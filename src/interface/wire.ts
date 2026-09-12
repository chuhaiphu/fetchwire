import { ApiError } from '../core/api-error';

/**
 * Optional global interceptors for the request/response lifecycle and errors.
 *
 * All handlers can be synchronous or async, and are awaited.
 */
export interface WireInterceptors {
  /**
   * Called before every request, with the full URL and the final `RequestInit` object.
   *
   * Mutations to `options` are reflected in the actual request: the interceptor and `fetch`
   * share one object.
   *
   * @param url     The full URL that will be fetched (baseUrl + endpoint).
   * @param options The final `RequestInit`, including merged headers and the auth token.
   */
  onRequest?: (url: string, options: RequestInit) => void | Promise<void>;

  /**
   * Called after every response, before the body is parsed.
   *
   * **Do not consume the response body** (e.g. do not call `response.json()` or `response.text()`).
   * Doing so exhausts the body stream, causing the subsequent read inside `wireRaw` to fail.
   * Use `response.clone()` if you need to read the body here.
   *
   * @param url      The full URL of the completed request.
   * @param response The raw `Response` object returned by `fetch`.
   */
  onResponse?: (url: string, response: Response) => void | Promise<void>;

  /**
   * The single global error sink: called for every `ApiError` fetchwire throws, whatever its
   * `code`. Branch on `error.code` to tell a failed HTTP exchange from a failed connection.
   *
   * Errors raised by your own `onRequest`, `onResponse` or `transformResponse` do not reach it.
   */
  onError?: (error: ApiError) => void | Promise<void>;
}

/**
 * Global configuration passed to `initWire`.
 */
export interface WireConfig {
  /**
   * Base URL that all relative endpoints are appended to, e.g. "https://api.example.com".
   */
  baseUrl: string;

  /**
   * Default headers applied to every request.
   *
   * Merged lowest to highest: **these headers → `Authorization` → per-request headers**.
   *
   * To drop one of these on a single request, delete it from `onRequest`:
   * `onRequest: (url, options) => (options.headers as Headers).delete("x-client")`.
   */
  headers?: HeadersInit;

  /**
   * A Promise-returning function that resolves to the current access token, or null when
   * there is no session.
   *
   * A non-empty token is sent as `Authorization: Bearer <token>`.
   */
  getToken: () => Promise<string | null>;

  /**
   * Optional function that turns the parsed JSON body into the payload.
   *
   * Runs after `JSON.parse` succeeds, before the result is handed back. Whatever it returns
   * **is** the payload `wireData<T>` resolves, and what `wireRaw<T>` puts on `.data`.
   *
   * It is not called when there is no body to parse (`204`, `205`, `HEAD`), nor for a non-OK
   * response — an error body reaches you verbatim on `ApiError.data`.
   *
   * If not provided, the parsed body is the payload.
   *
   * @param json - The parsed JSON body.
   * @returns The payload.
   */
  transformResponse?: (json: unknown) => unknown;

  /**
   * Optional global interceptors for the request/response lifecycle and errors.
   */
  interceptors?: WireInterceptors;
}

/**
 * Per-request options accepted by `wireData` and `wireRaw`. A superset of the standard `RequestInit`.
 *
 * `headers` here override both the global config headers and `Authorization`.
 *
 * `Content-Type` is derived from `body`: a string body defaults to `application/json`, while
 * `FormData`, `URLSearchParams` and `Blob` keep the type `fetch` assigns them, and a request
 * with no body is sent without the header.
 *
 * `Accept` defaults to `application/json, *&#47;*;q=0.8` on every request, including ones with no body.
 *
 * Setting either header explicitly replaces the default.
 */
export interface WireRequestInit extends RequestInit {
  /**
   * When `true`, fetchwire does **not** call `getToken` and adds **no** `Authorization` header.
   */
  skipToken?: boolean;
}
