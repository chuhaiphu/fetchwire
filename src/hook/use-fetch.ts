import { useEffect, useCallback, use, useRef, useState, useTransition } from 'react';
import { fetchClient } from '../cache/fetch-client';
import { eventEmitter } from '../cache/event-emitter';
import { promiseCacheStore } from '../cache/promise-cache-store';
import { FetchOptions } from '../interface/react';

/**
 * A hook that fetches immediately on mount and suspends the component while data is loading.
 * The parent tree must have a `<Suspense>` boundary and an `<ErrorBoundary>`.
 *
 * A rejected Promise reaches the `<ErrorBoundary>` exactly as it was thrown.
 *
 * @example
 * ```tsx
 * // Parent tree
 * <ErrorBoundary fallback={<div>Error</div>}>
 *   <Suspense fallback={<div>Loading…</div>}>
 *     <TodoList />
 *   </Suspense>
 * </ErrorBoundary>
 * ```
 *
 * @param fetch - A Promise-returning function `() => Promise<T>`.
 *   fetchwire calls it automatically on mount to start the fetch,
 *   and again on every `refreshFetch()` or tag invalidation.
 *   Whatever it resolves **is** `data` — fetchwire never inspects or unwraps it.
 * @param options - Options for this hook.
 *   - `fetchKey` — a unique key that caches this request's Promise.
 *     If `prefetch()` ran with the same key beforehand, the hook reuses the cached Promise.
 *     Changing `fetchKey` starts a fresh fetch and **suspends** the component.
 *     Change `fetchKey` inside `startTransition` to keep the old data on screen while it loads.
 *   - `tags` — an optional list of tag strings this request subscribes to.
 *     When a `useMutationFn` invalidates a matching tag via `invalidatesTags`, the hook refreshes.
 *
 * @returns
 *   - `data` — the resolved value of type `T`.
 *   - `refreshFetch` — manually triggers a refresh while the component is mounted.
 *     Uses `useTransition` internally so the current data stays visible while the refresh loads.
 *
 *     **refreshFetch CANNOT be used to retry from an ErrorBoundary**: when the boundary catches
 *     an error the component is unmounted, so `refreshFetch` is inaccessible. Call
 *     `fetchClient.remove(fetchKey)` inside the boundary's reset handler instead, which clears
 *     the rejected Promise so the next mount starts a fresh fetch.
 *   - `isRefreshing` — true while a refresh is in flight.
 */
export function useFetch<T>(
  fetch: () => Promise<T>,
  options: FetchOptions,
): {
  data: T;
  refreshFetch: () => void;
  isRefreshing: boolean;
} {
  const { fetchKey, tags } = options;
  const tagsKey = JSON.stringify(tags ?? []);

  if (promiseCacheStore.has(fetchKey)) {
    fetchClient.registerTags(fetchKey, tags);
  } else {
    fetchClient.cachePromiseAndRegisterTags(fetchKey, fetch(), tags);
  }

  const [promise, setPromise] = useState<Promise<T>>(
    () => promiseCacheStore.get(fetchKey) as Promise<T>,
  );

  const [previousFetchKey, setPreviousFetchKey] = useState(fetchKey);
  if (fetchKey !== previousFetchKey) {
    setPreviousFetchKey(fetchKey);
    setPromise(promiseCacheStore.get(fetchKey) as Promise<T>);
  }

  const [isPending, startTransition] = useTransition();

  const fetchRef = useRef(fetch);

  useEffect(() => {
    fetchRef.current = fetch;
  }, [fetch]);

  const refreshFetch = useCallback(() => {
    const newPromise = fetchRef.current();
    fetchClient.cachePromiseAndRegisterTags(
      fetchKey,
      newPromise,
      JSON.parse(tagsKey) as string[],
    );
    startTransition(() => {
      setPromise(newPromise);
    });
  }, [fetchKey, tagsKey]);

  useEffect(() => {
    const subscribedTags = JSON.parse(tagsKey) as string[];
    if (subscribedTags.length === 0) return;

    const subscriptions = subscribedTags.map((tag) =>
      eventEmitter.addListener(tag, refreshFetch),
    );
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [tagsKey, refreshFetch]);

  return { data: use(promise), refreshFetch, isRefreshing: isPending };
}
