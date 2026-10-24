# Migration guide

Upgrade steps for every release with breaking changes, newest first. [CHANGELOG.md](./CHANGELOG.md)
lists every release.

The 6.0.0, 7.0.0 and 8.0.0 sections start with a table of the changes. Fix by hand the rows the
compiler misses; the `grep` commands under each table find them.

## 7.x → 8.0.0

fetchwire 8 ships ES modules only and moves the cache to `fetchwire`.

| # | If you have | Change it to | Caught by the compiler |
| --- | --- | --- | --- |
| 1 | `prefetch` or `fetchClient` imported from `"fetchwire/react"` | import it from `"fetchwire"` | Yes, `TS2305` |
| 2 | `FetchOptions` imported from `"fetchwire/react"` | import it from `"fetchwire"` | Yes, `TS2305` |
| 3 | `require("fetchwire")` on Node.js below 20.19 or 22.12 | Node.js 20.19+ or 22.12+, or `await import("fetchwire")` | No, `ERR_REQUIRE_ESM` at runtime |
| 4 | Jest in CommonJS mode | let Jest transform fetchwire | No, the test suite fails to run |
| 5 | Metro with package exports turned off | turn them on | No, the bundle fails to build |
| 6 | A CommonJS TypeScript file with `module` set to `node16` or `node18` | `node20` or `nodenext` | Yes, `TS1479` |
| 7 | `moduleResolution` set to `node10` or `node` | `bundler`, `node16` or `nodenext` | Yes, `TS2307` |
| 8 | TypeScript below 5.0 | TypeScript 5.0+, or `skipLibCheck: true` | Yes, `TS1383` |
| 9 | An import of `fetchwire/package.json` | remove it | No, `ERR_PACKAGE_PATH_NOT_EXPORTED` at runtime |

```bash
grep -rnE "require\(['\"]fetchwire" src/                 # 3
grep -rn "transformIgnorePatterns" jest.config.*          # 4
grep -rn "unstable_enablePackageExports" metro.config.*   # 5
grep -rn "fetchwire/package.json" src/                    # 9
```

### 1–2. Import `prefetch`, `fetchClient` and `FetchOptions` from `fetchwire`

`TS2305: Module '"fetchwire/react"' has no exported member 'prefetch'.`

```diff
- import { useFetch, prefetch, fetchClient } from "fetchwire/react";
+ import { prefetch, fetchClient } from "fetchwire";
+ import { useFetch } from "fetchwire/react";
```

`fetchwire/react` keeps `useFetch`, `useFetchFn`, `useMutationFn`, `MutationOptions` and
`ExecuteMutationOptions`.

### 3. Load fetchwire with `require()`

Node.js loads an ES module with `require()` from 20.19.0 and 22.12.0. On an older version, upgrade
Node.js or load fetchwire with `await import("fetchwire")`.

### 4. Run fetchwire in Jest

In CommonJS mode, add fetchwire to the files Jest transforms:

```js
transformIgnorePatterns: ["/node_modules/(?!fetchwire/)"],
```

Or run Jest 30.5+ on Node.js 24.9+ with `--experimental-vm-modules`.

### 5. Turn on package exports in Metro

fetchwire 8 resolves only through `exports`. Metro reads `exports` by default from Metro 0.82
(React Native 0.79). If `metro.config.js` sets `resolver.unstable_enablePackageExports` to `false`,
set it to `true`.

### 6–8. Update TypeScript settings

- A CommonJS file, meaning a `.cts` file or a `.ts` file in a package without `"type": "module"`,
  needs `module` set to `node20` or `nodenext` to import fetchwire.
- `moduleResolution` `node10` ignores `exports`. Use `bundler` with a bundler, and `node16` or
  `nodenext` otherwise.
- TypeScript below 5.0 reports `TS1383` in fetchwire's declarations. Upgrade, or set
  `skipLibCheck: true`.

### 9. Remove imports of `fetchwire/package.json`

8.0.0 removes `"./package.json"` from `exports`.

## 6.x → 7.0.0

fetchwire 7 keeps the server's error body on `ApiError`, removes `transformError`, and moves the
hooks and the cache to `fetchwire/react`.

| # | If you have | Change it to | Caught by the compiler |
| --- | --- | --- | --- |
| 1 | `useFetch`, `useFetchFn`, `useMutationFn`, `prefetch` or `fetchClient` imported from `"fetchwire"` | import it from `"fetchwire/react"` | Yes, `TS2305` |
| 2 | `transformError` in `initWire` | delete it; read `error.data` where you handle the error | Yes, `TS2353` |
| 3 | `new ApiError(message, errorCode, statusCode)` | `new ApiError({ code, method, url, response, data })` | Yes, `TS2554` |
| 4 | `error.errorCode` for your API's code | `readErrorBody(error).error` | Yes, `TS2339` |
| 5 | `error.errorCode` for fetchwire's code | `error.code` | Yes, `TS2339` |
| 6 | `error.statusCode` | `error.status` | Yes, `TS2339` |
| 7 | `error.message` shown to the user | `readErrorBody(error).message` | No |
| 8 | `statusCode === 520` for a network failure | `error.code === "NETWORK_ERROR"` | No |
| 9 | `"EMPTY_BODY"` or `"INVALID_JSON"` | `"PARSE_ERROR"` | Yes, `TS2367` |
| 10 | An `onError` that assumes a response exists | handle `NETWORK_ERROR`, where `status` is `undefined` | No |
| 11 | A subclass of `ApiError` that carries a body field | delete it; read the field from `error.data` | Depends |

```bash
grep -rn "error.message" src/                        # 7
grep -rn "520" src/                                  # 8
grep -rn "onError" src/                              # 10
grep -rn "extends ApiError" src/                     # 11
```

### 1. Import the hooks and the cache from `fetchwire/react`

`TS2305: Module '"fetchwire"' has no exported member 'useFetch'.`

```diff
- import { initWire, wireData, useFetch, fetchClient } from "fetchwire";
+ import { initWire, wireData } from "fetchwire";
+ import { useFetch, fetchClient } from "fetchwire/react";
```

`react` is an optional peer dependency from 7.0.0: code that imports only `fetchwire` runs without
React installed.

### 2. Delete `transformError`

`TS2353: Object literal may only specify known properties, and 'transformError' does not exist in
type 'WireConfig'.`

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

Read the error body where you handle the error. Steps 4, 7 and 11 use this helper:

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

### 3. Pass one object to `new ApiError`

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

Only code that constructs an `ApiError` itself needs this step.

### 4–5. Replace `errorCode`

`TS2339: Property 'errorCode' does not exist on type 'ApiError'.`

Your API's code is in the error body:

```diff
- if (error.errorCode === "TENANT_INACTIVE") showTenantDialog();
+ if (readErrorBody(error).error === "TENANT_INACTIVE") showTenantDialog();
```

fetchwire's code is on `error.code`, which is `"HTTP_ERROR"`, `"NETWORK_ERROR"` or `"PARSE_ERROR"`:

```diff
- if (error.errorCode === "NETWORK_ERROR") showOfflineToast();
+ if (error.code === "NETWORK_ERROR") showOfflineToast();
```

### 6. Replace `statusCode` with `status`

`TS2339: Property 'statusCode' does not exist on type 'ApiError'.`

```diff
- if (error.statusCode === 401) redirectToLogin();
+ if (error.status === 401) redirectToLogin();
```

### 7. Read the server's message from the error body

`error.message` describes the request, e.g. `HTTP_ERROR [PUT] https://api.example.com/tenants/me`.
Show the server's text from the body:

```diff
- Alert.alert("Failed", error.message);
+ const { message } = readErrorBody(error);
+ Alert.alert("Failed", Array.isArray(message) ? message[0] : message ?? "Something went wrong");
```

Skip this step if your app maps error codes to its own text.

### 8. Detect a network failure by `code`

A network failure has `status: undefined`.

```diff
- if (error.statusCode === 520) showOfflineToast();
+ if (error.code === "NETWORK_ERROR") showOfflineToast();
```

### 9. Replace `EMPTY_BODY` and `INVALID_JSON` with `PARSE_ERROR`

`TS2367: This comparison appears to be unintentional.`

```diff
- if (error.errorCode === "EMPTY_BODY" || error.errorCode === "INVALID_JSON") reportBug();
+ if (error.code === "PARSE_ERROR") reportBug();
```

The text that failed to parse is on `error.data`. The `content-length` header is on
`error.response.headers.get("content-length")`.

### 10. Handle `NETWORK_ERROR` in `onError`

`onError` receives every `ApiError`. On a `NETWORK_ERROR`, `error.status` and `error.response` are
`undefined`.

```diff
  onError: (error) => {
+   if (error.code === "NETWORK_ERROR") return showOfflineToast();
    if (error.status === 401) return redirectToLogin();
    showToast(error.message);
  },
```

### 11. Delete `ApiError` subclasses that carry a body field

The field is on `error.data`.

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

## 5.x → 6.0.0

fetchwire 6 removes the `HttpResponse` envelope: a request resolves the payload.

| # | If you have | Change it to | Caught by the compiler |
| --- | --- | --- | --- |
| 1 | `wireApi<T>(...)` | `wireData<T>(...)` | Yes, `TS2305` |
| 2 | `HttpResponse<T>` in a type | `T`, or `{ data: T; response: Response }` | Yes, `TS2305` |
| 3 | `transformResponse` returning `{ data, message, status }` | return the payload | No |
| 4 | A `204`, `205` or `HEAD` call | it resolves `undefined` | No |
| 5 | `executeMutationFn({ onSuccess })` | `executeMutationFn(undefined, { onSuccess })` | Yes, `TS2345` |
| 6 | `(await executeMutationFn(...)).data` | the return value is the payload | Yes, `TS2339` |
| 7 | `getWireConfig().transformResponse(json)` called by hand | it returns the payload | Depends |
| 8 | The `EMPTY_DATA` error code | delete it | No |

```bash
grep -rn "transformResponse" src/                    # 3, 7
grep -rnE "wireApi<(void|null|undefined)>" src/      # 4
grep -rnE "method: *['\"](DELETE|HEAD)['\"]" src/    # 4
grep -rn "EMPTY_DATA" src/                           # 8
```

### 1. Rename `wireApi` to `wireData`

`TS2305: Module '"fetchwire"' has no exported member 'wireApi'.`

```diff
- import { wireApi } from "fetchwire";
+ import { wireData } from "fetchwire";

  export async function getTodosApi() {
-   return wireApi<Todo[]>("/todos", { method: "GET" });
+   return wireData<Todo[]>("/todos", { method: "GET" });
  }
```

`getTodosApi()` resolves `Todo[]`.

### 2. Remove `HttpResponse<T>`

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

To read the status or headers of a call, use `wireRaw` and write its type inline:

```ts
async function createTodo(input: NewTodo): Promise<{ data: Todo; response: Response }> {
  return wireRaw<Todo>("/todos", { method: "POST", body: JSON.stringify(input) });
}
```

### 3. Return the payload from `transformResponse`

Do this step first. The old return value still compiles, and every payload becomes the envelope
object.

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

A `transformResponse` that throws on an unexpected body can keep throwing:

```ts
transformResponse(json) {
  const body = json as { statusCode?: number; data?: unknown };
  if (body.statusCode === undefined) {
    throw new ApiError("Unexpected response shape", "INVALID_ENVELOPE", 520);
  }
  return body.data;
}
```

### 4. Handle `undefined` from bodiless responses

A `204`, `205` or `HEAD` response resolves `undefined`, so a truthiness check on the result fails.

```diff
- return wireApi<void>(`/todos/${id}`, { method: "DELETE" });
+ return wireData<void>(`/todos/${id}`, { method: "DELETE" });
```

```diff
  const result = await deleteTodoApi(id);
- if (result) showSuccess();
+ showSuccess();
```

`transformResponse` is skipped for these responses.

### 5. Pass `variables` first to `executeMutationFn`

`TS2345: Argument of type '{ onSuccess: ... }' is not assignable to parameter of type 'void'.`

```diff
  const { executeMutationFn: deleteTodo } = useMutationFn(() => deleteTodoApi(todoId));

- deleteTodo({ onSuccess: () => router.back() });
+ deleteTodo(undefined, { onSuccess: () => router.back() });
```

With no callbacks, call `deleteTodo()`. A mutation with variables keeps its call:
`toggleTodo("todo-123", { onSuccess })`.

### 6. Read the payload from `executeMutationFn`

`TS2339: Property 'data' does not exist on type '<your payload type>'.`

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

`null` means the mutation failed. To read the status, call `wireRaw` in `mutationFn`:

```ts
const { executeMutationFn: createTodo } = useMutationFn((input: NewTodo) =>
  wireRaw<Todo>("/todos", { method: "POST", body: JSON.stringify(input) }),
);

const result = await createTodo(input);
result?.response.status; // 201
```

### 7. Update code that calls `getWireConfig().transformResponse`

Skip this step unless your code calls `transformResponse` outside fetchwire.

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

If that code also builds the request, send `Content-Type: application/json` for a string body only,
and `Accept: application/json, */*;q=0.8` on every request.

### 8. Delete `EMPTY_DATA`

```diff
  const ERROR_MESSAGES = {
    NETWORK_ERROR: "...",
    EMPTY_BODY: "...",
    INVALID_JSON: "...",
-   EMPTY_DATA: "...",
  };
```

`NETWORK_ERROR`, `EMPTY_BODY`, `INVALID_JSON` and `HTTP_ERROR` stay.

## 5.1.x → 5.2.0

1. If your API wraps responses in an envelope, add a `transformResponse`. fetchwire stops reading
   `data`, `status`, `statusCode` and `message` off the body:

   ```ts
   initWire({
     transformResponse: (json) => {
       const body = json as { statusCode?: number; message?: string; data?: unknown };
       return { data: body.data, status: body.statusCode, message: body.message };
     },
   });
   ```

2. If your error body uses `statusCode` for a code of your own, read it in `transformError`.
   `ApiError.statusCode` is the HTTP status.
3. If your `transformError` expects `message`, `error` or `statusCode` in the body, handle their
   absence: it receives the body as sent.
4. If your API sends `message` or `error` as an array or an object, add a `transformError`. Without
   one, such a `message` becomes `HTTP <status>`, and such an `error` becomes `"HTTP_ERROR"`.
5. If `transformResponse` checks for an empty body, delete the check. An empty body throws `ApiError`
   with `errorCode: "EMPTY_BODY"`.
6. If you match `NETWORK_ERROR` to catch a body that is not JSON, match `INVALID_JSON`.
7. If you cast errors from interceptors or `transformResponse` to `ApiError`, narrow them with
   `instanceof`. They propagate as thrown.
8. Make `onSuccess` and `onError` safe to run after the component unmounts, for example by calling a
   router or a store. They now run in that case.

## 5.0.x → 5.1.0

Rename the method:

```diff
- fetchClient.setFetchKeyToTags(fetchKey, promise, tags);
+ fetchClient.cachePromiseAndRegisterTags(fetchKey, promise, tags);
```

## 4.x → 5.0.0

1. Move `onUnauthorized` and `onForbidden` into `onError`, and delete `unauthorizedStatusCodes` and
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

2. If you target an engine without ES2022 support, transpile `node_modules/fetchwire`.

## 3.3.1 → 4.0.0

1. Swap the arguments of `prefetch` and move the key into `options`:

   ```diff
   - prefetch("todos", () => getTodosApi());
   + prefetch(() => getTodosApi(), { fetchKey: "todos" });
   ```

2. Replace `promiseCacheStore` with `fetchClient`:

   ```diff
   - import { promiseCacheStore } from "fetchwire";
   - promiseCacheStore.clear();
   + import { fetchClient } from "fetchwire";
   + fetchClient.clear();
   ```

## 3.3.0 → 3.3.1

Move `fetchKey` into `options`, and add it to every `useFetchFn` call:

```diff
- useFetch(getTodosApi, "todos", { tags: ["todos"] });
+ useFetch(getTodosApi, { fetchKey: "todos", tags: ["todos"] });

- useFetchFn(getTodosApi);
+ useFetchFn(getTodosApi, { fetchKey: "todos" });
```

Pick a key that identifies the resource uniquely.

## 3.2.x → 3.3.0

1. Add `url` as the first parameter of `onRequest`:

   ```diff
   - onRequest: (requestInit) => {
   + onRequest: (url, requestInit) => {
       requestInit.headers.set("x-request-id", crypto.randomUUID());
     },
   ```

2. `onError` also runs for `401` and `403`, after `onUnauthorized` or `onForbidden`. If your
   `onError` handles other errors only, skip those two statuses:

   ```ts
   onError: (error) => {
     if (error.statusCode === 401 || error.statusCode === 403) return;
     showToast(error.message);
   };
   ```

## 3.1.0 → 3.2.0

`executeFetchFn` and `refreshFetchFn` resolve the data:

```diff
- const response = await executeFetchFn();
- const todos = response?.data;
+ const todos = await executeFetchFn();
```

## 1.x → 2.0.0

Pass the request function to the hook, and call the trigger with no function:

```diff
- const { executeFetchFn } = useFetchFn<Todo[]>({ tags: ["todos"] });
- executeFetchFn(() => getTodosApi());
+ const { executeFetchFn } = useFetchFn(getTodosApi, { tags: ["todos"] });
+ executeFetchFn();
```

```diff
- const { executeMutationFn } = useMutationFn<Todo>({ invalidatesTags: ["todos"] });
- executeMutationFn(() => createTodoApi({ title }), { onSuccess });
+ const { executeMutationFn } = useMutationFn(() => createTodoApi({ title }), {
+   invalidatesTags: ["todos"],
+ });
+ executeMutationFn({ onSuccess });
```

The data type is inferred from the function's return type.
