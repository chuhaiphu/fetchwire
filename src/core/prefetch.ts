import { FetchOptions, HttpResponse } from '../interface';
import { extractHttpResponseData } from '../util/helper';
import { fetchClient } from './fetch-client';
import { promiseCacheStore } from './promise-cache-store';

/**
 * Eagerly runs `fetchFn` and caches its Promise under `options.fetchKey`, so a
 * later `useFetch` / `useFetchFn` with the same key resolves instantly instead of
 * firing a new request. If the key is already cached, the existing Promise is
 * returned and `fetchFn` is not called.
 *
 * @param fetchFn - A Promise-returning function `() => Promise<HttpResponse<T> | T>`.
 *   Return either an `HttpResponse<T>` envelope or the raw data `T`.
 * @param options - Options for this prefetch.
 *   - `fetchKey` — a unique key that caches this request's Promise. A later
 *     `useFetch` / `useFetchFn` with the same key reuses the cached Promise instead
 *     of firing a new request.
 *   - `tags` — an optional list of tag strings this request subscribes to. When a
 *     `useMutationFn` invalidates a matching tag via `invalidatesTags`, the hook
 *     refreshes automatically. Tag strings must not contain commas.
 * @returns The cached Promise for `options.fetchKey`.
 */
export function prefetch<T>(
  fetchFn: () => Promise<HttpResponse<T> | T>,
  options: FetchOptions
) {
  // If the promise is already in the cacheMap, return it
  if (promiseCacheStore.has(options.fetchKey)) {
    return promiseCacheStore.get(options.fetchKey);
  }

  // Otherwise, execute the fetch function and store in the cacheMap then return it
  const promise = fetchFn().then((res) => extractHttpResponseData(res));
  fetchClient.cachePromiseAndRegisterTags(options.fetchKey, promise, options?.tags);
  return promise;
}
