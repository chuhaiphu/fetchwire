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
 * Set of optional global interceptors that can react to HTTP errors.
 *
 * All handlers can be synchronous or async.
 */
export interface WireInterceptors {
  /**
   * Called when a 401 Unauthorized response is returned.
   */
  onUnauthorized?: (error: ApiError) => void | Promise<void>;

  /**
   * Called when a 403 Forbidden response is returned.
   */
  onForbidden?: (error: ApiError) => void | Promise<void>;

  /**
   * Called for other non‑success errors, after more specific handlers (if any).
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
   * Optional function to transform the raw JSON response from the server into the
   * standardized `HttpResponse` shape.
   *
   * This is useful if your API responses have a different structure and you want
   * to normalize them for easier consumption in your app.
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
 * Options for the `useFetchFn` hook.
 */
export interface FetchOptions {
  /**
   * Tags that this fetch subscribes to.
   *
   * When a mutation invalidates any of these tags, the hook will automatically
   * re‑run the last request via `refreshFetchFn`.
   */
  tags?: string[];
}

/**
 * Options for the `useMutationFn` hook.
 */
export interface MutationOptions {
  /**
   * Tags that should be invalidated after a successful mutation.
   *
   * All active `useFetchFn` hooks that subscribed to any of these tags
   * will be notified and refreshed.
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
  onSuccess?: (data: T) => void | Promise<void>;

  /**
   * Called when the mutation fails with an `ApiError`.
   *
   * @param error Normalized API error.
   */
  onError?: (error: ApiError) => void | Promise<void>;
}
