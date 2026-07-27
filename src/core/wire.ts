import { HttpResponse, WireRequestInit } from "../interface";
import { ApiError } from "../util/api-error";
import { getWireConfig } from "./config";

// `statusCode` is absent on purpose; fetchwire never takes the status from the body.
interface JsonErrorResponseBody {
  message?: unknown;
  error?: unknown;
}

/**
 * Sends an API request and returns the response.
 * @param endpoint - The API endpoint to call. Example: '/api/v1/users'.
 * @param options - The request options: a `RequestInit` plus optional fetchwire flags
 *   (e.g. `skipToken` to send the request without an `Authorization` header).
 *
 * @throws {ApiError} with `errorCode`:
 *   - `"NETWORK_ERROR"` — `fetch()` itself rejected; the request never completed.
 *   - `"EMPTY_BODY"` — the response completed with no body on a status that requires one
 *     (anything but 204/205). The message carries the `content-length` header.
 *   - `"INVALID_JSON"` — the body has content but is not JSON.
 *   - whatever `transformError` produces, for any non-OK response.
 *
 * Errors thrown by `onRequest`, `onResponse` or `transformResponse` are NOT wrapped.
 */
export async function wireApi<T>(
  endpoint: string,
  options: WireRequestInit = {},
): Promise<HttpResponse<T>> {
  // Split fetchwire-specific flags off so only standard RequestInit reaches fetch/onRequest.
  const { skipToken, ...requestInit } = options;
  const config = getWireConfig();
  const url = `${config.baseUrl}${endpoint}`;
  // `skipToken` requests never touch getToken — this is what lets the token-refresh call
  // itself go through wireApi without recursing into the refresh it is performing.
  const accessToken = skipToken ? null : await config.getToken();

  const isFormData = requestInit.body instanceof FormData;
  const headers = new Headers({
    ...config.headers,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...requestInit.headers,
  });
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Build ONE request object and share its reference with both the interceptor and fetch.
  // ---
  // Why use a shared variable instead of spreading inline at each function:
  // `onRequest` lets callers mutate the request before it is sent (e.g. add a header).
  // Mutation only works if the interceptor and fetch point to the SAME object.
  // Spreading `{ ...options, headers }` at each function (onRequest, fetch)
  // would create a separate object per call, so the interceptor would mutate one object
  // while fetch sends a different one — the change would be silently lost.
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
    throw new ApiError(
      error instanceof Error ? error.message : "Network error",
      "NETWORK_ERROR",
      520,
    );
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

  const textResponse = await response.text();

  // Classify an empty body by STATUS, 204 and 205 are defined as bodiless (RFC 9110 §15.3.5, §15.3.6).
  // For every other STATUS, an empty body is a broken response.
  if (!textResponse) {
    // No JSON exists to hand to transformResponse, so this returns directly.
    if (response.status === 204 || response.status === 205) {
      return { data: undefined, status: response.status, message: "" };
    }
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

  // With transformResponse set, the consumer owns the shape entirely.
  if (config.transformResponse) {
    return config.transformResponse(jsonResponseBody) as HttpResponse<T>;
  }

  // Without it, fetchwire knows nothing about this API's envelope, so it does not invent one.
  // As default, the body IS the data, and the transport status is the only status that is real.
  return {
    data: jsonResponseBody as T,
    status: response.status,
    message: "",
  };
}
