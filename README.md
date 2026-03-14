# fetchwire

A lightweight, focused API fetching library for **React and React Native** applications.

**fetchwire** wraps the native `fetch` API in a global configuration layer. It is designed to make it easy to:
- Centralize your API base URL, auth token, and common headers.
- Handle errors consistently.

### When to use fetchwire

- **React / React Native apps** that:
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
  - Converts server/network errors into a typed `ApiError`.

- **React hooks for data fetching and mutation with tag-based invalidation**
  - **`useFetchFn`** for data fetching
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

You **must** call `initWire` (directly or via a helper like `setupWire`) before using `wireApi`, `useFetchFn`, or `useMutationFn`.

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

### 2. Fetch data with `useFetchFn`

`useFetchFn` is a generic hook that manages state for running an async function returning `HttpResponse<T>`, where `T` is **inferred** from your API helper.

**Key ideas:**

- You pass a **pre-typed API helper** (e.g. `getTodosApi`) into the hook once.
- The hook tracks:
  - `data: T | null`
  - `isLoading: boolean`
  - `isRefreshing: boolean`
  - `error: ApiError | null`
  - `executeFetchFn()`
  - `refreshFetchFn()`

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

### 3. Mutate data with `useMutationFn`

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

  const {
    isMutating: isCreating,
    executeMutationFn: createTodo,
  } = useMutationFn(() => createTodoApi({ title }), {
    invalidatesTags: ['todos'],
  });

  const {
    isMutating: isToggling,
    executeMutationFn: toggleTodo,
  } = useMutationFn(
    (id: string) => toggleTodoApi(id),
    { invalidatesTags: ['todos'] }
  );

  const {
    isMutating: isDeleting,
    executeMutationFn: deleteTodo,
  } = useMutationFn(
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

### 4. Tag-based invalidation and auto-refresh

Tags provide a simple way to coordinate refetches across your app:

- `useFetchFn(fetchFn, { tags: [...] })` subscribes the hook to one or more **tags**.
- `useMutationFn(mutationFn, { invalidatesTags: [...] })` emits those tags after a **successful** mutation.
- When a tag is emitted, all subscribed fetch hooks will automatically **call `refreshFetchFn`**.

This pattern keeps your code explicit and small, without introducing a full query cache library.

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

With `useMutationFn`, you commonly handle errors with `onError`:

```tsx
import { ApiError } from 'fetchwire';

// No variables: pass only options
executeMutationFn({
  onSuccess: () => { /* success logic */ },
  onError: (error: ApiError) => {
    Alert.alert('Login failed', error.message || 'Unexpected error');
  },
});

// With variables: pass variables first, then options
executeMutationFn(payload, {
  onSuccess: (data) => { /* ... */ },
  onError: (error: ApiError) => { /* ... */ },
});
```

You can also read `error` directly from `useFetchFn` state if you want to render error messages in your UI.

---

## API Reference

### `initWire(config)`

```ts
type WireInterceptors = {
  onUnauthorized?: (error: ApiError) => void;
  onForbidden?: (error: ApiError) => void;
  onError?: (error: ApiError) => void;
};

type WireConfig = {
  baseUrl: string;
  headers?: Record<string, string>;
  getToken: () => Promise<string | null>;
  interceptors?: WireInterceptors;
  unauthorizedStatusCodes?: number[];
  forbiddenStatusCodes?: number[];
};

function initWire(config: WireConfig): void;
```

- **`baseUrl`**: Base API URL (e.g. `'https://api.example.com'`).
- **`headers`**: Global headers to apply to every request.
- **`getToken`**: Async function called on each request; return the current access token or `null`. If a non-empty string is returned, fetchwire sends it as `Authorization: Bearer <token>`.
- **`interceptors`** (optional):
  - `onUnauthorized(error)`: Called when a 401 is returned.
  - `onForbidden(error)`: Called when a 403 is returned.
  - `onError(error)`: Called for other error statuses.
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
  options?: RequestInit & { headers?: Record<string, string> }
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
  refreshFetchFn: () => Promise<HttpResponse<T> | null> | null;
};
```

- **`fetchFn`**: Async function (e.g. an API helper using `wireApi<T>`). Type `T` is inferred from its return type.
- **`options.tags`**: Optional array of tag strings to subscribe to. When a mutation invalidates these tags, `refreshFetchFn` is called automatically.
- **`executeFetchFn()`**: Runs `fetchFn` (no arguments). Updates `data`, `isLoading`, `error`.
- **`refreshFetchFn()`**: Re-runs the same `fetchFn`, setting `isRefreshing` during the call.

---

### `useMutationFn<T>(mutationFn, options?)` (no variables)  
### `useMutationFn<T, TVariables>(mutationFn, options?)` (with variables)

```ts
type MutationOptions = {
  invalidatesTags?: string[];
};

type ExecuteMutationOptions<T> = {
  onSuccess?: (data: T) => void;
  onError?: (error: ApiError) => void;
};

// No variables: mutationFn has no parameters
function useMutationFn<T>(
  mutationFn: () => Promise<HttpResponse<T>>,
  options?: MutationOptions
): {
  data: T | null;
  isMutating: boolean;
  executeMutationFn: (executeOptions?: ExecuteMutationOptions<T>) => Promise<HttpResponse<T> | null>;
  reset: () => void;
};

// With variables: mutationFn accepts one argument (e.g. update payload)
function useMutationFn<T, TVariables>(
  mutationFn: (variables: TVariables) => Promise<HttpResponse<T>>,
  options?: MutationOptions
): {
  data: T | null;
  isMutating: boolean;
  executeMutationFn: (variables: TVariables, executeOptions?: ExecuteMutationOptions<T>) => Promise<HttpResponse<T> | null>;
  reset: () => void;
};
```

- **`mutationFn`**: Async function that returns `Promise<HttpResponse<T>>`. If it takes one parameter, `executeMutationFn` will require that variable as the first argument.
- **`options.invalidatesTags`**: Tags to emit after a **successful** mutation; subscribed `useFetchFn` hooks refresh.
- **`executeMutationFn`**:
  - **No variables:** `executeMutationFn({ onSuccess, onError })`.
  - **With variables:** `executeMutationFn(variables, { onSuccess, onError })`.
  - Sets `isMutating` while running; on success updates `data`, emits tags, calls `onSuccess`; on error calls `onError`.
- **`reset()`**: Resets `data` and `isMutating` to initial values.

---

## License

**MIT License**

Copyright (c) Doanvinhphu

See the `LICENSE` file for details (or include the standard MIT text directly in your repository).
