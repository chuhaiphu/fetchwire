import { useState, useCallback, useRef, useEffect } from 'react';
import { fetchClient } from '../cache/fetch-client';
import type { ApiError } from '../core/api-error';
import { MutationOptions, ExecuteMutationOptions } from '../interface/react';

interface MutationState<T> {
  data: T | null;
  isMutating: boolean;
}

/**
 * A hook that runs a mutation on demand and tracks its pending and result state.
 *
 * @template T Type of the value `mutationFn` resolves.
 * @template TVariables Type of the input passed to `mutationFn`. Defaults to `void`.
 * @template TError Type of the value `mutationFn` rejects with. Defaults to `ApiError`, what
 *   `wireData` / `wireRaw` throw; set it yourself when `mutationFn` uses another transport.
 * @param mutationFn - A Promise-returning function `(variables: TVariables) => Promise<T>`.
 *   fetchwire runs it only when you call `executeMutationFn(variables)`.
 *   Whatever it resolves **is** `data` — fetchwire never inspects or unwraps it.
 * @param options - Options for this hook.
 *   - `invalidatesTags` — an optional list of tag strings to invalidate after a successful
 *     mutation. Every `useFetch` / `useFetchFn` subscribed to a matching tag refreshes.
 * @returns
 *   - `data` — the resolved data of type `T`, or null.
 *   - `isMutating` — true while the mutation is in flight.
 *   - `executeMutationFn` — runs `mutationFn(variables)`. `variables` comes first and may be
 *      omitted when `TVariables` is `void`; optional per-call `{ onSuccess, onError }`
 *      callbacks come second.
 *   - `reset` — resets state back to the initial idle state and retires every in-flight run.
 *
 * @example
 * // With variables — TVariables infers as `string`:
 * const { executeMutationFn } = useMutationFn((id: string) => deleteTodoApi(id), {
 *   invalidatesTags: ['todos'],
 * });
 * executeMutationFn('todo-123', { onSuccess: () => alert('Deleted') });
 *
 * @example
 * // Without variables — TVariables falls back to `void`:
 * const { executeMutationFn, isMutating } = useMutationFn(logoutApi, {
 *   invalidatesTags: ['user-session'],
 * });
 * executeMutationFn();
 * executeMutationFn(undefined, { onSuccess: () => console.log('Logged out') });
 */
export function useMutationFn<T, TVariables = void, TError = ApiError>(
  mutationFn: (variables: TVariables) => Promise<T>,
  options?: MutationOptions,
) {
  const [state, setState] = useState<MutationState<T>>({
    data: null,
    isMutating: false,
  });

  const latestRequestIdRef = useRef(0);
  const mutationFnRef = useRef(mutationFn);

  useEffect(() => {
    mutationFnRef.current = mutationFn;
  }, [mutationFn]);

  const invalidatesTagsKey = JSON.stringify(options?.invalidatesTags ?? []);

  const executeMutationFn = useCallback(
    async (
      variables: TVariables,
      executeOptions?: ExecuteMutationOptions<T, TError>,
    ): Promise<T | null> => {
      const fn = mutationFnRef.current;
      const requestId = ++latestRequestIdRef.current;

      setState((prev) => ({ ...prev, isMutating: true }));

      let result: T;

      try {
        result = await fn(variables);
      } catch (error) {
        if (requestId === latestRequestIdRef.current) {
          setState({ data: null, isMutating: false });
        }
        await executeOptions?.onError?.(error as TError);
        return null;
      }

      if (requestId === latestRequestIdRef.current) {
        setState({ data: result ?? null, isMutating: false });
      }

      const tagsToInvalidate = JSON.parse(invalidatesTagsKey) as string[];
      if (tagsToInvalidate.length > 0) {
        fetchClient.invalidateTags(tagsToInvalidate);
      }

      await executeOptions?.onSuccess?.(result ?? null);

      return result;
    },
    [invalidatesTagsKey],
  );

  const reset = useCallback(() => {
    latestRequestIdRef.current++;
    setState({ data: null, isMutating: false });
  }, []);

  return { ...state, executeMutationFn, reset };
}
