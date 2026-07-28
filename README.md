# fetchwire

An extremely lightweight, focused API fetching library for **React / React Native** applications that use **React 19+** with **Suspense support**. Use **fetchwire** when your app fetches, shows, and re-fetches — and you would rather own the caching policy than
configure one.

| | min | min + gzip |
| --- | --- | --- |
| **fetchwire** | **5.68 KB** | **2.24 KB** |
| SWR (`useSWR` + `useSWRMutation`) | 13.87 KB | 6.26 KB |
| TanStack Query | 45.98 KB | 13.58 KB |
| axios | 60.94 KB | 21.05 KB |

**fetchwire** wraps the native `fetch` API in a global configuration layer. It is designed to make it easy to:

- Centralize your API base URL, auth token, and common headers.
- Handle errors consistently.
- Deliver a smooth, non-blocking data-fetching experience.
- Eliminate loading waterfalls and make the UI feel instant.

### What fetchwire has

| Included | What it means |
| --- | --- |
| **Global configuration** | One place for `baseUrl`, the auth token, default headers, and request / response / error interceptors — `initWire`. |
| **Typed HTTP client** | `wireApi` resolves to `HttpResponse<T>` and never returns a raw `Response`. |
| **Normalized errors** | Every failure arrives as an `ApiError` with `message`, `errorCode`, and `statusCode`, shaped by your `transformError`. |
| **Suspense data fetching** | `useFetch` fetches on mount, suspends while loading, and refreshes without blanking the screen. |
| **Imperative data fetching** | `useFetchFn` runs when you call it, exposing `isLoading` / `isRefreshing` / `error` as state. |
| **Mutations** | `useMutationFn` runs a write and tracks `isMutating`. |
| **Tag-based invalidation** | A write declares `invalidatesTags`; every read subscribed to a matching tag refreshes. Reads and writes never reference each other. |
| **Request deduplication** | One `fetchKey` is one in-flight request, shared by everyone who asks for it. |
| **Cache warming** | `prefetch` starts a request before the component mounts, so the first read has nothing to wait for. |
| **Manual cache control** | `fetchClient` — `invalidateTags()`, `remove()`, `clear()`. |

### What fetchwire does have

If you need any of the below features, reach for [TanStack Query](https://tanstack.com/query), [SWR](https://swr.vercel.app), or RTK Query instead.

| Not included | What it means |
| --- | --- |
| **Cache eviction** | The Promise cache never expires or shrinks. Clear it yourself with `fetchClient.clear()`, e.g. on logout. |
| **Staleness / auto-refetch** | No `staleTime`, no refetch on focus or reconnect, no polling. |
| **Request cancellation** | A superseded run is ignored, not aborted. Pass your own `signal` if you need one. |
| **Retry / backoff** | A failed request stays failed until you trigger it again. |
| **Pagination & infinite queries** | Each page is its own `fetchKey`. Accumulating and merging pages is your own state. |
| **Optimistic updates** | `data` changes only after the server responds. |
| **Provider-scoped caching** | The cache is a module-level singleton — one per process, not one per provider. |
| **Devtools** | No cache inspector. Use the network tab, or log from the `onRequest` / `onResponse` interceptors. |
| **Selectors / structural sharing** | Each refresh replaces `data` wholesale. |


## Support

If you find **fetchwire** helpful and want to support its development, you can buy me a coffee via:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/doanvinhphu)
[![PayPal](https://img.shields.io/badge/PayPal-004595?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/doanvinhphu)

## Features

- **Global configuration with `initWire`**
  - Configure `baseUrl`, default headers, and how to read the auth token.
  - Register a single global `onError` interceptor for every non-OK response (branch on `error.statusCode` to handle 401/403/etc).
  - Per-request `skipToken` flag on `wireApi` to send a request without an `Authorization` header (e.g. the token-refresh call, login).
  - `onRequest` interceptor — called before every request with the full URL and `RequestInit`.
  - `onResponse` interceptor — called after every response, before the body is parsed.
  - Optional `transformError` to normalize server error payloads into `ApiError`.
  - Optional `transformResponse` to normalize incoming API responses.
  - Converts server and network errors into a typed `ApiError`.

- **React hooks for reading and writing, wired together by tags**
  - **`useFetch`** — Suspense-based reading: fetches on mount, suspends while loading, refreshes without blocking via `useTransition`.
  - **`useFetchFn`** — manually triggered reading with explicit `isLoading` / `isRefreshing` / `error` state.
  - **`useMutationFn`** — writing, with tag invalidation on success.

- **`prefetch` for eager loading**
  - Warms the Promise cache before a component mounts, so `useFetch` / `useFetchFn` resolve instantly without a duplicate request.

- **`fetchClient` for cache management**
  - A singleton that centralizes the tag-to-fetchKey map and the Promise cache. Call `fetchClient.clear()` on logout to drop all cached data and tag associations in one step.

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
- For React Native / Expo, make sure the global `fetch` is available (default in modern RN / Expo).

---

## Getting Started

### Initialize fetchwire once at app startup

Call `initWire` once, as early as possible in your app lifecycle.

```ts
// src/api/wire.ts
import { ApiError, initWire } from "fetchwire";

export function setupWire() {
  initWire({
    baseUrl: "https://api.example.com",
    headers: {
      "x-client": "web",
    },
    getToken: async () => {
      // Called on each request — return the current access token or null.
      // Read the token from localStorage (or any storage you prefer).
      return localStorage.getItem("access_token");
    },
    // Optional: normalize an envelope response into { data, message, status }
    transformResponse(res) {
      const rawResponse = res as {
        statusCode?: number;
        data: object;
        message?: string;
      };
      return {
        status: rawResponse.statusCode,
        data: rawResponse.data,
        message: rawResponse.message || "",
      };
    },
    // Optional: normalize a server error payload into ApiError
    transformError(error) {
      const rawError = error as {
        message?: string;
        error?: string;
        code?: string;
        statusCode?: number;
        status?: number;
      };
      return new ApiError(
        rawError.message ?? "Unknown server error",
        rawError.error ?? rawError.code ?? "UNKNOWN",
        rawError.statusCode ?? rawError.status,
      );
    },
    interceptors: {
      onRequest: (url, requestInit) => {
        // Called before every request.
        // url is the full URL (baseUrl + endpoint), e.g. "https://api.example.com/todos"
        // Mutations to requestInit are reflected in the actual request.
        console.log(`→ ${requestInit.method ?? "GET"} ${url}`);
        requestInit.headers.set("x-request-id", crypto.randomUUID());
      },
      onResponse: (url, response) => {
        // Called after every response, before the body is parsed.
        // Do not call response.json() / response.text() here — use response.clone() if needed.
        console.log(`← ${response.status} ${url}`);
      },
      onError: (error) => {
        // Called for EVERY non-OK response — the single error sink.
        // Branch on error.statusCode to handle specific cases:
        //   if (error.statusCode === 401) // redirect to login, clear token
        //   else if (error.statusCode === 403) // show "no permission"
        //   else // show a global toast notification
      },
    },
  });
}
```

```tsx
// src/main.tsx or src/index.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setupWire } from "./api/wire";

setupWire();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

You **must** call `initWire` (directly or via a helper like `setupWire`) before using `wireApi`, `useFetch`, `useFetchFn`, or `useMutationFn`.

---

## Usage

### 1. Define API helpers with `wireApi`

A common pattern is to define small API helper functions in `src/api/*` that wrap your backend endpoints. For example, a simple CRUD helper for `Todo`:

```ts
// src/api/todo-api.ts
import { wireApi } from "fetchwire";

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
};

export async function getTodosApi() {
  return wireApi<Todo[]>("/todos", { method: "GET" });
}

export async function createTodoApi(input: { title: string }) {
  return wireApi<Todo>("/todos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function toggleTodoApi(id: string) {
  return wireApi<Todo>(`/todos/${id}/toggle`, {
    method: "POST",
  });
}

export async function deleteTodoApi(id: string) {
  return wireApi<null>(`/todos/${id}`, {
    method: "DELETE",
  });
}
```

You can organize similar helpers for users, invoices, organizations, uploads, etc., all using `wireApi`.

---

### 2. Read data with `useFetch` (Suspense-based)

`useFetch` fetches immediately on mount and **suspends** the component while data is loading. The parent tree must provide a `<Suspense>` boundary for the loading state and an `<ErrorBoundary>` for API errors.

**Key ideas:**

- The component suspends while the initial fetch is in flight — no `isLoading` flag needed.
- API errors are thrown and caught by the nearest `<ErrorBoundary>`.
- `fetch` can return either an `HttpResponse<T>` envelope or the raw data `T`.
- `fetchKey` caches this request's Promise, which is what prevents an infinite suspend loop across renders.
- `refreshFetch` uses `useTransition` internally, so the current data stays visible while the refresh loads instead of falling back to the `<Suspense>` fallback.
- `isRefreshing` is true while a refresh is in flight — use it for inline indicators without losing existing content.

```tsx
// src/components/TodoList.tsx
import { Suspense } from "react";
import { useFetch } from "fetchwire";
import { getTodosApi } from "../api/todo-api";

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
  const {
    data: todos,
    refreshFetch,
    isRefreshing,
  } = useFetch(getTodosApi, {
    fetchKey: "todos",
    tags: ["todos"],
  });

  return (
    <div>
      <button onClick={refreshFetch} disabled={isRefreshing}>
        {isRefreshing ? "Refreshing..." : "Refresh"}
      </button>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            {todo.title} {todo.completed ? "(done)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

### 3. Read data with `useFetchFn` (manual trigger)

`useFetchFn` runs a Promise-returning function that resolves to `HttpResponse<T>`, where `T` is **inferred** from your API helper. Unlike `useFetch`, you control when the fetch runs, and errors land in state instead of an `<ErrorBoundary>`.

**Key ideas:**

- You pass a **pre-typed API helper** (e.g. `getTodosApi`) into the hook once.
- Nothing runs on mount — the fetch starts when you call `executeFetchFn()`.
- A repeat `executeFetchFn()` resolves from the Promise cache without a request. Call `refreshFetchFn()` to force the network.

```tsx
// src/components/TodoList.tsx
import { useEffect } from "react";
import { useFetchFn } from "fetchwire";
import { getTodosApi, type Todo } from "../api/todo-api";

export function TodoList() {
  const {
    data: todos,
    isLoading,
    isRefreshing,
    error,
    executeFetchFn: fetchTodos,
    refreshFetchFn: refreshTodos,
  } = useFetchFn(getTodosApi, {
    fetchKey: "todos",
    tags: ["todos"],
  });

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <button onClick={() => refreshTodos()} disabled={isRefreshing}>
        {isRefreshing ? "Refreshing..." : "Refresh"}
      </button>

      <ul>
        {(todos ?? []).map((todo) => (
          <li key={todo.id}>
            {todo.title} {todo.completed ? "(done)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

### 4. Write data with `useMutationFn`

`useMutationFn` runs a mutation on demand (create / update / delete), tracks `data` and `isMutating`, and invalidates **tags** after a successful mutation.

```ts
const { data, isMutating, executeMutationFn, reset } = useMutationFn(
  mutationFn,
  { invalidatesTags: ["todos"] },
);
```

There are two call shapes, chosen by whether `mutationFn` declares a parameter:

| `mutationFn` | Call as |
| --- | --- |
| No parameters | `executeMutationFn({ onSuccess, onError })` |
| One parameter | `executeMutationFn(variables, { onSuccess, onError })` |

> **Constraint:** declare that parameter **without a default value**. The two shapes are told apart at runtime by `mutationFn.length`, and a default value (or a rest parameter) makes it report `0`, so `variables` would be silently dropped.

```tsx
// src/components/TodoActions.tsx
import { FormEvent, useState } from "react";
import { useMutationFn } from "fetchwire";
import {
  createTodoApi,
  toggleTodoApi,
  deleteTodoApi,
  type Todo,
} from "../api/todo-api";

export function TodoActions() {
  const [title, setTitle] = useState("");

  const { isMutating: isCreating, executeMutationFn: createTodo } =
    useMutationFn(() => createTodoApi({ title }), {
      invalidatesTags: ["todos"],
    });

  const { isMutating: isToggling, executeMutationFn: toggleTodo } =
    useMutationFn((id: string) => toggleTodoApi(id), {
      invalidatesTags: ["todos"],
    });

  const { isMutating: isDeleting, executeMutationFn: deleteTodo } =
    useMutationFn((id: string) => deleteTodoApi(id), {
      invalidatesTags: ["todos"],
    });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createTodo({
      onSuccess: () => setTitle(""),
    });
  };

  // With variables, pass the payload first, then the options:
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
        {isCreating ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
```

---

### 5. Tag-based invalidation and auto-refresh

Tags are the only wire between reads and writes — neither side references the other directly.

- `useFetch(fetch, { fetchKey, tags })` and `useFetchFn(fetchFn, { fetchKey, tags })` **subscribe** to one or more tags.
- `useMutationFn(mutationFn, { invalidatesTags })` **invalidates** those tags after a successful mutation.

Invalidating a tag does two things for every `fetchKey` mapped to it:

| | Serves |
| --- | --- |
| Clears the cached Promise | readers that are **not** mounted — the next mount re-fetches instead of reusing a stale Promise |
| Emits the tag | readers that **are** mounted — `useFetch` refreshes via `useTransition`, `useFetchFn` calls `refreshFetchFn` |

A failed mutation invalidates nothing.

> **Constraint:** Tag strings must not contain commas. Commas are used internally to serialize the tag array into a stable dependency key. Use hyphens or underscores instead (e.g. `'user-123'`, `'todo_list'`).

---

### 6. Warm the cache with `prefetch`

`prefetch` starts loading data before a component mounts — in a route loader, an event handler, or during navigation. The Promise is stored in the Promise cache, so a later `useFetch` / `useFetchFn` with the same `fetchKey` resolves instantly without a duplicate request.

```tsx
import { prefetch } from "fetchwire";
import { getTodosApi } from "../api/todo-api";

// In a route loader or link hover handler
function onNavigateToTodos() {
  prefetch(() => getTodosApi(), { fetchKey: "todos" });

  // With tags — registered for invalidation alongside useFetch / useFetchFn:
  // prefetch(() => getTodosApi(), { fetchKey: 'todos', tags: ['todos'] });
}
```

When the component renders, the **same `fetchKey`** is what makes the hand-off work:

```tsx
// useFetch — resolves from the Promise cache, no request
const { data: todos } = useFetch(getTodosApi, {
  fetchKey: "todos",
  tags: ["todos"],
});

// useFetchFn — resolves from the Promise cache on executeFetchFn()
const { data: todos, executeFetchFn } = useFetchFn(getTodosApi, {
  fetchKey: "todos",
  tags: ["todos"],
});
```

---

## Error Handling

### Response shape

`wireApi` always resolves to `HttpResponse<T>`:

```ts
type HttpResponse<T> = {
  data?: T;
  message?: string;
  status?: number;
};
```

How that shape gets filled depends on whether you configured `transformResponse`:

| | `data` | `status` | `message` |
| --- | --- | --- | --- |
| **Default** (no `transformResponse`) | the parsed body, as-is | the HTTP status | `""` |
| **With `transformResponse`** | whatever you return | whatever you return | whatever you return |

Without `transformResponse`, fetchwire makes **no assumption** about your payload's shape — the body *is* the data. **Configure `transformResponse` whenever your API uses an envelope** such as `{ statusCode, message, data }`.

A `204 No Content` / `205 Reset Content` response is **not** an error: it resolves to `{ data: undefined, status, message: "" }`.

### Synthetic error codes

When a request fails or a response cannot be read, fetchwire throws an `ApiError` whose `errorCode` says which case happened:

| `errorCode` | Thrown by | When | `statusCode` |
| --- | --- | --- | --- |
| `"NETWORK_ERROR"` | `wireApi` | `fetch()` rejected — the request never completed | `520` |
| `"EMPTY_BODY"` | `wireApi` | The response completed with no body on a status other than `204` / `205`. The message carries the `content-length` header, which tells you whether the sender sent nothing (`0`) or the body was lost in transport (absent / non-zero) | the real status |
| `"INVALID_JSON"` | `wireApi` | The body has content but is not JSON — typically a proxy's HTML error page | the real status |
| `"HTTP_ERROR"` | `wireApi` | A non-OK response whose body carried no string `error` field of its own | the real status |
| `"EMPTY_DATA"` | `useFetch` | The fetch resolved, but the value is `undefined` — thrown to the `<ErrorBoundary>` | — |

On a non-OK response, `statusCode` **always** comes from the HTTP response, never from the body. With no `transformError` configured, `message` and `error` are read off the body only when each is a `string`; otherwise they fall back to `HTTP <status>` and `"HTTP_ERROR"`. If your API sends them in another shape (a `string[]` message, a nested `error` object), configure `transformError` — it receives the parsed body untouched.

Errors thrown by your own `onRequest`, `onResponse` or `transformResponse` are **not** wrapped — they propagate as themselves, because a bug in consumer code is not a transport failure.

### `ApiError`

Transport errors are normalized to an `ApiError` instance, which extends `Error`:

| Field | Type | |
| --- | --- | --- |
| `message` | `string` | |
| `errorCode` | `string \| undefined` | from the server's `error` field, or one of the codes above |
| `statusCode` | `number \| undefined` | e.g. `401`, `403`, `500`, `520` |

`useFetchFn`'s `error` and `useMutationFn`'s `onError` always receive a real `ApiError`, including for values `wireApi` does not itself wrap — a rejected `getToken()`, an interceptor, or your callback throwing before the request is made.

### Reading errors in components

**With `useFetch`** — errors are thrown and caught by the nearest `<ErrorBoundary>`; you do not handle them in the component. See [Retrying after an API error](#retrying-after-an-api-error) to let the user retry.

**With `useFetchFn`** — read `error` from the hook state:

```tsx
const { error } = useFetchFn(getTodosApi, { fetchKey: "todos" });
if (error) return <div>Error: {error.message}</div>;
```

**With `useMutationFn`** — handle errors with `onError`:

```tsx
import { ApiError } from "fetchwire";

// No variables: pass only the options
executeMutationFn({
  onSuccess: () => {
    /* success logic */
  },
  onError: (error: ApiError) => {
    Alert.alert("Login failed", error.message || "Unexpected error");
  },
});

// With variables: pass the variables first, then the options
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

## Retrying after an API error

### Why `refreshFetch` cannot retry from an `<ErrorBoundary>`

`refreshFetch` (returned by `useFetch`) updates an internal `useState` and overwrites the Promise cache. Both require the component to be **mounted**. When an API call fails, `useFetch` throws to the nearest `<ErrorBoundary>`, which **unmounts** the component and shows the fallback. At that point:

- `refreshFetch` is no longer accessible — it lives inside the unmounted component.
- Even holding a stale reference to it, its internal `setPromise` state update has no effect.

### The correct pattern: `fetchClient.remove(fetchKey)`

`fetchClient.remove(fetchKey)` deletes the rejected Promise from the Promise cache without emitting any tag events, and works whether or not the component is mounted. Call it in the boundary's reset handler **before** the component remounts, so the next render finds an empty cache entry and starts a fresh fetch.

```tsx
import { fetchClient } from "fetchwire";

// React (web) example using react-error-boundary
import { ErrorBoundary } from "react-error-boundary";

function TodoPage() {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div>
          <p>Failed to load: {error.message}</p>
          <button onClick={resetErrorBoundary}>Retry</button>
        </div>
      )}
      onReset={() => {
        // Clear the rejected Promise from the cache before the component remounts.
        // Without this, the next mount finds the same rejected Promise and
        // immediately throws again — the ErrorBoundary would loop forever.
        fetchClient.remove("todos");
      }}
    >
      <Suspense fallback={<div>Loading…</div>}>
        <TodoList />
      </Suspense>
    </ErrorBoundary>
  );
}
```

```tsx
// React Native example (custom ErrorBoundary with a resetKeys prop or similar)
import { fetchClient } from "fetchwire";

function WageDetailPage({ wageId }: { wageId: string }) {
  const fetchKey = `receipt-payment-list-in-wage-${wageId}`;

  return (
    <ErrorBoundary
      onReset={() => fetchClient.remove(fetchKey)}
      fallback={<RetryButton onPress={resetErrorBoundary} />}
    >
      <Suspense fallback={<ListSkeleton />}>
        <ReceiptPaymentWageList wageId={wageId} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Why not `fetchClient.invalidateTags(tags)`?

`invalidateTags` clears the cache **and** emits tag events to refresh mounted hooks. Inside an `<ErrorBoundary>` the component is unmounted, so there are no listeners and the emit is a no-op. `fetchClient.remove(fetchKey)` is the minimal, correct call for this scenario.

---

## Network access

fetchwire is an HTTP client, so supply-chain scanners will flag it for **network access**. That capability is the feature, not a side effect. What can be verified is how narrow it is:

| | |
| --- | --- |
| Network call sites | **1** — a single `fetch()` inside `wireApi` |
| Hardcoded hosts or endpoints | **none** |
| Destination | `baseUrl + endpoint`, both supplied by you via `initWire` |
| Telemetry / analytics / phone-home | **none** |
| Runtime dependencies | **0** (`react` is a peer dependency) |
| Install scripts (`preinstall` / `postinstall`) | **none** |
| Published files | `dist` only |
| Registry provenance | signed, with SLSA attestation |

---

## API Reference

### `initWire(config)`

```ts
type WireInterceptors = {
  onRequest?: (url: string, options: RequestInit) => void | Promise<void>;
  onResponse?: (url: string, response: Response) => void | Promise<void>;
  onError?: (error: ApiError) => void | Promise<void>;
};

type WireConfig = {
  baseUrl: string;
  headers?: HeadersInit;
  getToken: () => Promise<string | null>;
  transformError?: (error: unknown) => ApiError;
  transformResponse?: (json: unknown) => HttpResponse<unknown>;
  interceptors?: WireInterceptors;
};

function initWire(config: WireConfig): void;
```

Initializes fetchwire with the required configuration. Must be executed at the application entry point before any API calls.

- **`baseUrl`**: Base URL that all relative endpoints will be appended to, e.g. `"https://api.example.com"`.
- **`headers`**: Default headers applied to every request. These will be merged with the `Authorization` header built from `getToken`, and any per-request headers.
- **`getToken`**: A Promise-returning function that resolves to the current access token, or `null` if not logged in. When a non-empty token is returned, fetchwire will send it as `Authorization: Bearer <token>`.
- **`transformError`** (optional): Transforms the raw error response from the server into the standardized `ApiError` shape. It receives the parsed error body exactly as the server sent it — nothing is filled in or filtered first — so a `string[]` message or a nested `error` object is readable here. An `ApiError` returned without a `statusCode` gets the response status.
- **`transformResponse`** (optional): Transforms the raw JSON response from the server into the standardized `HttpResponse` shape. If not provided, fetchwire wraps the raw JSON as the `data` field of the returned `HttpResponse`.
- **`interceptors`** (optional):
  - **`onRequest(url, options)`**: Called before every request, with the full URL and the final `RequestInit` object. Use this to add dynamic headers, inject trace IDs, or log outgoing requests. Mutations to `options` (e.g. `options.headers.set(...)`) are reflected in the actual request because both this interceptor and `fetch` share the same object.
  - **`onResponse(url, response)`**: Called after every response, before the body is parsed. Use this to log response metadata, inspect headers, or record timing. **Do not consume the response body** (e.g. do not call `response.json()` or `response.text()`) — doing so will exhaust the body stream, causing the subsequent read inside `wireApi` to fail. Use `response.clone()` if you need to read the body here.
  - **`onError(error)`**: Called for **every** non-OK response (the single global error sink). Branch on `error.statusCode` to handle specific cases.

### `updateWireConfig(configPartial)`

```ts
function updateWireConfig(config: Partial<WireConfig>): void;
```

Updates the existing configuration. Merges new headers with existing ones and overrides other provided fields.

- `headers` and `interceptors` are each merged one level deep, so you can add a single header or a single interceptor without restating the rest.
- Every other field is replaced outright.
- Throws if called before `initWire`.

### `getWireConfig()`

```ts
function getWireConfig(): WireConfig;
```

Retrieves the current global configuration state. Throws if called before `initWire`. Intended for advanced usage (e.g. custom hooks or libraries built on top of fetchwire).

---

### `wireApi<T>(endpoint, options?)`

```ts
type WireRequestInit = RequestInit & {
  skipToken?: boolean;
};

async function wireApi<T>(
  endpoint: string,
  options?: WireRequestInit,
): Promise<HttpResponse<T>>;
```

Sends an API request and returns the response.

- **`endpoint`**: The API endpoint to call. Example: `'/api/v1/users'`.
- **`options`**: The request options — a `RequestInit` plus optional fetchwire flags:
  - **`skipToken`** (optional): When `true`, fetchwire does **not** call `getToken` and adds **no** `Authorization` header.
- **Returns**: `HttpResponse<T>` — see [Response shape](#response-shape).
- **Throws**: `ApiError` — see [Synthetic error codes](#synthetic-error-codes).

```ts
const result = await wireApi<UserResponse>("/user/me", { method: "GET" });
// result.data is your typed data
// result.message and result.status are available if your backend provides them

// Token refresh — runs unauthenticated, so it cannot recurse into itself:
const refreshed = await wireApi<{ accessToken: string }>("/auth/refresh", {
  method: "POST",
  body: JSON.stringify({ refreshToken }),
  skipToken: true,
});
```

---

### `useFetch<T>(fetch, options)`

```ts
type FetchOptions = {
  fetchKey: string;
  tags?: string[];
};

function useFetch<T>(
  fetch: () => Promise<HttpResponse<T> | T>,
  options: FetchOptions,
): {
  data: T | null;
  refreshFetch: () => void;
  isRefreshing: boolean;
};
```

Fetches immediately on mount and suspends the component while data is loading. The parent tree must have a `<Suspense>` boundary (for the loading state) and an `<ErrorBoundary>` (for API errors).

- **`fetch`**: A Promise-returning function `() => Promise<HttpResponse<T> | T>`. fetchwire calls it automatically on mount to start the fetch, and again on every `refreshFetch()` or tag invalidation. Return either an `HttpResponse<T>` envelope or the raw data `T`.
- **`options.fetchKey`**: A unique key that caches this request's Promise. If `prefetch()` ran with the same key beforehand, the hook reuses the cached Promise instead of firing a new request. The key must be unique across all concurrent fetches. A good convention is to include the resource name and any dynamic segments, e.g. `"todos"` or `"user-" + userId`.
- **`options.tags`**: An optional list of tag strings this request subscribes to. When a `useMutationFn` invalidates a matching tag via `invalidatesTags`, the hook refreshes automatically.
- **`data`**: The resolved value of type `T`, or `null`.
- **`refreshFetch()`**: Manually triggers a refresh while the component is mounted. Uses `useTransition` internally so the current data stays visible while the refresh loads. **Cannot be used to retry from an ErrorBoundary** — see [Retrying after an API error](#retrying-after-an-api-error).
- **`isRefreshing`**: `true` while a refresh is in flight.

> **Note:** Tag strings must not contain commas.

---

### `useFetchFn<T>(fetchFn, options)`

```ts
function useFetchFn<T>(
  fetchFn: () => Promise<HttpResponse<T>>,
  options: FetchOptions,
): {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: ApiError | null;
  executeFetchFn: () => Promise<T | null>;
  refreshFetchFn: () => Promise<T | null>;
  reset: () => void;
};
```

Runs a fetch on demand and tracks its loading, refreshing, and error state.

- **`fetchFn`**: A Promise-returning function `() => Promise<HttpResponse<T>>`. fetchwire does not call it on mount. It runs only when you call `executeFetchFn()` (initial fetch) or `refreshFetchFn()` (refresh).
- **`options.fetchKey`** / **`options.tags`**: Same as [`useFetch`](#usefetchtfetch-options).
- **`data`**: The resolved value of type `T`, or `null` if not yet fetched.
- **`isLoading`**: `true` while the initial fetch is in flight.
- **`isRefreshing`**: `true` while a refresh is in flight.
- **`error`**: An `ApiError` if the last fetch failed, otherwise `null`.
- **`executeFetchFn()`**: Manually triggers the initial fetch. If `fetchKey` is already in the Promise cache, it reuses the stored Promise and issues no request. If the run fails, `fetchKey` is removed from the cache so the next `executeFetchFn()` retries for real. Returns `Promise<T | null>` — the response is unwrapped.
- **`refreshFetchFn()`**: Manually triggers a refresh: skips the cache read and overwrites the cached Promise with the new one. Returns `Promise<T | null>`.
- **`reset()`**: Resets state back to the initial idle state and retires every in-flight run, so a late response cannot overwrite what was just cleared. Does not touch the Promise cache.

Overlapping runs resolve by recency, not by arrival: several runs can be in flight against one state, and only the newest one writes.

> **Note:** Tag strings must not contain commas.

---

### `useMutationFn<T>(mutationFn, options?)` · `useMutationFn<T, TVariables>(mutationFn, options?)`

```ts
type MutationOptions = {
  invalidatesTags?: string[];
};

type ExecuteMutationOptions<T> = {
  onSuccess?: (data: T | null) => void | Promise<void>;
  onError?: (error: ApiError) => void | Promise<void>;
};

// No variables: mutationFn declares no parameter
function useMutationFn<T>(
  mutationFn: () => Promise<HttpResponse<T>>,
  options?: MutationOptions,
): {
  data: T | null;
  isMutating: boolean;
  executeMutationFn: (
    executeOptions?: ExecuteMutationOptions<T>,
  ) => Promise<HttpResponse<T> | null>;
  reset: () => void;
};

// With variables: mutationFn declares one parameter
function useMutationFn<T, TVariables>(
  mutationFn: (variables: TVariables) => Promise<HttpResponse<T>>,
  options?: MutationOptions,
): {
  data: T | null;
  isMutating: boolean;
  executeMutationFn: (
    variables: TVariables,
    executeOptions?: ExecuteMutationOptions<T>,
  ) => Promise<HttpResponse<T> | null>;
  reset: () => void;
};
```

Runs a mutation on demand and tracks its pending and result state.

- **`mutationFn`**: A Promise-returning function. fetchwire runs it only when you call `executeMutationFn()`. If it declares one parameter, that parameter must **not** have a default value — see the [call-shape constraint](#4-write-data-with-usemutationfn).
- **`options.invalidatesTags`**: An optional list of tag strings to invalidate after a successful mutation. Every `useFetch` / `useFetchFn` subscribed to a matching tag refreshes automatically.
- **`data`**: The resolved data of type `T`, or `null`.
- **`isMutating`**: `true` while the mutation is in flight.
- **`executeMutationFn`**: Runs `mutationFn`. Accepts optional per-call `{ onSuccess, onError }` callbacks. Returns the full `HttpResponse<T>` on success, or `null` on failure.
- **`reset()`**: Resets state back to the initial idle state and retires every in-flight run. Does not touch the Promise cache and emits nothing.

Three behaviors worth knowing:

- **Invalidation runs before `onSuccess`**, so anything `onSuccess` does — navigating, mounting a new screen — happens on top of an already-cleared cache.
- **The callbacks are awaited.** `await executeMutationFn(...)` settles only after `onSuccess` / `onError` has finished. `isMutating` goes `false` earlier: it tracks the request, not the callback.
- **Overlapping runs resolve by recency.** Only the newest run writes `data` / `isMutating`, while every run still invalidates its tags and calls its own `onSuccess` / `onError`.

> **Note:** Tag strings must not contain commas.

---

### `prefetch<T>(fetchFn, options)`

```ts
function prefetch<T>(
  fetchFn: () => Promise<HttpResponse<T> | T>,
  options: FetchOptions,
): Promise<unknown> | undefined;
```

Eagerly runs `fetchFn` and caches its Promise under `options.fetchKey`, so a later `useFetch` / `useFetchFn` with the same key resolves instantly instead of firing a new request.

- **`fetchFn`**: A Promise-returning function `() => Promise<HttpResponse<T> | T>`. Return either an `HttpResponse<T>` envelope or the raw data `T`.
- **`options.fetchKey`**: A unique key that caches this request's Promise. A later `useFetch` / `useFetchFn` with the same key reuses the cached Promise instead.
- **`options.tags`**: An optional list of tag strings this request subscribes to. When a `useMutationFn` invalidates a matching tag via `invalidatesTags`, the hook refreshes automatically.
- **Returns**: The cached Promise for `options.fetchKey`. If one already exists, it is returned as-is and `fetchFn` is not called — but `tags` are still registered, since the Promise cache and the tag map are separate stores.

```ts
import { prefetch } from "fetchwire";
import { getTodosApi } from "./api/todo-api";

// Call in a route loader, on link hover, or before navigating
prefetch(() => getTodosApi(), { fetchKey: "todos" });

// With tags (recommended if you also use tags in useFetch / useFetchFn):
prefetch(() => getTodosApi(), { fetchKey: "todos", tags: ["todos"] });
```

---

### `fetchClient`

The exported singleton instance of `FetchClient`. It centralizes the mapping between fetch keys, tags, and the Promise cache. All hooks and `prefetch` use it internally.

```ts
class FetchClient {
  registerTags(fetchKey: string, tags?: string[]): void;
  cachePromiseAndRegisterTags(
    fetchKey: string,
    promise: Promise<unknown>,
    tags?: string[],
  ): void;
  invalidateTags(tags: string[]): void;
  remove(fetchKey: string): void;
  clear(): void;
}

const fetchClient: FetchClient;
```

- **`clear()`** — clears every Promise in the Promise cache and the tag-to-fetchKey map. Call this on logout so no stale cached data persists into the next session.

  ```ts
  import { fetchClient } from "fetchwire";

  function handleLogout() {
    localStorage.removeItem("access_token");
    fetchClient.clear();
  }
  ```

- **`invalidateTags(tags)`** — clears every Promise in the Promise cache whose fetch key is associated with those tags, and emits events to trigger a refresh on mounted components. Called automatically by `useMutationFn` after a successful mutation; exposed for cases where you need to invalidate imperatively (e.g. after a WebSocket push).

  ```ts
  import { fetchClient } from "fetchwire";

  fetchClient.invalidateTags(["todos"]);
  ```

- **`remove(fetchKey)`** — removes a single `fetchKey` from the Promise cache without emitting any events. Use this to clear a rejected Promise so the next render initiates a fresh fetch. See [Retrying after an API error](#retrying-after-an-api-error).

  ```ts
  import { fetchClient } from "fetchwire";

  fetchClient.remove("todos");
  ```

- **`cachePromiseAndRegisterTags(fetchKey, promise, tags?)`** — caches the Promise under `fetchKey` **and** registers its `tags`. Used internally by `useFetch`, `useFetchFn`, and `prefetch`; exposed for advanced cases such as a custom prefetch wrapper.

- **`registerTags(fetchKey, tags?)`** — registers all the tags to `fetchKey` links **without** touching the cached Promise. Used internally when a hook reuses an already-cached Promise and only needs to re-subscribe that key to its tags.

> **Note:** For most application code, `clear()` and `remove()` are the only methods you need to call directly.

---

## License

**MIT License**

Copyright (c) Doanvinhphu

See the `LICENSE` file for details.
