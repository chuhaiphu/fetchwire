# useFetchFn — Imperative Data Flow

The **imperative** fetch hook: it exposes plain state — `data`, `isLoading`, `isRefreshing`, `error` — and a
function for us to call ourselves.

> **The one idea that defines this flow.** `useFetchFn` does **not** suspend and does **not** throw to an
> `ErrorBoundary`. It models the promise's whole lifecycle — **pending → fulfilled | rejected** — as three
> shapes of local `useState` (`isLoading`/`isRefreshing`, `data`, `error`). Use this when we want manual
> control instead of Suspense.

> Every path below ends in _one_ function, `handlePromise(promise, { isRefresh })`
> ([use-fetch-fn.ts](../../src/react/use-fetch-fn.ts)): it sets the flags, awaits the promise, and writes
> `data` or `error`. The three entry points differ only in where the promise comes from:
>
> | Entry | The promise | `isRefresh` (which flag) |
> | --- | --- | --- |
> | `executeFetchFn()` | the cached promise of `fetchKey`, or `fetchFn()` cached when none is | `false` → `isLoading` |
> | `refreshFetchFn()` | `fetchFn()`, cached, then the fetchKey event emitted | `true` → `isRefreshing` |
> | the fetchKey event, any reader refreshed | the promise that refresh cached | `true` → `isRefreshing` |

---

## Where it fits

Read the map as three bands: the entry point picks a **promise**, then **PENDING** (flags on, a serial
number claimed), then **SETTLED** (`fulfilled` / `rejected`). Every path ends in the same two bands — that
symmetry is what the sequence diagrams below preserve.

```mermaid
flowchart LR
    Cmp["Consumer Component"] -->|"useEffect / handler"| EXE{"executeFetchFn()<br/>has(fetchKey)?"}
    Cmp -->|"pull-to-refresh / tag event"| REF["refreshFetchFn()<br/>fetchFn() → cache promise<br/>register tags → fetchKey<br/>emit fetchKey event"]
    EV["fetchKey event<br/>(any reader refreshed)"] --> FOL["cache.get(fetchKey)"]

    EXE -->|"yes, cache hit"| CACHED["reuse cached promise<br/>register tags → fetchKey"]
    EXE -->|"no, cache miss"| FRESH["fetchFn() → cache promise<br/>register tags → fetchKey"]

    CACHED --> PE["handlePromise(promise, { isRefresh: false })<br/>PENDING: setState(isLoading:true, error:null)"]
    FRESH --> PE
    REF --> PR["handlePromise(promise, { isRefresh: true })<br/>PENDING: setState(isRefreshing:true, error:null)"]
    FOL --> PR

    PE --> S{"SETTLED"}
    PR --> S
    S -->|"fulfilled"| OKS["setState { data, isLoading:false,<br/>isRefreshing:false, error:null }"]
    S -->|"rejected"| ERRS["remove(fetchKey)<br/>setState { data:null, error: what fetchFn threw }"]
```

Unlike `useFetch`, there is **no** `<Suspense>`/`<ErrorBoundary>` in the picture — every branch ends in
state the consumer reads.

---

## executeFetchFn — Cache hit

Reached when the `fetchKey` is already in the Promise cache. That warmth does not have to come from
[`prefetch`](./PREFETCH-FLOW.md): a previous `executeFetchFn`, a `refreshFetchFn`, or a mounted
[`useFetch`](./USE-FETCH-FLOW.md) on the same key all write the same store.

The practical consequence: **a second `executeFetchFn()` returns the first call's data without touching the
network.** When we need fresh data, call `refreshFetchFn()`.

```mermaid
sequenceDiagram
    autonumber
    participant Cmp as Consumer Component
    participant H as useFetchFn
    participant FC as fetchClient
    participant Cache as promiseCacheStore

    Note over Cmp,H: nothing fetches on mount — the consumer triggers it<br/>useEffect(() => { executeFetchFn() }, [executeFetchFn])
    Cmp->>H: executeFetchFn()

    H->>Cache: has(fetchKey)
    Cache-->>H: true → cache HIT

    Note over H,Cache: The consumer's `fetchFn` is NEVER invoked on this path.<br/>No request leaves the app.
    H->>FC: registerTags(fetchKey, JSON.parse(tagsKey))
    FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)
    Note over FC,Cache: registerTags only. This path never calls cachePromiseAndRegisterTags
    H->>Cache: get(fetchKey)
    Cache-->>H: the stored promise — pending, fulfilled, OR already rejected
    H->>H: handlePromise(that promise, { isRefresh: false })

    rect rgba(128,128,128,0.12)
        Note over Cmp,Cache: PENDING — flags on, error cleared, and this run claims a serial number
        H->>H: requestId = ++latestRequestIdRef.current
        H->>H: setState(isLoading: true, isRefreshing: false, error: null)
    end

    H->>H: data = await that promise

    rect rgba(128,128,128,0.12)
        Note over Cmp,Cache: SETTLED — a retired run writes nothing: it neither moves the data nor clears the flags
        alt fulfilled
            H->>H: setState(data, isLoading: false, isRefreshing: false, error: null)
            H-->>Cmp: re-render — { data, isLoading: false, isRefreshing: false, error: null }
        else rejected
            H->>FC: remove(fetchKey) — do not leave a failed promise in the cache
            H->>H: setState(data: null, isLoading: false, isRefreshing: false, error: apiError)
            H-->>Cmp: re-render — { data: null, isLoading: false, isRefreshing: false, error: the rejection value }
        end
        Note over H,FC: every step in this band is inside `if (requestId === latestRequestIdRef.current)`
    end
```

---

## executeFetchFn — Cache miss

The default path when nothing warmed the key. The hook fires the request itself and caches the in-flight
promise **before** awaiting it.

```mermaid
sequenceDiagram
    autonumber
    participant Cmp as Consumer Component
    participant H as useFetchFn
    participant Fn as fetch callback (consumer-supplied)
    participant API as Server (via wireData / wireRaw)
    participant FC as fetchClient
    participant Cache as promiseCacheStore

    Cmp->>H: executeFetchFn()

    H->>Cache: has(fetchKey)
    Cache-->>H: false → cache MISS, no one warmed this key

    Note over H,API: `fetchFnRef.current` is the latest fetchFn, read at call time, and invoked exactly ONCE.<br/>Its promise is cached as-is — fetchwire derives nothing from it.
    H->>Fn: fetchFnRef.current()
    Fn->>API: HTTP request
    Fn-->>H: promise A (pending)
    H->>H: newPromise = A — cached exactly as `fetchFn` returned it, no derived promise

    H->>FC: cachePromiseAndRegisterTags(fetchKey, newPromise, JSON.parse(tagsKey))
    FC->>FC: void newPromise.catch(() => {}) — attach a no-op rejection listener<br/>so a promise nobody reads cannot fire unhandledrejection.
    FC->>Cache: set(fetchKey, newPromise)
    FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)
    Note over H,Cache: cached BEFORE the await, so a concurrent read of the same fetchKey<br/>joins this request instead of starting a second one.
    H->>H: handlePromise(newPromise, { isRefresh: false })

    rect rgba(128,128,128,0.12)
        Note over Cmp,Cache: PENDING — flags on, error cleared, and this run claims a serial number
        H->>H: requestId = ++latestRequestIdRef.current
        H->>H: setState(isLoading: true, isRefreshing: false, error: null)
    end

    H->>H: data = await newPromise

    API-->>Fn: response
    Note over Fn,H: A settles → the await resumes

    rect rgba(128,128,128,0.12)
        Note over Cmp,Cache: SETTLED — a retired run writes nothing: it neither moves the data nor clears the flags
        alt fulfilled
            H->>H: setState(data, isLoading: false, isRefreshing: false, error: null)
            H-->>Cmp: re-render — { data, isLoading: false, isRefreshing: false, error: null }
        else rejected
            H->>FC: remove(fetchKey) — do not leave a failed promise in the cache
            H->>H: setState(data: null, isLoading: false, isRefreshing: false, error: apiError)
            H-->>Cmp: re-render — { data: null, isLoading: false, isRefreshing: false, error: the rejection value }
        end
        Note over H,FC: every step in this band is inside `if (requestId === latestRequestIdRef.current)`
    end
```

---

## Refresh — tag-driven & manual

A refresh never reads the cache. It always issues a request, always overwrites the cache entry, and emits
the fetchKey event, so every mounted `useFetch` and `useFetchFn` on the `fetchKey` shows the new promise.
The event names are explained in [USE-FETCH-FLOW](./USE-FETCH-FLOW.md#refresh--tag-driven--manual).

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Cmp as Consumer Component
    participant EM as eventEmitter
    participant H as useFetchFn
    participant Fn as fetch callback (consumer-supplied)
    participant API as Server (via wireData / wireRaw)
    participant FC as fetchClient
    participant Cache as promiseCacheStore

    Note over Cmp,H: PRECONDITION — this hook is mounted.<br/>The subscription exists from mount, whether or not executeFetchFn was ever called.

    rect rgba(128,128,128,0.12)
        Note over EM,H: TRIGGER A — tag-driven, reaches EVERY hook instance subscribed to that tag
        EM->>H: emit(generateTagEventName(tag)) fires refreshFetchFnCb
        Note over EM,H: refreshFetchFnCb calls refreshFetchFn() only when the fetchKey is not cached.<br/>A cached fetchKey means another reader already refreshed it on this invalidation,<br/>and its fetchKey event has already reached this hook.
    end

    rect rgba(128,128,128,0.12)
        Note over User,H: TRIGGER B — manual
        User->>Cmp: pull-to-refresh / retry button
        Cmp->>H: refreshFetchFn()
    end

    Note over H,API: `fetchFnRef.current` is the latest fetchFn, read at call time, and invoked exactly ONCE.<br/>Its promise is cached as-is — fetchwire derives nothing from it.
    H->>Fn: fetchFnRef.current()
    Fn->>API: HTTP request
    Fn-->>H: promise A (pending)
    H->>H: newPromise = A — cached exactly as `fetchFn` returned it, no derived promise

    H->>FC: cachePromiseAndRegisterTags(fetchKey, newPromise, JSON.parse(tagsKey))
    FC->>FC: void newPromise.catch(() => {}) — attach a no-op rejection listener<br/>so a promise nobody reads cannot fire unhandledrejection.
    FC->>Cache: set(fetchKey, newPromise) — replaces whatever was stored
    FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)

    rect rgba(128,128,128,0.12)
        Note over EM,H: ANNOUNCE — this refresh replaced the promise every reader of the fetchKey shows
        H->>EM: emit(generateFetchKeyEventName(fetchKey))
        EM->>H: EVERY mounted useFetchFn on this fetchKey: handlePromise(cache.get(fetchKey), { isRefresh: true })
        Note over EM,H: Each one awaits newPromise as a refresh. A useFetch on the key sets newPromise<br/>as its promise (USE-FETCH-FLOW). This hook is a listener too: that run starts first,<br/>so the handlePromise below is the newer run, and the one that writes state.
    end

    H->>H: handlePromise(newPromise, { isRefresh: true })

    rect rgba(128,128,128,0.12)
        Note over Cmp,Cache: PENDING — isRefreshing instead of isLoading, so the consumer can keep the old UI
        H->>H: requestId = ++latestRequestIdRef.current
        H->>H: setState(isLoading: false, isRefreshing: true, error: null)
    end

    H->>H: data = await newPromise

    API-->>Fn: response
    Note over Fn,H: A settles → the await resumes

    rect rgba(128,128,128,0.12)
        Note over Cmp,Cache: SETTLED — a retired run writes nothing: it neither moves the data nor clears the flags
        alt fulfilled
            H->>H: setState(data, isLoading: false, isRefreshing: false, error: null)
            H-->>Cmp: re-render with fresh data
        else rejected
            H->>FC: remove(fetchKey) — do not leave a failed promise in the cache
            H->>H: setState(data: null, isLoading: false, isRefreshing: false, error: apiError)
            H-->>Cmp: re-render with error
        end
        Note over H,FC: every step in this band is inside `if (requestId === latestRequestIdRef.current)`
    end
```

> **Why refresh writes `isRefreshing`, not `isLoading`.** The two flags let the consumer distinguish the
> _first_ load (skeleton) from a _background_ refresh (keep old UI, show a spinner). `isLoading` is set
> only when `isRefresh` is false.

> **Why only the newest run writes state.** Two `handlePromise` runs can overlap, for example a
> pull-to-refresh that starts while the first load is still in flight, and their responses can arrive in
> either order. Each run takes a number when it starts (`++latestRequestIdRef.current`) and writes state
> only if no later run has started since. So the hook shows the response of the request started last,
> even when an older response arrives after it.

> **Why `tagsKey = JSON.stringify(tags)`.** `options.tags` is a new array on every render. Here the
> serialized string does double duty: it keeps the subscription `useEffect` from re-running each render,
> **and** it is a dependency of the `useCallback`s that memoize `executeFetchFn` and `refreshFetchFn` —
> without a stable primitive, `executeFetchFn` would change identity every render and the consumer's
> `useEffect(() => { executeFetchFn() }, [executeFetchFn])` would loop forever. The array is read back
> with `JSON.parse` inside the callback, so a tag may contain any character.

---

**Suspense-based sibling:** [USE-FETCH-FLOW](./USE-FETCH-FLOW.md).
**What invalidates a tag:** [USE-MUTATION-FN-FLOW](./USE-MUTATION-FN-FLOW.md).
**Warming the cache before mount:** [PREFETCH-FLOW](./PREFETCH-FLOW.md).
