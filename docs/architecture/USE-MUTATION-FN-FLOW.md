# useMutationFn — Write & Invalidate Flow

The **write** hook: run an async mutation, track `isMutating`, and — on success — **invalidate tags** so
every mounted reader ([`useFetch`](./USE-FETCH-FLOW.md) / [`useFetchFn`](./USE-FETCH-FN-FLOW.md))
subscribed to those tags re-reads.

> **The one idea that defines this flow.** A fetch is a **resource**, so it has an identity (`fetchKey`)
> and can be cached. A mutation is an **action** — it has no identity, so this hook never reads or writes
> `promiseCacheStore` for itself, and calling it twice really does send two requests. What it owns instead
> is the mutation's _after-effect_: on success it **clears the cached promises** of every `fetchKey`
> associated with the invalidated tags, and **emits** those tags so mounted readers refetch. Writes and
> reads never reference each other directly — they are wired only through shared tag strings.

> Everything below turns on where the `try` **ends** inside `executeMutationFn`
> ([use-mutation-fn.ts](../../src/hook/use-mutation-fn.ts)):
>
> ```
> try   { result = await fn(variables) }     → the mutation ITSELF
> catch { normalizeToApiError → setState → onError }  → the mutation FAILED
> ─────────────────────────────────────────────── the try ends HERE
> setState → invalidateTags → onSuccess       → the CONSEQUENCES of success
> ```
>
> A `try` has no power over the server: it cannot un-`POST` a committed write. The only thing it controls
> is the **report**. Widen it past the network call and a throw in the consequences turns a successful
> write into a false failure report.

---

## Where it fits

Read the map as three bands: **PENDING** (the flag goes on, a serial number is claimed), the network call
(the only thing inside `try`), then **SETTLED** (`fulfilled` / `rejected`). The sequence diagrams below
preserve the same three bands.

```mermaid
flowchart LR
    Cmp["Consumer Component"] -->|"user action"| EXE["executeMutationFn(variables, opts?)"]
    EXE --> PEND["PENDING<br/>setState(isMutating: true)<br/>requestId = ++latestRequestIdRef.current"]
    PEND --> TRY{"await fn(variables)<br/>the ONLY statement inside try"}

    TRY -->|"rejected"| ERRS["apiError = normalizeToApiError(error)<br/>setState { data: null, isMutating: false }<br/>onError(apiError) → return null"]

    TRY -->|"fulfilled"| OKS["setState { data, isMutating: false }"]
    OKS --> INV["invalidateTags(tags)"]
    INV --> CLR["JOB 1 — delete every fetchKey<br/>mapped to the tag"]
    INV --> EMIT["JOB 2 — eventEmitter.emit(tag)"]
    EMIT --> RD["mounted readers subscribed<br/>to the tag → refresh"]
    INV --> OK["onSuccess(result ?? null) → return result"]
```

The **cache clear** and the **emit** are complementary: the emit refreshes readers that are _mounted now_;
the clear guarantees a reader that mounts _later_ starts from a fresh fetch instead of a stale cached
promise.

---

## executeMutationFn — Success

The mutation resolves, so the hook publishes the result and then runs the two consequences — invalidation
first, `onSuccess` second.

```mermaid
sequenceDiagram
    autonumber
    participant Cmp as Consumer Component
    participant H as useMutationFn
    participant Fn as mutation callback (consumer-supplied)
    participant API as Server (via wireData / wireRaw)
    participant FC as fetchClient
    participant Cache as promiseCacheStore
    participant EM as eventEmitter
    participant RD as Mounted readers

    Cmp->>H: executeMutationFn(variables, { onSuccess, onError })

    rect rgba(128,128,128,0.12)
        Note over Cmp,RD: PENDING — the flag goes on, and this run claims a serial number
        H->>H: fn = mutationFnRef.current — the latest mutationFn, read at call time
        Note over H: `variables` is always argument 1 and the options always argument 2.<br/>Nothing is inspected at runtime to tell them apart.
        H->>H: requestId = ++latestRequestIdRef.current
        H->>H: setState(isMutating: true) — data from the previous run is left in place
    end

    Note over H,API: INSIDE `try` — the network call, and nothing else.<br/>`fn` is the consumer's callback, invoked exactly ONCE.
    H->>Fn: await fn(variables)
    Fn->>API: request (POST / PUT / DELETE)
    API-->>Fn: 2xx
    Fn-->>H: result — whatever `fn` resolved, handed over untouched

    rect rgba(128,128,128,0.12)
        Note over Cmp,RD: SETTLED — OUTSIDE `try`. Everything here is a consequence of a write<br/>the server has already committed and no one can roll back.
        H->>H: setState(data: result ?? null, isMutating: false)
        Note over H,FC: this setState — and ONLY this setState — is inside<br/>`if (requestId === latestRequestIdRef.current)`

        opt invalidatesTags provided
            H->>FC: invalidateTags(invalidatesTagsKey.split(','))
            loop each non-empty tag
                Note over FC,Cache: JOB 1 — cache level, serves readers that are NOT mounted
                FC->>Cache: delete(fetchKey) for every key mapped to the tag
                FC->>FC: tagToFetchKeysMap.delete(tag)

                Note over EM,RD: JOB 2 — component level, serves readers that ARE mounted
                FC->>EM: emit(tag)
                EM->>RD: refreshFetch / refreshFetchFn — invoked synchronously on EVERY listener of that tag
                RD->>API: each mounted reader re-reads (see its own flow)
            end
        end

        H->>Cmp: await onSuccess(result ?? null)
        Note over H,Cmp: awaited, so the returned Promise settles only once the callback has finished.<br/>isMutating is already false — it tracks the request, not the callback.
        H-->>Cmp: return result — the same value onSuccess received
    end
```

> **Why invalidation runs _before_ `onSuccess`.** By the time `onSuccess` runs, the cache is already
> cleared and readers already notified — so any navigation or UI update it performs happens on top of an
> already-invalidated cache, not a stale one.

---

## executeMutationFn — Failure

The `await` rejects. Nothing is invalidated, `onSuccess` never runs, and the thrown value is **normalized**
before it reaches the consumer.

```mermaid
sequenceDiagram
    autonumber
    participant Cmp as Consumer Component
    participant H as useMutationFn
    participant Fn as mutation callback (consumer-supplied)
    participant API as Server (via wireData / wireRaw)

    Cmp->>H: executeMutationFn(variables, { onSuccess, onError })

    rect rgba(128,128,128,0.12)
        Note over Cmp,API: PENDING — identical to the success path, the branch is not decided yet
        H->>H: fn = mutationFnRef.current — the latest mutationFn, read at call time
        H->>H: requestId = ++latestRequestIdRef.current
        H->>H: setState(isMutating: true)
    end

    Note over H,API: INSIDE `try` — the network call, and nothing else.
    H->>Fn: await fn(variables)

    alt non-OK response — an exchange completed
        Fn->>API: request
        API-->>Fn: 4xx / 5xx
        Fn-->>H: wireRaw throws ApiError (statusCode from the response)
    else no exchange at all
        Fn->>API: request never completes (DNS, TLS, refused, timeout, abort)
        Fn-->>H: wireRaw throws ApiError — errorCode 'NETWORK_ERROR', statusCode 520
    else thrown from somewhere wireRaw does not wrap
        Note over Fn,H: a rejected getToken(), an onRequest / onResponse / transformResponse<br/>interceptor, an uninitialized wire
        Fn-->>H: the raw thrown value
    end

    rect rgba(128,128,128,0.12)
        Note over Cmp,API: SETTLED — the failure branch. No tag is invalidated and onSuccess never runs.
        H->>H: apiError = normalizeToApiError(error) — pass an ApiError through untouched, otherwise wrap it
        H->>H: setState(data: null, isMutating: false)
        Note over H,API: this setState — and ONLY this setState — is inside<br/>`if (requestId === latestRequestIdRef.current)`
        H->>Cmp: await onError(apiError)
        H-->>Cmp: return null — the only way this hook reports failure to an awaiting caller
    end
```

---

## Tag fan-out — one write, many reads

```mermaid
flowchart TB
    M["useMutationFn<br/>invalidatesTags: ['trip-list', 'assignment-list']"] --> I["fetchClient.invalidateTags"]
    I --> T1["tag 'trip-list'"]
    I --> T2["tag 'assignment-list'"]
    T1 --> K1["fetchKey: trip-list-org1<br/>→ clear cache + emit"]
    T2 --> K2["fetchKey: assignment-list-tripA<br/>→ clear cache + emit"]
    T2 --> K3["fetchKey: assignment-list-tripB<br/>→ clear cache + emit"]
    K1 --> R1["reader on trip-list refreshes"]
    K2 --> R2["reader on tripA refreshes"]
    K3 --> R3["reader on tripB refreshes"]
```

---

## Notes

- **Callbacks are awaited — so `isMutating` and the returned Promise mean different things.**
  `onSuccess` / `onError` may return a Promise, and `executeMutationFn` waits for it. So
  `await executeMutationFn(...)` means "the write **and** everything the caller queued after it are
  done", while `isMutating` went false earlier — it tracks the **request**, not the callback. A callback
  that rejects rejects `executeMutationFn` (it does **not** route to `onError`, which lives inside the
  narrowed `try`).
- **Overlapping runs resolve by recency, not by arrival.** Two `executeMutationFn()` calls produce two
  independent requests writing one state. The newer run always wins, whichever response lands last — but
  both runs still invalidate their tags and still call their own callbacks.
- **Collection vs entity tags.** A broad tag (`'entity-list'`) refreshes _every_ reader of that collection
  in one write — simple, at the cost of refetching readers that may not have changed. A narrow, per-entity
  tag (`'entity-list-' + id`) refreshes exactly one. Choosing the granularity is the caller's modeling
  decision; fetchwire treats every tag identically.
- **`onSuccess` and the return value carry the same thing.** Both are whatever `mutationFn` resolved:
  `onSuccess` is passed `result ?? null`, and `executeMutationFn` returns `result` itself. The hook never
  inspects or unwraps it. To reach transport metadata such as `status`, have `mutationFn` call
  [`wireRaw`](../../src/core/wire.ts) instead of `wireData`.
- **Unmounting the caller does not abandon the write.** A mutation whose component unmounts before the
  request settles still invalidates its tags and still calls `onSuccess` / `onError`. Only `setState` is
  lost, and only because React drops it — the cache and the caller's callbacks are not the component's to
  cancel. Write `onSuccess` / `onError` so they tolerate running after their component is gone: reach for
  a router, a store, or an alert rather than a `setState` the caller no longer owns.
- **`reset()`** returns state to the idle shape (`data:null, isMutating:false`) and retires every in-flight
  run, so a late response cannot resurrect what was just cleared. It does not touch the Promise cache and
  emits nothing.

---

**Readers that react to invalidation:** [USE-FETCH-FLOW](./USE-FETCH-FLOW.md) ·
[USE-FETCH-FN-FLOW](./USE-FETCH-FN-FLOW.md).
**Warming a reader's cache before it mounts:** [PREFETCH-FLOW](./PREFETCH-FLOW.md).
