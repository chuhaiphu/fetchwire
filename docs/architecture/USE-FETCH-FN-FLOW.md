# useFetchFn — Imperative Data Flow

The **imperative** fetch hook: it exposes plain state — `data`, `isLoading`, `isRefreshing`, `error` — and a
function for us to call ourself.

> **The one idea that defines this flow.** `useFetchFn` does **not** suspend and does **not** throw to an
> `ErrorBoundary`. It models the promise's whole lifecycle — **pending → fulfilled | rejected** — as three
> shapes of local `useState` (`isLoading`/`isRefreshing`, `data`, `error`). Use this when we want manual
> control instead of Suspense.

> Everything below is two readings of a _single_ `if/else` inside
> `execute` ([use-fetch-fn.ts](../../src/hook/use-fetch-fn.ts)):
>
> ```
> if (!isRefresh && promiseCacheStore.has(fetchKey))  → Path A: reuse the cached promise
> else                                                → Path B: fire a fresh request
> ```

---

## Where it fits

Read the map as three bands: **PENDING** (flags on), the branch (**A** reuse / **B** fetch), then
**SETTLED** (`fulfilled` / `rejected`). Every path starts and ends in the same two bands — that symmetry is
what the sequence diagrams below preserve.

```mermaid
flowchart LR
    Cmp["Consumer Component"] -->|"useEffect / handler"| EXE["executeFetchFn()<br/>isRefresh: false"]
    Cmp -->|"event-handling-to-refresh / tag event"| REF["refreshFetchFn()<br/>isRefresh: true"]

    EXE --> PE["PENDING<br/>setState(isLoading:true, error:null)"]
    REF --> PR["PENDING<br/>setState(isRefreshing:true, error:null)"]

    PE --> BR{"!isRefresh &&<br/>has(fetchKey)?"}
    PR --> FRESH
    BR -->|"yes · Path A"| CACHED["await cached promise<br/>(reuse prefetch)"]
    BR -->|"no · Path B"| FRESH["fn() → cache promise<br/>register tags → fetchKey<br/>await"]

    CACHED --> S{"SETTLED"}
    FRESH --> S
    S -->|"fulfilled"| OKS["setState { data, isLoading:false,<br/>isRefreshing:false, error:null }"]
    S -->|"rejected"| ERRS["setState { data:null, error: ApiError }"]
```

Unlike `useFetch`, there is **no** `<Suspense>`/`<ErrorBoundary>` in the picture — every branch ends in
state the consumer reads.

---

## Path A — Cache hit (reuse a prefetched promise)

Reachable **only** from `executeFetchFn` (never a refresh), and only when a
[`prefetch`](./PREFETCH-FLOW.md) already warmed the same `fetchKey`.

```mermaid
sequenceDiagram
    autonumber
    participant Cmp as Consumer Component
    participant H as useFetchFn
    participant FC as fetchClient
    participant Cache as promiseCacheStore

    Note over Cmp,H: on mount a useEffect calls executeFetchFn()<br/>useEffect(() => { executeFetchFn() }, [executeFetchFn])
    Cmp->>H: executeFetchFn()  ⇒ execute({ isRefresh: false })

    rect rgba(128,128,128,0.12)
        Note over H: PENDING
        H->>H: setState(isLoading: true, error: null)
        H->>H: fn = fetchFnRef.current  (latest fetchFn)
    end

    Note over H,Cache: cache HIT — !isRefresh && has(fetchKey)
    H->>FC: registerTags(fetchKey, tags)
    FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)
    H->>Cache: get(fetchKey)
    Cache-->>H: cached promise (warmed by prefetch)
    H->>H: data = await cached promise

    rect rgba(128,128,128,0.12)
        Note over H: SETTLED
        alt fulfilled
            H->>H: if mounted → setState(data, isLoading:false, isRefreshing:false, error:null)
            H-->>Cmp: re-render with data
        else rejected (ApiError)
            H->>H: if mounted → setState(data:null, error: apiError)
            H-->>Cmp: re-render with error
        end
    end
```

> **Why cache-hit only when `!isRefresh`.** A
> `refreshFetchFn` deliberately **bypasses** the cache (Path B) to force fresh data.

---

## Path B — Cache miss (fresh network request)

Reachable from `executeFetchFn` when **no** prefetch warmed the key (the `fetchKey` is not in the cache
store), and from **every** `refreshFetchFn`. Here the hook fires the request itself and caches the
in-flight promise.

```mermaid
sequenceDiagram
    autonumber
    participant Cmp as Consumer Component
    participant H as useFetchFn
    participant Wire as wireApi
    participant API as Server
    participant FC as fetchClient
    participant Cache as promiseCacheStore

    Cmp->>H: executeFetchFn()  ⇒ execute({ isRefresh: false })

    rect rgba(128,128,128,0.12)
        Note over H: PENDING
        H->>H: setState(isLoading: true, error: null)
        H->>H: fn = fetchFnRef.current  (latest fetchFn)
    end

    Note over H,API: cache MISS — fire a fresh request
    H->>Wire: fn()
    Wire->>API: request
    H->>H: rawPromise = fn().then(extractHttpResponseData)
    H->>FC: cachePromiseAndRegisterTags(fetchKey, rawPromise, tags)
    FC->>Cache: set(fetchKey, rawPromise)
    FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)
    H->>H: data = await rawPromise

    rect rgba(128,128,128,0.12)
        Note over H: SETTLED
        alt fulfilled
            API-->>H: payload
            H->>H: if mounted → setState(data, isLoading:false, isRefreshing:false, error:null)
            H-->>Cmp: re-render with data
        else rejected (ApiError)
            API-->>H: ApiError (non-OK) / network error
            H->>H: if mounted → setState(data:null, error: apiError)
            H-->>Cmp: re-render with error
        end
    end
```

> **Why need the `isMounted` ref guard.** `execute` is async; the component may unmount mid-flight (navigation).
> The guard prevents a `setState` on an unmounted component — the result is simply dropped.

---

## Refresh — Path B, triggered by a tag or a gesture

A refresh is just **Path B with `isRefresh: true`**: it always skips the cache and always hits the network.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant EM as eventEmitter
    participant Cmp as Consumer Component
    participant H as useFetchFn
    participant Wire as wireApi
    participant API as Server
    participant FC as fetchClient
    participant Cache as promiseCacheStore

    Note over Cmp,H: The mounted component holds useFetchFn instance.<br/>On mount it subscribed each tag →<br/>eventEmitter.addListener(tag, () => refreshFetchFn())

    alt tag-driven — a mutation invalidated a subscribed tag
        EM->>H: emit(tag) fires the listener → refreshFetchFn()
        Note over EM,H: reaches the hook instance directly
    else manual
        User->>Cmp: event-handling-to-refresh
        Cmp->>H: refreshFetchFn()
    end

    H->>H: execute({ isRefresh: true })

    rect rgba(128,128,128,0.12)
        Note over H: PENDING
        H->>H: setState(isRefreshing: true, error: null)
    end

    Note over H,API: isRefresh → skip cache reuse — fetch fresh, then overwrite the cache
    H->>Wire: fn()
    Wire->>API: request
    H->>H: rawPromise = fn().then(extractHttpResponseData)
    H->>FC: cachePromiseAndRegisterTags(fetchKey, rawPromise, tags)
    FC->>Cache: set(fetchKey, rawPromise)
    FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)
    H->>H: data = await rawPromise

    rect rgba(128,128,128,0.12)
        Note over H: SETTLED
        alt fulfilled
            API-->>H: payload
            H->>H: if mounted → setState(data, isRefreshing:false, error:null)
            H-->>Cmp: re-render with fresh data
        else rejected (ApiError)
            API-->>H: ApiError
            H->>H: if mounted → setState(data:null, error: apiError)
            H-->>Cmp: re-render with error
        end
    end
```

> **Why refresh writes `isRefreshing`, not `isLoading`.** The two flags let the consumer distinguish the
> _first_ load (skeleton) from a _background_ refresh (keep old UI, show a spinner). `isLoading` is set
> only when `isRefresh` is false.

---

## Notes

- **State, not boundaries.** `useFetchFn` is the imperative counterpart to `useFetch`. Errors land in
  `error` for the consumer to render inline; nothing is thrown to an `ErrorBoundary` and nothing suspends.
  Choose it when we need a retry button, conditional/lazy fetching, or an error message beside the data
  rather than a boundary fallback. → [USE-FETCH-FLOW](./USE-FETCH-FLOW.md) for the Suspense variant.
- **Must call `executeFetchFn` ourself.** Nothing fetches on mount automatically — the consumer triggers
  it (typically `useEffect(() => { executeFetchFn() }, [executeFetchFn])`). Because `executeFetchFn` is a
  stable reference, that effect runs once and does not loop.
- **`reset()`** returns state to the idle shape (`data:null, isLoading:false, isRefreshing:false,
error:null`) without touching the cache.
- **Tags register should match the prefetch's tags.** `prefetch` and the reader that consumes the same `fetchKey`
  should declare the **same** `tags`. Tag associations _accumulate as a union_ (not overriden), so
  differing tags make the key just becomes invalidatable by _both_ sets, which only ever
  causes an extra (safe) refetch, never stale data. Still, we should keep them
  identical so "what invalidates this key" has one obvious answer.

---

**What invalidates a tag:** [USE-MUTATION-FN-FLOW](./USE-MUTATION-FN-FLOW.md).
**Warming the cache before mount:** [PREFETCH-FLOW](./PREFETCH-FLOW.md).
