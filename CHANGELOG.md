# Changelog

All notable changes to fetchwire are listed here, newest first. Upgrade steps are in
[MIGRATION.md](./MIGRATION.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Breaking changes
start with **Breaking:**, as in [Common Changelog](https://common-changelog.org/). Versions follow
[Semantic Versioning](https://semver.org/) from 6.0.0 on; some earlier minor and patch releases
contain breaking changes. Dates are npm publish dates in UTC.

## [8.0.1] - 2026-10-27

### Changed

- A `useFetchFn` `fetchFn` that throws before it returns a Promise throws out of `executeFetchFn()`
  and `refreshFetchFn()`, as it does in `useFetch` and `prefetch`. A rejected Promise still lands
  in `error`.

### Fixed

- A refresh updates every mounted `useFetch` and `useFetchFn` with the same `fetchKey`, not only the
  hook that refreshed.
- An invalidation sends one request per `fetchKey`, whatever the number of readers and tags.

## [8.0.0] - 2026-10-24

### Changed

- **Breaking:** Ship ES modules only. A process now holds one cache, one configuration and one
  `ApiError` class. `require("fetchwire")` needs Node.js 20.19+ or 22.12+.
- **Breaking:** Move `prefetch`, `fetchClient` and `FetchOptions` from `fetchwire/react` to
  `fetchwire`.
- **Breaking:** Require TypeScript 5.0+ for the type declarations.
- Build with `tsc`, one output file per source file. tsup is no longer maintained.

### Removed

- **Breaking:** Remove the `require` export condition and the `main`, `module` and `types` fields.
- **Breaking:** Remove the `fetchwire/package.json` export.
- Remove source maps.

## [7.0.0] - 2026-09-12

### Added

- Add `sideEffects: false`, so bundlers drop unused modules.

### Changed

- **Breaking:** Split the package into two entry points. `fetchwire` holds `initWire`,
  `updateWireConfig`, `getWireConfig`, `wireData`, `wireRaw` and `ApiError`, and imports no React.
  `fetchwire/react` holds `useFetch`, `useFetchFn`, `useMutationFn`, `prefetch` and `fetchClient`.
  `react` becomes an optional peer dependency.
- **Breaking:** `ApiError` holds `code`, `method`, `url`, `response` and `data`, where `data` is the
  parsed error body as the server sent it. Its constructor takes one object.
- **Breaking:** Split `errorCode` in two: `code` is `"HTTP_ERROR"`, `"NETWORK_ERROR"` or
  `"PARSE_ERROR"`, and your API's own code is on `data`.
- **Breaking:** Rename `statusCode` to `status`, read from `response.status`. A `NETWORK_ERROR` has
  `status: undefined`; it had `520`.
- **Breaking:** Merge `EMPTY_BODY` and `INVALID_JSON` into `PARSE_ERROR`.
- **Breaking:** Build `message` from the request, e.g. `HTTP_ERROR [PUT] https://api.example.com/x`.
  The server's text is on `data`.
- **Breaking:** `useFetchFn` and `useMutationFn` report the value that was thrown, typed by a new
  `TError` parameter that defaults to `ApiError`.
- **Breaking:** Call `onError` for every `ApiError`, `NETWORK_ERROR` included.
- Serialize tag arrays with `JSON.stringify`, so a tag may contain a comma.
- Keep a non-JSON error body as text on `data`.

### Removed

- **Breaking:** Remove `transformError`. Read the error body from `error.data`.

## [6.0.1] - 2026-08-28

### Changed

- `refreshFetch` keeps one identity across renders, so tag listeners stay registered between
  renders.

### Fixed

- Fix `useFetch` showing the previous key's data after `fetchKey` changes. Changing `fetchKey` now
  suspends; change it inside `startTransition` to keep the current data on screen.

## [6.0.0] - 2026-07-29

### Added

- Add `wireRaw<T>(endpoint, options?)`, which resolves `{ data: T; response: Response }`.

### Changed

- **Breaking:** Rename `wireApi` to `wireData`. It resolves the payload `T`.
- **Breaking:** `transformResponse` takes the parsed body and returns the payload:
  `(json: unknown) => unknown`. It is skipped when there is no body.
- **Breaking:** `204`, `205` and `HEAD` responses resolve `undefined`.
- **Breaking:** `executeMutationFn(variables, options?)` always takes `variables` first.
- **Breaking:** `executeMutationFn` resolves the payload, the same value `onSuccess` receives. `null`
  still means the mutation failed.
- **Breaking:** Narrow `useFetch`'s `data` from `T | null` to `T`.
- Send `Accept: application/json, */*;q=0.8` on every request.
- `initWire` and `updateWireConfig` store `headers` as a `Headers` instance.
- Lower the build target from `es2022` to `es2020`.

### Removed

- **Breaking:** Remove `HttpResponse<T>`.
- **Breaking:** Remove the `EMPTY_DATA` error code.

### Fixed

- Fix a `HEAD` request throwing `EMPTY_BODY`.
- Fix per-request headers being dropped when given as `Headers` or as an array of pairs. Header
  precedence stays: global config, then `Authorization`, then per-request.
- Fix `Content-Type: application/json` being sent with every body, which broke `FormData`,
  `URLSearchParams` and `Blob` requests. It is now set for a string body only.
- Fix `prefetch<T>` resolving `Promise<unknown> | undefined` whatever `fetchFn` returned.

## [5.3.1] - 2026-07-28

README wording only; the package code is unchanged.

## [5.3.0] - 2026-07-28

### Changed

- `executeMutationFn` keeps one identity across renders.
- Await `onSuccess` and `onError`: `await executeMutationFn(...)` settles after the callback ends.
- `fetchClient.invalidateTags` skips empty tag strings.

### Fixed

- Fix `useMutationFn` reporting a committed write as failed when `onSuccess`, or a reader refreshed
  by `invalidateTags`, threw.
- Fix `useFetchFn` caching a rejected Promise, which made every later `executeFetchFn()` fail
  without a request.
- Fix overlapping `useMutationFn` runs: only the newest run writes state.
- Fix `reset()` in `useFetchFn` and `useMutationFn` being undone by a run still in flight.
- Fix `prefetch` dropping its `tags` when the key was already cached.
- Fix `useFetchFn`'s `error` and `useMutationFn`'s `onError` receiving values other than an
  `ApiError`. Such values are converted to an `ApiError`.

## [5.2.0] - 2026-07-27

### Changed

- **Breaking:** Without `transformResponse`, the parsed body is the data and `status` comes from the
  response. fetchwire stops reading `data`, `status`, `statusCode` and `message` off the body.
- **Breaking:** `ApiError.statusCode` is always `response.status`.
- **Breaking:** `transformError` receives the parsed error body as sent. Without `transformError`,
  a non-string `message` becomes `HTTP <status>`, and a non-string `error` becomes `"HTTP_ERROR"`.

### Fixed

- Fix an empty body resolving `{}`. `204` and `205` resolve `{ data: undefined, status, message: "" }`;
  an empty body on any other status throws `EMPTY_BODY`.
- Fix a non-JSON body being reported as `NETWORK_ERROR`. It throws `INVALID_JSON`.
- Fix every bodiless error response getting the message `Unknown server error`.
- Fix errors thrown by `onRequest`, `onResponse` or `transformResponse` being reported as
  `NETWORK_ERROR`. They propagate as thrown.
- Fix `useFetchFn` letting a slow response overwrite a newer one.
- Fix `useMutationFn` skipping `invalidateTags`, `onSuccess` and `onError` when the component
  unmounted mid-request.

## [5.1.0] - 2026-07-07

### Added

- Add `fetchClient.registerTags(fetchKey, tags?)`, which registers tags without caching a Promise.

### Changed

- **Breaking:** Rename `fetchClient.setFetchKeyToTags()` to
  `fetchClient.cachePromiseAndRegisterTags()`.

### Fixed

- Fix `useFetch` and `useFetchFn` dropping their tags when they read a cached Promise, such as one
  from `prefetch`. `invalidatesTags` now refreshes them.
- Fix "Unhandled promise rejection" warnings from cached rejected Promises.

## [5.0.0] - 2026-06-20

### Added

- Add the per-request `skipToken` option (`WireRequestInit`). It skips `getToken` and the
  `Authorization` header.

### Changed

- Raise the build target to `es2022`. Engines without ES2022 support must transpile fetchwire.

### Removed

- **Breaking:** Remove `onUnauthorized` and `onForbidden`. Branch on `error.statusCode` in
  `onError`.
- **Breaking:** Remove `unauthorizedStatusCodes` and `forbiddenStatusCodes`.

## [4.1.0] - 2026-05-30

### Fixed

- Fix `executeMutationFn(variables)` without a second argument calling `mutationFn` with
  `undefined`. The call shape is now read from `mutationFn.length`.

## [4.0.1] - 2026-05-18

### Added

- Add `fetchClient.remove(fetchKey)`, which removes one cached Promise without emitting tag events.
  Call it in an `<ErrorBoundary>` reset handler to retry.

### Fixed

- Fix `useFetch` suspending forever when the request fails. The rejected Promise stays cached, so the
  error reaches the `<ErrorBoundary>`.

## [4.0.0] - 2026-04-24

### Added

- Add `fetchClient` with `clear()`, `invalidateTags(tags)` and
  `setFetchKeyToTags(fetchKey, promise, tags?)`.

### Changed

- **Breaking:** `prefetch(fetchFn, options)` replaces `prefetch(fetchKey, fetchFn)`. `options` is a
  `FetchOptions`.
- `invalidateTags` also deletes the cached Promises of those tags, so a component that mounts later
  fetches fresh data.
- `prefetch` registers `options.tags`.

### Removed

- **Breaking:** Remove the `promiseCacheStore` export. Call `fetchClient.clear()` on logout.

## [3.3.1] - 2026-04-24

### Changed

- **Breaking:** `useFetch(fetch, options)` takes `fetchKey` inside `options`.
- **Breaking:** `useFetchFn(fetchFn, options)` requires `options` and `options.fetchKey`.
- **Breaking:** `FetchOptions.fetchKey` is required.

## [3.3.0] - 2026-04-11

### Added

- Add `transformError` to `WireConfig`, which turns an error body into an `ApiError`.
- Add the `onResponse` interceptor, called after every `fetch()` and before the body is parsed.

### Changed

- **Breaking:** `onRequest` takes `url` first: `(url, options)`.
- **Breaking:** `onError` runs for every non-OK response, after `onUnauthorized` or `onForbidden`.
- Await every interceptor.

## [3.2.0] - 2026-04-09

### Added

- Add `prefetch(fetchKey, fetchFn)`, which starts a request before a component mounts.
- Add the `onRequest` interceptor, called before every `fetch()` with the final `RequestInit`.
- Add `isRefreshing` to `useFetch`. `refreshFetch` runs inside `startTransition`, so the current data
  stays on screen.
- Add `fetchKey` to `FetchOptions`, so `useFetchFn` reuses a prefetched Promise.

### Changed

- **Breaking:** `executeFetchFn` and `refreshFetchFn` resolve the data: `Promise<T | null>`.

## [3.1.0] - 2026-04-07

### Changed

- `useFetch` accepts a function that resolves either `HttpResponse<T>` or `T`.

## [3.0.1] - 2026-04-07

README and JSDoc wording only; the package code is unchanged.

## [3.0.0] - 2026-04-07

### Added

- Add `useFetch(fetch, fetchKey, options?)`, which fetches on mount and suspends while loading. It
  needs a `<Suspense>` and an `<ErrorBoundary>` above it.
- Export `promiseCacheStore`, the cache of in-flight Promises.

## [2.3.1] - 2026-04-06

### Fixed

- Fix global `headers` overriding the `Authorization` header.
- Fix `useFetchFn` replacing `0`, `false` and `""` with `null`.
- Fix `useFetchFn` and `useMutationFn` resubscribing on every render when `tags` is an inline array.

## [2.3.0] - 2026-04-02

### Added

- Add `reset()` to `useFetchFn`, which sets `data`, `isLoading`, `isRefreshing` and `error` back to
  their initial values.

## [2.2.0] - 2026-03-19

### Added

- Add `transformResponse` to `initWire`, which maps your API's body to `HttpResponse`.

## [2.1.1] - 2026-03-14

### Fixed

- Fix `executeFetchFn` calling the `fetchFn` from the first render.

## [2.1.0] - 2026-03-14

### Added

- Add variables to `useMutationFn`. A `mutationFn` with one parameter is called as
  `executeMutationFn(variables, { onSuccess, onError })`.

## [2.0.0] - 2026-03-14

### Changed

- **Breaking:** `useFetchFn(fetchFn, options?)` and `useMutationFn(mutationFn, options?)` take the
  request function, and `executeFetchFn()` and `executeMutationFn()` take none. Types are inferred
  from that function.

## [1.0.1] - 2026-03-14

### Changed

- Publish with npm provenance, and add the `repository` field.

## [1.0.0] - 2026-03-13

### Added

- First release: `initWire`, `updateWireConfig`, `getWireConfig`, `wireApi`, `ApiError`,
  `useFetchFn` and `useMutationFn`, with tag invalidation and the `onUnauthorized`, `onForbidden`
  and `onError` interceptors.

[8.0.1]: https://github.com/chuhaiphu/fetchwire/compare/v8.0.0...v8.0.1
[8.0.0]: https://github.com/chuhaiphu/fetchwire/compare/v7.0.0...v8.0.0
[7.0.0]: https://github.com/chuhaiphu/fetchwire/compare/v6.0.1...v7.0.0
[6.0.1]: https://github.com/chuhaiphu/fetchwire/compare/v6.0.0...v6.0.1
[6.0.0]: https://github.com/chuhaiphu/fetchwire/compare/v5.3.1...v6.0.0
[5.3.1]: https://github.com/chuhaiphu/fetchwire/compare/v5.3.0...v5.3.1
[5.3.0]: https://github.com/chuhaiphu/fetchwire/compare/v5.2.0...v5.3.0
[5.2.0]: https://github.com/chuhaiphu/fetchwire/compare/v5.1.0...v5.2.0
[5.1.0]: https://github.com/chuhaiphu/fetchwire/compare/v5.0.0...v5.1.0
[5.0.0]: https://github.com/chuhaiphu/fetchwire/compare/v4.1.0...v5.0.0
[4.1.0]: https://github.com/chuhaiphu/fetchwire/compare/v4.0.1...v4.1.0
[4.0.1]: https://github.com/chuhaiphu/fetchwire/compare/v4.0.0...v4.0.1
[4.0.0]: https://github.com/chuhaiphu/fetchwire/compare/v3.3.1...v4.0.0
[3.3.1]: https://github.com/chuhaiphu/fetchwire/compare/v3.3.0...v3.3.1
[3.3.0]: https://github.com/chuhaiphu/fetchwire/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/chuhaiphu/fetchwire/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/chuhaiphu/fetchwire/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/chuhaiphu/fetchwire/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/chuhaiphu/fetchwire/compare/v2.3.1...v3.0.0
[2.3.1]: https://github.com/chuhaiphu/fetchwire/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/chuhaiphu/fetchwire/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/chuhaiphu/fetchwire/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/chuhaiphu/fetchwire/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/chuhaiphu/fetchwire/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/chuhaiphu/fetchwire/compare/v1.0.1...v2.0.0
[1.0.1]: https://github.com/chuhaiphu/fetchwire/compare/423ca87...v1.0.1
[1.0.0]: https://github.com/chuhaiphu/fetchwire/commit/423ca87ad13f30e8e932d44c9eaead9126cefe95
