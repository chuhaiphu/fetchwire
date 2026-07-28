import { ApiError } from "../util/api-error";

/**
 * Standard HTTP response shape used by fetchwire.
 * @template T Type of the `data` payload.
 */
export interface HttpResponse<T> {
  /**
   * Parsed response body returned by your API, if available.
   */
  data?: T;
  message?: string;
  status?: number;
}

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
   * Doing so will exhaust the body stream, causing the subsequent read inside `wireApi` to fail.
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
   * These will be merged with:
   * - the Authorization header built from `getToken`, and
   * - any per‑request headers.
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
   * Optional function to transform the raw Error response into the standardized `ApiError` shape.
   * 
   * An `ApiError` returned without a `statusCode` gets the response status.
   *
   * If not provided, fetchwire reuses `message` and `error` from the body if they are `string` 
   * and falling back to `HTTP <status>` for  `message` and `"HTTP_ERROR"` for `error` otherwise.
   * `statusCode` always comes from the HTTP response.
   */
  transformError?: (error: unknown) => ApiError;
  /**
   * Optional function to transform the raw JSON response into the standardized `HttpResponse` shape.
   *
   * If not provided, fetchwire wraps the raw JSON as the `data` field of the
   * returned `HttpResponse`.
   */
  transformResponse?: (json: unknown) => HttpResponse<unknown>;

  /**
   * Optional global interceptors for the request/response lifecycle and errors.
   */
  interceptors?: WireInterceptors;
}

/**
 * Per-request options accepted by `wireApi`. A superset of the standard `RequestInit`.
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
