import type { ApiError } from '../utils/class/api-error.js';

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
 * @template T - Type of the mutation result data.
 * @template TError - Type of the value `mutationFn` rejects with.
 */
export interface ExecuteMutationOptions<T, TError = ApiError> {
  /**
   * Called when the mutation succeeds.
   *
   * @param data - Whatever `mutationFn` resolved, or `null` when it resolved `undefined`.
   */
  onSuccess?: (data: T | null) => void | Promise<void>;

  /**
   * Called when the mutation fails, with the value `mutationFn` rejected with, untouched.
   *
   * @param error - The rejection value.
   */
  onError?: (error: TError) => void | Promise<void>;
}
