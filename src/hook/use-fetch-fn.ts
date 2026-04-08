import { useState, useRef, useEffect, useCallback } from 'react';
import { ApiError } from '../util/api-error';
import { HttpResponse, FetchOptions } from '../interface';
import { eventEmitter } from '../core/event-emitter';
import { promiseCacheMap } from '../core/promise-cache-map';
import { extractHttpResponseData } from '../util/helper';

interface FetchState<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: ApiError | null;
}

/**
 * A hook for manually handling the execution of a fetch function and managing the state of that fetch.
 * @param fetch - A promise function that returns `Promise<HttpResponse<T>>`.
 * @param options - Optional `tags` that will trigger a refresh when a
 *   `useMutationFn` with matching `invalidatesTags` completes.
 *   Tag strings must not contain commas.
 * @returns
 *   - `isLoading` — a boolean indicating if the fetch is currently executing.
 *   - `isRefreshing` — a boolean indicating if the fetch is currently refreshing.
 *   - `error` — an error object if the fetch failed, or null if no error occurred.
 *   - `executeFetchFn` — a function to manually execute the fetch function.
 *   - `refreshFetchFn` — a function to manually refresh the fetch function.
 *   - `reset` — a function to manually reset the fetch state.
 */
export function useFetchFn<T>(
  fetchFn: () => Promise<HttpResponse<T>>,
  options?: FetchOptions
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

  // Because useCallback only return the same reference of execute() function,
  // And because useRef only get the new fetchFn reference at the first render,
  // On the next renders, useRef will return the same fetchFn reference,
  // We need to update the fetchFn reference manually each time the fetchFn changes,
  // So that the execute() function can always get the latest fetchFn reference when it runs.
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
  const fetchKey = options?.fetchKey;
  const execute = useCallback(
    async (execOptions: {
      isRefresh: boolean;
    }): Promise<T | null> => {
      // Get the latest fetchFn reference from the ref, which is updated by the useEffect above each time the fetchFn changes.
      const fn = fetchFnRef.current;
      setState((prev) => ({
        ...prev,
        isLoading: !execOptions.isRefresh,
        isRefreshing: !!execOptions.isRefresh,
        error: null,
      }));

      try {
        let data: T;
        if (!execOptions.isRefresh && fetchKey && promiseCacheMap.has(fetchKey)) {
          // Get the Promise cache function from the fetchKey that prefetch() have set
          // So do not have to perform fetching again
          data = await promiseCacheMap.get(fetchKey) as T;
        } else {
          const rawPromise = fn().then((res) => extractHttpResponseData(res));
          // Set the promise right away so if there is any fetch with the same fetchKey, 
          // it will be served with promise from cacheMap instead of create a brand new promise.
          if (fetchKey) {
            promiseCacheMap.set(fetchKey, rawPromise);
          }
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
    [fetchKey]
  );

  const executeFetchFn = useCallback(
    () => execute({ isRefresh: false }),
    [execute]
  );
  const refreshFetchFn = useCallback(() => execute({ isRefresh: true }), [execute]);

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, isRefreshing: false, error: null });
  }, []);

  // Because options.tags is an array,
  // Each time the consumer component renders, a brand new array is created,
  // Which would cause the useEffect to re-run, even if the tags are the same.
  // So we need to create a string key for it by stringifying from options.tags.
  // We can use JSON.stringify, but it can be slow for large arrays, so we can use join instead.
  // This assumes that the tags themselves don't contain commas.
  const tagsKey = options?.tags?.join(',') ?? '';
  useEffect(() => {
    if (!tagsKey) return;
    const tags = tagsKey.split(',');
    const subscriptions = tags.map((tag) =>
      eventEmitter.addListener(tag, () => {
        refreshFetchFn();
      })
    );
    return () => subscriptions.forEach((sub) => sub.remove());
  }, [tagsKey, refreshFetchFn]);

  return { ...state, executeFetchFn, refreshFetchFn, reset };
}
