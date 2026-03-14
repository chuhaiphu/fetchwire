import { useState, useCallback, useRef, useEffect } from 'react';
import { ApiError } from '../util/api-error';
import {
  HttpResponse,
  MutationOptions,
  ExecuteMutationOptions,
} from '../interface';
import { eventEmitter } from '../core/event-emitter';

interface MutationState<T> {
  data: T | null;
  isMutating: boolean;
}

/**
 * Mutation without variables. Use when the payload is fixed (e.g. from closure/state).
 *
 * @param mutationFn - Function that returns a promise (e.g. `() => createApi()`).
 * @param options - Optional `invalidatesTags` to refetch useFetchFn with those tags after success.
 * @returns executeMutationFn(options?) — call with no args or only options: `executeMutationFn()` or `executeMutationFn({ onSuccess, onError })`.
 */
export function useMutationFn<T>(
  mutationFn: (variables: void) => Promise<HttpResponse<T>>,
  options?: MutationOptions
): {
  data: T | null;
  isMutating: boolean;
  executeMutationFn: (
    executeOptions?: ExecuteMutationOptions<T>
  ) => Promise<HttpResponse<T> | null>;
  reset: () => void;
};

/**
 * Mutation with variables. Use when the payload is passed at call time (e.g. update forms, PATCH body).
 *
 * @param mutationFn - Function that receives variables and returns a promise (e.g. `(data) => updateApi(id, data)`).
 * @param options - Optional `invalidatesTags` to refetch useFetchFn with those tags after success.
 * @returns executeMutationFn(variables, options?) — you must pass variables first, then optional callbacks.
 */
export function useMutationFn<T, TVariables>(
  mutationFn: (variables: TVariables) => Promise<HttpResponse<T>>,
  options?: MutationOptions
): {
  data: T | null;
  isMutating: boolean;
  executeMutationFn: (
    variables: TVariables,
    executeOptions?: ExecuteMutationOptions<T>
  ) => Promise<HttpResponse<T> | null>;
  reset: () => void;
};

export function useMutationFn<T, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<HttpResponse<T>>,
  options?: MutationOptions
) {
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
      firstArg?: TVariables | ExecuteMutationOptions<T>,
      secondArg?: ExecuteMutationOptions<T>
    ): Promise<HttpResponse<T> | null> => {
      const hasTwoArgs = secondArg !== undefined;
      const variables = (hasTwoArgs ? firstArg : undefined) as TVariables;
      const executeOptions = hasTwoArgs ? secondArg : firstArg as ExecuteMutationOptions<T>;

      setState((prev) => ({ ...prev, isMutating: true }));

      try {
        const response = await mutationFn(variables);

        if (isMounted.current) {
          setState({
            data: response.data ?? null,
            isMutating: false,
          });

          options?.invalidatesTags?.forEach((tag) => {
            eventEmitter.emit(tag);
          });

          if (response.data != null) executeOptions?.onSuccess?.(response.data);
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
          executeOptions?.onError?.(apiError);
        }
        return null;
      }
    },
    [mutationFn, options?.invalidatesTags]
  );

  const reset = useCallback(() => {
    setState({ data: null, isMutating: false });
  }, []);

  return { ...state, executeMutationFn, reset };
}
