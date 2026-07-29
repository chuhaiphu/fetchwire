import { ApiError } from "../util/api-error";

/**
 * Set of optional global interceptors that can react to HTTP lifecycle events.
 *
 * All handlers can be synchronous or async.
 */
export interface WireInterceptors {
  /**
   * Called before every request, with the full URL and the final `RequestInit` object.
   *
   * @param url     The full URL that will be fetched (baseUrl + endpoint).
   * @param options The final `RequestInit` object, including merged headers and auth token.
   */
  onRequest?: (url: string, options: RequestInit) => void | Promise<void>;

  /**
   * Called after every response, before the body is parsed.
   *
   * Use this to log response metadata, inspect headers, or record timing.
   *
   * **Do not consume the response body** (e.g. do not call `response.json()` or`response.text()`).
   * Doing so will exhaust the body stream, causing the subsequent read inside `wireRaw` to fail.
   * Use `response.clone()` if you need to read the body here.
   *
   * @param url      The full URL of the completed request.
   * @param response The raw `Response` object returned by `fetch`.
   */
  onResponse?: (url: string, response: Response) => void | Promise<void>;

  /**
   * Called for **every** non-OK response (the single global error sink).
   */
  onError?: (error: ApiError) => void | Promise<void>;
}

/**
 * Global configuration passed to `initWire`.
 */
export interface WireConfig {
  /**
   * Base URL that all relative endpoints will be appended to,
   * e.g. "https://api.example.com".
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
   * A Promise-returning function that resolves to the current access token, or null if not logged in.
   *
   * When a non‑empty token is returned, fetchwire will send it as:
   * `Authorization: Bearer <token>`.
   */
  getToken: () => Promise<string | null>;

  /**
   * Optional function that turns the parsed error body into an `ApiError`.
   *
   * Runs on every non-OK response, before `onError` and before the throw.
   * Whatever it returns **is** the `ApiError` thrown by `wireData` / `wireRaw`, except that an
   * `ApiError` returned without a `statusCode` gets the response status.
   *
   * It is not called for an OK response, nor when `fetch` itself rejects (`NETWORK_ERROR`).
   *
   * If not provided, `message` and `error` from the body become the `ApiError`'s `message` and
   * `errorCode` when they are strings, falling back to `statusText` (or `HTTP <status>`) and
   * `"HTTP_ERROR"`.
   *
   * @param error - The parsed error body, or `{}` when the response carried none or it was not JSON.
   * @returns The `ApiError` to throw.
   */
  transformError?: (error: unknown) => ApiError;
  /**
   * Optional function that turns the parsed JSON body into the payload.
   *
   * Runs after `JSON.parse` succeeds, before the result is handed back.
   * Whatever it returns **is** the payload `wireData<T>` resolves. `wireRaw<T>` puts it on `.data`.
   *
   * It is not called when there is no body to parse (`204`, `205`, `HEAD`), nor for a non-OK response.
   *
   * If not provided, the body is the payload.
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

/**
 * Options for the `useFetch` and `useFetchFn` hooks.
 */
export interface FetchOptions {
  /**
   * A unique key that caches this request's Promise.
   *
   * The key must be unique across all concurrent fetches.
   * A good convention is to include the resource name and any dynamic segments,
   * e.g. `"todos"` or `"user-" + userId`.
   */
  fetchKey: string;

  /**
   * An optional list of tag strings this request subscribes to.
   *
   * @constraint Tag strings must not contain commas.
   *
   * @example
   * tags: ['todos', 'user-123']   // ✓ valid
   * tags: ['todo,list']           // ✗ invalid — comma will break tag matching
   */
  tags?: string[];
}

/**
 * Options for the `useMutationFn` hook.
 */
export interface MutationOptions {
  /**
   * An optional list of tag strings to invalidate after a successful mutation.
   * Every `useFetch` / `useFetchFn` subscribed to a matching tag refreshes automatically.
   *
   * @constraint Tag strings must not contain commas.
   *
   * @example
   * invalidatesTags: ['todos', 'user-123']   // ✓ valid
   * invalidatesTags: ['todo,list']           // ✗ invalid — comma will break tag matching
   */
  invalidatesTags?: string[];
}

/**
 * Per‑execution callbacks for `useMutationFn`.
 * @template T Type of the mutation result data.
 */
export interface ExecuteMutationOptions<T> {
  /**
   * Called when the mutation succeeds.
   *
   * @param data Parsed response data from the server.
   */
  onSuccess?: (data: T | null) => void | Promise<void>;

  /**
   * Called when the mutation fails with an `ApiError`.
   *
   * @param error Normalized API error.
   */
  onError?: (error: ApiError) => void | Promise<void>;
}
