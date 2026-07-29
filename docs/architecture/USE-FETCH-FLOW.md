# useFetch — Suspense Data Flow

The **declarative** read hook: fetch on first render, **suspend** the component while the promise is
pending, and surface data through React's `use()`. The hook's job is to make sure the **same promise instance** is reused across renders.

> **The one idea that defines this flow.** `useFetch` hands a **cached promise** to `use(promise)` and lets **React** decide:

1. pending → the nearest `<Suspense>` fallback
2. rejected → the nearest `<ErrorBoundary>` fallback
3. fulfilled → the data.

---

## Where it fits

```mermaid
flowchart LR
    Cmp["Consumer Component<br/>useFetch(fetch, { fetchKey, tags })"] --> HIT{"promiseCacheStore<br/>has(fetchKey)?"}
    HIT -->|"yes (e.g. prefetched)"| REUSE["reuse cached promise<br/>register tags → fetchKey"]
    HIT -->|"no"| NEW["fetch() → cache promise<br/>register tags → fetchKey"]
    REUSE --> USE["const data = use(promise)"]
    NEW --> USE
    USE -->|"pending"| SUS["nearest &lt;Suspense&gt; fallback"]
    USE -->|"rejected"| EB["nearest &lt;ErrorBoundary&gt; fallback"]
    USE -->|"fulfilled"| DATA["return { data, refreshFetch, isRefreshing }"]
```

The consumer tree **must** provide both boundaries — `<Suspense>` for the pending state and
`<ErrorBoundary>` for a rejected promise. `useFetch` itself renders neither.

---

## First render — Cache hit

The trigger is **render on mount**, not a user gesture. This is the branch taken when a
[`prefetch`](./PREFETCH-FLOW.md) (or an already-mounted reader) warmed the same `fetchKey` — the hook
fires **no** request and reuses the stored promise.

```mermaid
sequenceDiagram
    autonumber
    participant Cmp as Consumer Component
    participant H as useFetch
    participant FC as fetchClient
    participant Cache as promiseCacheStore
    participant React as React runtime

    rect rgba(128,128,128,0.12)
        Note over Cmp,React: RENDER 1 — This render suspends, so the Suspense fallback commits instead
        Note over Cmp: component mounts
        Cmp->>H: useFetch(fetch, { fetchKey, tags })
        H->>H: tagsKey = tags.join(',')
        H->>Cache: has(fetchKey)
        Cache-->>H: true → a prefetch or another mounted reader already warmed this key

        Note over H,Cache: The consumer's `fetch` callback is NEVER invoked on this path.<br/>No request leaves the app.
        H->>FC: registerTags(fetchKey, tags)
        FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)

        Note over FC,Cache: registerTags only. This path never calls cachePromiseAndRegisterTags
        H->>Cache: get(fetchKey)  (inside useState initial value)
        Cache-->>H: the warmed promise — pending, fulfilled, OR already rejected
        H->>React: useEffect(subscribe tags) — REGISTERED, not run yet
        H->>React: const data = use(promise)

        Note over React: use() will suspends here EVEN IF the response already came back
        React-->>Cmp: component suspends → nearest Suspense fallback shown
        Note over React: this render is discarded — its state is dropped and its Effects never run
    end

    Note over Cache,React: the warmed promise settles<br/>React retries the suspended tree

    rect rgba(128,128,128,0.12)
        Note over Cmp,React: RENDER 2 — React retries rendering from scratch
        Cmp->>H: useFetch(fetch, { fetchKey, tags })
        H->>Cache: has(fetchKey)
        Cache-->>H: true → same promise as RENDER 1, still no request
        H->>FC: registerTags(fetchKey, tags)
        H->>React: useState initializer re-reads the SAME promise
        H->>React: const data = use(promise)

        alt fulfilled
            React-->>H: use(promise) returns the value, whatever it is — the hook does not judge it
            H-->>Cmp: return { data, refreshFetch, isRefreshing: false }
            Note over React: render commits → useEffect finally runs →<br/>eventEmitter.addListener(tag, refreshFetch) per tag
        else rejected (ApiError)
            React-->>Cmp: use(promise) throws the ApiError → nearest Error Boundary fallback shown
        end
    end
```

---

## First render — Cache miss

The default path on mount when nothing warmed the key: fire the request, cache the in-flight promise
through `fetchClient`, then suspend on it.

```mermaid
sequenceDiagram
    autonumber
    participant Cmp as Consumer Component
    participant H as useFetch
    participant Fn as fetch callback (consumer-supplied)
    participant API as Server (via wireData / wireRaw)
    participant FC as fetchClient
    participant Cache as promiseCacheStore
    participant React as React runtime

    rect rgba(128,128,128,0.12)
        Note over Cmp,React: RENDER 1 — This render suspends, so the Suspense fallback commits instead
        Note over Cmp: component mounts
        Cmp->>H: useFetch(fetch, { fetchKey, tags })
        H->>H: tagsKey = tags.join(',')
        H->>Cache: has(fetchKey)
        Cache-->>H: false → cache MISS, no one warmed this key

        Note over H,API: `fetch` is the consumer's callback, invoked exactly ONCE.<br/>Its promise is cached as-is — fetchwire derives nothing from it.
        H->>Fn: fetch()
        Fn->>API: HTTP request
        Fn-->>H: promise A (pending)
        H->>H: rawPromise = A — cached exactly as `fetch` returned it, no derived promise

        H->>FC: cachePromiseAndRegisterTags(fetchKey, rawPromise, tags)
        FC->>FC: void rawPromise.catch(() => {}) — attach a no-op rejection listener<br/>so a promise nobody reads cannot fire unhandledrejection.<br/>The promise stays rejected — use() still throws to the Error Boundary.
        FC->>Cache: set(fetchKey, rawPromise)
        FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)

        H->>React: useState(() => Cache.get(fetchKey)) — pins that exact instance
        H->>React: useEffect(subscribe tags) — REGISTERED, not run yet
        H->>React: const data = use(promise)

        Note over React: PENDING — React aborts this pass and discards its state.<br/>Effects never run, so no tag subscription exists yet.
        React-->>Cmp: component suspends → nearest Suspense fallback shown
    end

    API-->>Fn: response
    Note over Fn,React: A settles.<br/>React retries the suspended subtree from scratch.

    rect rgba(128,128,128,0.12)
        Note over Cmp,React: RENDER 2 — React retries rendering from scratch
        Cmp->>H: useFetch(fetch, { fetchKey, tags })
        H->>Cache: has(fetchKey)
        Cache-->>H: true → the entry RENDER 1 wrote is still there, so fetch() is NOT called again
        H->>FC: registerTags(fetchKey, tags)
        H->>React: useState initializer re-reads the SAME rawPromise
        H->>React: const data = use(promise)

        alt fulfilled
            React-->>H: use(promise) returns the value, whatever it is — the hook does not judge it
            H-->>Cmp: return { data, refreshFetch, isRefreshing: false }
            Note over React: render commits → useEffect finally runs →<br/>eventEmitter.addListener(tag, refreshFetch) per tag
        else rejected (ApiError)
            React-->>Cmp: use(promise) throws the ApiError → nearest Error Boundary fallback shown<br/>(component unmounts — rawPromise stays cached as rejected)
        end
    end
```

---

## Refresh — tag-driven & manual

A mounted `useFetch` subscribes each of its `tags` to the `eventEmitter`. A
[`useMutationFn`](./USE-MUTATION-FN-FLOW.md) that invalidates a matching tag — or a manual
`refreshFetch()` call — swaps in a **new** promise **without** unmounting, keeping current data visible via
`useTransition`.

```mermaid
sequenceDiagram
    autonumber
    participant Cmp as Consumer Component
    participant Mut as useMutationFn
    participant FC as fetchClient
    participant Cache as promiseCacheStore
    participant EM as eventEmitter
    participant H as useFetch
    participant Fn as fetch callback (consumer-supplied)
    participant API as Server (via wireData / wireRaw)
    participant React as React runtime

    Note over Cmp,React: PRECONDITION — this useFetch is mounted and a render of it already committed,<br/>so its useEffect ran → eventEmitter.addListener(tag, refreshFetch) per tag.<br/>A reader that never committed holds no subscription and cannot be tag-refreshed.

    rect rgba(128,128,128,0.12)
        Note over Cmp,EM: TRIGGER A — tag-driven, and it does TWO independent jobs
        Cmp->>Mut: executeMutationFn(variables)
        Note over Mut: mutation fulfilled — invalidateTags runs on success ONLY
        Mut->>FC: invalidateTags(invalidatesTags)

        Note over FC,Cache: JOB 1 — cache level, serves readers that are NOT mounted
        FC->>Cache: delete(fetchKey) for every key mapped to the tag
        FC->>FC: tagToFetchKeysMap.delete(tag)

        Note over EM,H: JOB 2 — component level, serves readers that ARE mounted
        FC->>EM: emit(tag)
        EM->>H: refreshFetch() — invoked synchronously on EVERY listener of that tag
    end

    rect rgba(128,128,128,0.12)
        Note over Cmp,H: TRIGGER B — manual, this reader ONLY
        Cmp->>H: refreshFetch() (pull-to-refresh / retry button)
        Note over Cmp,H: No invalidateTags on this path — nothing is deleted from the cache<br/>and no other reader sharing the tag is notified.
    end

    rect rgba(128,128,128,0.12)
        Note over H,React: REFRESH — the refreshFetch body, identical for both triggers

        Note over H,API: `fetch` is the consumer's callback, invoked exactly ONCE.<br/>Its promise is cached as-is — fetchwire derives nothing from it.
        H->>Fn: fetch()
        Fn->>API: HTTP request
        Fn-->>H: promise A (pending)
        H->>H: newPromise = A — cached exactly as `fetch` returned it, no derived promise

        H->>FC: cachePromiseAndRegisterTags(fetchKey, newPromise, tags)
        FC->>FC: void newPromise.catch(() => {}) — attach a no-op rejection listener<br/>so a promise nobody reads cannot fire unhandledrejection.<br/>The promise stays rejected — use() still throws to the Error Boundary.
        FC->>Cache: set(fetchKey, newPromise)
        FC->>FC: map each tag → fetchKey (tagToFetchKeysMap) — rebuilds what JOB 1 wiped

        H->>React: startTransition(() => setPromise(newPromise))
        Note over H,React: setPromise is React state — it only takes effect while the component is mounted.
    end

    alt reader still mounted
        rect rgba(128,128,128,0.12)
            Note over Cmp,React: RE-RENDER — the hook body runs again and fires NO new request
            React->>H: re-render (marked as a Transition)
            H->>Cache: has(fetchKey)
            Cache-->>H: true → the entry refreshFetch just wrote, so fetch() is NOT called again
            H->>FC: registerTags(fetchKey, tags)
            Note over H,React: useState initializer does NOT re-run — it is lazy and ran only on mount.<br/>`promise` comes from setPromise, so it is newPromise.
            H->>React: const data = use(newPromise)

            Note over React: PENDING — inside a Transition, so React does not replace<br/>already revealed content with the Suspense fallback.
            React-->>Cmp: the current data stays on screen (isRefreshing = true)

            Note over React: newPromise settles → React commits the pending render → isRefreshing = false

            alt fulfilled
                React-->>H: use(newPromise) returns the fresh value
                H-->>Cmp: return { data, refreshFetch, isRefreshing: false }
            else rejected (ApiError)
                React-->>Cmp: use(newPromise) throws the ApiError → nearest Error Boundary fallback shown
            end
        end
    else reader unmounted before the re-render runs
        Note over H,Cache: The re-render never runs, so use() never reads newPromise.<br/>The no-op rejection listener keeps a rejected newPromise from firing unhandledrejection.<br/>It stays cached AS REJECTED, so the next mount takes the cache-hit path on it —<br/>clear it with fetchClient.remove(fetchKey).
    end
```

> **Why `useTransition` for refresh but Suspense for the first load.** On first load there is no data to
> show, so suspending to a fallback is correct. On refresh there _is_ data on screen; a transition marks
> the new promise as non-urgent so React keeps the old UI visible (`isRefreshing = true`) instead of
> flashing the Suspense fallback again.

> **Why `tagsKey = tags.join(',')`.** `options.tags` is a new array on every render, which would make the
> subscription `useEffect` re-run each render. Joining to a stable string key makes the effect depend on
> the tag _values_, not the array identity. (Constraint: tag strings must not contain commas.)

---

## Notes

- **Boundaries are the consumer's responsibility.** `useFetch` returns no `isLoading`/`error` for the
  initial fetch — those states _are_ the `<Suspense>` and `<ErrorBoundary>` around the component. For an
  imperative, flag-based read, use [`useFetchFn`](./USE-FETCH-FN-FLOW.md).
- **`fetchKey` is the identity of the read.** It dedupes concurrent reads, links a
  [`prefetch`](./PREFETCH-FLOW.md) to the hook that later consumes it, and is the unit that
  `fetchClient.invalidateTags` clears.
- **`tags` connect reads to writes.** A read subscribes to tags; a
  [mutation](./USE-MUTATION-FN-FLOW.md) invalidates tags.
- **Two stores, not one — tags register on every call.** The promise cache and the tag map
  (`tagToFetchKeysMap`) are independent; a warm key means only the first one is already done, so the
  cache-hit path registers `tags` too. Registrations _accumulate as a union_ (never overridden), so a
  [`prefetch`](./PREFETCH-FLOW.md) and the reader consuming the same `fetchKey` should declare the **same**
  `tags` — differing sets only make the key invalidatable by _both_, an extra (safe) refetch rather than
  stale data.
- **`refreshFetch` requires a mounted component.** It sets internal promise state via `useTransition`, so
  it only has an effect while the component is rendered. To force a fresh fetch from _outside_ a mounted
  reader (e.g. resetting a rejected key), clear the cache with `fetchClient.remove(fetchKey)` and let the
  next mount re-fetch.

---

**Manual/flag-based sibling:** [USE-FETCH-FN-FLOW](./USE-FETCH-FN-FLOW.md).
**What invalidates a tag:** [USE-MUTATION-FN-FLOW](./USE-MUTATION-FN-FLOW.md).
**Warming the cache before mount:** [PREFETCH-FLOW](./PREFETCH-FLOW.md).
