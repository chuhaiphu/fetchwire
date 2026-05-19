# Changelog

## [4.1.1] - 2026-05-19

### Fixed

- **`useMutationFn`: variables silently dropped when `executeOptions` is omitted**

  When a mutation function takes variables (e.g. `(id: string) => deleteApi(id)`),
  calling `executeMutationFn(variables)` without a second argument caused the
  variables to be misidentified as `executeOptions`, so `mutationFn` was called
  with `undefined` instead of the provided value.

  Root cause: the previous implementation used `hasTwoArgs = secondArg !== undefined`
  to decide which overload was in effect. The TypeScript type signature marks
  `executeOptions` as optional (`executeOptions?: ExecuteMutationOptions<T>`), so
  callers correctly omit it — but at runtime this made the single-arg call
  indistinguishable from a no-variable call, silently breaking the mutation:

  ```ts
  // mutationFn called with undefined instead of 'item-id-123'
  const { executeMutationFn: deleteItem } = useMutationFn(
    (id: string) => deleteApi(id),
    { invalidatesTags: ['items'] },
  );
  deleteItem('item-id-123');          // ← looked correct in TypeScript
                                      // ← runtime: deleteApi(undefined) 🐛
  ```

  Because `mutationFn` failed, `invalidateTags` was never reached and any
  `useFetchFn` / `useFetch` hooks subscribed to the invalidated tags were not
  refreshed.

  Fix: replace the caller-side heuristic with `mutationFn.length > 0` — the number
  of formal parameters declared on `mutationFn`. This is fixed at definition time
  and correctly distinguishes the two overloads regardless of how many arguments the
  caller passes:

  - `mutationFn.length === 0` → no-variable mutation → single arg is `executeOptions`
  - `mutationFn.length > 0` → variable mutation → first arg is `variables`, second arg is `executeOptions`

  ```ts
  // All three call forms now work correctly:
  deleteItem('item-id-123');                              // ✓ variables only
  deleteItem('item-id-123', { onSuccess: () => {} });    // ✓ variables + options
  logout({ onSuccess: () => {} });                       // ✓ no-variable mutation
  ```

---

## [4.0.1] - 2026-05-18

### Fixed

- **`useFetch`: infinite Suspense loop when the API returns an error**

  Previously, when `wireApi` threw (e.g. 404, 500, network failure), the `.catch`
  handler inside `useFetch` deleted the Promise from the cache and re-threw the error.
  React detected the rejection and re-rendered the component from scratch. On that
  re-render the cache was empty, so `useFetch` created a brand-new pending Promise
  and immediately suspended again — triggering another fetch, another failure, and so
  on indefinitely. The `<ErrorBoundary>` was never reached.

  The fix: the `.catch` handler no longer deletes the Promise from the cache. The
  rejected Promise stays in cache, so on the subsequent re-render React calls
  `use(rejectedPromise)`, which throws the error synchronously to the nearest
  `<ErrorBoundary>` instead of suspending.

### Added

- **`fetchClient.remove(fetchKey)` — targeted cache eviction for ErrorBoundary retry**

  A new method on `fetchClient` that removes a single entry from the promise cache
  without emitting tag events. This is the correct way to enable retry from inside
  an `<ErrorBoundary>`: call `fetchClient.remove(fetchKey)` in the boundary's reset
  handler before the component remounts, so the next render finds an empty cache
  entry and starts a fresh fetch rather than re-throwing the cached rejection.

  ```ts
  // In your ErrorBoundary reset handler:
  fetchClient.remove('todos');
  ```

  See the new [Retrying after an API error](README.md#retrying-after-an-api-error)
  section in the README for a full example.

### Documentation

- Updated JSDoc for `useFetch` — `refreshFetch` now documents that it cannot be
  used to retry from an `<ErrorBoundary>` and points to `fetchClient.remove()`.
- Updated README: added `fetchClient.remove()` to the `fetchClient` API reference.
- Updated README: new section **Retrying after an API error** explains the
  `refreshFetch` limitation, the root cause, and the correct `fetchClient.remove()`
  pattern with concrete React and React Native examples.

---

## [4.0.0] - 2026-04-25

### Breaking Changes

- **`prefetch()` signature changed: arguments reversed, second argument is now `FetchOptions`**

  The old signature `prefetch(fetchKey, fetchFn)` is replaced by `prefetch(fetchFn, options)`, matching the same `FetchOptions` object used by `useFetch` and `useFetchFn`. The `fetchKey` is now inside `options`.

  ```ts
  // Before (3.3.1):
  prefetch('todos', () => getTodosApi());

  // After (4.0.0):
  prefetch(() => getTodosApi(), { fetchKey: 'todos' });

  // With tags (also supported):
  prefetch(() => getTodosApi(), { fetchKey: 'todos', tags: ['todos'] });
  ```

  **Migration:** swap the argument order and move the key string into `{ fetchKey: '...' }`. Tags are now also supported directly in the `prefetch` call.

- **`promiseCacheStore` is no longer a public export**

  `promiseCacheStore` is no longer exported from the package. For logout-flow cache clearing, use `fetchClient.clear()` instead.

  ```ts
  // Before (3.3.1):
  import { promiseCacheStore } from 'fetchwire';

  function handleLogout() {
    promiseCacheStore.clear();
  }

  // After (4.0.0):
  import { fetchClient } from 'fetchwire';

  function handleLogout() {
    fetchClient.clear();
  }
  ```

  **Migration:** replace `promiseCacheStore.clear()` with `fetchClient.clear()`. The `fetchClient.clear()` call also clears the internal tag-to-fetchKey map, ensuring no stale tag associations remain after logout.

### Added

- **`fetchClient` singleton — centralized cache and tag invalidation**

  A new `FetchClient` class is exported as `fetchClient`. It centralizes the relationship between fetch keys, tags, and the promise cache. All hooks (`useFetch`, `useFetchFn`) and `prefetch` now go through `fetchClient` internally instead of writing to `promiseCacheStore` directly.

  ```ts
  import { fetchClient } from 'fetchwire';
  ```

  **API:**

  - `fetchClient.clear()` — clears all cached promises AND the internal tag-to-fetchKey map. Use this on logout so no stale data is served after the next login.
  - `fetchClient.invalidateTags(tags: string[])` — clears all cached promises whose fetch keys are associated with the given tags, then emits refresh events to all mounted hooks subscribed to those tags. Called internally by `useMutationFn`; exposed for advanced use.
  - `fetchClient.setFetchKeyToTags(fetchKey, promise, tags?)` — stores a promise in the cache and registers its tag associations. Used internally by hooks and `prefetch`; exposed for advanced use.

  **Recommended logout flow:**

  ```ts
  import { fetchClient } from 'fetchwire';

  function handleLogout() {
    localStorage.removeItem('access_token');
    fetchClient.clear();
  }
  ```

### Changed

- **Cache invalidation now clears stale entries for unmounted components**

  Previously, when `useMutationFn` invalidated tags, it only emitted events to mounted hooks. If a component was unmounted at the time of invalidation, its stale promise remained in the cache — and when the component remounted, it would receive the old resolved data instead of fetching fresh.

  In 4.0.0, `fetchClient.invalidateTags()` both emits refresh events to mounted hooks AND deletes all cached promises associated with the invalidated tags. Unmounted components will always start a fresh fetch when they next mount after a tag invalidation.

- **`prefetch` now registers tag associations**

  `prefetch(fetchFn, options)` accepts `options.tags`. When provided, `prefetch` registers the tag-to-fetchKey relationship via `fetchClient.setFetchKeyToTags()`, so a tag invalidation triggered by a mutation will correctly clear a key originally populated via `prefetch`.

- **`PromiseCacheMap` renamed to `PromiseCacheStore`**

  The internal promise cache class has been renamed from `PromiseCacheMap` to `PromiseCacheStore` and extracted into its own file (`src/core/promise-cache-store.ts`). It is no longer part of the public export surface; use `fetchClient` for all cache management needs.

### Documentation

- Updated README: `prefetch` usage and API reference reflect the new `prefetch(fetchFn, options)` signature.
- Updated README: added `fetchClient` API reference section.
- Updated README: `promiseCacheStore` section updated to reflect it is no longer a public export.

---

## [3.3.1] - 2026-04-24

### Breaking Changes

- **`useFetch`: `fetchKey` moved into `options` (now required)**

  `fetchKey` is no longer a standalone second argument. It is now a required field inside the `options` object, which is itself the second argument.

  ```ts
  // Before:
  useFetch(getTodosApi, 'todos', { tags: ['todos'] });
  useFetch(getTodosApi, 'todos');

  // After:
  useFetch(getTodosApi, { fetchKey: 'todos', tags: ['todos'] });
  useFetch(getTodosApi, { fetchKey: 'todos' });
  ```

  **Migration:** move the string you were passing as the second argument into `options.fetchKey`.

- **`useFetchFn`: `options` is now required, `fetchKey` is required**

  `options` was previously optional and `fetchKey` inside it was optional. Both are now required.

  ```ts
  // Before:
  useFetchFn(getTodosApi);
  useFetchFn(getTodosApi, { tags: ['todos'] });
  useFetchFn(getTodosApi, { fetchKey: 'todos', tags: ['todos'] });

  // After:
  useFetchFn(getTodosApi, { fetchKey: 'todos' });
  useFetchFn(getTodosApi, { fetchKey: 'todos', tags: ['todos'] });
  ```

  **Migration:** add `fetchKey` to the options object for every `useFetchFn` call. Choose a key that uniquely identifies the resource (e.g. `'todos'`, `'user-' + userId`).

- **`FetchOptions`: `fetchKey` is now required, field order changed**

  The `fetchKey` field is no longer optional (`fetchKey?: string` → `fetchKey: string`).
  It now appears before `tags` in the type definition to reflect that it is required.

  ```ts
  // Before:
  type FetchOptions = {
    tags?: string[];
    fetchKey?: string;
  };

  // After:
  type FetchOptions = {
    fetchKey: string;
    tags?: string[];
  };
  ```

### Documentation

- Updated README: all `useFetch` and `useFetchFn` examples and API reference entries reflect the new unified `options` signature.
- Updated JSDoc for `FetchOptions`, `useFetch`, and `useFetchFn`.

---

## [3.3.0] - 2026-04-11

### Added

- **`transformError` in `WireConfig`**
  A new optional transformer to normalize backend error payloads into `ApiError` before interceptors run and before `wireApi` throws.

  Runtime behavior:
  - If `transformError` returns an `ApiError`, fetchwire now preserves that instance (including stack and custom properties).
  - If `statusCode` is missing from the transformed error, fetchwire falls back to the HTTP `response.status`.

  ```ts
  import { ApiError, initWire } from 'fetchwire';

  initWire({
    transformError: (error) => {
      const rawError = error as {
        message?: string;
        error?: string;
        code?: string;
        statusCode?: number;
        status?: number;
      };

      return new ApiError(
        rawError.message ?? 'Unknown server error',
        rawError.error ?? rawError.code ?? 'UNKNOWN',
        rawError.statusCode ?? rawError.status
      );
    },
  });
  ```

- **`onResponse` interceptor in `WireInterceptors`**
  A new interceptor called after every `fetch()`, before the response body is parsed.
  Use it to log response metadata, record timing, or inspect response headers.

  ```ts
  initWire({
    interceptors: {
      onResponse: (url, response) => {
        console.log(`← ${response.status} ${url}`);
      },
    },
  });
  ```

  **Important:** Do not consume the response body inside `onResponse` (i.e. avoid `response.json()` or `response.text()`). Doing so exhausts the body stream, which will cause the subsequent read inside `wireApi` to fail. Use `response.clone()` if you need to read the body.

### Changed

- **`onError` now uses cascade behavior**
  Previously, `onError` was only called when no specific handler (`onUnauthorized` / `onForbidden`) was registered or matched. Now, `onError` fires for **every** non-OK response — after `onUnauthorized` or `onForbidden` when applicable.

  ```ts
  // Before (3.2 — exclusive/waterfall):
  // 401 → onUnauthorized fires, onError does NOT fire
  // 403 → onForbidden fires, onError does NOT fire
  // 5xx → onError fires

  // After (3.3 — cascade):
  // 401 → onUnauthorized fires, then onError fires
  // 403 → onForbidden fires, then onError fires
  // 5xx → onError fires
  ```

  This makes it possible to combine specific handlers (e.g. redirect to login on 401) with a global error sink (e.g. show a toast for all API errors), without duplicating logic.

- **All interceptors are now properly `await`ed**
  Error interceptors (`onUnauthorized`, `onForbidden`, `onError`) were previously called without `await`, meaning async handlers were not awaited before `wireApi` threw the error. All interceptors now consistently `await` their handlers.

### Breaking Changes

- **`onRequest` signature: `url` added as first parameter**

  ```ts
  // Before (3.2):
  onRequest?: (options: RequestInit) => void | Promise<void>;

  // After (3.3):
  onRequest?: (url: string, options: RequestInit) => void | Promise<void>;
  ```

  **Migration:** add `url` as the first parameter in any existing `onRequest` handler.

  ```ts
  // Before
  onRequest: (requestInit) => {
    requestInit.headers.set('x-request-id', crypto.randomUUID());
  };

  // After
  onRequest: (url, requestInit) => {
    requestInit.headers.set('x-request-id', crypto.randomUUID());
  };
  ```

- **`onError` now fires for 401/403 in addition to specific handlers**
  If your existing `onError` was intentionally meant to run only for non-401/403 errors, you must add a status code guard:

  ```ts
  onError: (error) => {
    if (error.statusCode === 401 || error.statusCode === 403) return;
    showToast(error.message);
  };
  ```

### Documentation

- Updated README: added `transformError` to `initWire` example and API reference.
- Updated README: `WireInterceptors` type and `initWire` example now include `onResponse` and updated `onRequest` signature.
- Updated README: `onUnauthorized`, `onForbidden`, and `onError` descriptions reflect cascade behavior.

---

## [3.2.0] - 2026-04-09

### Added

- **`prefetch(fetchKey, fetchFn)` — pre-fetch data before a component mounts**
  Populates `promiseCacheStore` ahead of time so that `useFetch` or `useFetchFn` (with matching `fetchKey`) can resolve instantly without a redundant network request.

  ```ts
  import { prefetch } from 'fetchwire';

  // In a route loader, event handler, or anywhere before the component renders
  prefetch('todos', () => getTodosApi());
  ```

  - Accepts `() => Promise<HttpResponse<T> | T>` — same flexibility as `useFetch`.
  - If the key already exists in the cache, the existing Promise is returned (no duplicate fetch).
  - Works with `useFetch` (same `fetchKey`) and `useFetchFn` (via `options.fetchKey`).

- **`onRequest` interceptor in `WireInterceptors`**
  A new interceptor called before every `fetch()` with the final `RequestInit` object. Use it to add dynamic headers, inject tracing IDs, log outgoing requests, or perform any pre-request side effect.

  ```ts
  initWire({
    // ...
    interceptors: {
      onRequest: (requestInit) => {
        requestInit.headers.set('x-request-id', crypto.randomUUID());
      },
    },
  });
  ```

  Internally, `wireApi` now builds a single shared `RequestInit` object before calling `onRequest` and `fetch`, so mutations inside the interceptor are reflected in the actual request.

- **`useFetch` now uses `useTransition` for non-blocking refresh**
  `refreshFetch()` is wrapped in `startTransition`, so React keeps the current UI visible while the new data loads instead of immediately re-suspending and showing the `<Suspense>` fallback.

  The hook now returns an additional `isRefreshing: boolean` field (powered by `useTransition`'s `isPending`) to let you show inline loading indicators without losing the existing content.

  ```tsx
  const { data, refreshFetch, isRefreshing } = useFetch(getTodosApi, 'todos');
  ```

- **`fetchKey` option in `FetchOptions`**
  `FetchOptions` now accepts an optional `fetchKey` string. When provided to `useFetchFn`, the hook integrates with `promiseCacheStore`:
  - On the first `executeFetchFn()` call, it checks the cache for a prefetched Promise (set by `prefetch()`), avoiding a duplicate request.
  - On every fetch, the Promise is stored in the cache under `fetchKey`, enabling deduplication if multiple hooks share the same key.

### Breaking Changes

- **`useFetchFn`: `executeFetchFn` and `refreshFetchFn` now return `Promise<T | null>`**

  ```ts
  // Before (3.1)
  const response = await executeFetchFn(); // HttpResponse<Todo[]> | null
  const todos = response?.data;

  // After (3.2.0)
  const todos = await executeFetchFn(); // Todo[] | null
  ```

### Documentation

- Updated README: added `prefetch` usage section and API reference.
- Updated README: `WireInterceptors` type and `initWire` example now include `onRequest`.
- Updated README: `useFetch` return type and description reflect `isRefreshing` and Transition behavior.
- Updated README: `useFetchFn` return types corrected to `Promise<T | null>`, `fetchKey` documented in `FetchOptions`.

---

## [3.1] - 2026-04-07

### Added

- **`useFetch` now accepts both envelope and raw payload responses**
  `useFetch` fetch functions can now return either `Promise<HttpResponse<T>>` or `Promise<T>`.
  This makes the hook easier to use with API helpers that already unwrap data.

- **`extractHttpResponseData` helper**
  Added an internal helper to normalize `useFetch` responses into payload `T`
  from either a full `HttpResponse<T>` shape or a raw payload value.

### Documentation

- Updated JSDoc and README for `useFetch` to reflect support for both response shapes.

---

## [3.0.1] - 2026-04-07

### Documentation

- Documentation-only release.
- Updated README/JSDoc wording only. No runtime behavior changes.

---

## [3.0.0] - 2026-04-07

### Added

- **`useFetch` — Suspense-based data fetching hook**
  A new hook that fetches immediately on mount and suspends the component while data is loading.
  Uses React 19's `use()` API under the hood. The parent component tree must provide a `<Suspense>` boundary for the loading state and an `<ErrorBoundary>` for API errors.

  ```tsx
  // Parent
  <ErrorBoundary fallback={<div>Error</div>}>
    <Suspense fallback={<div>Loading…</div>}>
      <TodoList />
    </Suspense>
  </ErrorBoundary>;

  // TodoList component
  function TodoList() {
    const { data: todos, refreshFetch } = useFetch(getTodosApi, 'todos', {
      tags: ['todos'],
    });

    return (
      <ul>
        {todos.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    );
  }
  ```

  - `fetchKey` — a unique string key used to cache the in-flight Promise and prevent the infinite suspend loop that would otherwise occur when React re-renders during suspension.
  - `refreshFetch` — replaces the cached Promise with a fresh one, causing the component to re-suspend and show the nearest `<Suspense>` fallback.
  - Supports tag-based invalidation via `options.tags` — the same mechanism used by `useFetchFn`.

- **`promiseCacheStore` singleton**
  The `Map`-backed promise store used by `useFetch` is now exported as `promiseCacheStore`. Use it for advanced cache management — removing a specific entry to force a cold refetch, or calling `promiseCacheStore.clear()` to discard all cached Promises on logout.

  ```ts
  import { promiseCacheStore } from 'fetchwire';

  // Force a cold refetch for a single key
  promiseCacheStore.delete('todos');

  // Discard all entries on logout
  promiseCacheStore.clear();
  ```

### Documentation

- `FetchOptions` JSDoc updated to reflect that the interface is shared by both `useFetch` and `useFetchFn`.

---

## [2.3.1] - 2026-04-06

### Fixed

- **`wireApi`**: `config.headers` now merges before the computed `Authorization` header, so per-token auth is no longer silently overridden by global headers.
- **`useFetchFn`**: use `??` instead of `||` when setting `data`, so falsy values (`0`, `false`, `""`) are no longer replaced with `null`.
- **`useFetchFn` / `useMutationFn`**: tag arrays are now serialized to a string key before being used as `useEffect` / `useCallback` dependencies, preventing unnecessary re-subscriptions and function recreation on every render.

### Documentation

- Tag strings must not contain commas — documented in JSDoc and README.

---

## [2.3.0] - 2026-04-02

### Added

- **`reset()` in `useFetchFn`**
  `useFetchFn` now returns a `reset` function that clears `data`, `isLoading`, `isRefreshing`, and `error` back to their initial values. Useful when navigating away from a screen or unmounting a component that should not retain stale data.

  ```ts
  const { data, executeFetchFn, reset } = useFetchFn(getTodosApi);

  // Clear state when leaving the screen
  reset();
  ```

---

## [2.2.0] - 2026-03-19

### Added

- **`transformResponse` configuration in `initWire`**
  You can now provide a global `transformResponse` function to normalize your API response formats into fetchwire's standard `HttpResponse` shape.

  Example:

  ```ts
  transformResponse(res) {
    const rawResponse = res as {
      statusCode?: number;
      data: object;
      message?: string;
    };
    return {
      status: rawResponse.statusCode,
      data: rawResponse.data,
      message: rawResponse.message || '',
    };
  }
  ```

---

## [2.1.1] - 2026-03-15

### Fixed (Hotfix)

- **`useFetchFn`: stale closure when calling `executeFetchFn`**  
  `execute` was closing over the initial `fetchFn`.
  **Fix:** Use a ref that is updated every render (`fetchFnRef.current = fetchFn`) and call `fetchFnRef.current()` inside `execute`, with `useCallback(..., [])`. This keeps `executeFetchFn` / `refreshFetchFn` identity stable while always invoking the latest `fetchFn`.

---

## [2.1.0] - 2026-03-15

### Added

- **`useMutationFn` with variables**  
  Mutations that need a different payload each time (e.g. update invoice, update project) can now pass **variables** into the helper and into `executeMutationFn`, so you no longer need refs or closure workarounds.
  - **Helper with one parameter**  
    If the first argument to `useMutationFn` is a function that takes one argument (e.g. `(variables) => updateApi(id, variables)`), then `executeMutationFn` is called as:
    - `executeMutationFn(variables, { onSuccess, onError })`
  - **Helper with no parameters**  
    If the helper has no parameters (e.g. `() => createApi()`), the API is unchanged:
    - `executeMutationFn({ onSuccess, onError })`

  Example (update with variables):

  ```ts
  const updateInvoiceHelper = (updatedFields: UpdateInvoiceRequest) =>
    updateInvoiceApi(invoiceId, updatedFields);

  const { executeMutationFn: updateInvoice } = useMutationFn(updateInvoiceHelper, {
    invalidatesTags: ['organization-invoice-list'],
  });

  function handleUpdate(updatedFields: UpdateInvoiceRequest) {
    updateInvoice(updatedFields, {
      onSuccess: () => refreshInvoice(),
      onError: (e) => Alert.alert('Lỗi', e.message),
    });
  }
  ```

  Type inference: `T` is inferred from the helper return type; the variables type is inferred from the helper’s first parameter.

---

## [2.0.0] - 2026-03-15

### Breaking Changes

The APIs for `useFetchFn` and `useMutationFn` now support **automatic type inference**.

- **Shifted arguments**
  - The helper function is now the **first argument** to `useFetchFn` / `useMutationFn`.
  - `executeFetchFn` and `executeMutationFn` **no longer accept a function argument**; they operate on the helper passed into the hook.

#### Comparison (applies to both hooks)

```ts
// fetch helper
// Type `Todo` is inferred from the return type of your helper (e.g. `getTodosApi`), which should be typed via `wireApi<T>`
async function getTodosApi() {
  return wireApi<Todo[]>('/todos', { method: 'GET' });
}

// mutation helper
// The same as createTodoApi
async function createTodoApi(input: { title: string }) {
  return wireApi<Todo>('/todos', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
```

- **Old `useFetchFn` (v1.x.x)**

```ts
// component
// Has to explicitly define `Todo` type in every hooks
const { data: todos, executeFetchFn } = useFetchFn<Todo[]>({
  tags: ['todos'],
});

useEffect(() => {
  executeFetchFn(() => getTodosApi());
}, [executeFetchFn]);
```

- **New `useFetchFn` (v2.0.0)**

```ts
// component
// Type is infered from `getTodosApi`
const { data: todos, executeFetchFn } = useFetchFn(getTodosApi, {
  tags: ['todos'],
});

useEffect(() => {
  executeFetchFn();
}, [executeFetchFn]);
```

- **Old `useMutationFn` (v1.x.x)**

```ts
// component
const { isMutating, executeMutationFn } = useMutationFn<Todo>({
  invalidatesTags: ['todos'],
});

function handleCreate(title: string) {
  executeMutationFn(() => createTodoApi({ title }), {
    onSuccess: () => {
      console.log('Todo created');
    },
    onError: (error) => {
      console.error('Create todo failed', error);
    },
  });
}
```

- **New `useMutationFn` (v2.0.0)**

```ts
// component
// The same as createTodoApi
const { isMutating, executeMutationFn } = useMutationFn(
  () => createTodoApi({ title }),
  {
    invalidatesTags: ['todos'],
  }
);

function handleCreate(title: string) {
  executeMutationFn({
    onSuccess: () => {
      console.log('Todo created');
    },
    onError: (error) => {
      console.error('Create todo failed', error);
    },
  });
}
```
