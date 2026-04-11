import { ApiError } from '../util/api-error';

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
   * Use this to add dynamic headers, inject trace IDs, or log outgoing requests.
   * Mutations to `options` (e.g. `options.headers.set(...)`) are reflected in the
   * actual request because both this interceptor and `fetch` share the same object.
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
   * **Do not consume the response body** (e.g. do not call `response.json()` or
   * `response.text()`) — doing so will exhaust the body stream, causing the
   * subsequent read inside `wireApi` to fail. Use `response.clone()` if you
   * need to read the body here.
   *
   * @param url      The full URL of the completed request.
   * @param response The raw `Response` object returned by `fetch`.
   */
  onResponse?: (url: string, response: Response) => void | Promise<void>;

  /**
   * Called when a response matches `unauthorizedStatusCodes` (default: 401).
   *
   * Fires **before** `onError`. After this handler completes, `onError` will
   * also fire (cascade behavior) — useful when you want both specific auth
   * handling and a global error notification.
   */
  onUnauthorized?: (error: ApiError) => void | Promise<void>;

  /**
   * Called when a response matches `forbiddenStatusCodes` (default: 403).
   *
   * Fires **before** `onError`. After this handler completes, `onError` will
   * also fire (cascade behavior) — useful when you want both specific permission
   * handling and a global error notification.
   */
  onForbidden?: (error: ApiError) => void | Promise<void>;

  /**
   * Called for **every** non-OK response, including those already handled by
   * `onUnauthorized` or `onForbidden` (cascade behavior).
   *
   * Use this as a global error sink — e.g. to show a toast notification for
   * all API errors regardless of their specific status code.
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
   * Async function that returns the current access token, or null if not logged in.
   *
   * When a non‑empty token is returned, fetchwire will send it as:
   * `Authorization: Bearer <token>`.
   */
  getToken: () => Promise<string | null>;

  /**
   * Optional function to transform the raw Error response from the server into the
   * standardized `ApiError` shape.
   *
   * If not provided, fetchwire will assume the error response has the standard structure
   * 
   * `{ message: string, error: string, statusCode: number }`.
   */
  transformError?: (error: unknown) => ApiError;
  /**
   * Optional function to transform the raw JSON response from the server into the
   * standardized `HttpResponse` shape.
   *
   * If not provided, fetchwire will assume the raw JSON to "data" attribute in the HttpResponse`.
   */
  transformResponse?: (json: unknown) => HttpResponse<unknown>;

  /**
   * Optional global interceptors to handle unauthorized/forbidden/other errors.
   */
  interceptors?: WireInterceptors;

  /**
   * HTTP status codes that should be treated as "unauthorized" for the purpose
   * of calling `interceptors.onUnauthorized`. Defaults to `[401]` when omitted.
   */
  unauthorizedStatusCodes?: number[];

  /**
   * HTTP status codes that should be treated as "forbidden" for the purpose
   * of calling `interceptors.onForbidden`. Defaults to `[403]` when omitted.
   */
  forbiddenStatusCodes?: number[];
}

/**
 * Options for the `useFetch` and `useFetchFn` hooks.
 */
export interface FetchOptions {
  /**
   * Tags that this fetch subscribes to.
   *
   * When a mutation invalidates any of these tags, the hook will automatically
   * re‑run the last request via `refreshFetchFn`.
   *
   * @constraint Tag strings must not contain commas. Commas are used internally
   * to serialize the tag array into a stable dependency key.
   *
   * @example
   * tags: ['todos', 'user-123']   // ✓ valid
   * tags: ['todo,list']           // ✗ invalid — comma will break tag matching
   */
  tags?: string[];
  fetchKey?: string;
}

/**
 * Options for the `useMutationFn` hook.
 */
export interface MutationOptions {
  /**
   * Tags that should be invalidated after a successful mutation.
   *
   * All active `useFetch` and `useFetchFn` hooks that subscribed to any of
   * these tags will be notified and refreshed.
   *
   * @constraint Tag strings must not contain commas. Commas are used internally
   * to serialize the tag array into a stable dependency key.
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
