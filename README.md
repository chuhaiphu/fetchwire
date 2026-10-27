# fetchwire

fetchwire is a thin HTTP client built on top of browser native fetch API. It centralizes request configuration, error handling and a Promise cache.

fetchwire/react supports React 19 with hooks for reading and writing data.

| | min | min + gzip |
| --- | --- | --- |
| **fetchwire** | **5.57 kB** | **2.12 kB** |
| SWR (`useSWR` + `useSWRMutation`) | 15.49 kB | 7.00 kB |
| TanStack Query | 46.10 kB | 13.62 kB |
| axios | 51.34 kB | 19.63 kB |

> **Upgrading from 7.x?** fetchwire 8 ships ES modules only and moves `prefetch`, `fetchClient`
> and `FetchOptions` to `fetchwire`. See the
> [migration guide](https://github.com/chuhaiphu/fetchwire/blob/main/MIGRATION.md).

## Support

If you find **fetchwire** helpful and want to support its development, you can buy me a coffee via:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/doanvinhphu)
[![PayPal](https://img.shields.io/badge/PayPal-004595?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/doanvinhphu)

## Contents

- [Limitations](#limitations)
- [Install](#install)
- [Part 1: `fetchwire`](#part-1-fetchwire)
  1. [Send a request with `wireRaw`](#1-send-a-request-with-wireraw)
  2. [Read only the data with `wireData`](#2-read-only-the-data-with-wiredata)
  3. [What fetchwire does on every request](#3-what-fetchwire-does-on-every-request)
  4. [Send the auth token](#4-send-the-auth-token)
  5. [Handle a failed request](#5-handle-a-failed-request)
  6. [Unwrap an envelope response](#6-unwrap-an-envelope-response)
  7. [Run code on every request](#7-run-code-on-every-request)
  8. [Cache a request](#8-cache-a-request)
  - [API reference](#api-reference)
- [Part 2: `fetchwire/react`](#part-2-fetchwirereact)
  1. [Read data with `useFetch`](#1-read-data-with-usefetch)
  2. [Refresh the data](#2-refresh-the-data)
  3. [Write data with `useMutationFn`](#3-write-data-with-usemutationfn)
  4. [Read data on demand with `useFetchFn`](#4-read-data-on-demand-with-usefetchfn)
  5. [Load data before a component mounts](#5-load-data-before-a-component-mounts)
  6. [Show errors and retry](#6-show-errors-and-retry)
  7. [Use another HTTP client](#7-use-another-http-client)
  - [API reference](#api-reference-1)
- [Network access](#network-access)
- [License](#license)

| Entry point | Exports | Needs React |
| --- | --- | --- |
| `fetchwire` | `initWire`, `updateWireConfig`, `getWireConfig`, `wireData`, `wireRaw`, `ApiError`, `prefetch`, `fetchClient` | No |
| `fetchwire/react` | `useFetch`, `useFetchFn`, `useMutationFn` | React 19+ |

## Limitations

If you need any of these features, use [TanStack Query](https://tanstack.com/query),
[SWR](https://swr.vercel.app) or RTK Query.

| Not included | What it means |
| --- | --- |
| **Cache eviction** | A cached Promise stays until you remove it, e.g. with `fetchClient.clear()` on logout. |
| **Staleness and auto-refetch** | There is no `staleTime`, refetch on focus or reconnect, or polling. |
| **Request cancellation** | A superseded run keeps running, and the hook ignores its result. Pass your own `signal` to abort a request. |
| **Retry and backoff** | A failed request stays failed until you run it again. |
| **Pagination and infinite queries** | Each page is its own `fetchKey`. You merge pages in your own state. |
| **Optimistic updates** | `data` changes only after the server responds. |
| **Provider-scoped caching** | The cache is a module-level singleton: one per process. |
| **Devtools** | There is no cache inspector. Use the network tab, or log from the `onRequest` and `onResponse` interceptors. |
| **Selectors and structural sharing** | Each refresh replaces `data` whole. |

## Install

```bash
npm install fetchwire
# or
yarn add fetchwire
# or
pnpm add fetchwire
```

### Requirements

- An ES module environment. fetchwire ships ES modules only and resolves only through `exports`:
  - `require("fetchwire")` needs Node.js 20.19+ or 22.12+.
  - Metro needs package exports turned on, its default from Metro 0.82 (React Native 0.79).
  - Jest in CommonJS mode needs `transformIgnorePatterns: ["/node_modules/(?!fetchwire/)"]`, or
    Jest 30.5+ on Node.js 24.9+ with `--experimental-vm-modules`.
- For TypeScript: version 5.0+ (an older version works only with `skipLibCheck`), and
  `moduleResolution` set to `bundler`, `node16` or `nodenext`. A CommonJS file that imports
  fetchwire needs `module` set to `node20` or `nodenext`.


## Part 1: `fetchwire`

### 1. Send a request with `wireRaw`

Configure fetchwire once with `initWire`, then send a request:

```ts
import { initWire, wireRaw } from "fetchwire";

type Todo = { id: string; title: string; completed: boolean };

initWire({
  baseUrl: "https://api.example.com",
  getToken: async () => "token-123",
});

const { data, response } = await wireRaw<Todo[]>("/todos");
```

fetchwire sends this request:

```http
GET https://api.example.com/todos
Accept: application/json, */*;q=0.8
Authorization: Bearer token-123
```

The server answers `200` with a JSON body, and `wireRaw` resolves the parsed body and the
`Response`:

```ts
response.status; // → 200
data; // → [{ id: "1", title: "Write docs", completed: false }]
```

### 2. Read only the data with `wireData`

`wireData` sends the same request and resolves only the parsed body:

```ts
import { wireData } from "fetchwire";

const todos = await wireData<Todo[]>("/todos");
// → [{ id: "1", title: "Write docs", completed: false }]
```

A `204` response has no body, so `wireData` resolves `undefined`. Type that call as `void`.

### 3. What fetchwire does on every request

For each `wireData` or `wireRaw` call, fetchwire:

1. Builds the URL from `baseUrl + endpoint`.
2. Calls `getToken()`. A non-empty token becomes `Authorization: Bearer <token>`.
3. Merges the headers, lowest to highest: the `initWire` headers, `Authorization`, then the
   request's own headers.
4. Adds `Content-Type: application/json` for a string `body`, and
   `Accept: application/json, */*;q=0.8`, unless the request sets them.
5. Calls `onRequest`, sends the request with `fetch`, then calls `onResponse`.
6. Reads the response:

| Response | Result |
| --- | --- |
| `fetch` rejects (DNS, TLS, refused connection, timeout, abort) | throws `ApiError` with `code: "NETWORK_ERROR"` |
| Non-OK status | throws `ApiError` with `code: "HTTP_ERROR"` |
| `204`, `205` or any `HEAD` | resolves `undefined` |
| OK status, JSON body | resolves the parsed body, passed through `transformResponse` when it is set |
| OK status, body that is not JSON (an empty body included) | throws `ApiError` with `code: "PARSE_ERROR"` |

fetchwire calls `onError` before it throws an `ApiError`.

### 4. Send the auth token

fetchwire calls `getToken` before every request. Return the current token, or `null` when there is
no session:

```ts
initWire({
  baseUrl: "https://api.example.com",
  getToken: async () => localStorage.getItem("access_token"),
});
```

When `getToken` returns `null`, the request goes out without `Authorization`.

To send one request without the token, e.g. the token-refresh call, pass `skipToken: true`.
fetchwire skips `getToken` for that request:

```ts
const { accessToken } = await wireData<{ accessToken: string }>("/auth/refresh", {
  method: "POST",
  body: JSON.stringify({ refreshToken }),
  skipToken: true,
});
```

### 5. Handle a failed request

A failed request throws an `ApiError`:

```ts
import { ApiError, wireData } from "fetchwire";

try {
  await wireData<Todo>("/todos/999");
} catch (error) {
  if (error instanceof ApiError) {
    error.code; // → "HTTP_ERROR"
    error.status; // → 404
    error.data; // → { error: "TODO_NOT_FOUND" }
    error.message; // → "HTTP_ERROR [GET] https://api.example.com/todos/999"
  }
}
```

`error.data` is the body your server sent. To read your API's own error code, write one helper:

```ts
// src/utils/read-error-body.ts
import { ApiError } from "fetchwire";

type ErrorBody = {
  error?: string;
  message?: string | string[];
};

export function readErrorBody(error: unknown): ErrorBody {
  return error instanceof ApiError ? ((error.data as ErrorBody) ?? {}) : {};
}
```

```ts
try {
  await wireData<Todo>("/todos/999");
} catch (error) {
  if (readErrorBody(error).error === "TODO_NOT_FOUND") showNotFound();
}
```

Errors thrown by `getToken`, the interceptors or `transformResponse` propagate as thrown.

### 6. Unwrap an envelope response

If your API wraps every body, e.g. `{ "statusCode": 200, "message": "OK", "data": [...] }`, return
the payload from `transformResponse`:

```ts
initWire({
  baseUrl: "https://api.example.com",
  getToken: async () => localStorage.getItem("access_token"),
  transformResponse: (json) => (json as { data: unknown }).data,
});

const todos = await wireData<Todo[]>("/todos");
// → [{ id: "1", title: "Write docs", completed: false }]
```

`transformResponse` is skipped for `204`, `205`, `HEAD` and non-OK responses. An error body stays
on `error.data`.

### 7. Run code on every request

`interceptors` run on every request, and fetchwire awaits each one:

```ts
initWire({
  baseUrl: "https://api.example.com",
  getToken: async () => localStorage.getItem("access_token"),
  interceptors: {
    onRequest: (url, options) => {
      (options.headers as Headers).set("x-request-id", crypto.randomUUID());
    },
    onResponse: (url, response) => {
      console.log(response.status, url);
    },
    onError: (error) => {
      if (error.code === "NETWORK_ERROR") return showOfflineToast();
      if (error.status === 401) return redirectToLogin();
    },
  },
});
```

- `onRequest` runs before `fetch`. Changes to `options` reach the request, and `options.headers` is
  a `Headers` instance.
- `onResponse` runs before the body is read. Read the body from `response.clone()`: reading
  `response` itself makes the request fail.
- `onError` runs for every `ApiError` fetchwire throws.

### 8. Cache a request

`prefetch` runs a function and caches its Promise under `fetchKey`. A second call with the same key
returns the cached Promise and sends no request:

```ts
import { fetchClient, prefetch } from "fetchwire";
import { getTodosApi } from "./api/todo-api";

const first = prefetch(getTodosApi, { fetchKey: "todos" });
const second = prefetch(getTodosApi, { fetchKey: "todos" });

first === second; // → true, one request sent
```

Remove one entry to send a new request, or clear the whole cache, e.g. on logout:

```ts
fetchClient.remove("todos");
fetchClient.clear();
```

The hooks in Part 2 read and fill this same cache.

### API reference

| Function | Signature | Description |
| --- | --- | --- |
| `initWire` | `(config: WireConfig) => void` | Sets the configuration. |
| `updateWireConfig` | `(config: Partial<WireConfig>) => void` | Merges `headers` and `interceptors` into the configuration, and replaces the other fields you pass. Throws an `Error` before `initWire`. |
| `getWireConfig` | `() => WireConfig` | Returns the configuration, with `headers` as a `Headers` instance. Throws an `Error` before `initWire`. |
| `wireData` | `<T>(endpoint: string, options?: WireRequestInit) => Promise<T>` | Sends a request and resolves the payload. |
| `wireRaw` | `<T>(endpoint: string, options?: WireRequestInit) => Promise<{ data: T; response: Response }>` | Sends a request and resolves the payload and the `Response`. |
| `prefetch` | `<T>(fetchFn: () => Promise<T>, options: FetchOptions) => Promise<T>` | Caches `fetchFn()` under `options.fetchKey`, or returns the Promise already cached there. |

`WireConfig`:

| Field | Type | Description |
| --- | --- | --- |
| `baseUrl` | `string` | Prefix of every endpoint. |
| `headers` | `HeadersInit`, optional | Default headers for every request. |
| `getToken` | `() => Promise<string \| null>` | Resolves the access token, or `null`. |
| `transformResponse` | `(json: unknown) => unknown`, optional | Turns the parsed body of a successful response into the payload. |
| `interceptors` | `WireInterceptors`, optional | `onRequest(url, options)`, `onResponse(url, response)`, `onError(error)`. |

`WireRequestInit` is a `RequestInit` plus `skipToken?: boolean`. `FetchOptions` is
`{ fetchKey: string; tags?: string[] }`.

`ApiError`:

| Field | Value |
| --- | --- |
| `code` | `"HTTP_ERROR"`, `"NETWORK_ERROR"` or `"PARSE_ERROR"` |
| `method` | The request method, uppercase. |
| `url` | `baseUrl + endpoint`. |
| `response` | The `Response`, with its body already read. `undefined` for `NETWORK_ERROR`. |
| `status` | `response.status`, or `undefined`. |
| `data` | The error body as the server sent it: the parsed JSON, the text when it is not JSON, or `undefined` when it is empty. |
| `message` | `CODE [METHOD] url`. |

`fetchClient`:

| Method | Description |
| --- | --- |
| `remove(fetchKey)` | Removes one cached Promise and emits nothing. |
| `clear()` | Removes every cached Promise and every tag. |
| `invalidateTags(tags)` | Removes the cached Promises of those tags, then emits each tag so mounted hooks refresh. |
| `cachePromiseAndRegisterTags(fetchKey, promise, tags?)` | Caches a Promise and registers its tags. |
| `registerTags(fetchKey, tags?)` | Registers tags for a key and leaves its cached Promise as it is. |

Exported types: `WireConfig`, `WireInterceptors`, `WireRequestInit`, `FetchOptions`,
`ApiErrorCode`, `ApiErrorInit`.

---
<br>

## Part 2: `fetchwire/react`

We call `initWire` before the first render, e.g. at the top of `src/main.tsx`:

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { initWire } from "fetchwire";
import App from "./App";

initWire({
  baseUrl: "https://api.example.com",
  getToken: async () => localStorage.getItem("access_token"),
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Then we define some fetching functions with `wireData` .

```ts
// src/api/todo-api.ts
import { wireData } from "fetchwire";

export type Todo = { id: string; title: string; completed: boolean };

export async function getTodosApi() {
  return wireData<Todo[]>("/todos");
}

export async function createTodoApi(input: { title: string }) {
  return wireData<Todo>("/todos", { method: "POST", body: JSON.stringify(input) });
}

export async function toggleTodoApi(id: string) {
  return wireData<Todo>(`/todos/${id}/toggle`, { method: "POST" });
}

export async function deleteTodoApi(id: string) {
  return wireData<void>(`/todos/${id}`, { method: "DELETE" });
}
```



### 1. Read data with `useFetch`

```tsx
// src/components/todo-page.tsx
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useFetch } from "fetchwire/react";
import { getTodosApi } from "../api/todo-api";

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
  const { data: todos } = useFetch(getTodosApi, {
    fetchKey: "todos",
    tags: ["todos"],
  });

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

| While the request | `TodoPage` renders |
| --- | --- |
| is in flight | `Loading...`, the `<Suspense>` fallback |
| has resolved | the list |
| has failed | `Something went wrong`, the error boundary fallback |

`todos` is what `getTodosApi` resolved: `Todo[]`. `ErrorBoundary` comes from the
`react-error-boundary` package. Any error boundary works.

### 2. Refresh the data

`refreshFetch()` fetches again. The list stays on screen while `isRefreshing` is `true`:

```tsx
const { data: todos, refreshFetch, isRefreshing } = useFetch(getTodosApi, {
  fetchKey: "todos",
  tags: ["todos"],
});

<button onClick={refreshFetch} disabled={isRefreshing}>
  {isRefreshing ? "Refreshing..." : "Refresh"}
</button>;
```

Every mounted `useFetch` and `useFetchFn` with the same `fetchKey` shows the refreshed data, so a list
and a summary bar that each read `todos` stay equal after one `refreshFetch()`.

Changing `fetchKey` fetches the new key and suspends the component. To keep the current list on
screen, change the value the key is built from inside `startTransition`:

```tsx
import { startTransition, useState } from "react";
import { wireData } from "fetchwire";
import { useFetch } from "fetchwire/react";
import type { Todo } from "../api/todo-api";

function FilteredTodoList() {
  const [filter, setFilter] = useState("all");
  const { data: todos } = useFetch(() => wireData<Todo[]>(`/todos?status=${filter}`), {
    fetchKey: `todos-${filter}`,
    tags: ["todos"],
  });

  return (
    <>
      <button onClick={() => startTransition(() => setFilter("done"))}>Done</button>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </>
  );
}
```

### 3. Write data with `useMutationFn`

```tsx
// src/components/add-todo-button.tsx
import { useMutationFn } from "fetchwire/react";
import { createTodoApi } from "../api/todo-api";

export function AddTodoButton() {
  const { executeMutationFn: createTodo, isMutating } = useMutationFn(
    (title: string) => createTodoApi({ title }),
    { invalidatesTags: ["todos"] },
  );

  return (
    <button disabled={isMutating} onClick={() => createTodo("Write docs")}>
      Add
    </button>
  );
}
```

When `createTodo` succeeds, fetchwire invalidates the tag `todos`, and `TodoList` fetches `/todos`
again.

| After a successful write, a reader of the tag that is | Effect |
| --- | --- |
| mounted | Refreshes. |
| not mounted | Its cached Promise is removed, so its next mount fetches. |

A failed write invalidates nothing.

`executeMutationFn` takes the variables first and the callbacks second:

```ts
createTodo("Write docs", { onSuccess: () => console.log("Created") });
```

A mutation without variables takes `undefined` first, or no argument at all:

```ts
const { executeMutationFn: logout } = useMutationFn(logoutApi, {
  invalidatesTags: ["user-session"],
});

logout(undefined, { onSuccess: () => console.log("Logged out") });
logout();
```

### 4. Read data on demand with `useFetchFn`

`useFetchFn` fetches when you call `executeFetchFn()`, and keeps the loading and error state in the
hook:

```tsx
// src/components/todo-list.tsx
import { useEffect } from "react";
import { useFetchFn } from "fetchwire/react";
import { getTodosApi } from "../api/todo-api";

export function TodoList() {
  const { data: todos, isLoading, error, executeFetchFn } = useFetchFn(getTodosApi, {
    fetchKey: "todos",
    tags: ["todos"],
  });

  useEffect(() => {
    executeFetchFn();
  }, [executeFetchFn]);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {(todos ?? []).map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

The state at each step:

```ts
// before executeFetchFn():  { data: null, isLoading: false, isRefreshing: false, error: null }
// while it runs:            { data: null, isLoading: true, isRefreshing: false, error: null }
// after it resolves:        { data: [{ id: "1", ... }], isLoading: false, isRefreshing: false, error: null }
// after it rejects:         { data: null, isLoading: false, isRefreshing: false, error: ApiError }
```

A repeat `executeFetchFn()` resolves from the cache and sends no request. `refreshFetchFn()` always
sends a request.

### 5. Load data before a component mounts

Call `prefetch` in a route loader, a hover handler or a navigation handler, with the `fetchKey` and
`tags` the component uses:

```ts
import { prefetch } from "fetchwire";
import { getTodosApi } from "./api/todo-api";

prefetch(getTodosApi, { fetchKey: "todos", tags: ["todos"] });
```

When `TodoList` renders, `useFetch` reads the cached Promise and sends no request.

### 6. Show errors and retry

| Hook | Where the error goes |
| --- | --- |
| `useFetch` | Thrown to the nearest error boundary. |
| `useFetchFn` | `error` in the hook's state. |
| `useMutationFn` | The `onError` callback passed to `executeMutationFn`. |

```ts
createTodo("Write docs", {
  onError: (error) => {
    const { error: serverCode } = readErrorBody(error);
    Alert.alert("Failed", ERROR_COPY[serverCode ?? ""] ?? "Unexpected error");
  },
});
```

`readErrorBody` is the helper from [Handle a failed request](#5-handle-a-failed-request).

When `useFetch` throws, the error boundary unmounts the component, and the next mount reads the
same rejected Promise from the cache. Remove that Promise in the boundary's reset handler to retry:

```tsx
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { fetchClient } from "fetchwire";

function TodoPage() {
  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <div>
          <p>Failed to load.</p>
          <button onClick={resetErrorBoundary}>Retry</button>
        </div>
      )}
      onReset={() => fetchClient.remove("todos")}
    >
      <Suspense fallback={<div>Loading...</div>}>
        <TodoList />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### 7. Use another HTTP client

The hooks report what your function rejects with. `TError` defaults to `ApiError`. Name your
client's error type when the function uses another client:

```ts
import axios, { type AxiosError } from "axios";

const { data, error } = useFetchFn<Todo[], AxiosError>(
  () => axios.get<Todo[]>("/todos").then((response) => response.data),
  { fetchKey: "todos" },
);
```

### API reference

`useFetch<T>(fetch: () => Promise<T>, options: FetchOptions)`

| Returns | Description |
| --- | --- |
| `data` | The resolved value `T`. |
| `refreshFetch()` | Calls `fetch` inside `startTransition` and overwrites the cached Promise. Every mounted `useFetch` and `useFetchFn` with the same `fetchKey` shows the new Promise. |
| `isRefreshing` | `true` while a refresh is pending. |

The hook calls `fetch` when it renders with a `fetchKey` that is not cached, on `refreshFetch()`,
and on an invalidation of its tags while mounted, unless another reader of the `fetchKey` has
already fetched it again for that invalidation. A refresh of its `fetchKey` by another reader
hands it that reader's Promise, with no request of its own. A rejection goes to the nearest error
boundary, and the rejected Promise stays cached.

`useFetchFn<T, TError = ApiError>(fetchFn: () => Promise<T>, options: FetchOptions)`

| Returns | Description |
| --- | --- |
| `data` | The resolved value `T`, or `null` if not yet fetched or the last run failed. |
| `isLoading` | `true` while `executeFetchFn()` runs. |
| `isRefreshing` | `true` while `refreshFetchFn()` runs. |
| `error` | What the last failed run rejected with, or `null`. |
| `executeFetchFn()` | Reads the cached Promise of `fetchKey`, or calls `fetchFn`. Resolves the data, or `null` when the Promise rejects. |
| `refreshFetchFn()` | Calls `fetchFn` and overwrites the cached Promise. Every mounted `useFetch` and `useFetchFn` with the same `fetchKey` shows the new Promise. Resolves the data, or `null` when the Promise rejects. |
| `reset()` | Sets the state back to its initial values. The cache stays as it is. |

When runs overlap, only the newest run writes state. When the newest run fails, the hook removes its
`fetchKey` from the cache. While mounted, an invalidation of its tags calls `refreshFetchFn()`,
unless another reader of the `fetchKey` has already fetched it again for that invalidation, and a
refresh of its `fetchKey` by another reader sets its `data`, or its `error` when that refresh
rejects, with no request of its own.

`useMutationFn<T, TVariables = void, TError = ApiError>(mutationFn: (variables: TVariables) => Promise<T>, options?: MutationOptions)`

| Returns | Description |
| --- | --- |
| `data` | The resolved value `T`, or `null`. |
| `isMutating` | `true` while the latest run is in flight. |
| `executeMutationFn(variables, { onSuccess, onError }?)` | Runs `mutationFn(variables)`. Resolves what `mutationFn` resolved, or `null` when it rejected. |
| `reset()` | Sets the state back to its initial values. The cache stays as it is. |

After a successful run, the hook updates its state, invalidates `invalidatesTags`, then awaits
`onSuccess`. `onSuccess` receives the resolved value, or `null` when it is `undefined`.
`executeMutationFn` resolves after the callback finishes, and rejects if the callback throws.

Exported types: `MutationOptions` (`{ invalidatesTags?: string[] }`) and
`ExecuteMutationOptions<T, TError>` (`{ onSuccess?, onError? }`).

---
<br>

## Network access

fetchwire is an HTTP client, so supply-chain scanners flag it for **network access**. This table
shows how narrow that access is:

| | |
| --- | --- |
| Network call sites | **1**: a single `fetch()` inside `wireRaw` |
| Hardcoded hosts or endpoints | **none** |
| Destination | `baseUrl + endpoint`, both supplied by you through `initWire` |
| Telemetry, analytics, phone-home | **none** |
| Runtime dependencies | **0** (`react` is an optional peer dependency) |
| Install scripts (`preinstall`, `postinstall`) | **none** |
| Published files | `dist`, `package.json`, `README.md` and `LICENSE` |
| Registry provenance | signed, with an SLSA attestation |

---
<br>

## License

**MIT License**

Copyright (c) Doanvinhphu

See the `LICENSE` file for details.
