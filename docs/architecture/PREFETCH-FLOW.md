# prefetch — Cache-Warming Flow

The **eager** primitive: start a request **before** the component that needs it renders, store the
in-flight promise under a `fetchKey`, and let the later [`useFetch`](./USE-FETCH-FLOW.md) /
[`useFetchFn`](./USE-FETCH-FN-FLOW.md) pick it up instead of firing its own request.

> **The one idea that defines this flow.** `prefetch` is not a hook and holds no state. It's just a plain
> function — typically called from an event handler — that puts a promise into the shared
> `promiseCacheStore` under a `fetchKey`.

---

## Where it fits

```mermaid
flowchart LR
    User["User taps a row"] --> H["handler: prefetch(fn, { fetchKey })<br/>NOT awaited"]
    H --> HIT{"cache has(fetchKey)?"}
    HIT -->|"yes"| DEDUPE["reuse cached promise (dedupe)<br/>register tags → fetchKey"]
    HIT -->|"no"| NEW["fn() → cache promise<br/>register tags → fetchKey"]
    DEDUPE --> WARM["promise lives under fetchKey<br/>transit runs in the background"]
    NEW --> WARM
    H --> NAV["router.push(detail) — runs immediately,<br/>it does not wait for the promise"]
    NAV --> MOUNT["detail mounts → useFetch(fetchKey)"]
    MOUNT --> REUSE["reuse cached promise<br/>register tags → fetchKey"]
    WARM -.->|"same fetchKey"| REUSE
```

The **same `fetchKey`** is the contract: the value passed to `prefetch` must match the one the
destination reader uses, or the reader will fetch again on its own.

---

## The flow — warm, navigate, hand off

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Cmp as Consumer Component
    participant PF as prefetch()
    participant Fn as fetch callback (consumer-supplied)
    participant API as Server (via wireData / wireRaw)
    participant FC as fetchClient
    participant Cache as promiseCacheStore

    User->>Cmp: taps a row
    Cmp->>PF: prefetch(fetchFn, { fetchKey, tags })

    PF->>Cache: has(fetchKey)

    alt cache HIT — key already warm
        Cache-->>PF: true
        PF->>Cache: get(fetchKey)
        Cache-->>PF: existing promise — pending, fulfilled, OR already rejected
        PF->>FC: registerTags(fetchKey, tags)
        PF-->>Cmp: return the cached promise (no new request)
    else cache MISS — cold key
        Cache-->>PF: false

        Note over PF,API: `fetchFn` is the consumer's callback, invoked exactly ONCE.<br/>Its promise is cached as-is — fetchwire derives nothing from it.
        PF->>Fn: fetchFn()
        Fn->>API: HTTP request
        Fn-->>PF: promise A (pending)
        PF->>PF: promise = A — cached exactly as `fetchFn` returned it, no derived promise

        PF->>FC: cachePromiseAndRegisterTags(fetchKey, promise, tags)
        FC->>FC: void promise.catch(() => {}) — attach a no-op rejection listener<br/>so a promise nobody reads cannot fire unhandledrejection.<br/>The promise stays rejected — use() still throws to the Error Boundary.
        FC->>Cache: set(fetchKey, promise)
        FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)
        PF-->>Cmp: return promise
    end
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
        B2 --> B4["cache hit → render"]
        B3 --> B4
    end
```

---

## Notes

- **Not a hook** `prefetch` can be called from any imperative context (event handler,
  navigation callback). It has no React state and no subscription; it only seeds `promiseCacheStore`.
- **The key is the whole contract.** Hand-off works only when `prefetch`'s `fetchKey` is byte-for-byte
  the one the destination [`useFetch`](./USE-FETCH-FLOW.md)/[`useFetchFn`](./USE-FETCH-FN-FLOW.md) uses.
  A mismatch silently degrades to a normal (duplicate) fetch.
- **Tags register on every call.** The promise cache and the tag map
  (`tagToFetchKeysMap`) are independent; a warm key means only the first one is already done, so
  `prefetch` registers `tags` on the cache-hit path too. Registrations _accumulate as a union_ (never
  overridden), so `prefetch` and the reader consuming the same `fetchKey` should declare the **same**
  `tags` — differing sets only make the key invalidatable by _both_, an extra (safe) refetch rather
  than stale data.
- **First read reuses it; a refresh replaces it.** A reader's _initial_ fetch honors the cache hit; an
  explicit `refreshFetch`/`refreshFetchFn` skips the cache read and overwrites the entry. So a warmed key
  speeds up the first paint without pinning stale data.

---

**Readers that consume a warmed key:** [USE-FETCH-FLOW](./USE-FETCH-FLOW.md) ·
[USE-FETCH-FN-FLOW](./USE-FETCH-FN-FLOW.md).
**What clears a warmed key:** [USE-MUTATION-FN-FLOW](./USE-MUTATION-FN-FLOW.md).
