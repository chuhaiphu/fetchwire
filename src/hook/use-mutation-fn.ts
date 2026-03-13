import { useState, useCallback, useRef, useEffect } from 'react';
import { ApiError } from '../util/api-error';
import { HttpResponse, MutationOptions, ExecuteMutationOptions } from '../interface';
import { eventEmitter } from '../core/event-emitter';

interface MutationState<T> {
  data: T | null;
  isMutating: boolean;
}

/**
 * A hook for executing a mutation function and managing the state of the mutation.
 * @param options - Has invalidatesTags property that will trigger refetching of the useFetchFn with the given tags.
 * @returns The state of the mutation and the mutation function.
 */
export function useMutationFn<T>(options?: MutationOptions) {
  const [state, setState] = useState<MutationState<T>>({
    data: null,
    isMutating: false,
  });
  const isMounted = useRef<boolean>(true);
  
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const executeMutationFn = useCallback(
    async (
      mutationFn: () => Promise<HttpResponse<T>>,
      executeOptions?: ExecuteMutationOptions<T>
    ): Promise<HttpResponse<T> | null> => {
      setState((prev) => ({ ...prev, isMutating: true }));

      try {
        const response = await mutationFn();
        
        if (isMounted.current) {
          setState({
            data: response.data || null,
            isMutating: false,
          });
          
          options?.invalidatesTags?.forEach((tag) => {
            eventEmitter.emit(tag);
          });
          
          if (response.data) executeOptions?.onSuccess?.(response.data);
          else executeOptions?.onSuccess?.(null as unknown as T);
        }
        return response;
      } catch (error) {
        const apiError = error as ApiError;
        if (isMounted.current) {
          setState({
            data: null,
            isMutating: false,
          });
          if (apiError) executeOptions?.onError?.(apiError);
        }
        return null;
      }
    },
    [options?.invalidatesTags]
  );

  const reset = useCallback(() => {
    setState({ data: null, isMutating: false });
  }, []);

  return { ...state, executeMutationFn, reset };
}