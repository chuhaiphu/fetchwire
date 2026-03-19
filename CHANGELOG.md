# Changelog

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
