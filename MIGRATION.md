# Migration guide

What to change when upgrading. For **why** each change was made, see the [CHANGELOG](./CHANGELOG.md).

---

# 6.x → 7.0.0

fetchwire 7 stops shaping your errors and splits the package in two. `ApiError` now carries the
server's error body verbatim, so `transformError` has nothing left to do and is gone.

| # | If you have | Change it to | Compiler catches it? |
| --- | --- | --- | --- |
| 1 | `import { useFetch, useMutationFn, prefetch, fetchClient } from "fetchwire"` | import them from `"fetchwire/react"` | ✅ `TS2305` |
| 2 | `transformError` in `initWire` | delete it; read `error.data` at the catch site | ✅ `TS2353` |
| 3 | `new ApiError(message, errorCode, statusCode)` | `new ApiError({ code, method, url, response, data })` | ✅ `TS2554` |
| 4 | `error.errorCode` for **your API's** code | `readErrorBody(error).error` | ✅ `TS2339` |
| 5 | `error.errorCode` for **fetchwire's** code | `error.code` | ✅ `TS2339` |
| 6 | `error.statusCode` | `error.status` | ✅ `TS2339` |
| 7 | `error.message` showing the server's text | `readErrorBody(error).message` | ❌ **silent** |
| 8 | `statusCode === 520` for a network failure | `error.code === "NETWORK_ERROR"` | ❌ **silent** |
| 9 | `"EMPTY_BODY"` / `"INVALID_JSON"` | both are `"PARSE_ERROR"` | ✅ `TS2367` |
| 10 | An `onError` interceptor assuming a response exists | it now fires for `NETWORK_ERROR` too, where `status` is `undefined` | ❌ **silent** |
| 11 | A subclass of `ApiError` built to carry an extra field | delete it — the field is already on `error.data` | ⚠️ depends |

Do **7, 8 and 10** by hand — nothing fails to compile. The rest the compiler will find for you.

## Finding every site

```bash
grep -rnE "from ['\"]fetchwire['\"]" src/            # 1
grep -rn "transformError" src/                       # 2, 3
grep -rn "errorCode" src/                            # 4, 5
grep -rn "statusCode" src/                           # 6, 8
grep -rn "error.message" src/                        # 7
grep -rn "520" src/                                  # 8
grep -rnE "EMPTY_BODY|INVALID_JSON" src/             # 9
grep -rn "onError" src/                              # 10
grep -rn "extends ApiError" src/                     # 11
```

## 1. Hooks move to `fetchwire/react`

`TS2305: Module '"fetchwire"' has no exported member 'useFetch'.`

```diff
- import { initWire, wireData, useFetch, fetchClient } from "fetchwire";
+ import { initWire, wireData } from "fetchwire";
+ import { useFetch, fetchClient } from "fetchwire/react";
```

`fetchwire` is the transport — `initWire`, `updateWireConfig`, `getWireConfig`, `wireData`,
`wireRaw`, `ApiError`. `fetchwire/react` is the cache and the hooks — `useFetch`, `useFetchFn`,
`useMutationFn`, `prefetch`, `fetchClient`.

There is still one package and one `npm install fetchwire`. What changed is that the transport
entry point imports no React, so `react` is now an **optional** peer dependency: a Node script or
a server action can use `wireData` without React installed. Nothing to do if you already have
React — npm keeps installing it.

## 2. `transformError` removed

`TS2353: Object literal may only specify known properties, and 'transformError' does not exist in
type 'WireConfig'.`

The error body now reaches you untouched on `error.data`, so there is nothing to normalize up
front. Delete the option and read the body where you handle the error.

```diff
  initWire({
    baseUrl: API_URL,
    getToken,
-   transformError: (error) => {
-     const raw = error as { statusCode?: number; message?: string | string[]; error?: string };
-     const message = Array.isArray(raw.message) ? raw.message[0] : raw.message;
-     return new ApiError(message ?? "Something went wrong", raw.error ?? "UNKNOWN", raw.statusCode);
-   },
  });
```

Write one reader in your app instead:

```ts
// src/utils/read-error-body.ts
import { ApiError } from "fetchwire";

export type ErrorBody = {
  error?: string;
  message?: string | string[];
  errorDetail?: ErrorDetail;
};

export function readErrorBody(error: unknown): ErrorBody {
  return error instanceof ApiError ? ((error.data as ErrorBody) ?? {}) : {};
}
```

## 3. `ApiError`'s constructor takes one object

`TS2554: Expected 1 arguments, but got 3.`

```diff
- throw new ApiError("Upload failed", "UPLOAD_FAILED", response.status);
+ throw new ApiError({
+   code: "HTTP_ERROR",
+   method: "PUT",
+   url: `${baseUrl}/tenants/me/settings/logo`,
+   response,
+   data: body,
+ });
```

You only need this when you construct an `ApiError` yourself — typically a hand-rolled upload that
uses a transport other than `fetch`.

## 4-5. `errorCode` splits in two

`TS2339: Property 'errorCode' does not exist on type 'ApiError'.`

One field used to hold two unrelated things: your server's code (`"TENANT_INACTIVE"`) and
fetchwire's own (`"INVALID_JSON"`). They now live apart.

```diff
- if (error.errorCode === "TENANT_INACTIVE") showTenantDialog();
+ if (readErrorBody(error).error === "TENANT_INACTIVE") showTenantDialog();
```

```diff
- if (error.errorCode === "NETWORK_ERROR") showOfflineToast();
+ if (error.code === "NETWORK_ERROR") showOfflineToast();
```

`error.code` is a closed union of `"HTTP_ERROR" | "NETWORK_ERROR" | "PARSE_ERROR"`, so a `switch`
over it is exhaustive.

## 6. `statusCode` → `status`

`TS2339: Property 'statusCode' does not exist on type 'ApiError'.`

```diff
- if (error.statusCode === 401) redirectToLogin();
+ if (error.status === 401) redirectToLogin();
```

`status` is a getter over `error.response`, so it can never disagree with the transport.

## 7. `message` describes the HTTP exchange

**No compile error.** `error.message` used to be the server's sentence when the body carried a
string `message`. It is now built from the exchange, e.g.
`HTTP_ERROR [PUT] https://api.example.com/tenants/me` — useful in a log or a stack trace, and
wrong on a screen.

```diff
- Alert.alert("Failed", error.message);
+ const { message } = readErrorBody(error);
+ Alert.alert("Failed", Array.isArray(message) ? message[0] : message ?? "Something went wrong");
```

If your app already keys its own copy off an error code, this changes nothing for you.

## 8. Network failures have no status

**No compile error.** A failed connection used to report `statusCode: 520`, a status no server
ever sent. It now reports `status: undefined`, and says what happened through `code`.

```diff
- if (error.statusCode === 520) showOfflineToast();
+ if (error.code === "NETWORK_ERROR") showOfflineToast();
```

## 9. `EMPTY_BODY` and `INVALID_JSON` merge into `PARSE_ERROR`

`TS2367: This comparison appears to be unintentional.`

Both meant the same thing: an OK response whose body could not be read as JSON. `JSON.parse("")`
throws on its own, so the empty body needs no case of its own.

```diff
- if (error.errorCode === "EMPTY_BODY" || error.errorCode === "INVALID_JSON") reportBug();
+ if (error.code === "PARSE_ERROR") reportBug();
```

The unparsable text is on `error.data`. If you relied on the `content-length` the old message
carried, read it from `error.response.headers.get("content-length")`.

## 10. `onError` now sees every failure

**No compile error.** It used to fire only for a non-OK response. It now fires for every `ApiError`
fetchwire throws, which is what makes it a sink worth having: a dropped connection reaches it too.

```diff
  onError: (error) => {
+   if (error.code === "NETWORK_ERROR") return showOfflineToast();
    if (error.status === 401) return redirectToLogin();
    showToast(error.message);
  },
```

Guard anything that assumed a response existed — on a `NETWORK_ERROR`, `error.status` and
`error.response` are both `undefined`.

## 11. Subclasses of `ApiError` are no longer needed

Extending `ApiError` used to be the only way to carry a field it had no slot for. That field is
already on `error.data`.

```diff
- export class DetailedApiError extends ApiError {
-   constructor(message: string, errorCode?: string, statusCode?: number, readonly errorDetail?: ErrorDetail) {
-     super(message, errorCode, statusCode);
-     this.name = "DetailedApiError";
-   }
- }
-
- export function readErrorDetail(error: unknown): ErrorDetail | undefined {
-   return error instanceof DetailedApiError ? error.errorDetail : undefined;
- }
+ export function readErrorDetail(error: unknown): ErrorDetail | undefined {
+   return readErrorBody(error).errorDetail;
+ }
```

## Tag strings may contain commas again

Nothing to change, and one constraint to forget. Tag arrays are serialized with `JSON.stringify`
rather than `join(",")`, so `"todo,list"` is one tag now.

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
