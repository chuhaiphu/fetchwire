import { WireRequestInit } from "../interface";
import { ApiError } from "../util/api-error";
import { normalizeToApiError } from "../util/normalize-to-api-error";
import { mergeHeaders } from "../util/merge-headers";
import { getWireConfig } from "./config";

// `statusCode` is absent on purpose; fetchwire never takes the status from the body.
interface JsonErrorResponseBody {
  message?: unknown;
  error?: unknown;
}

/**
 * Sends an API request and returns the payload together with the `Response` that carried it.
 *
 * @param endpoint - The API endpoint to call. Example: '/api/v1/users'.
 * @param options - The request options: a `RequestInit` plus optional fetchwire flags
 *   (e.g. `skipToken` to send the request without an `Authorization` header).
 * @returns `data` — the payload, as produced by `transformResponse`, or the parsed body when
 *   no transform is configured. `undefined` for a `204`, a `205` or any `HEAD`.
 *
 *   `response` — the `Response` `fetch` returned, with its body already consumed.
 *
 * @throws {ApiError} with `errorCode`:
 *   - `"NETWORK_ERROR"` — `fetch()` itself rejected; the request never completed.
 *   - `"EMPTY_BODY"` — the response completed with no body on a status that should have had one.
 *   - `"INVALID_JSON"` — the body has content but is not JSON.
 *   - whatever `transformError` produces, for any non-OK response.
 *
 * Errors thrown by `onRequest`, `onResponse` or `transformResponse` are NOT wrapped.
 */
export async function wireRaw<T>(
  endpoint: string,
  options: WireRequestInit = {},
): Promise<{ data: T; response: Response }> {
  // Split fetchwire-specific flags off so only standard RequestInit reaches fetch/onRequest.
  const { skipToken, ...requestInit } = options;
  const config = getWireConfig();
  const url = `${config.baseUrl}${endpoint}`;
  // `skipToken` requests never touch getToken — this is what lets the token-refresh call
  // itself go through fetchwire without recursing into the refresh it is performing.
  const accessToken = skipToken ? null : await config.getToken();

  // Precedence reads left to right: global config < Authorization < per-request.
  const headers = mergeHeaders(
    config.headers,
    accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    requestInit.headers,
  );

  // Content-Type describes the body being SENT
  if (typeof requestInit.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Accept states which media types are acceptable in the RESPONSE (RFC 9110 §8.3 vs §12.5.1).
  // `*/*;q=0.8` keeps it a preference rather than a demand:
  // JSON ranks first, but still has something to fall back on instead of answering `406 Not Acceptable`.
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json, */*;q=0.8");
  }

  // Build ONE request object and share its reference with both the interceptor and fetch.
  const finalRequestConfig: RequestInit = {
    ...requestInit,
    headers,
  };

  if (config.interceptors?.onRequest) {
    await config.interceptors.onRequest(url, finalRequestConfig);
  }

  let response: Response;
  try {
    response = await fetch(url, finalRequestConfig);
  } catch (error) {
    // fetch() rejects only when no HTTP exchange happened at all:
    // DNS failure, TLS failure, connection refused, timeout, abort.
    // A 404 or a 500 is a completed exchange, so it never reaches this catch.
    throw normalizeToApiError(error, "NETWORK_ERROR", 520);
  }

  // Runs before the body is read, so the Response is still intact.
  if (config.interceptors?.onResponse) {
    await config.interceptors.onResponse(url, response);
  }

  if (!response.ok) {
    // text() reads first, then only parsing if `errorText` is not empty.
    // we not using `json()` because `json()` equals reads then parse.
    // So an empty `errorText` would throw for all case,
    // which will collapsing all cases into one, with or without `errorText,
    // make us impossible to differentiate between cases to build appropriate `errorResponseBody`.
    const errorText = await response.text();
    let errorResponseBody: JsonErrorResponseBody = {};
    if (errorText) {
      try {
        errorResponseBody = JSON.parse(errorText) as JsonErrorResponseBody;
      } catch {
        // A parse failure means "no usable fields", and errorResponseBody is already {}.
        // The catch is here to stop the throw, not to handle it.
      }
    }

    let apiError: ApiError;

    if (config.transformError) {
      apiError = config.transformError(errorResponseBody);
      if (apiError.statusCode == null) {
        // transformError may drop the status; restore it.
        apiError.statusCode = response.status;
      }
    } else {
      // If error with no transform, accept only values that fit ApiError's slots.
      apiError = new ApiError(
        typeof errorResponseBody.message === "string"
          ? errorResponseBody.message
          : response.statusText || `HTTP ${response.status}`,
        typeof errorResponseBody.error === "string"
          ? errorResponseBody.error
          : "HTTP_ERROR",
        response.status,
      );
    }

    // Notify the single global error sink for every non-OK response.
    await config.interceptors?.onError?.(apiError);

    throw apiError;
  }

  // 204 and 205 are defined to carry none (RFC 9110 §15.3.5, §15.3.6) and a HEAD response never does (§9.3.2).
  if (
    response.status === 204 ||
    response.status === 205 ||
    requestInit.method?.toUpperCase() === "HEAD"
  ) {
    // Nothing to parse, so transformResponse has nothing to run on either.
    return { data: undefined as T, response };
  }

  const textResponse = await response.text();

  // Past the check above, every remaining status is defined to carry a body,
  // so an empty one is a broken response rather than a legitimate outcome.
  if (!textResponse) {
    // content-length locates the loss:
    //   "0"                → the sender really sent nothing
    //   absent or non-zero → the body was lost after the headers arrived, i.e. in transport
    throw new ApiError(
      `Empty response body (content-length: ${response.headers.get("content-length") ?? "absent"})`,
      "EMPTY_BODY",
      response.status,
    );
  }

  let jsonResponseBody: unknown;
  try {
    jsonResponseBody = JSON.parse(textResponse);
  } catch {
    // Content that is not JSON — usually a proxy's HTML page served with a 2xx.
    throw new ApiError(
      "Malformed JSON in response body",
      "INVALID_JSON",
      response.status,
    );
  }

  // transformResponse only ever picks the payload out of the body.
  const data = config.transformResponse
    ? (config.transformResponse(jsonResponseBody) as T)
    : (jsonResponseBody as T);

  return { data, response };
}

/**
 * Sends an API request and returns the payload, dropping the `Response` that `wireRaw` keeps.
 *
 * @param endpoint - The API endpoint to call. Example: '/api/v1/users'.
 * @param options - The request options: a `RequestInit` plus optional fetchwire flags
 *   (e.g. `skipToken` to send the request without an `Authorization` header).
 * @returns The payload, as produced by `transformResponse`, or the parsed body when no
 *   transform is configured. `undefined` for a `204`, a `205` or any `HEAD`.
 *
 * @throws {ApiError} with `errorCode`:
 *   - `"NETWORK_ERROR"` — `fetch()` itself rejected; the request never completed.
 *   - `"EMPTY_BODY"` — the response completed with no body on a status that should have had one.
 *   - `"INVALID_JSON"` — the body has content but is not JSON.
 *   - whatever `transformError` produces, for any non-OK response.
 */
export async function wireData<T>(
  endpoint: string,
  options: WireRequestInit = {},
): Promise<T> {
  const { data } = await wireRaw<T>(endpoint, options);
  return data;
}
