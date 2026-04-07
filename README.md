# fetchwire

A lightweight, focused API fetching library for **React / React Native+** applications that use **React 19+** with **Suspense support**.

**fetchwire** wraps the native `fetch` API in a global configuration layer. It is designed to make it easy to:

- Centralize your API base URL, auth token, and common headers.
- Handle errors consistently.

## Version note

If you only need regular fetching (non-Suspense) or your project is on **React 18 or below**, use **fetchwire v2.3.1**.

- Docs/package link: https://www.npmjs.com/package/fetchwire/v/2.3.1
- Install: `npm install fetchwire@2.3.1`

### When to use fetchwire

- **React / React Native** that:
  - Want a **simple**, centralized way for API fetching setup.
  - Prefer plain hooks over a heavier state management or query library.
  - Need basic tag-based invalidation without a full cache layer.

### When not to use fetchwire

- Consider a more full-featured solution (e.g. TanStack Query / React Query, SWR, RTK Query) if:
  - You need advanced, automatic caching strategies.
  - You need built-in pagination helpers, infinite queries.
  - You need a more powerful data-fetching library and you want to avoid overlap.

## Support

If you find **fetchwire** helpful and want to support its development, you can buy me a coffee via:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/doanvinhphu)
[![PayPal](https://img.shields.io/badge/PayPal-004595?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/doanvinhphu)

## Features

- **Global API fetching configuration `initWire`**
  - Configure `baseUrl`, default headers, and how to read the auth token.
  - Optionally register global interceptors for 401/403/other errors.
  - Optional `transformResponse` function to normalize incoming API responses.
  - Converts server/network errors into a typed `ApiError`.

- **React hooks for data fetching and mutation with tag-based invalidation**
  - **`useFetch`** for **React 19+** new feature: Suspense-based data fetching (fetches on mount, suspends while loading)
  - **`useFetchFn`** for manually triggered data fetching with explicit loading/error state
  - **`useMutationFn`** for mutations
  - With a simple, explicit way to refetch related data through tags

---

## Installation

```bash
npm install fetchwire
# or
yarn add fetchwire
# or
pnpm add fetchwire
```

### Peer expectations

- Requires **React 19+** (the `useFetch` hook uses React's `use()` API).
- TypeScript is recommended but not required.
- For React Native / Expo, make sure the global `fetch` is available (default in modern RN/Expo).

---

## Getting Started

### 1. Initialize fetchwire once at app startup

Call `initWire` once, as early as possible in your app lifecycle.

#### Simple React example

```ts
// src/api/wire.ts
import { initWire } from 'fetchwire';

export function setupWire() {
  initWire({
    baseUrl: 'https://api.example.com',
    headers: {
      'x-client': 'web',
    },
    getToken: async () => {
      // Called on each request — return the current access token or null.
      // Read token from localStorage (or any storage you prefer)
      return localStorage.getItem('access_token');
    },
    // Optional: transform response
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
    },
    // Optional: customize which status codes should trigger auth interceptors
    unauthorizedStatusCodes: [401, 419], // defaults to [401] if omitted
    forbiddenStatusCodes: [403], // defaults to [403] if omitted
    interceptors: {
      onUnauthorized: (error) => {
        // e.g. redirect to login, clear token, show toast, etc.
      },
      onForbidden: (error) => {
        // e.g. show "no permission" message
      },
      onError: (error) => {
        // fallback handler for other error statuses
      },
    },
  });
}
```

```tsx
// src/main.tsx or src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { setupWire } from './api/wire';

setupWire();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

You **must** call `initWire` (directly or via a helper like `setupWire`) before using `wireApi`, `useFetch`, `useFetchFn`, or `useMutationFn`.

---

## Usage

### 1. Define API helpers with `wireApi`

A common pattern is to define small API helper functions in `src/api/*` that wrap your backend endpoints. For example, a simple CRUD helper for `Todo`:

```ts
// src/api/todo-api.ts
import { wireApi } from 'fetchwire';

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
};

export async function getTodosApi() {
  return wireApi<Todo[]>('/todos', { method: 'GET' });
}

export async function createTodoApi(input: { title: string }) {
  return wireApi<Todo>('/todos', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function toggleTodoApi(id: string) {
  return wireApi<Todo>(`/todos/${id}/toggle`, {
    method: 'POST',
  });
}

export async function deleteTodoApi(id: string) {
  return wireApi<null>(`/todos/${id}`, {
    method: 'DELETE',
  });
}
```

You can organize similar helpers for users, invoices, organizations, uploads, etc., all using `wireApi`.

---

### 2. Fetch data with `useFetch` (Suspense-based)

`useFetch` fetches immediately on mount and **suspends** the component while data is loading. The parent component tree must provide a `<Suspense>` boundary for the loading state and an `<ErrorBoundary>` for API errors.

**Key ideas:**

- The component suspends while the fetch is in flight — no `isLoading` flag needed.
- API errors are thrown and caught by the nearest `<ErrorBoundary>`.
- `fetch` can return either a standard `HttpResponse<T>` envelope or raw data `T`.
- `fetchKey` uniquely identifies this fetch in the internal promise cache, preventing infinite suspend loops.
- `refreshFetch` replaces the cached promise and re-suspends the component, showing the `<Suspense>` fallback again.

```tsx
// src/components/TodoList.tsx
import { Suspense } from 'react';
import { useFetch } from 'fetchwire';
import { getTodosApi } from '../api/todo-api';

// Parent: wrap with Suspense + ErrorBoundary
export function TodoPage() {
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <Suspense fallback={<div>Loading...</div>}>
        <TodoList />
      </Suspense>
    </ErrorBoundary>
  );
}

function TodoList() {
  const { data: todos, refreshFetch } = useFetch(getTodosApi, 'todos', {
    tags: ['todos'],
  });

  return (
    <div>
      <button onClick={refreshFetch}>Refresh</button>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            {todo.title} {todo.completed ? '(done)' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

### 3. Fetch data with `useFetchFn` (manual trigger)

`useFetchFn` is a generic hook that manages state for running an async function returning `HttpResponse<T>`, where `T` is **inferred** from your API helper. Unlike `useFetch`, you control when the fetch runs.

**Key ideas:**

- You pass a **pre-typed API helper** (e.g. `getTodosApi`) into the hook once.
- The hook tracks:
  - `data: T | null`
  - `isLoading: boolean`
  - `isRefreshing: boolean`
  - `error: ApiError | null`
  - `executeFetchFn()`
  - `refreshFetchFn()`
  - `reset()`

Example: loading and refreshing a todo list in a React component:

```tsx
// src/components/TodoList.tsx
import { useEffect } from 'react';
import { useFetchFn } from 'fetchwire';
import { getTodosApi, type Todo } from '../api/todo-api';

export function TodoList() {
  const {
    data: todos,
    isLoading,
    isRefreshing,
    error,
    executeFetchFn: fetchTodos,
    refreshFetchFn: refreshTodos,
  } = useFetchFn(getTodosApi, {
    tags: ['todos'],
  });

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <button onClick={() => refreshTodos()} disabled={isRefreshing}>
        {isRefreshing ? 'Refreshing...' : 'Refresh'}
      </button>

      <ul>
        {(todos ?? []).map((todo) => (
          <li key={todo.id}>
            {todo.title} {todo.completed ? '(done)' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

### 4. Mutate data with `useMutationFn`

`useMutationFn` is a hook for mutations (create/update/delete). It:

- Tracks `data` and `isMutating`.
- Lets you invalidate **tags** after a successful mutation.
- Accepts per-call `onSuccess` and `onError` callbacks.

Signature:

```ts
const {
  data,
  isMutating,
  executeMutationFn,
  reset,
} = useMutationFn(mutationFn, { invalidatesTags?: string[] });
```

- If `mutationFn` has **no parameters**, call `executeMutationFn({ onSuccess, onError })`.
- If `mutationFn` has **one parameter** (e.g. update payload), call `executeMutationFn(variables, { onSuccess, onError })`.

Example: creating and toggling todos with `useMutationFn`:

```tsx
// src/components/TodoActions.tsx
import { FormEvent, useState } from 'react';
import { useMutationFn } from 'fetchwire';
import {
  createTodoApi,
  toggleTodoApi,
  deleteTodoApi,
  type Todo,
} from '../api/todo-api';

export function TodoActions() {
  const [title, setTitle] = useState('');

  const { isMutating: isCreating, executeMutationFn: createTodo } = useMutationFn(
    () => createTodoApi({ title }),
    {
      invalidatesTags: ['todos'],
    }
  );

  const { isMutating: isToggling, executeMutationFn: toggleTodo } = useMutationFn(
    (id: string) => toggleTodoApi(id),
    { invalidatesTags: ['todos'] }
  );

  const { isMutating: isDeleting, executeMutationFn: deleteTodo } = useMutationFn(
    (id: string) => deleteTodoApi(id),
    { invalidatesTags: ['todos'] }
  );

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createTodo({
      onSuccess: () => setTitle(''),
    });
  };

  // With variables, pass payload first then options:
  // toggleTodo(todoId, { onSuccess: () => ..., onError: (error) => ... });
  // deleteTodo(todoId, { onSuccess: () => ..., onError: (error) => ... });

  return (
    <form onSubmit={handleCreate}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New todo"
      />
      <button type="submit" disabled={isCreating}>
        {isCreating ? 'Adding...' : 'Add'}
      </button>
    </form>
  );
}
```

---

### 5. Tag-based invalidation and auto-refresh

Tags provide a simple way to coordinate refetches across your app:

- `useFetch(fetchFn, fetchKey, { tags: [...] })` and `useFetchFn(fetchFn, { tags: [...] })` subscribe to one or more **tags**.
- `useMutationFn(mutationFn, { invalidatesTags: [...] })` emits those tags after a **successful** mutation.
- When a tag is emitted, all subscribed fetch hooks will automatically refresh:
  - `useFetch` — calls `refreshFetch`, re-suspending the component and showing the `<Suspense>` fallback.
  - `useFetchFn` — calls `refreshFetchFn` automatically.

This pattern keeps your code explicit and small, without introducing a full query cache library.

> **Constraint:** Tag strings must not contain commas. Commas are used internally to serialize the tag array into a stable dependency key. Use hyphens or underscores as separators instead (e.g. `'user-123'`, `'todo_list'`).

---

## Error Handling

### Response object shape

By default, `wireApi` assumes your backend returns an object compatible with:

```ts
type HttpResponse<T> = {
  data?: T;
  message?: string;
  status?: number;
};
```

**Successful response example:**

```json
{
  "data": {
    "id": "123",
    "email": "user@example.com"
  },
  "message": "OK",
  "status": 200
}
```

**Error response example (from server):**

```json
{
  "message": "Something went wrong",
  "error": "ERROR_CODE"
}
```

If the response body cannot be parsed as JSON or a network error occurs, fetchwire falls back to a synthetic error with:

- `message`: from the thrown `Error` or `"Network error"`
- `errorCode`: `"NETWORK_ERROR"`
- `statusCode`: `520`

### ApiError

All errors are normalized to an `ApiError` instance. It extends `Error` and typically includes:

- `message: string`
- `errorCode: string | undefined` (e.g. from server `error` field or `'NETWORK_ERROR'`)
- `statusCode: number | undefined` (e.g. 401, 403, 500, 520, etc.)

### Using ApiError in components

**With `useFetch`** — errors are thrown and caught by the nearest `<ErrorBoundary>`. You do not handle them in the component itself.

**With `useFetchFn`** — read the `error` field directly from the hook state:

```tsx
const { error } = useFetchFn(getTodosApi);
if (error) return <div>Error: {error.message}</div>;
```

**With `useMutationFn`** — handle errors with `onError`:

```tsx
import { ApiError } from 'fetchwire';

// No variables: pass only options
executeMutationFn({
  onSuccess: () => {
    /* success logic */
  },
  onError: (error: ApiError) => {
    Alert.alert('Login failed', error.message || 'Unexpected error');
  },
});

// With variables: pass variables first, then options
executeMutationFn(payload, {
  onSuccess: (data) => {
    /* ... */
  },
  onError: (error: ApiError) => {
    /* ... */
  },
});
```

---

## API Reference

### `initWire(config)`

```ts
type WireInterceptors = {
  onUnauthorized?: (error: ApiError) => void | Promise<void>;
  onForbidden?: (error: ApiError) => void | Promise<void>;
  onError?: (error: ApiError) => void | Promise<void>;
};

type WireConfig = {
  baseUrl: string;
  headers?: HeadersInit;
  getToken: () => Promise<string | null>;
  transformResponse?: (res: unknown) => {
    data?: unknown;
    message?: string;
    status?: number;
  };
  interceptors?: WireInterceptors;
  unauthorizedStatusCodes?: number[];
  forbiddenStatusCodes?: number[];
};

function initWire(config: WireConfig): void;
```

- **`baseUrl`**: Base API URL (e.g. `'https://api.example.com'`).
- **`headers`**: Global headers applied to every request (`HeadersInit` — plain object, `Headers` instance, or array of `[name, value]` pairs). Merged before the computed `Authorization` header.
- **`getToken`**: Async function called on each request; return the current access token or `null`. If a non-empty string is returned, fetchwire sends it as `Authorization: Bearer <token>`.
- **`interceptors`** (optional):
  - `onUnauthorized(error)`: Called when a response matches `unauthorizedStatusCodes`. Can be async.
  - `onForbidden(error)`: Called when a response matches `forbiddenStatusCodes`. Can be async.
  - `onError(error)`: Called for other error statuses. Can be async.
- **`transformResponse`** (optional): A function to normalize your API's response shape into fetchwire's standard `{ data?, message?, status? }` format. Useful when your backend uses a different envelope (e.g. `statusCode` instead of `status`). Called on every successful response before the data reaches your hooks.
- **`unauthorizedStatusCodes`** (optional): List of HTTP status codes that should be treated as unauthorized (defaults to `[401]`).
- **`forbiddenStatusCodes`** (optional): List of HTTP status codes that should be treated as forbidden (defaults to `[403]`).

### `updateWireConfig(configPartial)`

```ts
function updateWireConfig(config: Partial<WireConfig>): void;
```

- Merges new configuration into the existing global config.
- Merges header objects deeply, so you can safely add new headers at runtime.
- Throws if called before `initWire`.

Use this if you need to adjust base URL, headers, or interceptors after startup.

### `getWireConfig()`

```ts
function getWireConfig(): WireConfig;
```

- Returns the current configuration.
- Throws if called before `initWire`.
- Intended for advanced usage (e.g. custom hooks or libraries that build on top of fetchwire).

---

### `wireApi<T>(endpoint, options?)`

```ts
async function wireApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<HttpResponse<T>>;
```

- **`endpoint`**: Path relative to `baseUrl`, e.g. `'/invoice'`.
- **`options`**: Standard `fetch` options (method, body, headers, etc).
- **Return value**: Resolves to the parsed JSON body in the standard shape `{ data?: T; message?: string; status?: number }`.
- **Errors**: Throws `ApiError` on non-OK responses or network issues.

Usage:

```ts
const result = await wireApi<UserResponse>('/user/me', { method: 'GET' });
// result.data is your typed data
// result.message and result.status are available if your backend provides them
```

---

### `useFetch<T>(fetch, fetchKey, options?)`

```ts
type FetchOptions = {
  tags?: string[];
};

function useFetch<T>(
  fetch: () => Promise<HttpResponse<T> | T>,
  fetchKey: string,
  options?: FetchOptions
): {
  data: T | null;
  refreshFetch: () => void;
};
```

Fetches immediately on mount and **suspends** the component while data is loading. Requires a `<Suspense>` boundary for the loading state and an `<ErrorBoundary>` for API errors in the parent tree.

- **`fetch`**: Async function that can return either `HttpResponse<T>` or raw `T` (e.g. `wireApi<T>` helper or plain transformed payload). Type `T` is inferred from its return type.
- **`fetchKey`**: Unique string key for this fetch, used to cache the in-flight Promise and prevent infinite re-suspension on re-render.
- **`options.tags`**: Optional array of tag strings to subscribe to. When a mutation invalidates these tags, `refreshFetch` is called automatically, re-suspending the component.
- **`data`**: The resolved value from the fetch. The component suspends until this is available.
- **`refreshFetch()`**: Replaces the cached Promise with a fresh one. The component re-suspends and shows the nearest `<Suspense>` fallback.

> **Note:** Tag strings must not contain commas.

---

### `promiseCacheMap`

The shared singleton instance of `PromiseCacheMap` — the internal Promise cache that backs `useFetch`. It is exported for advanced use cases where you need to manage the cache directly.

```ts
class PromiseCacheMap {
  get(key: string): Promise<unknown> | undefined;
  set(key: string, promise: Promise<unknown>): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
}

const promiseCacheMap: PromiseCacheMap;
```

**Common use cases:**

- **Remove a specific entry** — the next render of `useFetch` with that key will start a cold fetch from scratch:

  ```ts
  import { promiseCacheMap } from 'fetchwire';

  promiseCacheMap.delete('todos');
  ```

- **Clear everything on logout** — discard all cached Promises so no stale data is served after a new login:

  ```ts
  import { promiseCacheMap } from 'fetchwire';

  function handleLogout() {
    // ... clear auth token ...
    promiseCacheMap.clear();
  }
  ```

> **Note:** Reach for `promiseCacheMap` only when you need explicit, imperative control over the cache (e.g. logout flows, deep cache resets).

---

### `useFetchFn<T>(fetchFn, options?)`

```ts
type FetchOptions = {
  tags?: string[];
};

function useFetchFn<T>(
  fetchFn: () => Promise<HttpResponse<T>>,
  options?: FetchOptions
): {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: ApiError | null;
  executeFetchFn: () => Promise<HttpResponse<T> | null>;
  refreshFetchFn: () => Promise<HttpResponse<T> | null>;
  reset: () => void;
};
```

- **`fetchFn`**: Async function (e.g. an API helper using `wireApi<T>`). Type `T` is inferred from its return type.
- **`options.tags`**: Optional array of tag strings to subscribe to. When a mutation invalidates these tags, `refreshFetchFn` is called automatically.
- **`executeFetchFn()`**: Runs `fetchFn`. Sets `isLoading: true` during the call; updates `data` and `error` on completion.
- **`refreshFetchFn()`**: Re-runs the same `fetchFn`. Sets `isRefreshing: true` during the call (keeps existing `data` visible).
- **`reset()`**: Resets `data`, `isLoading`, `isRefreshing`, and `error` back to their initial values.

> **Note:** Tag strings must not contain commas.

---

### `useMutationFn<T>(mutationFn, options?)` (no variables)

### `useMutationFn<T, TVariables>(mutationFn, options?)` (with variables)

```ts
type MutationOptions = {
  invalidatesTags?: string[];
};

type ExecuteMutationOptions<T> = {
  onSuccess?: (data: T | null) => void | Promise<void>;
  onError?: (error: ApiError) => void | Promise<void>;
};

// No variables: mutationFn has no parameters
function useMutationFn<T>(
  mutationFn: () => Promise<HttpResponse<T>>,
  options?: MutationOptions
): {
  data: T | null;
  isMutating: boolean;
  executeMutationFn: (
    executeOptions?: ExecuteMutationOptions<T>
  ) => Promise<HttpResponse<T> | null>;
  reset: () => void;
};

// With variables: mutationFn accepts one argument (e.g. update payload)
function useMutationFn<T, TVariables>(
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
```

- **`mutationFn`**: Async function that returns `Promise<HttpResponse<T>>`. If it takes one parameter, `executeMutationFn` will require that variable as the first argument.
- **`options.invalidatesTags`**: Tags to emit after a **successful** mutation. All `useFetch` and `useFetchFn` hooks subscribed to any of these tags will refresh automatically.
- **`executeMutationFn`**:
  - **No variables:** `executeMutationFn({ onSuccess, onError })`.
  - **With variables:** `executeMutationFn(variables, { onSuccess, onError })`.
  - Sets `isMutating` while running; on success updates `data`, emits tags, calls `onSuccess`; on error calls `onError`.
- **`reset()`**: Resets `data` and `isMutating` to initial values.

> **Note:** Tag strings must not contain commas.

---

## License

**MIT License**

Copyright (c) Doanvinhphu

See the `LICENSE` file for details (or include the standard MIT text directly in your repository).
