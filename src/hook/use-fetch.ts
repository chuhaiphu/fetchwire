import { useEffect, useCallback, use, useState, useTransition } from 'react';
import { HttpResponse, FetchOptions } from '../interface';
import { eventEmitter } from '../core/event-emitter';
import { promiseCacheStore } from '../core/promise-cache-store';
import { extractHttpResponseData } from '../util/helper';
import { fetchClient } from '../core/fetch-client';

/**
 * A hook that fetches immediately on mount and suspends
 * the component while data is loading. The parent tree must have a
 * `<Suspense>` boundary (for the loading state) and an `<ErrorBoundary>`
 * (for API errors).
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
 * @param fetch - A promise function that returns `Promise<HttpResponse<T> | T>`.
 *   You can return a standard `HttpResponse<T>` envelope or raw data `T`.
 * @param options - Required options for this hook.
 *   - `fetchKey` — a unique key used to cache the in-flight promise. Must match
 *     the key passed to `prefetch()` if prefetching is used.
 *   - `tags` — optional list of tag strings that will trigger a refresh when a
 *     `useMutationFn` with matching `invalidatesTags` completes.
 *     Tag strings must not contain commas.
 *
 * @returns
 *   - `data` — the resolved value of type `T` or null.
 *   - `refreshFetch` — a function to manually trigger a new fetch. The component will re-suspend
 *     and the nearest `<Suspense>` fallback will be shown.
 *   - `isRefreshing` — true while a triggered refresh is in flight.
 */

export function useFetch<T>(
  fetch: () => Promise<HttpResponse<T> | T>,
  options: FetchOptions
): {
  data: T | null;
  refreshFetch: () => void;
  isRefreshing: boolean;
} {
  const { fetchKey } = options;

  // Each time the consumer component renders, a brand new options object is created,
  // Which would cause the useEffect to re-run, even if the tags are the same.
  // So we need to create a string key for it by stringifying from options.tags.
  // We can use JSON.stringify, but it can be slow for large arrays, so we can use join instead.
  // This assumes that the tags themselves don't contain commas.
  const tagsKey = options.tags?.join(',') ?? '';

  // Why if we don't cache the promise?
  // 1. Each time the Component is rendered, a new Pending Promise from fetch is created
  // 2. After use(promise) hook run, React will abort the current render, dispose all the states
  // 3. React will render the Suspense fallback.
  // 4. After the current Promise is resolved, React will re-render the suspended component tree from scratch
  // 5. The component will received a new Pending Promise and will suspend again.
  // 6. The component will create an infinite loop of suspend-render-suspend-render...
  // ---
  // Set the promise in cache if not exists.
  // This ensures that the same promise is used across renders.
  if (!promiseCacheStore.has(fetchKey)) {
    const rawPromise = fetch()
      .then((res) => extractHttpResponseData(res))
      .catch((error) => {
        promiseCacheStore.delete(fetchKey);
        throw error;
      });
    const tags = tagsKey.split(',');
    fetchClient.setFetchKeyToTags(fetchKey, rawPromise, tags);
  }

  // Get the cached promise
  const [promise, setPromise] = useState<Promise<T | undefined>>(
    () => promiseCacheStore.get(fetchKey) as Promise<T>
  );

  const [isPending, startTransition] = useTransition();

  const refreshFetch = useCallback(() => {
    const newPromise = fetch().then((res) => extractHttpResponseData(res));
    const tags = tagsKey.split(',');
    fetchClient.setFetchKeyToTags(fetchKey, newPromise, tags);
    startTransition(() => {
      setPromise(newPromise);
    });
  }, [fetch, fetchKey, tagsKey]);

  useEffect(() => {
    if (!tagsKey) return;
    const tags = tagsKey.split(',');
    const subscriptions = tags.map((tag) =>
      eventEmitter.addListener(tag, refreshFetch)
    );
    return () => subscriptions.forEach((sub) => sub.remove());
  }, [tagsKey, refreshFetch]);

  const data = use(promise);

  if (data === undefined) {
    throw new Error('Undefined data');
  }

  return { data, refreshFetch, isRefreshing: isPending };
}
