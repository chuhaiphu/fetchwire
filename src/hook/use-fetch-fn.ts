import { useState, useRef, useEffect, useCallback } from "react";
import { ApiError } from "../util/api-error";
import { HttpResponse, FetchOptions } from "../interface";
import { eventEmitter } from "../core/event-emitter";
import { promiseCacheStore } from "../core/promise-cache-store";
import { extractHttpResponseData } from "../util/helper";
import { fetchClient } from "../core/fetch-client";

interface FetchState<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: ApiError | null;
}

/**
 * A hook for manually handling the execution of a fetch function and managing the state of that fetch.
 *
 * @param fetchFn - A promise function that returns `Promise<HttpResponse<T>>`.
 * @param options - Required options for this hook.
 *   - `fetchKey` — a unique key used to cache the in-flight promise. If `prefetch()`
 *     was called with the same key beforehand, the first execution will reuse the
 *     cached promise instead of firing a new network request.
 *   - `tags` — optional list of tag strings that will trigger a refresh when a
 *     `useMutationFn` with matching `invalidatesTags` completes.
 *     Tag strings must not contain commas.
 *
 * @returns
 *   - `data` — the resolved value of type `T`, or null if not yet fetched.
 *   - `isLoading` — true while the initial fetch is in flight.
 *   - `isRefreshing` — true while a refresh is in flight.
 *   - `error` — an `ApiError` if the last fetch failed, otherwise null.
 *   - `executeFetchFn` — trigger the initial fetch manually.
 *   - `refreshFetchFn` — trigger a refresh (bypasses the promise cache).
 *   - `reset` — reset state back to the initial idle state.
 */
export function useFetchFn<T>(
  fetchFn: () => Promise<HttpResponse<T>>,
  options: FetchOptions,
) {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
  });

  const isMounted = useRef<boolean>(true);
  const fetchFnRef = useRef(fetchFn);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Why do we need fetchFnRef + this useEffect?
  //
  // Problem 1 — Stale closure if we only did useRef(fetchFn) once at init:
  //   useRef(fetchFn) only captures the fetchFn value from the FIRST RENDER.
  //   If fetchFn depends on state/props (e.g. fetchFn = () => api.getUser(id)),
  //   then when `id` changes, fetchFnRef.current would still point to the OLD closure with the OLD `id`.
  //   => execute() would always fetch with stale parameters, even though the component re-rendered with a new id.
  //   That's why this useEffect is required — to keep fetchFnRef.current in sync
  //
  // Problem 2 — What if we drop the ref and put fetchFn directly in the useCallback deps of `execute`?
  //   It would still call the correct fetchFn (via closure).
  //   BUT: if the caller passes an inline function that isn't memoized, e.g.:
  //     useFetchFn(() => api.getUser(id), { fetchKey: 'user' })
  //   then `() => api.getUser(id)` is a brand new function object on every render.
  //   1. fetchFn's reference changes every render
  //   2. then execute (useCallback) changes reference too, since fetchFn is in its deps
  //   3. then executeFetchFn/refreshFetchFn change reference as well
  //   => if the consumer uses them as a useEffect dependency (which is how this hook is designed to be used):
  //        useEffect(() => { executeFetchFn() }, [executeFetchFn])
  //      then that effect re-runs every time executeFetchFn's reference changes
  //   => which calls execute() again => re-render => new fetchFn reference is created => INFINITE LOOP.
  //
  //   In other words: removing the ref shifts the burden of memoizing fetchFn onto every consumer of this hook.
  //
  // => Solution: split these into two separate concerns
  //   (1) Keep execute()'s reference stable: do NOT put fetchFn in the useCallback deps
  //    — only keep fetchKey/tagsKey (the values that actually need to change execute's behavior).
  //   (2) Still guarantee execute() always calls the latest fetchFn:
  //       read fetchFn through a ref (fetchFnRef.current) and sync that ref on every render via the useEffect below.
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  // Create only one reference for the execute function with useCallback,
  // So that the executeFetchFn and refreshFetchFn below can be memoized
  // In return won't cause unnecessary re-renders in the consumer component.
  // ---
  // If not use useCallback here,
  // In case the consumer component put executeFetchFn or refreshFetchFn in the dependency array of their useEffect,
  // E.g useEffect(() => { executeFetchFn }, [executeFetchFn]), which is a must to use useFetchFn,
  // This is the consequence:
  // 1. Each time the Component is rendered, a new execute function is created
  // 2. The useEffect in the consumer component will be triggered because executeFetchFn reference changed
  // 3. executeFetchFn will run, which will call this new execute function reference
  // 4. Then it will trigger a new fetch and update the state.
  // 5. The component will re-render because the state is updated.
  // 6. Repeat from step 1, which creates an infinite loop of fetches and re-renders.
  const fetchKey = options.fetchKey;

  // Because options.tags is an array,
  // Each time the consumer component renders, a brand new array is created,
  // Which would cause the useEffect to re-run, even if the tags are the same.
  // So we need to create a string key for it by stringifying from options.tags.
  // We can use JSON.stringify, but it can be slow for large arrays, so we can use join instead.
  // This assumes that the tags themselves don't contain commas.
  const tagsKey = options.tags?.join(",") ?? "";

  const execute = useCallback(
    async (execOptions: { isRefresh: boolean }): Promise<T | null> => {
      // Read fetchFn through the ref (fetchFnRef.current), NOT directly from the `fetchFn` closure variable.
      const fn = fetchFnRef.current;
      setState((prev) => ({
        ...prev,
        isLoading: !execOptions.isRefresh,
        isRefreshing: !!execOptions.isRefresh,
        error: null,
      }));

      try {
        let data: T;
        if (!execOptions.isRefresh && promiseCacheStore.has(fetchKey)) {
          // Get the Promise cache function from the fetchKey that prefetch() have set,
          // so we do not have to perform fetching again.
          // ---
          // register the tags to fetchKey without caching promise.
          fetchClient.registerTags(fetchKey, tagsKey.split(","));
          data = (await promiseCacheStore.get(fetchKey)) as T;
        } else {
          const rawPromise = fn().then((res) => extractHttpResponseData(res));
          const tags = tagsKey.split(",");
          // Cache the promise right away so if there is any fetch with the same fetchKey,
          // it will be served with promise from cacheMap instead of create a brand new promise.
          fetchClient.cachePromiseAndRegisterTags(fetchKey, rawPromise, tags);
          data = await rawPromise;
        }

        if (isMounted.current) {
          setState({
            data: data ?? null,
            isLoading: false,
            isRefreshing: false,
            error: null,
          });
        }
        return data;
      } catch (error) {
        const apiError = error as ApiError;
        if (isMounted.current) {
          setState({
            data: null,
            isLoading: false,
            isRefreshing: false,
            error: apiError,
          });
        }
        return null;
      }
    },
    [fetchKey, tagsKey],
  );

  const executeFetchFn = useCallback(
    () => execute({ isRefresh: false }),
    [execute],
  );
  const refreshFetchFn = useCallback(
    () => execute({ isRefresh: true }),
    [execute],
  );

  const reset = useCallback(() => {
    setState({
      data: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    if (!tagsKey) return;
    const tags = tagsKey.split(",");
    const subscriptions = tags.map((tag) =>
      eventEmitter.addListener(tag, () => {
        refreshFetchFn();
      }),
    );
    return () => subscriptions.forEach((sub) => sub.remove());
  }, [tagsKey, refreshFetchFn]);

  return { ...state, executeFetchFn, refreshFetchFn, reset };
}
