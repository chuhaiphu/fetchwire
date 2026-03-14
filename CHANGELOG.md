# Changelog

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