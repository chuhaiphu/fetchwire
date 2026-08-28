import {
  useEffect,
  useCallback,
  use,
  useRef,
  useState,
  useTransition,
} from "react";
import { FetchOptions } from "../interface";
import { eventEmitter } from "../core/event-emitter";
import { promiseCacheStore } from "../core/promise-cache-store";
import { fetchClient } from "../core/fetch-client";

/**
 * A hook that fetches immediately on mount and suspends the component while data is loading.
 * The parent tree must have a `<Suspense>` boundary and an `<ErrorBoundary>`.
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
 *     If `prefetch()` ran with the same key beforehand, the hook will reuses the cached Promise instead.
 *     Changing `fetchKey` starts a fresh fetch and **suspends** the component.
 *     Change `fetchKey` inside `startTransition` to keep the old data on screen while the new key loads.
 *   - `tags` — an optional list of tag strings this request subscribes to.
 *     When a `useMutationFn` invalidates a matching tag via `invalidatesTags`,
 *     the hook refreshes automatically.
 *     Tag strings must not contain commas.
 *
 * @returns
 *   - `data` — the resolved value of type `T`.
 *   - `refreshFetch` — manually triggers a refresh while the component is mounted.
 *     Uses `useTransition` internally so the current data stays visible while the refresh loads.
 *     
 *     **refreshFetch CANNOT be used to retry from an ErrorBoundary**:
 *     when ErrorBoundary catches an API error the component is unmounted, so `refreshFetch` is inaccessible.
 *     
 *     To retry from an ErrorBoundary:
 *     call `fetchClient.remove(fetchKey)` inside the boundary's reset handler, 
 *     this clears the rejected Promise from the Promise cache so the next mount starts a fresh fetch.
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
    // ---
    // A rejected Promise is cached too, and is deliberately NOT deleted here.
    // What if we deleted the rejected promise from cache?
    // 1. Each time the Component is rendered, a new Pending Promise from fetch is created
    // 2. After use(promise) hook run, React will abort the current render, dispose all the states
    // 3. React will render the Suspense fallback.
    // 4. After the current rejected error-Promise is resolved, React will re-render the suspended component tree from scratch
    // 5. The component will received a new Pending Promise and will suspend again.
    // 6. The component will create an infinite loop of suspend-render-suspend-render...
    //
    // Keeping the rejected Promise in cache lets React propagate the error to the nearest ErrorBoundary on the next render.
    const rawPromise = fetch();
    const tags = tagsKey.split(",");
    fetchClient.cachePromiseAndRegisterTags(fetchKey, rawPromise, tags);
  } else {
    fetchClient.registerTags(fetchKey, tagsKey.split(","));
  }

  // Get the cached promise
  const [promise, setPromise] = useState<Promise<T>>(
    () => promiseCacheStore.get(fetchKey) as Promise<T>,
  );

  // What if we relied on the useState initializer above alone?
  // 1. The initializer is lazy: it runs on MOUNT ONLY.
  // 2. But fetchKey is built from props/state, so it can change on a later render,
  //    e.g. a new fetchKey is provided: `todos-${filter}`.
  // 3. The block above already ran for the NEW key: it fetched and cached that promise,
  //    so promiseCacheStore.get(fetchKey) is guaranteed to hold an entry here.
  // 4. The `promise` state, however, would still hold the promise of the OLD key.
  // 5. use(promise) keeps returning the OLD key's data — a key change would never show new data.
  // ---
  // Adjusting state during render is React's documented pattern for this,
  // and it is why no useEffect is needed: https://react.dev/learn/you-might-not-need-an-effect
  // 
  const [previousFetchKey, setPreviousFetchKey] = useState(fetchKey);
  if (fetchKey !== previousFetchKey) {
    setPreviousFetchKey(fetchKey);
    setPromise(promiseCacheStore.get(fetchKey) as Promise<T>);
  }

  const [isPending, startTransition] = useTransition();

  const fetchRef = useRef(fetch);

  // Why do we need fetchRef + this useEffect?
  //
  // Problem 1 — Stale closure if we only did useRef(fetch) once at init:
  //   useRef(fetch) only captures the fetch value from the FIRST RENDER.
  //   If fetch depends on state/props (e.g. fetch = () => getTodosApi(filter)),
  //   then when `filter` changes, fetchRef.current would still point to the OLD closure with the OLD `filter`.
  //   => refreshFetch() would always refresh with stale parameters, even though the component re-rendered
  //      with a new filter.
  //   That's why this useEffect is required — to keep fetchRef.current in sync
  //
  // Problem 2 — What if we drop the ref and put fetch directly in the useCallback deps of `refreshFetch`?
  //   It would still call the correct fetch (via closure).
  //   BUT: if the caller passes an inline function that isn't memoized, e.g.:
  //     useFetch(() => getTodosApi(filter), { fetchKey: `todos-${filter}` })
  //   then `() => getTodosApi(filter)` is a brand new function object on every render.
  //   1. fetch's reference changes every render
  //   2. then refreshFetch (useCallback) changes reference too, since fetch is in its deps
  //   3. then the tag-subscription useEffect below re-runs, since refreshFetch is in its deps
  //   => every tag listener is removed and registered again on EVERY render.
  //      Nothing breaks, but the work is wasted.
  //
  //   In other words: removing the ref shifts the burden of memoizing fetch onto every consumer of this hook.
  //
  // => Solution: split these into two separate concerns
  //   (1) Keep refreshFetch's reference stable: do NOT put fetch in the useCallback deps
  //    — only keep fetchKey/tagsKey (the values that actually need to change refreshFetch's behavior).
  //   (2) Still guarantee refreshFetch() always calls the latest fetch:
  //       read fetch through a ref (fetchRef.current) and sync that ref on every render via the useEffect below.
  //
  // The cache-miss branch at the top of this hook keeps calling `fetch` directly: it runs during render,
  // where `fetch` is already the latest value.
  useEffect(() => {
    fetchRef.current = fetch;
  }, [fetch]);

  const refreshFetch = useCallback(() => {
    const newPromise = fetchRef.current();
    const tags = tagsKey.split(",");
    fetchClient.cachePromiseAndRegisterTags(fetchKey, newPromise, tags);
    startTransition(() => {
      setPromise(newPromise);
    });
  }, [fetchKey, tagsKey]);

  useEffect(() => {
    if (!tagsKey) return;
    const tags = tagsKey.split(",");
    const subscriptions = tags.map((tag) =>
      eventEmitter.addListener(tag, refreshFetch),
    );
    return () => subscriptions.forEach((sub) => sub.remove());
  }, [tagsKey, refreshFetch]);

  // Handed back untouched: the hook does not judge what `fetch` resolved.
  const data = use(promise);

  return { data, refreshFetch, isRefreshing: isPending };
}
