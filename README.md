# fetchwire

An extremely lightweight, focused API fetching library for **React / React Native** applications that use **React 19+** with **Suspense support**. Use **fetchwire** when your app fetches, shows, and re-fetches — and you would rather own the caching policy than
configure one.

| | min | min + gzip |
| --- | --- | --- |
| **fetchwire** | **5.55 KB** | **2.14 KB** |
| — `fetchwire` alone (no React) | 2.09 KB | 0.98 KB |
| — `fetchwire/react` alone | 3.46 KB | 1.28 KB |
| SWR (`useSWR` + `useSWRMutation`) | 13.87 KB | 6.26 KB |
| TanStack Query | 45.98 KB | 13.58 KB |
| axios | 60.94 KB | 21.05 KB |

**fetchwire** wraps the native `fetch` API in a global configuration layer. It is designed to make it easy to:

- Centralize your API base URL, auth token, and common headers.
- Handle errors consistently.
- Deliver a smooth, non-blocking data-fetching experience.
- Eliminate loading waterfalls and make the UI feel instant.

> **Upgrading from 6.x?** fetchwire 7 splits the package into two entry points and hands you the
> server's error body verbatim — see the [migration guide](./MIGRATION.md). Two of the changes are
> silent, so start there.

### What fetchwire has

| Included | What it means |
| --- | --- |
| **Global configuration** | One place for `baseUrl`, the auth token, default headers, and request / response / error interceptors — `initWire`. |
| **Typed HTTP client** | `wireData` resolves to the payload `T`. Need `status` or `headers`? `wireRaw` hands back the payload plus the native `Response`. |
| **Errors that keep the evidence** | Every transport failure arrives as an `ApiError` carrying the `Response` and the server's error body verbatim on `.data`. fetchwire shapes nothing. |
| **Suspense data fetching** | `useFetch` fetches on mount, suspends while loading, and refreshes without blanking the screen. |
| **Imperative data fetching** | `useFetchFn` runs when you call it, exposing `isLoading` / `isRefreshing` / `error` as state. |
| **Mutations** | `useMutationFn` runs a write and tracks `isMutating`. |
| **Tag-based invalidation** | A write declares `invalidatesTags`; every read subscribed to a matching tag refreshes. Reads and writes never reference each other. |
| **Request deduplication** | One `fetchKey` is one in-flight request, shared by everyone who asks for it. |
| **Cache warming** | `prefetch` starts a request before the component mounts, so the first read has nothing to wait for. |
| **Manual cache control** | `fetchClient` — `invalidateTags()`, `remove()`, `clear()`. |

### What fetchwire lacks

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

- **Two entry points**
  - `fetchwire` — the transport: `initWire`, `wireData`, `wireRaw`, `ApiError`. Imports no React, so a Node script or a server action can use it on its own.
  - `fetchwire/react` — the cache and the hooks: `useFetch`, `useFetchFn`, `useMutationFn`, `prefetch`, `fetchClient`.

- **Global configuration with `initWire`**
  - Configure `baseUrl`, default headers, and how to read the auth token.
  - Register a single global `onError` interceptor that sees every `ApiError` fetchwire throws (branch on `error.code` and `error.status`).
  - Per-request `skipToken` flag on `wireData` / `wireRaw` to send a request without an `Authorization` header (e.g. the token-refresh call, login).
  - `onRequest` interceptor — called before every request with the full URL and `RequestInit`.
  - `onResponse` interceptor — called after every response, before the body is parsed.
  - Optional `transformResponse` to pull the payload out of an envelope response.

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

- `react` is an **optional** peer dependency. Import from `fetchwire/react` and you need **React 19+** (the `useFetch` hook uses React's `use()` API). Import only from `fetchwire` and React never has to be installed.
- TypeScript is recommended but not required.
- For React Native / Expo, make sure the global `fetch` is available (default in modern RN / Expo).

```ts
import { initWire, wireData, ApiError } from "fetchwire";
import { useFetch, useMutationFn, prefetch, fetchClient } from "fetchwire/react";
```

---

## Getting Started

### Initialize fetchwire once at app startup

Call `initWire` once, as early as possible in your app lifecycle.

```ts
// src/api/wire.ts
import { initWire } from "fetchwire";

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
    // Optional: pull the payload out of an envelope response.
    // Only configure this if your API wraps every response, e.g. { statusCode, message, data }.
    // The HTTP status is not yours to set here — it stays on the Response.
    transformResponse(json) {
      return (json as { data: unknown }).data;
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
        // Called for EVERY ApiError fetchwire throws — the single error sink.
        //   if (error.code === "NETWORK_ERROR") // show "you are offline"
        //   else if (error.status === 401) // redirect to login, clear token
        //   else if (error.status === 403) // show "no permission"
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

You **must** call `initWire` (directly or via a helper like `setupWire`) before using `wireData`, `wireRaw`, `useFetch`, `useFetchFn`, or `useMutationFn`.

---

## Usage

### 1. Define API helpers with `wireData`

A common pattern is to define small API helper functions in `src/api/*` that wrap your backend endpoints. For example, a simple CRUD helper for `Todo`:

```ts
// src/api/todo-api.ts
import { wireData } from "fetchwire";

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
};

export async function getTodosApi() {
  return wireData<Todo[]>("/todos", { method: "GET" });
}

export async function createTodoApi(input: { title: string }) {
  return wireData<Todo>("/todos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function toggleTodoApi(id: string) {
  return wireData<Todo>(`/todos/${id}/toggle`, {
    method: "POST",
  });
}

// A 204 response carries no body, so this resolves `undefined` — declare it as `void`.
export async function deleteTodoApi(id: string) {
  return wireData<void>(`/todos/${id}`, {
    method: "DELETE",
  });
}
```

---

### 2. Read data with `useFetch` (Suspense-based)

`useFetch` fetches immediately on mount and **suspends** the component while data is loading. The parent tree must provide a `<Suspense>` boundary for the loading state and an `<ErrorBoundary>` for API errors.

**Key ideas:**

- The component suspends while the initial fetch is in flight — no `isLoading` flag needed.
- API errors are thrown and caught by the nearest `<ErrorBoundary>`.
- Whatever `fetch` resolves **is** `data` — fetchwire never inspects or unwraps it.
- `fetchKey` caches this request's Promise, which is what prevents an infinite suspend loop across renders.
- `refreshFetch` uses `useTransition` internally, so the current data stays visible while the refresh loads instead of falling back to the `<Suspense>` fallback.
- `isRefreshing` is true while a refresh is in flight — use it for inline indicators without losing existing content.
- Changing `fetchKey` (e.g. `` `todos-${filter}` ``) starts a fresh fetch and **suspends** the component again, so the `<Suspense>` fallback replaces the current data. To keep the old data on screen while the new key loads, change the value the key is built from inside `startTransition`:

```tsx
import { startTransition, useState } from "react";

const [filter, setFilter] = useState("all");
const { data: todos } = useFetch(() => getTodosApi(filter), {
  fetchKey: `todos-${filter}`,
  tags: ["todos"],
});

// without startTransition → the Suspense fallback flashes on every filter change
<button onClick={() => startTransition(() => setFilter("done"))}>Done</button>;
```

```tsx
// src/components/TodoList.tsx
import { Suspense } from "react";
import { useFetch } from "fetchwire/react";
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

`useFetchFn` runs a Promise-returning function `() => Promise<T>`, where `T` is **inferred** from your API helper. Unlike `useFetch`, you control when the fetch runs, and errors land in state instead of an `<ErrorBoundary>`.

**Key ideas:**

- You pass a **pre-typed API helper** (e.g. `getTodosApi`) into the hook once.
- Nothing runs on mount — the fetch starts when you call `executeFetchFn()`.
- A repeat `executeFetchFn()` resolves from the Promise cache without a request. Call `refreshFetchFn()` to force the network.

```tsx
// src/components/TodoList.tsx
import { useEffect } from "react";
import { useFetchFn } from "fetchwire/react";
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

`variables` always comes **first** and the callbacks **second** — nothing is inspected at runtime to tell them apart:

```ts
executeMutationFn(variables, { onSuccess, onError });
```

A mutation that takes no input leaves `TVariables` at its `void` default, and TypeScript lets a `void` parameter be omitted — so both of these type-check:

```ts
executeMutationFn();
executeMutationFn(undefined, { onSuccess, onError });
```

```tsx
// src/components/TodoActions.tsx
import { FormEvent, useState } from "react";
import { useMutationFn } from "fetchwire/react";
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

    // createTodo takes no variables, so pass `undefined` before the callbacks.
    createTodo(undefined, {
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

---

### 6. Warm the cache with `prefetch`

`prefetch` starts loading data before a component mounts — in a route loader, an event handler, or during navigation. The Promise is stored in the Promise cache, so a later `useFetch` / `useFetchFn` with the same `fetchKey` resolves instantly without a duplicate request.

```tsx
import { prefetch } from "fetchwire/react";
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

### Payload shape

fetchwire imposes **no** shape of its own. `wireData<T>` resolves the payload; `wireRaw<T>` resolves `{ data, response }` where `response` is the native `Response`.

What counts as the payload depends on whether you configured `transformResponse`:

| | Payload |
| --- | --- |
| **Default** (no `transformResponse`) | the parsed body, as-is — fetchwire assumes no envelope |
| **With `transformResponse`** | whatever it returns |

**Configure `transformResponse` whenever your API uses an envelope** such as `{ statusCode, message, data }`:

```ts
transformResponse: (json) => (json as { data: unknown }).data;
```

Only the payload is yours to change. The HTTP status stays on the `Response`, reachable through `wireRaw` or the `onResponse` interceptor, so a transform can never disagree with the transport about what happened.

### `ApiError`

`wireData` and `wireRaw` throw an `ApiError`, which extends `Error`:

| Field | Type | |
| --- | --- | --- |
| `code` | `ApiErrorCode` | which of fetchwire's three failure modes happened |
| `method` | `string` | the request method, uppercased |
| `url` | `string` | the full URL, `baseUrl + endpoint` |
| `response` | `Response \| undefined` | the `Response` `fetch` returned, body already consumed |
| `status` | `number \| undefined` | `response.status`, read through a getter |
| `data` | `unknown` | **the error body exactly as the server sent it** |
| `message` | `string` | `CODE [METHOD] url`, e.g. `HTTP_ERROR [PUT] https://api.example.com/tenants/me` |

`code` is a closed union of the three outcomes fetchwire itself can produce:

| `code` | When | `status` | `data` |
| --- | --- | --- | --- |
| `"HTTP_ERROR"` | The server answered with a non-OK status | the real status | the parsed JSON body, the raw text when it is not JSON, `undefined` when there was none |
| `"NETWORK_ERROR"` | `fetch()` rejected — DNS, TLS, connection refused, timeout, abort. No HTTP exchange happened | `undefined` | `undefined` |
| `"PARSE_ERROR"` | An OK response whose body is not JSON — a proxy's HTML page, or an empty body | the real status | the raw text |

Errors thrown by your own `onRequest`, `onResponse` or `transformResponse` propagate as themselves, because a bug in consumer code is not a transport failure.

### Your API's error codes live in `data`

`code` names what **fetchwire** could not do. What your **server** decided is in `data`, untouched, so a field fetchwire has never heard of survives the trip:

```ts
import { ApiError } from "fetchwire";

type ErrorBody = {
  error?: string;
  message?: string | string[];
  errorDetail?: { violationTotal: number };
};

export function readErrorBody(error: unknown): ErrorBody {
  return error instanceof ApiError ? ((error.data as ErrorBody) ?? {}) : {};
}
```

```ts
try {
  await updateTenantApi(input);
} catch (error) {
  const { error: serverCode, errorDetail } = readErrorBody(error);
  if (serverCode === "TENANT_INACTIVE") showTenantInactiveDialog(errorDetail);
}
```

This is the narrowing TanStack Query recommends, and the shape ky (`error.data`), ofetch (`error.data`) and axios (`error.response.data`) all use. fetchwire has no transform hook for errors: the body arrives intact, so the reading belongs where the error is handled.

### Reading errors in components

**With `useFetch`** — errors are thrown and caught by the nearest `<ErrorBoundary>`; you do not handle them in the component. See [Retrying after an API error](#retrying-after-an-api-error) to let the user retry.

**With `useFetchFn`** — read `error` from the hook state:

```tsx
const { error } = useFetchFn(getTodosApi, { fetchKey: "todos" });
if (error) return <div>Error: {error.message}</div>;
```

**With `useMutationFn`** — handle errors with `onError`. `error` is typed by `TError`, which defaults to `ApiError`:

```tsx
// No variables: pass `undefined` first, then the options
executeMutationFn(undefined, {
  onSuccess: () => {
    /* success logic */
  },
  onError: (error) => {
    const { error: serverCode } = readErrorBody(error);
    Alert.alert("Login failed", ERROR_COPY[serverCode ?? ""] ?? "Unexpected error");
  },
});

// With variables: pass the variables first, then the options
executeMutationFn(payload, {
  onSuccess: (data) => {
    /* ... */
  },
  onError: (error) => {
    /* ... */
  },
});
```

### When `fetchFn` is not a `wireData` call

The hooks hand you whatever the function rejected with, untouched. `TError` is only a claim about what that will be, and it defaults to `ApiError` because that is what `wireData` throws. Using another transport, name its error type:

```ts
const { error } = useFetchFn<Todo[], AxiosError>(() => axios.get("/todos"), {
  fetchKey: "todos",
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
import { fetchClient } from "fetchwire/react";

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
import { fetchClient } from "fetchwire/react";

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
| Network call sites | **1** — a single `fetch()` inside `wireRaw` |
| Hardcoded hosts or endpoints | **none** |
| Destination | `baseUrl + endpoint`, both supplied by you via `initWire` |
| Telemetry / analytics / phone-home | **none** |
| Runtime dependencies | **0** (`react` is an optional peer dependency) |
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
  transformResponse?: (json: unknown) => unknown;
  interceptors?: WireInterceptors;
};

function initWire(config: WireConfig): void;
```

Initializes fetchwire with the required configuration. Must be executed at the application entry point before any API calls.

- **`baseUrl`**: Base URL that all relative endpoints will be appended to, e.g. `"https://api.example.com"`.
- **`headers`**: Default headers applied to every request. Merged lowest to highest: **these headers → `Authorization` → per-request headers**. To drop one on a single request, delete it from `onRequest`: `(url, options) => (options.headers as Headers).delete("x-client")`.
- **`getToken`**: A Promise-returning function that resolves to the current access token, or `null` if not logged in. When a non-empty token is returned, fetchwire will send it as `Authorization: Bearer <token>`.
- **`transformResponse`** (optional): Extracts the payload from the parsed JSON body. Runs after `JSON.parse` succeeds; whatever it returns **is** the payload `wireData<T>` resolves, and what `wireRaw<T>` puts on `.data`. It is not called when there is no body to parse (`204`, `205`, `HEAD`), nor for a non-OK response — an error body reaches you verbatim on `ApiError.data`. If not provided, the body is the payload.
- **`interceptors`** (optional):
  - **`onRequest(url, options)`**: Called before every request, with the full URL and the final `RequestInit` object. Use this to add dynamic headers, inject trace IDs, or log outgoing requests. Mutations to `options` (e.g. `options.headers.set(...)`) are reflected in the actual request because both this interceptor and `fetch` share the same object.
  - **`onResponse(url, response)`**: Called after every response, before the body is parsed. Use this to log response metadata, inspect headers, or record timing. **Do not consume the response body** (e.g. do not call `response.json()` or `response.text()`) — doing so will exhaust the body stream, causing the subsequent read inside `wireRaw` to fail. Use `response.clone()` if you need to read the body here.
  - **`onError(error)`**: The single global error sink — called for **every** `ApiError` fetchwire throws, whatever its `code`, so a failed connection reaches it just like a failed HTTP exchange. Branch on `error.code`, then on `error.status`. Errors raised by your own interceptors or by `transformResponse` do not reach it.

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

### `wireData<T>(endpoint, options?)`

```ts
type WireRequestInit = RequestInit & {
  skipToken?: boolean;
};

async function wireData<T>(
  endpoint: string,
  options?: WireRequestInit,
): Promise<T>;
```

Sends an API request and returns the payload, dropping the `Response` that `wireRaw` keeps. This is the entry point the hooks are built for — a `wireData` call can be handed to any of them directly.

- **`endpoint`**: The API endpoint to call. Example: `'/api/v1/users'`.
- **`options`**: The request options — a `RequestInit` plus optional fetchwire flags:
  - **`skipToken`** (optional): When `true`, fetchwire does **not** call `getToken` and adds **no** `Authorization` header.
- **Returns**: The payload, as produced by `transformResponse`, or the parsed body when no transform is configured. `undefined` for a `204`, a `205` or any `HEAD` — see [Payload shape](#payload-shape).
- **Throws**: `ApiError` — see [`ApiError`](#apierror).

```ts
const user = await wireData<User>("/user/me", { method: "GET" });
// user is your typed payload — no unwrapping step

// Token refresh — runs unauthenticated, so it cannot recurse into itself:
const refreshed = await wireData<{ accessToken: string }>("/auth/refresh", {
  method: "POST",
  body: JSON.stringify({ refreshToken }),
  skipToken: true,
});
```

---

### `wireRaw<T>(endpoint, options?)`

```ts
async function wireRaw<T>(
  endpoint: string,
  options?: WireRequestInit,
): Promise<{ data: T; response: Response }>;
```

Sends an API request and returns the payload together with the `Response` that carried it. Reach for this over `wireData` only when you need transport metadata — `status`, `headers`, `redirected`.

- **`endpoint`** / **`options`**: Same as [`wireData`](#wiredatatendpoint-options).
- **Returns**:
  - **`data`** — the payload, identical to what `wireData` would resolve.
  - **`response`** — the `Response` `fetch` returned, with its body already consumed.
- **Throws**: the same `ApiError`s as `wireData`.

```ts
const { data, response } = await wireRaw<Todo>("/todos", {
  method: "POST",
  body: JSON.stringify({ title: "Write docs" }),
});

if (response.status === 201) {
  console.log("Created at", response.headers.get("Location"));
}
```

---

### `useFetch<T>(fetch, options)`

```ts
type FetchOptions = {
  fetchKey: string;
  tags?: string[];
};

function useFetch<T>(
  fetch: () => Promise<T>,
  options: FetchOptions,
): {
  data: T;
  refreshFetch: () => void;
  isRefreshing: boolean;
};
```

Fetches immediately on mount and suspends the component while data is loading. The parent tree must have a `<Suspense>` boundary (for the loading state) and an `<ErrorBoundary>` (for API errors).

- **`fetch`**: A Promise-returning function `() => Promise<T>`. fetchwire calls it automatically on mount to start the fetch, and again on every `refreshFetch()` or tag invalidation. Whatever it resolves **is** `data` — fetchwire never inspects or unwraps it.
- **`options.fetchKey`**: A unique key that caches this request's Promise. If `prefetch()` ran with the same key beforehand, the hook reuses the cached Promise instead of firing a new request. The key must be unique across all concurrent fetches. A good convention is to include the resource name and any dynamic segments, e.g. `"todos"` or `"user-" + userId`. Changing it between renders starts a fresh fetch and **suspends** the component, so the `<Suspense>` fallback replaces the current data — update the value the key is built from inside `startTransition` to keep the old data visible instead.
- **`options.tags`**: An optional list of tag strings this request subscribes to. When a `useMutationFn` invalidates a matching tag via `invalidatesTags`, the hook refreshes automatically.
- **`data`**: The resolved value of type `T`. Never `null` — the hook suspends until the Promise settles, so there is no "not yet" state to represent.
- **`refreshFetch()`**: Manually triggers a refresh while the component is mounted. Uses `useTransition` internally so the current data stays visible while the refresh loads. **Cannot be used to retry from an ErrorBoundary** — see [Retrying after an API error](#retrying-after-an-api-error).
- **`isRefreshing`**: `true` while a refresh is in flight.

---

### `useFetchFn<T, TError>(fetchFn, options)`

```ts
function useFetchFn<T, TError = ApiError>(
  fetchFn: () => Promise<T>,
  options: FetchOptions,
): {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: TError | null;
  executeFetchFn: () => Promise<T | null>;
  refreshFetchFn: () => Promise<T | null>;
  reset: () => void;
};
```

Runs a fetch on demand and tracks its loading, refreshing, and error state.

- **`fetchFn`**: A Promise-returning function `() => Promise<T>`. fetchwire does not call it on mount. It runs only when you call `executeFetchFn()` (initial fetch) or `refreshFetchFn()` (refresh). Whatever it resolves **is** `data` — fetchwire never inspects or unwraps it.
- **`options.fetchKey`** / **`options.tags`**: Same as [`useFetch`](#usefetchtfetch-options).
- **`data`**: The resolved value of type `T`, or `null` if not yet fetched.
- **`isLoading`**: `true` while the initial fetch is in flight.
- **`isRefreshing`**: `true` while a refresh is in flight.
- **`error`**: Whatever the last failed run rejected with, untouched, otherwise `null`. `TError` defaults to `ApiError` because that is what `wireData` / `wireRaw` throw; set it yourself when `fetchFn` uses another transport.
- **`executeFetchFn()`**: Manually triggers the initial fetch. If `fetchKey` is already in the Promise cache, it reuses the stored Promise and issues no request. If the run fails, `fetchKey` is removed from the cache so the next `executeFetchFn()` retries for real. Returns `Promise<T | null>` — `null` on failure.
- **`refreshFetchFn()`**: Manually triggers a refresh: skips the cache read and overwrites the cached Promise with the new one. Returns `Promise<T | null>`.
- **`reset()`**: Resets state back to the initial idle state and retires every in-flight run, so a late response cannot overwrite what was just cleared. Does not touch the Promise cache.

Overlapping runs resolve by recency, not by arrival: several runs can be in flight against one state, and only the newest one writes.

---

### `useMutationFn<T, TVariables, TError>(mutationFn, options?)`

```ts
type MutationOptions = {
  invalidatesTags?: string[];
};

type ExecuteMutationOptions<T, TError = ApiError> = {
  onSuccess?: (data: T | null) => void | Promise<void>;
  onError?: (error: TError) => void | Promise<void>;
};

function useMutationFn<T, TVariables = void, TError = ApiError>(
  mutationFn: (variables: TVariables) => Promise<T>,
  options?: MutationOptions,
): {
  data: T | null;
  isMutating: boolean;
  executeMutationFn: (
    variables: TVariables,
    executeOptions?: ExecuteMutationOptions<T, TError>,
  ) => Promise<T | null>;
  reset: () => void;
};
```

Runs a mutation on demand and tracks its pending and result state.

- **`mutationFn`**: A Promise-returning function `(variables: TVariables) => Promise<T>`. fetchwire runs it only when you call `executeMutationFn(variables)`. Whatever it resolves **is** `data` — fetchwire never inspects or unwraps it.
- **`options.invalidatesTags`**: An optional list of tag strings to invalidate after a successful mutation. Every `useFetch` / `useFetchFn` subscribed to a matching tag refreshes automatically.
- **`data`**: The resolved data of type `T`, or `null`.
- **`isMutating`**: `true` while the mutation is in flight.
- **`executeMutationFn`**: Runs `mutationFn(variables)`. `variables` comes first and may be omitted when `TVariables` is `void`; optional per-call `{ onSuccess, onError }` callbacks come second. Returns the resolved `T` on success, or `null` on failure — the same value `onSuccess` receives.
- **`reset()`**: Resets state back to the initial idle state and retires every in-flight run. Does not touch the Promise cache and emits nothing.

Three behaviors worth knowing:

- **Invalidation runs before `onSuccess`**, so anything `onSuccess` does — navigating, mounting a new screen — happens on top of an already-cleared cache.
- **The callbacks are awaited.** `await executeMutationFn(...)` settles only after `onSuccess` / `onError` has finished. `isMutating` goes `false` earlier: it tracks the request, not the callback.
- **Overlapping runs resolve by recency.** Only the newest run writes `data` / `isMutating`, while every run still invalidates its tags and calls its own `onSuccess` / `onError`.

---

### `prefetch<T>(fetchFn, options)`

```ts
function prefetch<T>(
  fetchFn: () => Promise<T>,
  options: FetchOptions,
): Promise<T>;
```

Eagerly runs `fetchFn` and caches its Promise under `options.fetchKey`, so a later `useFetch` / `useFetchFn` with the same key resolves instantly instead of firing a new request.

- **`fetchFn`**: A Promise-returning function `() => Promise<T>`. Whatever it resolves **is** the data — fetchwire never inspects or unwraps it.
- **`options.fetchKey`**: A unique key that caches this request's Promise. A later `useFetch` / `useFetchFn` with the same key reuses the cached Promise instead.
- **`options.tags`**: An optional list of tag strings this request subscribes to. When a `useMutationFn` invalidates a matching tag via `invalidatesTags`, the hook refreshes automatically.
- **Returns**: The cached Promise for `options.fetchKey`. If one already exists, it is returned as-is and `fetchFn` is not called — but `tags` are still registered, since the Promise cache and the tag map are separate stores.

```ts
import { prefetch } from "fetchwire/react";
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
  import { fetchClient } from "fetchwire/react";

  function handleLogout() {
    localStorage.removeItem("access_token");
    fetchClient.clear();
  }
  ```

- **`invalidateTags(tags)`** — clears every Promise in the Promise cache whose fetch key is associated with those tags, and emits events to trigger a refresh on mounted components. Called automatically by `useMutationFn` after a successful mutation; exposed for cases where you need to invalidate imperatively (e.g. after a WebSocket push).

  ```ts
  import { fetchClient } from "fetchwire/react";

  fetchClient.invalidateTags(["todos"]);
  ```

- **`remove(fetchKey)`** — removes a single `fetchKey` from the Promise cache without emitting any events. Use this to clear a rejected Promise so the next render initiates a fresh fetch. See [Retrying after an API error](#retrying-after-an-api-error).

  ```ts
  import { fetchClient } from "fetchwire/react";

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
