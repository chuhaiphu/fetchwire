import { WireRequestInit } from '../interface/wire';
import { mergeHeaders } from '../util/merge-headers';
import { ApiError } from './api-error';
import { getWireConfig } from './config';

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
 * @throws {ApiError} with `code`:
 *   - `"NETWORK_ERROR"` — `fetch()` itself rejected; no HTTP exchange happened, so `status` is
 *     `undefined`.
 *   - `"HTTP_ERROR"` — the server answered with a non-OK status. `data` holds the error body:
 *     the parsed JSON, the raw text when it is not JSON, or `undefined` when there was none.
 *   - `"PARSE_ERROR"` — an OK response whose body is not JSON, the empty body included. `data`
 *     holds the raw text.
 *
 * Errors thrown by `onRequest`, `onResponse` or `transformResponse` propagate as themselves.
 */
export async function wireRaw<T>(
  endpoint: string,
  options: WireRequestInit = {},
): Promise<{ data: T; response: Response }> {
  const { skipToken, ...requestInit } = options;
  const config = getWireConfig();
  const url = `${config.baseUrl}${endpoint}`;
  const method = requestInit.method?.toUpperCase() ?? 'GET';
  const accessToken = skipToken ? null : await config.getToken();

  const headers = mergeHeaders(
    config.headers,
    accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    requestInit.headers,
  );

  if (typeof requestInit.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json, */*;q=0.8');
  }

  const finalRequestConfig: RequestInit = { ...requestInit, headers };

  if (config.interceptors?.onRequest) {
    await config.interceptors.onRequest(url, finalRequestConfig);
  }

  let response: Response;
  try {
    response = await fetch(url, finalRequestConfig);
  } catch {
    const networkError = new ApiError({ code: 'NETWORK_ERROR', method, url });
    await config.interceptors?.onError?.(networkError);
    throw networkError;
  }

  if (config.interceptors?.onResponse) {
    await config.interceptors.onResponse(url, response);
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: unknown;
    if (errorText) {
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = errorText;
      }
    }

    const httpError = new ApiError({
      code: 'HTTP_ERROR',
      method,
      url,
      response,
      data: errorData,
    });
    await config.interceptors?.onError?.(httpError);
    throw httpError;
  }

  if (response.status === 204 || response.status === 205 || method === 'HEAD') {
    return { data: undefined as T, response };
  }

  const responseText = await response.text();

  let responseBody: unknown;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    const parseError = new ApiError({
      code: 'PARSE_ERROR',
      method,
      url,
      response,
      data: responseText,
    });
    await config.interceptors?.onError?.(parseError);
    throw parseError;
  }

  const data = config.transformResponse
    ? (config.transformResponse(responseBody) as T)
    : (responseBody as T);

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
 * @throws {ApiError} — the same three codes as `wireRaw`.
 */
export async function wireData<T>(
  endpoint: string,
  options: WireRequestInit = {},
): Promise<T> {
  const { data } = await wireRaw<T>(endpoint, options);
  return data;
}
