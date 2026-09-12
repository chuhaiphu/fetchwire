import { useState, useRef, useEffect, useCallback } from 'react';
import { fetchClient } from '../cache/fetch-client';
import { eventEmitter } from '../cache/event-emitter';
import { promiseCacheStore } from '../cache/promise-cache-store';
import type { ApiError } from '../core/api-error';
import { FetchOptions } from '../interface/react';

interface FetchState<T, TError> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: TError | null;
}

/**
 * A hook that runs a fetch on demand and tracks its loading, refreshing, and error state.
 *
 * @template T Type of the value `fetchFn` resolves.
 * @template TError Type of the value `fetchFn` rejects with. Defaults to `ApiError`, what
 *   `wireData` / `wireRaw` throw; set it yourself when `fetchFn` uses another transport.
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
 *   - `data` — the resolved value of type `T`, or null if not yet fetched.
 *   - `isLoading` — true while the initial fetch is in flight.
 *   - `isRefreshing` — true while a refresh is in flight.
 *   - `error` — whatever the last failed run rejected with, untouched, otherwise null.
 *   - `executeFetchFn` — manually triggers the initial fetch.
 *   - `refreshFetchFn` — manually triggers a refresh: skips the cache read and
 *     overwrites the cached Promise with the new one.
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

  const execute = useCallback(
    async (execOptions: { isRefresh: boolean }): Promise<T | null> => {
      const fn = fetchFnRef.current;
      const requestId = ++latestRequestIdRef.current;
      const tags = JSON.parse(tagsKey) as string[];

      setState((prev) => ({
        ...prev,
        isLoading: !execOptions.isRefresh,
        isRefreshing: execOptions.isRefresh,
        error: null,
      }));

      try {
        let data: T;
        if (!execOptions.isRefresh && promiseCacheStore.has(fetchKey)) {
          fetchClient.registerTags(fetchKey, tags);
          data = (await promiseCacheStore.get(fetchKey)) as T;
        } else {
          const rawPromise = fn();
          fetchClient.cachePromiseAndRegisterTags(fetchKey, rawPromise, tags);
          data = await rawPromise;
        }

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
    [fetchKey, tagsKey],
  );

  const executeFetchFn = useCallback(() => execute({ isRefresh: false }), [execute]);
  const refreshFetchFn = useCallback(() => execute({ isRefresh: true }), [execute]);

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

    const subscriptions = tags.map((tag) =>
      eventEmitter.addListener(tag, () => {
        refreshFetchFn();
      }),
    );
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [tagsKey, refreshFetchFn]);

  return { ...state, executeFetchFn, refreshFetchFn, reset };
}
