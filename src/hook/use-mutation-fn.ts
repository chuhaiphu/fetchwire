import { useState, useCallback, useRef, useEffect } from 'react';
import { ApiError } from '../util/api-error';
import {
  HttpResponse,
  MutationOptions,
  ExecuteMutationOptions,
} from '../interface';
import { fetchClient } from '../core/fetch-client';

interface MutationState<T> {
  data: T | null;
  isMutating: boolean;
}

/**
 *
 * @param mutationFn - An async function that performs the mutation.
 * @param options - Configuration for invalidating tags upon successful execution.
 * @returns An object containing the mutation state and the execution function.
 * * @example
 * const { executeMutationFn, isMutating } = useMutationFn(logoutApi, {
 * invalidatesTags: ['user-session']
 * });
 * // Trigger without arguments:
 * executeMutationFn({ onSuccess: () => console.log('Logged out') });
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
 *
 * @template TVariables - The type of the input variables for the mutation.
 * @param mutationFn - An async function receiving variables and returning a promise.
 * @param options - Configuration for invalidating tags upon successful execution.
 * @returns An object containing the mutation state and the execution function.
 * * @example
 * const { executeMutationFn } = useMutationFn((id: string) => deleteItem(id), {
 * invalidatesTags: ['items']
 * });
 * // Trigger with variables:
 * executeMutationFn('item-id-123', { onSuccess: () => alert('Deleted') });
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

  // Each time the consumer component renders, a brand new options object is created,
  // Which would cause the useEffect to re-run, even if the tags are the same.
  // So we need to create a string key for it by stringifying from options.tags.
  // We can use JSON.stringify, but it can be slow for large arrays, so we can use join instead.
  // This assumes that the tags themselves don't contain commas.
  const invalidatesTagsKey = options?.invalidatesTags?.join(',') ?? '';

  const executeMutationFn = useCallback(
    async (
      firstArg?: TVariables | ExecuteMutationOptions<T>,
      secondArg?: ExecuteMutationOptions<T>
    ): Promise<HttpResponse<T> | null> => {
      // Determine if the first argument is variables or execute options based on the parameters count of mutationFn
      // Function.length returns the number of parameters defined in the function signature
      const hasVariables = mutationFn.length > 0;

      // If mutationFn expects variables, the first argument is variables and the second is execute options.
      // If mutationFn does not expect variables, the first argument is execute options and there is no second argument.
      // Example:
      // executeMutationFn(variables, { onSuccess }) -> hasVariables = true
      // executeMutationFn({ onSuccess }) -> hasVariables = false
      const variables = (hasVariables ? firstArg : undefined) as TVariables;
      const executeOptions = (hasVariables ? secondArg : firstArg) as ExecuteMutationOptions<T>;

      setState((prev) => ({ ...prev, isMutating: true }));

      try {
        const response = await mutationFn(variables);

        if (isMounted.current) {
          setState({
            data: response.data ?? null,
            isMutating: false,
          });

          if (invalidatesTagsKey) {
            const tagsToInvalidate = invalidatesTagsKey.split(',');
            fetchClient.invalidateTags(tagsToInvalidate);
          }
          executeOptions?.onSuccess?.(response.data ?? null);
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
    [mutationFn, invalidatesTagsKey]
  );

  const reset = useCallback(() => {
    setState({ data: null, isMutating: false });
  }, []);

  return { ...state, executeMutationFn, reset };
}
