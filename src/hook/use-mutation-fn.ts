import { useState, useCallback, useRef, useEffect } from "react";
import { normalizeToApiError } from "../util/normalize-to-api-error";
import { MutationOptions, ExecuteMutationOptions } from "../interface";
import { fetchClient } from "../core/fetch-client";

interface MutationState<T> {
  data: T | null;
  isMutating: boolean;
}

/**
 * A hook that runs a mutation on demand and tracks its pending and result state.
 *
 * @template T - The type of the value `mutationFn` resolves.
 * @template TVariables - The type of the input passed to `mutationFn`. Defaults to `void`.
 * @param mutationFn - A Promise-returning function `(variables: TVariables) => Promise<T>`.
 *   fetchwire runs it only when you call `executeMutationFn(variables)`.
 *   Whatever it resolves **is** `data` — fetchwire never inspects or unwraps it.
 * @param options - Options for this hook.
 *   - `invalidatesTags` — an optional list of tag strings to invalidate after a successful mutation.
 *     Every `useFetch` / `useFetchFn` subscribed to a matching tag refreshes automatically.
 *     Tag strings must not contain commas.
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
export function useMutationFn<T, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<T>,
  options?: MutationOptions,
) {
  const [state, setState] = useState<MutationState<T>>({
    data: null,
    isMutating: false,
  });

  const latestRequestIdRef = useRef(0);
  const mutationFnRef = useRef(mutationFn);

  // Why do we need mutationFnRef + this useEffect?
  //
  // Problem 1 — Stale closure if we only did useRef(mutationFn) once at init:
  //   useRef(mutationFn) only captures the mutationFn value from the FIRST RENDER.
  //   If mutationFn depends on state/props (e.g. mutationFn = () => updateProfile(form)),
  //   then when `form` changes, mutationFnRef.current would still point to the OLD closure with the OLD `form`.
  //   => executeMutationFn() would SEND THE STALE PAYLOAD to the server, even though the component
  //      re-rendered with new values. Unlike a stale read, a stale write cannot be corrected by refetching.
  //   That's why this useEffect is required — to keep mutationFnRef.current in sync
  //
  // Problem 2 — What if we drop the ref and put mutationFn directly in the useCallback deps of `executeMutationFn`?
  //   It would still call the correct mutationFn (via closure).
  //   BUT: if the caller passes an inline function that isn't memoized, e.g.:
  //     useMutationFn((id: string) => deleteItem(id), { invalidatesTags: ['items'] })
  //   then `(id) => deleteItem(id)` is a brand new function object on every render.
  //   1. mutationFn's reference changes every render
  //   2. then executeMutationFn (useCallback) changes reference too, since mutationFn is in its deps
  //
  //   In other words: removing the ref shifts the burden of memoizing mutationFn onto every consumer of this hook.
  //
  // => Solution: split these into two separate concerns
  //   (1) Keep executeMutationFn's reference stable: do NOT put mutationFn in the useCallback deps
  //    — only keep invalidatesTagsKey (the only value that actually needs to change its behavior).
  //   (2) Still guarantee executeMutationFn() always calls the latest mutationFn:
  //       read mutationFn through a ref (mutationFnRef.current) and sync that ref on every render via the useEffect below.
  //
  useEffect(() => {
    mutationFnRef.current = mutationFn;
  }, [mutationFn]);

  // Each time the consumer component renders, a brand new options object is created,
  // Which would cause the useEffect to re-run, even if the tags are the same.
  // So we need to create a string key for it by stringifying from options.tags.
  // We can use JSON.stringify, but it can be slow for large arrays, so we can use join instead.
  // This assumes that the tags themselves don't contain commas.
  const invalidatesTagsKey = options?.invalidatesTags?.join(",") ?? "";

  const executeMutationFn = useCallback(
    async (
      variables: TVariables,
      executeOptions?: ExecuteMutationOptions<T>,
    ): Promise<T | null> => {
      const fn = mutationFnRef.current;

      // Claim a serial number for this run.
      const requestId = ++latestRequestIdRef.current;

      setState((prev) => ({ ...prev, isMutating: true }));

      let result: T;

      // Only the network call belongs inside `try`.
      // Everything that happens after a success is the CONSEQUENCE of the mutation, not part of it.
      // Why?: If they ran inside the same `try`, `onError` would fire alongside `onSuccess`,
      // and the caller would be told a mutation the server already committed had failed.
      try {
        result = await fn(variables);
      } catch (error) {
        const apiError = normalizeToApiError(error);
        if (requestId === latestRequestIdRef.current) {
          setState({
            data: null,
            isMutating: false,
          });
        }
        await executeOptions?.onError?.(apiError);
        return null;
      }

      if (requestId === latestRequestIdRef.current) {
        setState({
          data: result ?? null,
          isMutating: false,
        });
      }

      if (invalidatesTagsKey) {
        const tagsToInvalidate = invalidatesTagsKey.split(",");
        fetchClient.invalidateTags(tagsToInvalidate);
      }

      await executeOptions?.onSuccess?.(result ?? null);

      return result;
    },
    [invalidatesTagsKey],
  );

  const reset = useCallback(() => {
    // Retire every in-flight run.
    latestRequestIdRef.current++;
    setState({ data: null, isMutating: false });
  }, []);

  return { ...state, executeMutationFn, reset };
}
