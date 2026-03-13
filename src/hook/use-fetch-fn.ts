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
export function useFetchFn<T>(options?: FetchOptions) {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
  });

  const isMounted = useRef<boolean>(true);
  const lastFetchFn = useRef<(() => Promise<HttpResponse<T>>) | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const execute = useCallback(
    async (
      fetchFn: () => Promise<HttpResponse<T>>,
      execOptions: { isRefresh: boolean }
    ): Promise<HttpResponse<T> | null> => {
      lastFetchFn.current = fetchFn;

      setState((prev) => ({
        ...prev,
        isLoading: !execOptions.isRefresh,
        isRefreshing: !!execOptions.isRefresh,
        error: null,
      }));

      try {
        const response = await fetchFn();

        if (isMounted.current) {
          setState({
            data: response.data || null,
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
    (fetchFn: () => Promise<HttpResponse<T>>) => {
      return execute(fetchFn, { isRefresh: false });
    },
    [execute]
  );

  const refreshFetchFn = useCallback(() => {
    if (lastFetchFn.current) {
      return execute(lastFetchFn.current, { isRefresh: true });
    }
    return null;
  }, [execute]);

  useEffect(() => {
    if (!options?.tags || options.tags.length === 0) return;

    const subscriptions = options.tags.map((tag) =>
      eventEmitter.addListener(tag, () => {
        refreshFetchFn();
      })
    );
    return () => subscriptions.forEach((sub) => sub.remove());
  }, [options?.tags, refreshFetchFn]);

  return { ...state, executeFetchFn, refreshFetchFn };
}
