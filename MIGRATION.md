# Migration guide

What to change when upgrading. For **why** each change was made, see the [CHANGELOG](./CHANGELOG.md).

---

# 5.x → 6.0.0

fetchwire 6 removes the `HttpResponse` envelope. A request now resolves the payload.

| # | If you have | Change it to | Compiler catches it? |
| --- | --- | --- | --- |
| 1 | `wireApi<T>(...)` | `wireData<T>(...)` | ✅ `TS2305` |
| 2 | `HttpResponse<T>` in a type | `T`, or `{ data: T; response: Response }` | ✅ `TS2305` |
| 3 | `transformResponse` returning `{ data, message, status }` | return the payload only | ❌ **silent** |
| 4 | A `204` / `205` / `HEAD` call | resolves `undefined`, not an object | ❌ **silent** |
| 5 | `executeMutationFn({ onSuccess })` | `executeMutationFn(undefined, { onSuccess })` | ✅ `TS2345` |
| 6 | `(await executeMutationFn(...)).data` | the return value **is** the payload | ✅ `TS2339` |
| 7 | `getWireConfig().transformResponse(json)` by hand | it returns the payload now | ⚠️ depends |
| 8 | `EMPTY_DATA` error code | removed — nothing throws it | ❌ **silent** |

Do **3, 4 and 8** by hand — nothing fails to compile. The rest the compiler will find for you.

## Finding every site

```bash
grep -rn "wireApi" src/                              # 1
grep -rn "HttpResponse" src/                         # 2
grep -rn "transformResponse" src/                    # 3, 7
grep -rnE "wireApi<(void|null|undefined)>" src/      # 4
grep -rn "method: *['\"]\(DELETE\|HEAD\)['\"]" src/  # 4
grep -rn "EMPTY_DATA" src/                           # 8

# 5 — collect the names executeMutationFn was renamed to, then find those
#     called with an object as the first argument
grep -rhoE "executeMutationFn: *[a-zA-Z][a-zA-Z0-9]*" src/ \
  | sed 's/.*: *//' | sort -u > /tmp/triggers.txt
while read -r t; do grep -rn "\b${t}(\s*{" src/; done < /tmp/triggers.txt | sort -u
grep -rn "executeMutationFn(\s*{" src/
```

## 1. `wireApi` → `wireData`

`TS2305: Module '"fetchwire"' has no exported member 'wireApi'.`

```diff
- import { wireApi } from "fetchwire";
+ import { wireData } from "fetchwire";

  export async function getTodosApi() {
-   return wireApi<Todo[]>("/todos", { method: "GET" });
+   return wireData<Todo[]>("/todos", { method: "GET" });
  }
```

Only the resolved value changes: `Promise<Todo[]>` instead of `Promise<HttpResponse<Todo[]>>`.

## 2. `HttpResponse<T>` removed

`TS2305: Module '"fetchwire"' has no exported member 'HttpResponse'.`

```diff
- async function uploadAvatar(file: File): Promise<HttpResponse<Avatar>> {
+ async function uploadAvatar(file: File): Promise<Avatar> {
```

```diff
  type UserContextValue = {
-   updateUser: (input: UpdateUserInput) => Promise<HttpResponse<User> | null>;
+   updateUser: (input: UpdateUserInput) => Promise<User | null>;
  };
```

If that call needs the status or headers, use `wireRaw` and spell the shape inline — there is no
exported type name for it:

```ts
async function createTodo(input: NewTodo): Promise<{ data: Todo; response: Response }> {
  return wireRaw<Todo>("/todos", { method: "POST", body: JSON.stringify(input) });
}
```

## 3. `transformResponse` returns the payload

**No compile error.** The old return value still type-checks — `{ data, message, status }` is
assignable to `unknown` — so every payload in your app silently becomes the envelope object.
Fix this first.

```diff
  initWire({
-   transformResponse(res) {
-     const raw = res as { statusCode?: number; data?: object; message?: string };
-     return { status: raw.statusCode, data: raw.data, message: raw.message || "" };
-   },
+   transformResponse(json) {
+     return (json as { data: unknown }).data;
+   },
  });
```

If you used it as a guard, keep throwing — only the return value changed:

```ts
transformResponse(json) {
  const body = json as { statusCode?: number; data?: unknown };
  if (body.statusCode === undefined) {
    throw new ApiError("Unexpected response shape", "INVALID_ENVELOPE", 520);
  }
  return body.data;
}
```

## 4. Bodiless responses resolve `undefined`

**No compile error.** A `204`, `205` or `HEAD` used to resolve `{ data: undefined, status, message: "" }`
— an object, always truthy. Now it resolves `undefined`, so a truthiness check flips.

```diff
- return wireApi<void>(`/todos/${id}`, { method: "DELETE" });
+ return wireData<void>(`/todos/${id}`, { method: "DELETE" });
```

```diff
  const result = await deleteTodoApi(id);
- if (result) showSuccess();   // was always true
+ showSuccess();               // a resolved Promise already means success
```

Also: `transformResponse` is no longer called for these responses, and a `HEAD` request no longer
throws `EMPTY_BODY`.

## 5. `executeMutationFn` takes `variables` first

`TS2345: Argument of type '{ onSuccess: ... }' is not assignable to parameter of type 'void'.`

```diff
  const { executeMutationFn: deleteTodo } = useMutationFn(() => deleteTodoApi(todoId));

- deleteTodo({ onSuccess: () => router.back() });
+ deleteTodo(undefined, { onSuccess: () => router.back() });
```

With no callbacks, omit the argument entirely: `deleteTodo()`.

Mutations **with** variables are unchanged: `toggleTodo("todo-123", { onSuccess })`.

Also drop any workaround for the old `mutationFn.length` constraint — default parameters, rest
parameters and wrapped functions are all fine now.

## 6. `executeMutationFn` returns the payload

`TS2339: Property 'data' does not exist on type '<your payload type>'.`

The return value and `onSuccess` now carry the same thing: whatever `mutationFn` resolved.

```diff
- const response = await signIn(credentials);
- if (response && response.status === 200 && response.data?.user) {
-   session.set(response.data.user, response.data.accessToken);
- }
+ const result = await signIn(credentials);
+ if (result) {
+   session.set(result.user, result.accessToken);
+ }
```

`null` still means the mutation failed.

If a mutation needs the status, have its `mutationFn` call `wireRaw`:

```ts
const { executeMutationFn: createTodo } = useMutationFn((input: NewTodo) =>
  wireRaw<Todo>("/todos", { method: "POST", body: JSON.stringify(input) }),
);

const result = await createTodo(input);
result?.response.status; // 201
```

The same applies to `useFetch`, `useFetchFn` and `prefetch` — they hand back exactly what the
function resolved.

## 7. If you call `getWireConfig().transformResponse` yourself

Skip unless you have code that runs **outside** fetchwire's pipeline and reassembles it by hand.

```diff
- return (
-   config.transformResponse
-     ? config.transformResponse(json)
-     : { status: result.status, data: json, message: "" }
- ) as HttpResponse<UploadResult>;
+ return (
+   config.transformResponse ? config.transformResponse(json) : json
+ ) as UploadResult;
```

Everything else on `getWireConfig()` is unchanged. If you build the request too, mirror these
defaults: `Content-Type: application/json` for a **string** body only (never for `FormData`,
`URLSearchParams`, `Blob`, or a bodyless request), and `Accept: application/json, */*;q=0.8`.

## 8. `EMPTY_DATA` removed

**No compile error** — just a branch that will never run.

```diff
  const ERROR_MESSAGES = {
    NETWORK_ERROR: "...",
    EMPTY_BODY: "...",
    INVALID_JSON: "...",
-   EMPTY_DATA: "...",
  };
```

The other four codes are unchanged: `NETWORK_ERROR`, `EMPTY_BODY`, `INVALID_JSON`, `HTTP_ERROR`.

## Nothing to do for

`initWire` · `updateWireConfig` · `getWireConfig` · `transformError` · `onRequest` / `onResponse` /
`onError` · `ApiError` · `fetchClient` · `prefetch` arguments · tags, `fetchKey`, invalidation,
deduplication · `skipToken` · header precedence · `useFetch` / `useFetchFn` options and refresh.

`useFetch`'s `data` narrowed from `T | null` to `T`. Existing `data?.field` and `data ?? []` still
compile — they are merely redundant now.

---

# 5.1.x → 5.2.0

**If your API uses an envelope and you relied on the implicit unwrap, declare it.** The default path
no longer reads `data` / `status` / `statusCode` / `message` off the body.

```ts
initWire({
  transformResponse: (json) => {
    const body = json as { statusCode?: number; message?: string; data?: unknown };
    return { data: body.data, status: body.statusCode, message: body.message };
  },
});
```

Projects that already configure `transformResponse` are unaffected.

**If your error body carries a domain code in `statusCode`, read it in `transformError`.**
`ApiError.statusCode` is now always the HTTP status. No change if the two always match.

**If your `transformError` assumed `message` / `error` / `statusCode` were always present, handle
their absence.** It now receives the parsed body untouched. Without a `transformError`, a non-string
`message` or `error` falls back to `HTTP <status>` / `"HTTP_ERROR"` — add one if your API sends those
as arrays or objects.

**If you detected empty responses inside `transformResponse`, delete that check.** An empty body on a
status that should carry one now throws `ApiError` with `errorCode: "EMPTY_BODY"`.

**If you matched on `NETWORK_ERROR` to catch malformed payloads, match `INVALID_JSON` instead.**

**Narrow with `instanceof` instead of casting.** Errors thrown from your interceptors or
`transformResponse` now propagate as themselves, not as `ApiError`.

**Write `onSuccess` / `onError` to tolerate an unmounted component** — a router, a store or an alert
rather than the caller's own `setState`. They now run in cases where they were silently skipped.

---

# 5.0.x → 5.1.0

Rename the call site — signature and behavior are unchanged:

```diff
- fetchClient.setFetchKeyToTags(fetchKey, promise, tags);
+ fetchClient.cachePromiseAndRegisterTags(fetchKey, promise, tags);
```

Most applications never call this directly.

---

# 4.x → 5.0.0

Fold `onUnauthorized` / `onForbidden` into `onError`, and drop `unauthorizedStatusCodes` /
`forbiddenStatusCodes`:

```diff
  initWire({
    interceptors: {
-     onUnauthorized: (error) => redirectToLogin(),
-     onForbidden: (error) => showNoPermission(),
-     onError: (error) => showToast(error.message),
+     onError: (error) => {
+       if (error.statusCode === 401) return redirectToLogin();
+       if (error.statusCode === 403) return showNoPermission();
+       showToast(error.message);
+     },
    },
  });
```

---

# 3.3.1 → 4.0.0

Swap `prefetch`'s arguments and move the key into `options`:

```diff
- prefetch("todos", () => getTodosApi());
+ prefetch(() => getTodosApi(), { fetchKey: "todos" });
```

Replace `promiseCacheStore` — it is no longer exported:

```diff
- import { promiseCacheStore } from "fetchwire";
- promiseCacheStore.clear();
+ import { fetchClient } from "fetchwire";
+ fetchClient.clear();
```

---

# 3.3.0 → 3.3.1

Move the `fetchKey` string into `options`, and add it to every `useFetchFn` call:

```diff
- useFetch(getTodosApi, "todos", { tags: ["todos"] });
+ useFetch(getTodosApi, { fetchKey: "todos", tags: ["todos"] });

- useFetchFn(getTodosApi);
+ useFetchFn(getTodosApi, { fetchKey: "todos" });
```

`options` and `fetchKey` are both required now. Choose a key that uniquely identifies the resource.

---

# 3.2.x → 3.3.0

Add `url` as the first parameter of `onRequest`:

```diff
- onRequest: (requestInit) => {
+ onRequest: (url, requestInit) => {
    requestInit.headers.set("x-request-id", crypto.randomUUID());
  },
```

---

# 3.1 → 3.2.0

`executeFetchFn` / `refreshFetchFn` resolve the data instead of the envelope:

```diff
- const response = await executeFetchFn();
- const todos = response?.data;
+ const todos = await executeFetchFn();
```

---

# 1.x → 2.0.0

Pass the helper to the hook instead of to the trigger:

```diff
- const { executeFetchFn } = useFetchFn();
- executeFetchFn(getTodosApi);
+ const { executeFetchFn } = useFetchFn(getTodosApi, { fetchKey: "todos" });
+ executeFetchFn();
```

Same shape for `useMutationFn`. Types are inferred from the helper's return type.
