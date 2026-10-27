import { useState, useRef, useEffect, useCallback } from 'react';

import type { FetchOptions } from '../interfaces/core-interfaces.js';
import type { ApiError } from '../utils/class/api-error.js';
import { eventEmitter } from '../utils/class/event-emitter.js';
import { fetchClient } from '../utils/class/fetch-client.js';
import { promiseCacheStore } from '../utils/class/promise-cache-store.js';
import { generateFetchKeyEventName } from '../utils/generator/generate-fetch-key-event-name.js';
import { generateTagEventName } from '../utils/generator/generate-tag-event-name.js';

interface FetchState<T, TError> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: TError | null;
}

/**
 * A hook that runs a fetch on demand and tracks its loading, refreshing, and error state.
 *
 * @template T - Type of the value `fetchFn` resolves.
 * @template TError - Type of the value `fetchFn` rejects with. Defaults to `ApiError`, what
 *   `wireData` / `wireRaw` throw. Set it yourself when `fetchFn` uses another transport.
 * @param fetchFn - A Promise-returning function `() => Promise<T>`.
 *   fetchwire does not call it on mount. It runs only when you call `executeFetchFn()`
 *   (initial fetch) or `refreshFetchFn()` (refresh).
 *   Whatever it resolves **is** `data` — fetchwire never inspects or unwraps it.
 * @param options - Options for this hook.
 *   - `fetchKey` — a unique key that caches this request's Promise.
 *     If `prefetch()` ran with the same key beforehand, the hook reuses the cached Promise.
 *   - `tags` — an optional list of tag strings this request subscribes to.
 *     When a `useMutationFn` invalidates a matching tag via `invalidatesTags`, the hook refreshes.
 *
 * @returns
 *   - `data` — the resolved value of type `T`, or `null` if not yet fetched or the last run failed.
 *   - `isLoading` — `true` while the initial fetch is in flight.
 *   - `isRefreshing` — `true` while a refresh is in flight.
 *   - `error` — whatever the last failed run rejected with, untouched, otherwise `null`.
 *   - `executeFetchFn` — manually triggers the initial fetch.
 *   - `refreshFetchFn` — manually triggers a refresh: skips the cache read and
 *     overwrites the cached Promise with the new one. Every mounted `useFetch` and `useFetchFn` on
 *     the same `fetchKey` shows the new data.
 *   - `reset` — resets state back to the initial idle state and retires every
 *     in-flight run, so a late response cannot overwrite what was just cleared.
 */
export function useFetchFn<T, TError = ApiError>(
  fetchFn: () => Promise<T>,
  options: FetchOptions,
) {
  const [state, setState] = useState<FetchState<T, TError>>({
    data: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
  });

  const latestRequestIdRef = useRef(0);
  const fetchFnRef = useRef(fetchFn);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const fetchKey = options.fetchKey;
  const tagsKey = JSON.stringify(options.tags ?? []);

  const handlePromise = useCallback(
    async (promise: Promise<T>, handleOptions: { isRefresh: boolean }): Promise<T | null> => {
      const requestId = ++latestRequestIdRef.current;

      setState((prev) => ({
        ...prev,
        isLoading: !handleOptions.isRefresh,
        isRefreshing: handleOptions.isRefresh,
        error: null,
      }));

      try {
        const data = await promise;

        if (requestId === latestRequestIdRef.current) {
          setState({
            data: data ?? null,
            isLoading: false,
            isRefreshing: false,
            error: null,
          });
        }

        return data;
      } catch (error) {
        if (requestId === latestRequestIdRef.current) {
          fetchClient.remove(fetchKey);
          setState({
            data: null,
            isLoading: false,
            isRefreshing: false,
            error: error as TError,
          });
        }
        return null;
      }
    },
    [fetchKey],
  );

  const executeFetchFn = useCallback(() => {
    const tags = JSON.parse(tagsKey) as string[];

    if (promiseCacheStore.has(fetchKey)) {
      fetchClient.registerTags(fetchKey, tags);
      return handlePromise(promiseCacheStore.get(fetchKey) as Promise<T>, { isRefresh: false });
    }

    const newPromise = fetchFnRef.current();
    fetchClient.cachePromiseAndRegisterTags(fetchKey, newPromise, tags);
    return handlePromise(newPromise, { isRefresh: false });
  }, [fetchKey, tagsKey, handlePromise]);

  const refreshFetchFn = useCallback(() => {
    const newPromise = fetchFnRef.current();
    fetchClient.cachePromiseAndRegisterTags(fetchKey, newPromise, JSON.parse(tagsKey) as string[]);
    eventEmitter.emit(generateFetchKeyEventName(fetchKey));
    return handlePromise(newPromise, { isRefresh: true });
  }, [fetchKey, tagsKey, handlePromise]);

  const reset = useCallback(() => {
    latestRequestIdRef.current++;
    setState({
      data: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    const tags = JSON.parse(tagsKey) as string[];
    if (tags.length === 0) return;

    fetchClient.registerTags(fetchKey, tags);

    // invalidateTags removed this fetchKey from the cache.
    // The first reader to hear a tag refreshes it with a fetch request,
    // a later one only get a Promise that already cached.
    const refreshFetchFnCb = () => {
      if (promiseCacheStore.has(fetchKey)) return;
      refreshFetchFn();
    };

    const subscriptions = tags.map((tag) =>
      eventEmitter.addListener(generateTagEventName(tag), refreshFetchFnCb),
    );
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [fetchKey, tagsKey, refreshFetchFn]);

  useEffect(() => {
    const subscription = eventEmitter.addListener(generateFetchKeyEventName(fetchKey), () => {
      handlePromise(promiseCacheStore.get(fetchKey) as Promise<T>, { isRefresh: true });
    });
    return () => subscription.remove();
  }, [fetchKey, handlePromise]);

  return { ...state, executeFetchFn, refreshFetchFn, reset };
}
