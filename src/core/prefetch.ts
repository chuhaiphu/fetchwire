import { FetchOptions } from '../interface';
import { fetchClient } from './fetch-client';
import { promiseCacheStore } from './promise-cache-store';

/**
 * Eagerly runs `fetchFn` and caches its Promise under `options.fetchKey`,
 * so a later `useFetch` / `useFetchFn` with the same key resolves instantly instead of firing a new request.
 *
 * @param fetchFn - A Promise-returning function `() => Promise<T>`.
 *   Whatever it resolves **is** the data — fetchwire never inspects or unwraps it.
 * @param options - Options for this prefetch.
 *   - `fetchKey` — a unique key that caches this request's Promise.
 *      A later `useFetch` / `useFetchFn` with the same key reuses the cached Promise instead.
 *   - `tags` — an optional list of tag strings this request subscribes to.
 *      When a `useMutationFn` invalidates a matching tag via `invalidatesTags`, the hook refreshes automatically.
 *      Tag strings must not contain commas.
 * @returns The cached Promise for `options.fetchKey`.
 */
export function prefetch<T>(
  fetchFn: () => Promise<T>,
  options: FetchOptions
): Promise<T> {
  // If the promise is already in the cacheMap, return it
  if (promiseCacheStore.has(options.fetchKey)) {
    fetchClient.registerTags(options.fetchKey, options.tags);
    return promiseCacheStore.get(options.fetchKey) as Promise<T>;
  }

  // Otherwise, execute the fetch function and store in the cacheMap then return it
  const promise = fetchFn();
  fetchClient.cachePromiseAndRegisterTags(options.fetchKey, promise, options?.tags);
  return promise;
}
