import { useEffect, useCallback, use, useState, useTransition } from "react";
import { HttpResponse, FetchOptions } from "../interface";
import { eventEmitter } from "../core/event-emitter";
import { promiseCacheStore } from "../core/promise-cache-store";
import { extractHttpResponseData } from "../util/helper";
import { fetchClient } from "../core/fetch-client";
import { ApiError } from "../util/api-error";

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
 * @param fetch - A Promise-returning function `() => Promise<HttpResponse<T> | T>`.
 *   fetchwire calls it automatically on mount to start the fetch, and again on
 *   every `refreshFetch()` or tag invalidation. Return either an `HttpResponse<T>`
 *   envelope or the raw data `T`.
 * @param options - Options for this hook.
 *   - `fetchKey` — a unique key that caches this request's Promise. If `prefetch()`
 *     ran with the same key beforehand, the hook reuses the cached Promise instead
 *     of firing a new request.
 *   - `tags` — an optional list of tag strings this request subscribes to. When a
 *     `useMutationFn` invalidates a matching tag via `invalidatesTags`, the hook
 *     refreshes automatically. Tag strings must not contain commas.
 *
 * @returns
 *   - `data` — the resolved value of type `T`, or null.
 *   - `refreshFetch` — manually triggers a refresh while the component is mounted.
 *     Uses `useTransition` internally so the current data stays visible while the
 *     refresh loads. **Cannot be used to retry from an ErrorBoundary**: when the
 *     ErrorBoundary catches an API error the component is unmounted, so `refreshFetch`
 *     is inaccessible and its internal `setPromise` state update has no effect. To
 *     retry from an ErrorBoundary, call `fetchClient.remove(fetchKey)` inside the
 *     boundary's reset handler before remounting the component — this clears the
 *     rejected Promise from the Promise cache so the next mount starts a fresh fetch.
 *   - `isRefreshing` — true while a refresh is in flight.
 */

export function useFetch<T>(
  fetch: () => Promise<HttpResponse<T> | T>,
  options: FetchOptions,
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
  const tagsKey = options.tags?.join(",") ?? "";

  // What if we don't cache the promise?
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
        // Do NOT delete the resolved error-promise cache here.
        // What if we delete the rejected promise from cache?
        // 1. Each time the Component is rendered, a new Pending Promise from fetch is created
        // 2. After use(promise) hook run, React will abort the current render, dispose all the states
        // 3. React will render the Suspense fallback.
        // 4. After the current rejected error-Promise is resolved, React will re-render the suspended component tree from scratch
        // 5. The component will received a new Pending Promise and will suspend again.
        // 6. The component will create an infinite loop of suspend-render-suspend-render...

        // Keeping the rejected Promise in cache lets React propagate the error to the nearest ErrorBoundary on the next render.
        throw error;
      });
    const tags = tagsKey.split(",");
    fetchClient.cachePromiseAndRegisterTags(fetchKey, rawPromise, tags);
  } else {
    fetchClient.registerTags(fetchKey, tagsKey.split(","));
  }

  // Get the cached promise
  const [promise, setPromise] = useState<Promise<T | undefined>>(
    () => promiseCacheStore.get(fetchKey) as Promise<T>,
  );

  const [isPending, startTransition] = useTransition();

  const refreshFetch = useCallback(() => {
    const newPromise = fetch().then((res) => extractHttpResponseData(res));
    const tags = tagsKey.split(",");
    fetchClient.cachePromiseAndRegisterTags(fetchKey, newPromise, tags);
    startTransition(() => {
      setPromise(newPromise);
    });
  }, [fetch, fetchKey, tagsKey]);

  useEffect(() => {
    if (!tagsKey) return;
    const tags = tagsKey.split(",");
    const subscriptions = tags.map((tag) =>
      eventEmitter.addListener(tag, refreshFetch),
    );
    return () => subscriptions.forEach((sub) => sub.remove());
  }, [tagsKey, refreshFetch]);

  const data = use(promise);

  if (data === undefined) {
    throw new ApiError("Response resolved with no data", "EMPTY_DATA");
  }

  return { data, refreshFetch, isRefreshing: isPending };
}
