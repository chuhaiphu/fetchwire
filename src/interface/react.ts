import type { ApiError } from '../core/api-error';

/**
 * Options for the `useFetch` and `useFetchFn` hooks.
 */
export interface FetchOptions {
  /**
   * A unique key that caches this request's Promise.
   *
   * The key must be unique across all concurrent fetches. A good convention is to include the
   * resource name and any dynamic segments, e.g. `"todos"` or `"user-" + userId`.
   */
  fetchKey: string;

  /**
   * An optional list of tag strings this request subscribes to.
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
   */
  invalidatesTags?: string[];
}

/**
 * Per-execution callbacks for `useMutationFn`.
 *
 * @template T Type of the mutation result data.
 * @template TError Type of the value `mutationFn` rejects with.
 */
export interface ExecuteMutationOptions<T, TError = ApiError> {
  /**
   * Called when the mutation succeeds.
   *
   * @param data Whatever `mutationFn` resolved.
   */
  onSuccess?: (data: T | null) => void | Promise<void>;

  /**
   * Called when the mutation fails, with the value `mutationFn` rejected with, untouched.
   *
   * @param error The rejection value.
   */
  onError?: (error: TError) => void | Promise<void>;
}
