# Changelog

> Upgrade instructions live in [MIGRATION.md](./MIGRATION.md). This file records **what** changed and
> **why**.

## [6.0.0] - 2026-07-29

fetchwire no longer invents a response shape. A request resolves the payload; the transport metadata
stays on the `Response` that carried it.

### Breaking Changes

- **`HttpResponse<T>` removed. `wireApi` split into `wireData` and `wireRaw`.**

  Every response was wrapped in `{ data, message, status }`, even for an API that has no envelope —
  the default path fabricated one, `message: ""` included. That forced every field to be optional,
  which in turn forced every consumer to unwrap and re-check.

  The two entry points now say what they return. `wireData<T>` resolves the payload. `wireRaw<T>`
  resolves `{ data, response }`, where `response` is the `Response` `fetch` returned — nothing is
  copied out of it, so a copy can never drift from what the transport reported.

  This follows the model ky and ofetch use: payload by default, the real response behind a second
  entry point. Two functions rather than one function with a `raw` flag, because a flag produces
  `T | WireRawResult<T>` — an untagged union with no runtime discriminant, which is the exact defect
  this release removes.

- **`transformResponse` returns the payload, not an envelope.**

  `(json: unknown) => HttpResponse<unknown>` → `(json: unknown) => unknown`.

  Handing the transform the job of building the envelope is what made `data` and `status` optional in
  the first place, and it let a transform report a status that disagreed with the HTTP exchange. It
  now takes the parsed body and returns the payload — the signature axios (`transformResponse`) and
  RTK Query (`transformResponse`) both use. The status is no longer the transform's to set.

  It is also no longer called when there is no body to parse.

- **`204`, `205` and `HEAD` resolve `undefined`.**

  They used to resolve `{ data: undefined, status, message: "" }` — an object, therefore always
  truthy. The decision is now made from the status and the method **before** the body is read, so
  "the server sent nothing" and "the body was lost in transport" stay distinguishable. Declare such
  calls as `wireData<void>(...)`.

- **`executeMutationFn(variables, options?)` — fixed positions.**

  The two call shapes used to be told apart at runtime by `mutationFn.length`. That number is wrong
  for a default parameter, a rest parameter, a `.bind()`, or any wrapper — and when it was wrong, the
  variables were silently dropped. `variables` is now always argument 1 and the options always
  argument 2; a mutation taking none leaves `TVariables` at its `void` default, so
  `executeMutationFn()` still type-checks. This matches TanStack Query's `mutate(variables, options)`.

  The two overloads collapse into one signature, and the documented "declare the parameter without a
  default value" constraint is gone.

- **`executeMutationFn` returns the payload.**

  It returned the whole `HttpResponse<T>` while `onSuccess` received `response.data` — two names for
  two different values out of one call. Both now carry whatever `mutationFn` resolved. `null` still
  means the mutation failed.

- **`EMPTY_DATA` removed.**

  `useFetch` threw it when the resolved value was `undefined`. It existed only because
  `HttpResponse.data` was optional; with no envelope there is no "resolved but empty" state.

- **`useFetch`'s `data` narrowed from `T | null` to `T`.**

  The hook suspends until the Promise settles, so there was never a "not yet" state to represent.
  Widening callers (`data?.field`, `data ?? []`) still compile.

### Added

- **`wireRaw<T>(endpoint, options?)`** — resolves `{ data: T; response: Response }`. The way to read
  `status`, `headers` or `redirected` for a single call now that no envelope carries them.

### Fixed

- **A `HEAD` request threw `EMPTY_BODY`.** The body was classified by whether the text was empty, so
  a `HEAD` response — which never carries one (RFC 9110 §9.3.2) — was read as a broken response.

- **Per-request headers were silently dropped unless they were a plain object.** `HeadersInit` is
  `Headers | string[][] | Record<string, string>`, and the merge was an object spread, which handles
  only the third form. A `new Headers({...})` or an array of pairs spread to `{}` and vanished.

  Merging now goes through a single `Headers`-based helper, so all three forms behave identically.
  Precedence is unchanged and explicit: global config → `Authorization` → per-request.

- **`Content-Type: application/json` was attached to every request with a body.** That mislabelled
  `FormData` (destroying the multipart boundary), `URLSearchParams` and `Blob`, and it forced a CORS
  preflight on requests that did not need one. It is now derived from the body: a string body only.

- **`prefetch<T>` lost its type parameter**, resolving `Promise<unknown> | undefined` regardless of
  what `fetchFn` returned.

### Changed

- **`Accept: application/json, */*;q=0.8`** is now sent on every request, including bodyless ones.
  `Accept` describes the response, which is why it is set where `Content-Type` is not — every
  successful body is parsed as JSON. The `*/*;q=0.8` fallback keeps a strict-negotiating server from
  answering `406 Not Acceptable`. axios sends an equivalent header unconditionally.

- **`initWire` and `updateWireConfig` both normalize `headers` to a `Headers` instance**, so
  `getWireConfig().headers` has one type regardless of how it was supplied.

- **`util/helper.ts` split into `util/normalize-to-api-error.ts`.** Internal only; nothing exported
  changed.

### Documentation

- Added [MIGRATION.md](./MIGRATION.md), covering every version with breaking changes. Migration
  instructions were removed from this file.
- Rewrote the README's response section around the payload, and documented behavior that had never
  been written down: header precedence, `Content-Type` derivation, the `Accept` default, and how
  bodiless responses resolve.
- Updated all four architecture flows: removed the dead `EMPTY_DATA` branches and the
  `extractHttpResponseData` step, and corrected `USE-MUTATION-FN-FLOW`, which stated the opposite of
  the new `onSuccess` / return-value behavior.

## [5.3.0] - 2026-07-28

No breaking changes — every call signature is unchanged.

### Fixed

- **`useMutationFn` reported successful writes as failures.**

  The `try` wrapped the whole success path, so a throw after the response arrived was caught as if the
  write itself had failed: the just-set `data` was wiped, `onError` fired **alongside** `onSuccess`, and
  the caller got `null` for a mutation the server had already committed.

  ```ts
  executeMutationFn(payload, {
    onSuccess: (data) => router.push(`/detail/${data.id}`), // throws → onError also fires
  });
  ```

  Two ways it happened: `onSuccess` throwing, and — with no faulty consumer code at all — a reader
  refreshed by `invalidateTags`, since `emit` runs its listeners synchronously and `useFetch`'s
  `refreshFetch` calls the consumer's fetch callback directly.

  A `try` cannot un-`POST` a committed write; it only controls the report. It now ends at the network
  call, and the consequences of success run outside it.

- **`useFetchFn` cached failed requests, so `executeFetchFn` could never recover.**

  A rejected Promise stayed under `fetchKey`, and the cache-hit branch reuses whatever is stored without
  inspecting it — so every later `executeFetchFn()` failed instantly without reaching the network, even
  after connectivity came back. `execute` now removes the key when a run rejects; only the newest run may
  delete.

  `useFetch` deliberately keeps its rejected Promise: deleting it there would make the next render create
  a fresh pending Promise, suspend, reject, delete, and suspend again.

- **`useMutationFn` had no protection against overlapping runs.**

  Two rapid submits let the slower run land last and overwrite the newer result, and whichever finished
  first cleared `isMutating` while another was still in flight — re-enabling a submit button mid-write.
  Runs now claim a serial number and resolve by **recency, not arrival**: only the newest writes state.
  Tag invalidation and the per-call callbacks still run for every run, since they describe the server and
  the caller rather than shared state.

- **`reset()` could be undone by an in-flight request** — `useFetchFn` and `useMutationFn`.

  A run that started before the reset still held the newest serial number, so its response wrote over the
  state just cleared. `reset()` now retires every in-flight run first. It still does not touch the Promise
  cache.

- **`prefetch` dropped its `tags` when the key was already cached.**

  The Promise cache and the tag map are separate stores. On a cache hit `prefetch` returned early, so
  those `tags` never reached `tagToFetchKeysMap` and a later `invalidatesTags` found no key to clear.
  `prefetch` now registers tags on the cache-hit path too — the fix applied to `useFetch` / `useFetchFn`
  in 5.1.0, which did not cover `prefetch`.

- **`onError` could receive something that was not an `ApiError`.**

  `error as ApiError` is erased at compile time and checks nothing. Anything `wireApi` does not wrap — a
  rejected `getToken()`, an `onRequest` / `onResponse` / `transformResponse` interceptor, an uninitialized
  wire, or `mutationFn` throwing before the request is made — arrived with `statusCode` and `errorCode`
  reading `undefined`, while the declared type told consumers not to guard.

  `useFetchFn`'s `error` and `useMutationFn`'s `onError` now normalize the caught value, so the declared
  type is true. An existing `ApiError` passes through untouched.

### Changed

- **`executeMutationFn` keeps a stable identity across renders.** `mutationFn` is read through a ref
  instead of sitting in the `useCallback` deps, so an inline arrow — the documented usage — no longer
  gives the callback a new identity on every render. This matches `useFetchFn`.

- **`onSuccess` / `onError` are awaited.** `await executeMutationFn(...)` now settles only after the
  callback has finished, and an `async` callback that rejects rejects `executeMutationFn` instead of
  escaping as an unhandled rejection. `isMutating` still goes false earlier — it tracks the request, not
  the callback.

- **`fetchClient.invalidateTags` skips empty tag strings**, mirroring `registerTags`. An empty tag can
  never map to a `fetchKey` or to a listener.

### Documentation

- Rewrote `USE-MUTATION-FN-FLOW` around the boundary of the `try`, with the success and failure paths as
  separate flows.
- Aligned all four architecture flows on one diagram vocabulary: shared participant names (the consumer's
  callback and the server are now distinct), shared band labels, and shared section headings. Replaced the
  invented `Path A` / `Path B` labels with the function names they describe.
- Corrected "a refresh bypasses the cache" throughout — a refresh **skips the cache read and overwrites
  the entry**.
- Documented behavior that was previously undocumented: a repeat `executeFetchFn()` resolves from the
  cache without a request, a tag event refreshes a `useFetchFn` that never fetched, and the argument
  dispatch of `executeMutationFn` relies on `mutationFn.length`.

## [5.2.0] - 2026-07-27

### Breaking Changes

- **Without `transformResponse`, fetchwire no longer guesses at an envelope.**

  The default path read `data`, `status`, `statusCode` and `message` off the parsed body:

  ```ts
  data: jsonResponse.data ?? jsonResponse,
  status: jsonResponse.status ?? jsonResponse.statusCode ?? response.status,
  message: jsonResponse.message ?? "",
  ```

  That assumes those four names carry the meaning they have in one backend convention. For any API
  where they are ordinary domain fields, the result was wrong — silently:

  | Body from the server | Old result |
  | --- | --- |
  | `{"id":"o-1","status":2,"total":500000}` | `status: 2` — an order's state reported as the HTTP status |
  | `{"id":9,"message":"Hello"}` | `message: "Hello"` — a chat message reported as the response message |
  | `{"id":5,"name":"Q3","data":[1,2,3]}` | `data: [1,2,3]` — **`id` and `name` lost** |

  The default path now does the only thing that is true without knowing the API: the body **is** the
  data, and `status` comes from the response. This also restores the documented contract — the
  `transformResponse` docstring already said the default *"wraps the raw JSON as the `data` field"*,
  and `README` already pointed at `transformResponse` for envelope handling.

- **`ApiError.statusCode` no longer comes from the error body.**

  The non-OK branch resolved it as `body.statusCode ?? response.status`, letting a number the
  backend typed into its own payload outrank the status of the actual HTTP exchange. For a NestJS
  backend the two are always equal, so this looked harmless — but an API that uses `statusCode` for
  a domain code broke the documented `onError` pattern silently:

  ```
  HTTP 401,  body {"statusCode":1001,...}   →  old: ApiError.statusCode === 1001
  onError: if (error.statusCode === 401) redirectToLogin()   // never fired
  ```

  `statusCode` is now always `response.status`. It is the one field fetchwire holds first-hand, so
  it is never taken from the body — the same rule that removed the envelope guessing above.

- **`transformError` now receives the parsed body untouched.**

  It previously received a fetchwire-built object with `message` / `error` / `statusCode` filled in,
  which overwrote what the server actually sent. A NestJS validation body (`message: string[]`) or a
  Google-style body (`error: { code, message }`) reached the consumer already flattened, so a
  transform written to read those shapes could not see them.

  With no `transformError` configured, the default `ApiError` now accepts a body value only when it
  is a `string` — `ApiError` extends `Error`, whose `message` must be one. A `string[]` message or an
  object `error` falls back to `HTTP <status>` / `"HTTP_ERROR"` instead of being coerced.

### Fixed

- **An empty response body was silently turned into `{}`.**

  `wireApi` classified the body by whether the text was truthy: `textResponse ? JSON.parse(...) : {}`.
  A response that arrived with **no body at all** therefore became byte-identical to one carrying a
  legitimate empty object, and every layer above lost the ability to tell them apart. Applications
  had to reconstruct the distinction by guessing from a missing envelope field — an inference about
  the transport drawn from application-level data.

  The body is now classified by **status**, which is HTTP's own contract. `204` and `205` are defined
  as bodiless (RFC 9110 §15.3.5, §15.3.6) and resolve to `{ data: undefined, status, message: "" }`.
  Every other status promises a representation, so an empty body there throws
  `ApiError` with `errorCode: "EMPTY_BODY"` and the real status code. Its message carries the
  `content-length` header, which locates the loss without guesswork: `0` means the sender sent
  nothing; absent or non-zero means the body went missing after the headers arrived.

- **A non-JSON body was reported as a network error.**

  `JSON.parse` throwing a `SyntaxError` fell through to the outermost `catch`, which labelled it
  `NETWORK_ERROR` / `520`. A proxy's HTML error page served with a `2xx` was thus indistinguishable
  from a connection failure. It now throws `errorCode: "INVALID_JSON"` carrying the real status.

- **Bodiless error responses all collapsed to one hardcoded message.**

  The non-OK branch called `response.json()`, which throws on an empty body, and fell back to a
  hardcoded `{ message: "Unknown server error", error: "UNKNOWN" }`. Since a bodiless error response
  is normal (a `304`, or a `502` from a proxy), a whole class of errors became textually identical:
  the status code survived through the `?? response.status` fallbacks further down, but the message
  and the error code did not. `transformError` also received a body with no `statusCode` at all, so
  a consumer transform reading that field saw `undefined`. And `json()` consumes the body even when
  it throws, leaving no way to inspect what actually arrived.

  The branch now reads the body as text — which never throws — so a bodiless error keeps its
  identity. See the two entries under **Breaking Changes** for what is built from it.

- **Bugs in consumer code were relabelled as network errors.**

  The `try` block wrapped `onRequest`, `onResponse` and `transformResponse` alongside `fetch()`, so a
  `TypeError` in any of them surfaced as `NETWORK_ERROR` / `520`. Only the `fetch()` call is wrapped
  now — the one failure that genuinely is a transport failure. Errors thrown from your interceptors
  or `transformResponse` therefore propagate as themselves instead of as an `ApiError`.

- **`useFetchFn` let a slow response overwrite a newer one.**

  Overlapping runs — an effect, a tag listener, a pull-to-refresh — wrote one shared state in
  whatever order responses arrived, so the slowest run won by landing last. Each run now claims a
  serial number and writes only if it is still the newest; `isLoading` / `isRefreshing` follow the
  same rule. `execute` still resolves with its own result even when a newer run took over the state.

- **`useMutationFn` dropped `invalidateTags` and both callbacks when the caller unmounted mid-flight.**

  An `isMounted` ref gated everything after `await mutationFn(...)`, so a mutation that succeeded on
  the server could leave every reader on a stale cached promise and surface no error at all. The
  guard is gone: unmounting now affects only `setState`, which React already no-ops. `onSuccess` /
  `onError` therefore run in cases where they were previously skipped.

---

## [5.1.0] - 2026-07-07

### Breaking Changes

- **`fetchClient.setFetchKeyToTags()` renamed to `fetchClient.cachePromiseAndRegisterTags()`.**

  The old name described only the tag mapping, but the method does two things: it caches the
  Promise **and** registers its tags. The new name states both. The signature and behavior are
  unchanged — only the name differs.

  Most applications never call this method directly (they use `clear()` and `remove()`), so this
  affects only code that reached into `fetchClient` for a custom prefetch wrapper.

### Added

- **`fetchClient.registerTags(fetchKey, tags?)`.**

  Registers the tag relationships for a `fetchKey` **without** caching a Promise — the tag-only
  half of `cachePromiseAndRegisterTags`. The hooks use it to subscribe an already-cached key to
  its tags on a cache hit (see _Fixed_ below). Exposed on `fetchClient` for advanced use.

### Fixed

- **Tags were dropped when a fetch resolved from a cached (prefetched) Promise.**

  On a cache hit, `useFetch` / `useFetchFn` reused the cached Promise but never registered their
  `tags`. As a result, a key populated by `prefetch()` — or shared across components — subscribed
  to nothing, so a later `useMutationFn` with a matching `invalidatesTags` did **not** refresh it.

  Both hooks now call `fetchClient.registerTags(fetchKey, tags)` on the cache-hit path, so a
  prefetched fetch subscribes to its tags just like a fresh one.

- **Spurious "Unhandled promise rejection" warnings from cached rejected Promises.**

  A cached Promise is meant to be read by `use(promise)` during render, which surfaces any
  rejection to the nearest `<ErrorBoundary>`. If the reader unmounts before that read runs — e.g.
  it navigates away right after firing the mutation that invalidated the tag — nothing consumes
  the rejection, and the runtime logs it as unhandled.

  Every Promise entering the cache now gets a no-op rejection handler (`promise.catch(() => {})`),
  so the rejection is always considered handled while still propagating to `use()` on the next
  render.

### Documentation

- **Standardized JSDoc across the public API.** Unified the vocabulary so the same concept always
  reads the same way: a callback that returns a Promise is a **"Promise-returning function"**, the
  internal store is **"the Promise cache"**, and the reload behavior is **"refresh"** everywhere.
  Each of `fetch`, `fetchFn`, and `mutationFn` now states what it is and when it runs. Added JSDoc
  for `prefetch`, gave `useMutationFn` the same summary/return shape as the other hooks, and fixed
  a malformed `transformResponse` description. The README's `fetchClient` reference was updated to
  match the renamed and added methods.

---

## [5.0.0] - 2026-06-20

### Breaking Changes

- **Removed the `onUnauthorized` and `onForbidden` interceptors; `onError` is now the single error sink.**

  `WireInterceptors` previously exposed three error handlers that fired in a cascade:
  `onUnauthorized` (for `401`), `onForbidden` (for `403`), and then `onError` for every
  non-OK response. The status-specific handlers added an extra concept (a cascade with a
  configurable status-code map) for something callers can express directly inside `onError`
  by branching on `error.statusCode`. The two handlers and the cascade have been removed.

- **Removed the `unauthorizedStatusCodes` and `forbiddenStatusCodes` config options.**

  These existed only to remap which status codes triggered `onUnauthorized` / `onForbidden`.
  With those handlers gone they no longer have meaning. Decide which codes matter inside
  `onError` by inspecting `error.statusCode`.

### Added

- **Per-request `skipToken` flag on `wireApi` (new `WireRequestInit` type).**

  `wireApi`'s options are now `WireRequestInit` — a superset of `RequestInit` — accepting an
  optional `skipToken`. When `true`, fetchwire does **not** call `getToken` and adds **no**
  `Authorization` header for that request.

  Its main purpose is to let the **token-refresh call go through `wireApi`** instead of a
  hand-rolled `fetch`.

  ```ts
  export async function refreshToken(refreshToken: string) {
    return wireApi<{ accessToken: string }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
      skipToken: true,
    });
  }
  ```

### Changed

- **Build target raised to `es2022`** (tsup). Consumers running on engines without ES2022
  support must transpile `node_modules/fetchwire`; all current React Native / modern browser
  targets are unaffected.

---

## [4.1.0] - 2026-05-19

### Fixed

- **`useMutationFn`: variables silently dropped when `executeOptions` is omitted**

  When a mutation function takes variables (e.g. `(id: string) => deleteApi(id)`),
  calling `executeMutationFn(variables)` without a second argument caused the
  variables to be misidentified as `executeOptions`, so `mutationFn` was called
  with `undefined` instead of the provided value.

  Root cause: the previous implementation used `hasTwoArgs = secondArg !== undefined`
  to decide which overload was in effect.

  ```ts
  // mutationFn called with undefined instead of 'item-id-123'
  const { executeMutationFn: deleteItem } = useMutationFn(
    (id: string) => deleteApi(id),
    { invalidatesTags: ["items"] },
  );
  deleteItem("item-id-123"); // ← looked correct in TypeScript
  // ← runtime: deleteApi(undefined) 🐛
  ```

  Because `mutationFn` failed, `invalidateTags` was never reached and any
  `useFetchFn` / `useFetch` hooks subscribed to the invalidated tags were not
  refreshed.

  Fix: correctly distinguishes the two overloads regardless of how many arguments the
  caller passes:
  - `mutationFn.length === 0` → no-variable mutation → single arg is `executeOptions`
  - `mutationFn.length > 0` → variable mutation → first arg is `variables`, second arg is `executeOptions`

  ```ts
  // All three call forms now work correctly:
  deleteItem("item-id-123"); // ✓ variables only
  deleteItem("item-id-123", { onSuccess: () => {} }); // ✓ variables + options
  logout({ onSuccess: () => {} }); // ✓ no-variable mutation
  ```

---

## [4.0.1] - 2026-05-18

### Fixed

- **`useFetch`: infinite Suspense loop when the API returns an error**

  Previously, when `wireApi` threw (e.g. 404, 500, network failure), the `.catch`
  handler inside `useFetch` deleted the Promise from the cache and re-threw the error.
  React detected the rejection and re-rendered the component from scratch. On that
  re-render the cache was empty, so `useFetch` created a brand-new pending Promise
  and immediately suspended again — triggering another fetch, another failure, and so
  on indefinitely. The `<ErrorBoundary>` was never reached.

  The fix: the `.catch` handler no longer deletes the Promise from the cache. The
  rejected Promise stays in cache, so on the subsequent re-render React calls
  `use(rejectedPromise)`, which throws the error synchronously to the nearest
  `<ErrorBoundary>` instead of suspending.

### Added

- **`fetchClient.remove(fetchKey)` — targeted cache eviction for ErrorBoundary retry**

  A new method on `fetchClient` that removes a single entry from the promise cache
  without emitting tag events. This is the correct way to enable retry from inside
  an `<ErrorBoundary>`: call `fetchClient.remove(fetchKey)` in the boundary's reset
  handler before the component remounts, so the next render finds an empty cache
  entry and starts a fresh fetch rather than re-throwing the cached rejection.

  ```ts
  // In your ErrorBoundary reset handler:
  fetchClient.remove("todos");
  ```

  See the new [Retrying after an API error](README.md#retrying-after-an-api-error)
  section in the README for a full example.

### Documentation

- Updated JSDoc for `useFetch` — `refreshFetch` now documents that it cannot be
  used to retry from an `<ErrorBoundary>` and points to `fetchClient.remove()`.
- Updated README: added `fetchClient.remove()` to the `fetchClient` API reference.
- Updated README: new section **Retrying after an API error** explains the
  `refreshFetch` limitation, the root cause, and the correct `fetchClient.remove()`
  pattern with concrete React and React Native examples.

---

## [4.0.0] - 2026-04-25

### Breaking Changes

- **`prefetch()` signature changed: arguments reversed, second argument is now `FetchOptions`**

  The old signature `prefetch(fetchKey, fetchFn)` is replaced by `prefetch(fetchFn, options)`, matching the same `FetchOptions` object used by `useFetch` and `useFetchFn`. The `fetchKey` is now inside `options`.

  ```ts
  // Before (3.3.1):
  prefetch("todos", () => getTodosApi());

  // After (4.0.0):
  prefetch(() => getTodosApi(), { fetchKey: "todos" });

  // With tags (also supported):
  prefetch(() => getTodosApi(), { fetchKey: "todos", tags: ["todos"] });
  ```

- **`promiseCacheStore` is no longer a public export**

  `promiseCacheStore` is no longer exported from the package. For logout-flow cache clearing, use `fetchClient.clear()` instead.

  ```ts
  // Before (3.3.1):
  import { promiseCacheStore } from "fetchwire";

  function handleLogout() {
    promiseCacheStore.clear();
  }

  // After (4.0.0):
  import { fetchClient } from "fetchwire";

  function handleLogout() {
    fetchClient.clear();
  }
  ```

### Added

- **`fetchClient` singleton — centralized cache and tag invalidation**

  A new `FetchClient` class is exported as `fetchClient`. It centralizes the relationship between fetch keys, tags, and the promise cache. All hooks (`useFetch`, `useFetchFn`) and `prefetch` now go through `fetchClient` internally instead of writing to `promiseCacheStore` directly.

  ```ts
  import { fetchClient } from "fetchwire";
  ```

  **API:**
  - `fetchClient.clear()` — clears all cached promises AND the internal tag-to-fetchKey map. Use this on logout so no stale data is served after the next login.
  - `fetchClient.invalidateTags(tags: string[])` — clears all cached promises whose fetch keys are associated with the given tags, then emits refresh events to all mounted hooks subscribed to those tags. Called internally by `useMutationFn`; exposed for advanced use.
  - `fetchClient.setFetchKeyToTags(fetchKey, promise, tags?)` — stores a promise in the cache and registers its tag associations. Used internally by hooks and `prefetch`; exposed for advanced use.

  **Recommended logout flow:**

  ```ts
  import { fetchClient } from "fetchwire";

  function handleLogout() {
    localStorage.removeItem("access_token");
    fetchClient.clear();
  }
  ```

### Changed

- **Cache invalidation now clears stale entries for unmounted components**

  Previously, when `useMutationFn` invalidated tags, it only emitted events to mounted hooks. If a component was unmounted at the time of invalidation, its stale promise remained in the cache — and when the component remounted, it would receive the old resolved data instead of fetching fresh.

  In 4.0.0, `fetchClient.invalidateTags()` both emits refresh events to mounted hooks AND deletes all cached promises associated with the invalidated tags. Unmounted components will always start a fresh fetch when they next mount after a tag invalidation.

- **`prefetch` now registers tag associations**

  `prefetch(fetchFn, options)` accepts `options.tags`. When provided, `prefetch` registers the tag-to-fetchKey relationship via `fetchClient.setFetchKeyToTags()`, so a tag invalidation triggered by a mutation will correctly clear a key originally populated via `prefetch`.

- **`PromiseCacheMap` renamed to `PromiseCacheStore`**

  The internal promise cache class has been renamed from `PromiseCacheMap` to `PromiseCacheStore` and extracted into its own file (`src/core/promise-cache-store.ts`). It is no longer part of the public export surface; use `fetchClient` for all cache management needs.

### Documentation

- Updated README: `prefetch` usage and API reference reflect the new `prefetch(fetchFn, options)` signature.
- Updated README: added `fetchClient` API reference section.
- Updated README: `promiseCacheStore` section updated to reflect it is no longer a public export.

---

## [3.3.1] - 2026-04-24

### Breaking Changes

- **`useFetch`: `fetchKey` moved into `options` (now required)**

  `fetchKey` is no longer a standalone second argument. It is now a required field inside the `options` object, which is itself the second argument.

  ```ts
  // Before:
  useFetch(getTodosApi, "todos", { tags: ["todos"] });
  useFetch(getTodosApi, "todos");

  // After:
  useFetch(getTodosApi, { fetchKey: "todos", tags: ["todos"] });
  useFetch(getTodosApi, { fetchKey: "todos" });
  ```

- **`useFetchFn`: `options` is now required, `fetchKey` is required**

  `options` was previously optional and `fetchKey` inside it was optional. Both are now required.

  ```ts
  // Before:
  useFetchFn(getTodosApi);
  useFetchFn(getTodosApi, { tags: ["todos"] });
  useFetchFn(getTodosApi, { fetchKey: "todos", tags: ["todos"] });

  // After:
  useFetchFn(getTodosApi, { fetchKey: "todos" });
  useFetchFn(getTodosApi, { fetchKey: "todos", tags: ["todos"] });
  ```

- **`FetchOptions`: `fetchKey` is now required, field order changed**

  The `fetchKey` field is no longer optional (`fetchKey?: string` → `fetchKey: string`).
  It now appears before `tags` in the type definition to reflect that it is required.

  ```ts
  // Before:
  type FetchOptions = {
    tags?: string[];
    fetchKey?: string;
  };

  // After:
  type FetchOptions = {
    fetchKey: string;
    tags?: string[];
  };
  ```

### Documentation

- Updated README: all `useFetch` and `useFetchFn` examples and API reference entries reflect the new unified `options` signature.
- Updated JSDoc for `FetchOptions`, `useFetch`, and `useFetchFn`.

---

## [3.3.0] - 2026-04-11

### Added

- **`transformError` in `WireConfig`**
  A new optional transformer to normalize backend error payloads into `ApiError` before interceptors run and before `wireApi` throws.

  Runtime behavior:
  - If `transformError` returns an `ApiError`, fetchwire now preserves that instance (including stack and custom properties).
  - If `statusCode` is missing from the transformed error, fetchwire falls back to the HTTP `response.status`.

  ```ts
  import { ApiError, initWire } from "fetchwire";

  initWire({
    transformError: (error) => {
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
  });
  ```

- **`onResponse` interceptor in `WireInterceptors`**
  A new interceptor called after every `fetch()`, before the response body is parsed.
  Use it to log response metadata, record timing, or inspect response headers.

  ```ts
  initWire({
    interceptors: {
      onResponse: (url, response) => {
        console.log(`← ${response.status} ${url}`);
      },
    },
  });
  ```

  **Important:** Do not consume the response body inside `onResponse` (i.e. avoid `response.json()` or `response.text()`). Doing so exhausts the body stream, which will cause the subsequent read inside `wireApi` to fail. Use `response.clone()` if you need to read the body.

### Changed

- **`onError` now uses cascade behavior**
  Previously, `onError` was only called when no specific handler (`onUnauthorized` / `onForbidden`) was registered or matched. Now, `onError` fires for **every** non-OK response — after `onUnauthorized` or `onForbidden` when applicable.

  ```ts
  // Before (3.2 — exclusive/waterfall):
  // 401 → onUnauthorized fires, onError does NOT fire
  // 403 → onForbidden fires, onError does NOT fire
  // 5xx → onError fires

  // After (3.3 — cascade):
  // 401 → onUnauthorized fires, then onError fires
  // 403 → onForbidden fires, then onError fires
  // 5xx → onError fires
  ```

  This makes it possible to combine specific handlers (e.g. redirect to login on 401) with a global error sink (e.g. show a toast for all API errors), without duplicating logic.

- **All interceptors are now properly `await`ed**
  Error interceptors (`onUnauthorized`, `onForbidden`, `onError`) were previously called without `await`, meaning async handlers were not awaited before `wireApi` threw the error. All interceptors now consistently `await` their handlers.

### Breaking Changes

- **`onRequest` signature: `url` added as first parameter**

  ```ts
  // Before (3.2):
  onRequest?: (options: RequestInit) => void | Promise<void>;

  // After (3.3):
  onRequest?: (url: string, options: RequestInit) => void | Promise<void>;
  ```

- **`onError` now fires for 401/403 in addition to specific handlers**
  If your existing `onError` was intentionally meant to run only for non-401/403 errors, you must add a status code guard:

  ```ts
  onError: (error) => {
    if (error.statusCode === 401 || error.statusCode === 403) return;
    showToast(error.message);
  };
  ```

### Documentation

- Updated README: added `transformError` to `initWire` example and API reference.
- Updated README: `WireInterceptors` type and `initWire` example now include `onResponse` and updated `onRequest` signature.
- Updated README: `onUnauthorized`, `onForbidden`, and `onError` descriptions reflect cascade behavior.

---

## [3.2.0] - 2026-04-09

### Added

- **`prefetch(fetchKey, fetchFn)` — pre-fetch data before a component mounts**
  Populates `promiseCacheStore` ahead of time so that `useFetch` or `useFetchFn` (with matching `fetchKey`) can resolve instantly without a redundant network request.

  ```ts
  import { prefetch } from "fetchwire";

  // In a route loader, event handler, or anywhere before the component renders
  prefetch("todos", () => getTodosApi());
  ```

  - Accepts `() => Promise<HttpResponse<T> | T>` — same flexibility as `useFetch`.
  - If the key already exists in the cache, the existing Promise is returned (no duplicate fetch).
  - Works with `useFetch` (same `fetchKey`) and `useFetchFn` (via `options.fetchKey`).

- **`onRequest` interceptor in `WireInterceptors`**
  A new interceptor called before every `fetch()` with the final `RequestInit` object. Use it to add dynamic headers, inject tracing IDs, log outgoing requests, or perform any pre-request side effect.

  ```ts
  initWire({
    // ...
    interceptors: {
      onRequest: (requestInit) => {
        requestInit.headers.set("x-request-id", crypto.randomUUID());
      },
    },
  });
  ```

  Internally, `wireApi` now builds a single shared `RequestInit` object before calling `onRequest` and `fetch`, so mutations inside the interceptor are reflected in the actual request.

- **`useFetch` now uses `useTransition` for non-blocking refresh**
  `refreshFetch()` is wrapped in `startTransition`, so React keeps the current UI visible while the new data loads instead of immediately re-suspending and showing the `<Suspense>` fallback.

  The hook now returns an additional `isRefreshing: boolean` field (powered by `useTransition`'s `isPending`) to let you show inline loading indicators without losing the existing content.

  ```tsx
  const { data, refreshFetch, isRefreshing } = useFetch(getTodosApi, "todos");
  ```

- **`fetchKey` option in `FetchOptions`**
  `FetchOptions` now accepts an optional `fetchKey` string. When provided to `useFetchFn`, the hook integrates with `promiseCacheStore`:
  - On the first `executeFetchFn()` call, it checks the cache for a prefetched Promise (set by `prefetch()`), avoiding a duplicate request.
  - On every fetch, the Promise is stored in the cache under `fetchKey`, enabling deduplication if multiple hooks share the same key.

### Breaking Changes

- **`useFetchFn`: `executeFetchFn` and `refreshFetchFn` now return `Promise<T | null>`**

  ```ts
  // Before (3.1)
  const response = await executeFetchFn(); // HttpResponse<Todo[]> | null
  const todos = response?.data;

  // After (3.2.0)
  const todos = await executeFetchFn(); // Todo[] | null
  ```

### Documentation

- Updated README: added `prefetch` usage section and API reference.
- Updated README: `WireInterceptors` type and `initWire` example now include `onRequest`.
- Updated README: `useFetch` return type and description reflect `isRefreshing` and Transition behavior.
- Updated README: `useFetchFn` return types corrected to `Promise<T | null>`, `fetchKey` documented in `FetchOptions`.

---

## [3.1] - 2026-04-07

### Added

- **`useFetch` now accepts both envelope and raw payload responses**
  `useFetch` fetch functions can now return either `Promise<HttpResponse<T>>` or `Promise<T>`.
  This makes the hook easier to use with API helpers that already unwrap data.

- **`extractHttpResponseData` helper**
  Added an internal helper to normalize `useFetch` responses into payload `T`
  from either a full `HttpResponse<T>` shape or a raw payload value.

### Documentation

- Updated JSDoc and README for `useFetch` to reflect support for both response shapes.

---

## [3.0.1] - 2026-04-07

### Documentation

- Documentation-only release.
- Updated README/JSDoc wording only. No runtime behavior changes.

---

## [3.0.0] - 2026-04-07

### Added

- **`useFetch` — Suspense-based data fetching hook**
  A new hook that fetches immediately on mount and suspends the component while data is loading.
  Uses React 19's `use()` API under the hood. The parent component tree must provide a `<Suspense>` boundary for the loading state and an `<ErrorBoundary>` for API errors.

  ```tsx
  // Parent
  <ErrorBoundary fallback={<div>Error</div>}>
    <Suspense fallback={<div>Loading…</div>}>
      <TodoList />
    </Suspense>
  </ErrorBoundary>;

  // TodoList component
  function TodoList() {
    const { data: todos, refreshFetch } = useFetch(getTodosApi, "todos", {
      tags: ["todos"],
    });

    return (
      <ul>
        {todos.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    );
  }
  ```

  - `fetchKey` — a unique string key used to cache the in-flight Promise and prevent the infinite suspend loop that would otherwise occur when React re-renders during suspension.
  - `refreshFetch` — replaces the cached Promise with a fresh one, causing the component to re-suspend and show the nearest `<Suspense>` fallback.
  - Supports tag-based invalidation via `options.tags` — the same mechanism used by `useFetchFn`.

- **`promiseCacheStore` singleton**
  The `Map`-backed promise store used by `useFetch` is now exported as `promiseCacheStore`. Use it for advanced cache management — removing a specific entry to force a cold refetch, or calling `promiseCacheStore.clear()` to discard all cached Promises on logout.

  ```ts
  import { promiseCacheStore } from "fetchwire";

  // Force a cold refetch for a single key
  promiseCacheStore.delete("todos");

  // Discard all entries on logout
  promiseCacheStore.clear();
  ```

### Documentation

- `FetchOptions` JSDoc updated to reflect that the interface is shared by both `useFetch` and `useFetchFn`.

---

## [2.3.1] - 2026-04-06

### Fixed

- **`wireApi`**: `config.headers` now merges before the computed `Authorization` header, so per-token auth is no longer silently overridden by global headers.
- **`useFetchFn`**: use `??` instead of `||` when setting `data`, so falsy values (`0`, `false`, `""`) are no longer replaced with `null`.
- **`useFetchFn` / `useMutationFn`**: tag arrays are now serialized to a string key before being used as `useEffect` / `useCallback` dependencies, preventing unnecessary re-subscriptions and function recreation on every render.

### Documentation

- Tag strings must not contain commas — documented in JSDoc and README.

---

## [2.3.0] - 2026-04-02

### Added

- **`reset()` in `useFetchFn`**
  `useFetchFn` now returns a `reset` function that clears `data`, `isLoading`, `isRefreshing`, and `error` back to their initial values. Useful when navigating away from a screen or unmounting a component that should not retain stale data.

  ```ts
  const { data, executeFetchFn, reset } = useFetchFn(getTodosApi);

  // Clear state when leaving the screen
  reset();
  ```

---

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

  const { executeMutationFn: updateInvoice } = useMutationFn(
    updateInvoiceHelper,
    {
      invalidatesTags: ["organization-invoice-list"],
    },
  );

  function handleUpdate(updatedFields: UpdateInvoiceRequest) {
    updateInvoice(updatedFields, {
      onSuccess: () => refreshInvoice(),
      onError: (e) => Alert.alert("Lỗi", e.message),
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
  return wireApi<Todo[]>("/todos", { method: "GET" });
}

// mutation helper
// The same as createTodoApi
async function createTodoApi(input: { title: string }) {
  return wireApi<Todo>("/todos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
```

- **Old `useFetchFn` (v1.x.x)**

```ts
// component
// Has to explicitly define `Todo` type in every hooks
const { data: todos, executeFetchFn } = useFetchFn<Todo[]>({
  tags: ["todos"],
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
  tags: ["todos"],
});

useEffect(() => {
  executeFetchFn();
}, [executeFetchFn]);
```

- **Old `useMutationFn` (v1.x.x)**

```ts
// component
const { isMutating, executeMutationFn } = useMutationFn<Todo>({
  invalidatesTags: ["todos"],
});

function handleCreate(title: string) {
  executeMutationFn(() => createTodoApi({ title }), {
    onSuccess: () => {
      console.log("Todo created");
    },
    onError: (error) => {
      console.error("Create todo failed", error);
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
    invalidatesTags: ["todos"],
  },
);

function handleCreate(title: string) {
  executeMutationFn({
    onSuccess: () => {
      console.log("Todo created");
    },
    onError: (error) => {
      console.error("Create todo failed", error);
    },
  });
}
```
