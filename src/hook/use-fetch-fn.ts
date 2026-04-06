import { useState, useRef, useEffect, useCallback } from 'react';
import { ApiError } from '../util/api-error';
import { HttpResponse, FetchOptions } from '../interface';
import { eventEmitter } from '../core/event-emitter';

interface FetchState<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: ApiError | null;
}

/**
 * A hook for executing a fetch function and managing the state of the fetch.
 * @param options - Has tags property that will trigger refetching of the useFetchFn with the given tags.
 * @returns The state of the fetch and the fetch function.
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
  fetchFnRef.current = fetchFn;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const execute = useCallback(
    async (execOptions: {
      isRefresh: boolean;
    }): Promise<HttpResponse<T> | null> => {
      const fn = fetchFnRef.current;

      setState((prev) => ({
        ...prev,
        isLoading: !execOptions.isRefresh,
        isRefreshing: !!execOptions.isRefresh,
        error: null,
      }));

      try {
        const response = await fn();

        if (isMounted.current) {
          setState({
            data: response.data ?? null,
            isLoading: false,
            isRefreshing: false,
            error: null,
          });
        }
        return response;
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
    []
  );

  const executeFetchFn = useCallback(
    () => execute({ isRefresh: false }),
    [execute]
  );
  const refreshFetchFn = useCallback(() => execute({ isRefresh: true }), [execute]);

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, isRefreshing: false, error: null });
  }, []);

  // Each time the consumer component renders, a brand new options object is created, 
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
