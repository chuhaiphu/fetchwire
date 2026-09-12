import { FetchOptions } from '../interface/react';
import { fetchClient } from './fetch-client';
import { promiseCacheStore } from './promise-cache-store';

/**
 * Eagerly runs `fetchFn` and caches its Promise under `options.fetchKey`, so a later
 * `useFetch` / `useFetchFn` with the same key resolves instantly instead of firing a request.
 *
 * @param fetchFn - A Promise-returning function `() => Promise<T>`.
 *   Whatever it resolves **is** the data — fetchwire never inspects or unwraps it.
 * @param options - Options for this prefetch.
 *   - `fetchKey` — a unique key that caches this request's Promise.
 *   - `tags` — an optional list of tag strings this request subscribes to.
 * @returns The cached Promise for `options.fetchKey`. An existing one is returned as-is and
 *   `fetchFn` is not called, though `tags` are still registered.
 */
export function prefetch<T>(fetchFn: () => Promise<T>, options: FetchOptions): Promise<T> {
  if (promiseCacheStore.has(options.fetchKey)) {
    fetchClient.registerTags(options.fetchKey, options.tags);
    return promiseCacheStore.get(options.fetchKey) as Promise<T>;
  }

  const promise = fetchFn();
  fetchClient.cachePromiseAndRegisterTags(options.fetchKey, promise, options.tags);
  return promise;
}
