# prefetch — Cache-Warming Flow

The **eager** primitive: start a request **before** the component that needs it renders, store the
in-flight promise under a `fetchKey`, and let the later [`useFetch`](./USE-FETCH-FLOW.md) /
[`useFetchFn`](./USE-FETCH-FN-FLOW.md) pick it up instead of firing its own request.

> **The one idea that defines this flow.** `prefetch` is not a hook and holds no state. It just an event handler function that puts a
> promise into the shared `promiseCacheStore` under a `fetchKey`.

---

## Where it fits

```mermaid
flowchart LR
    User["User taps a row"] --> H["handler: await prefetch(fn, { fetchKey })"]
    H --> HIT{"cache has(fetchKey)?"}
    HIT -->|"yes"| RET["return cached promise (dedupe)"]
    HIT -->|"no"| RUN["fn() → store promise under fetchKey"]
    RUN --> AWAIT["await → resolves in background"]
    RET --> NAV["router.push(detail)"]
    AWAIT --> NAV
    NAV --> MOUNT["detail mounts → useFetch(fetchKey)"]
    MOUNT --> REUSE["cache hit → no new request"]
```

The **same `fetchKey`** is the contract: the value passed to `prefetch` must match the one the
destination reader uses, or the reader will fetch again on its own.

---

## The flow — warm, navigate, hand off

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant PF as prefetch()
    participant Wire as wireApi
    participant API as Server
    participant FC as fetchClient
    participant Cache as promiseCacheStore

    User->>PF: prefetch(fetchFn, { fetchKey, tags })

    alt cache HIT — has(fetchKey)
        PF->>Cache: get(fetchKey)
        Cache-->>PF: existing promise
        PF-->>User: return cached promise (no new request)
    else cache MISS — cold key
        PF->>Wire: fetchFn()
        Wire->>API: request (starts in background)
        PF->>PF: promise = fetchFn().then(extractHttpResponseData)
        PF->>FC: cachePromiseAndRegisterTags(fetchKey, promise, tags)
        FC->>Cache: set(fetchKey, promise)
        FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)
        PF-->>User: return promise
    end

    Note over User,Cache: promise now lives under fetchKey —<br/>whoever later reads the same key will get it
```

> **`has(fetchKey)`.** If the key is already warm (a previous prefetch, or a reader is
> already mounted), `prefetch` returns the existing promise instead of starting a second request. One key
> = one in-flight request, shared by everyone who asks for it.

---

## prefetch vs a reader's own fetch

```mermaid
flowchart TB
    subgraph without["Without prefetch (waterfall)"]
        A1["tap"] --> A2["navigate"] --> A3["mount"] --> A4["fetch starts"] --> A5["wait"] --> A6["render"]
    end
    subgraph with["With prefetch (overlap)"]
        B1["tap"] --> B2["fetch starts"]
        B1 --> B3["navigate + mount"]
        B2 --> B4["render (cache hit)"]
        B3 --> B4
    end
```

> **Why this matters.** Fetching lazily inside render delays the network request until after mount and can
> chain into waterfalls. `prefetch` moves the request to the earliest moment the intent is known — the
> tap — so transit time overlaps navigation instead of following it.

---

## Notes

- **Not a hook — a cache write.** `prefetch` can be called from any imperative context (event handler,
  navigation callback). It has no React state and no subscription; it only seeds `promiseCacheStore`.
- **The key is the whole contract.** Hand-off works only when `prefetch`'s `fetchKey` is byte-for-byte
  the one the destination [`useFetch`](./USE-FETCH-FLOW.md)/[`useFetchFn`](./USE-FETCH-FN-FLOW.md) uses.
  A mismatch silently degrades to a normal (duplicate) fetch.
- **Tags register should match the prefetch's tags.** `prefetch` and the reader that consumes the same `fetchKey`
  should declare the **same** `tags`. Tag associations _accumulate as a union_ (not overriden), so
  differing tags make the key just becomes invalidatable by _both_ sets, which only ever
  causes an extra (safe) refetch, never stale data. Still, we should keep them
  identical so "what invalidates this key" has one obvious answer.
- **First read reuses it; a refresh bypasses it.** A reader's _initial_ fetch honors the cache hit; an
  explicit `refreshFetch`/`refreshFetchFn` always goes to the network. So a warmed key speeds up the
  first paint without pinning stale data.

---

**Readers that consume a warmed key:** [USE-FETCH-FLOW](./USE-FETCH-FLOW.md) ·
[USE-FETCH-FN-FLOW](./USE-FETCH-FN-FLOW.md).
**What clears a warmed key:** [USE-MUTATION-FN-FLOW](./USE-MUTATION-FN-FLOW.md).
