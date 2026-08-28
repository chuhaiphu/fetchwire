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

## Reading the render bands

Every shaded band below is **one render** — *"Rendering is React calling your components."* Four
different things make React call this component, and each band says which one:

| Band | What triggered this render |
| --- | --- |
| `MOUNT` | the component mounted — React's initial render |
| `RETRY` | the promise it suspended on settled, so React **retries rendering from scratch**, keeping **no** state from the suspended render |
| `UPDATE` | a state update on a mounted component — `setPromise`, or a new `fetchKey` arriving from above |
| `IMMEDIATE RE-RUN` | `setPromise` was called **during** the previous render, so React calls the component again before rendering children or touching the DOM |

A render ends one of two ways: it **commits** (React updates the DOM, then runs Effects), or it
**suspends** and is discarded (no DOM, no Effects). That is why a suspended render never subscribes to
tags.

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
        Note over Cmp,React: MOUNT — React calls the component for the first time. This render suspends
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
        H->>React: useEffect(subscribe tags) — queued, NOT run: Effects run only after a commit
        H->>React: const data = use(promise)

        Note over React: use() suspends here EVEN IF the promise already resolved.<br/>React skips suspending only for a promise carrying a `status` field.<br/>fetchwire never sets one, so even an already-resolved promise costs this extra render.
        React-->>Cmp: component suspends → nearest Suspense fallback shown
        Note over React: this render is discarded — React keeps NO state from a render that<br/>suspended before mounting, and its Effects never run
    end

    Note over Cache,React: the warmed promise settles<br/>React retries the suspended tree

    rect rgba(128,128,128,0.12)
        Note over Cmp,React: RETRY — React calls the component again, from scratch
        Cmp->>H: useFetch(fetch, { fetchKey, tags })
        H->>Cache: has(fetchKey)
        Cache-->>H: true → the same promise MOUNT read, still no request
        H->>FC: registerTags(fetchKey, tags)
        H->>React: the useState initializer runs AGAIN — MOUNT's state was dropped — and reads the SAME promise
        H->>React: const data = use(promise)

        alt fulfilled
            React-->>H: use(promise) returns the value, whatever it is — the hook does not judge it
            H-->>Cmp: return { data, refreshFetch, isRefreshing: false }
            Note over React: this render commits → useEffect finally runs →<br/>eventEmitter.addListener(tag, refreshFetch) per tag
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
        Note over Cmp,React: MOUNT — React calls the component for the first time. This render suspends
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
        H->>React: useEffect(subscribe tags) — queued, NOT run: Effects run only after a commit
        H->>React: const data = use(promise)

        Note over React: PENDING — this render is discarded: React keeps NO state from a render that<br/>suspended before mounting, and its Effects never run, so no tag subscription exists yet
        React-->>Cmp: component suspends → nearest Suspense fallback shown
    end

    API-->>Fn: response
    Note over Fn,React: A settles.<br/>React retries the suspended tree.

    rect rgba(128,128,128,0.12)
        Note over Cmp,React: RETRY — React calls the component again, from scratch
        Cmp->>H: useFetch(fetch, { fetchKey, tags })
        H->>Cache: has(fetchKey)
        Cache-->>H: true → the entry MOUNT wrote is still there, so fetch() is NOT called again
        H->>FC: registerTags(fetchKey, tags)
        H->>React: the useState initializer runs AGAIN — MOUNT's state was dropped — and reads the SAME rawPromise
        H->>React: const data = use(promise)

        alt fulfilled
            React-->>H: use(promise) returns the value, whatever it is — the hook does not judge it
            H-->>Cmp: return { data, refreshFetch, isRefreshing: false }
            Note over React: this render commits → useEffect finally runs →<br/>eventEmitter.addListener(tag, refreshFetch) per tag
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

    Note over Cmp,React: PRECONDITION — this useFetch is mounted and one of its renders already committed,<br/>so its useEffect ran → eventEmitter.addListener(tag, refreshFetch) per tag.<br/>A reader that never committed holds no subscription and cannot be tag-refreshed.

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
        Note over H,React: refreshFetch body — identical for both triggers, and it runs OUTSIDE render
        H->>H: fetch = fetchRef.current — the latest fetch, read at call time

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
            Note over Cmp,React: UPDATE — setPromise makes React call the component again, and it fires NO new request
            React->>H: React calls the component again — this update is a Transition
            H->>Cache: has(fetchKey)
            Cache-->>H: true → the entry refreshFetch just wrote, so fetch() is NOT called again
            H->>FC: registerTags(fetchKey, tags)
            Note over H,React: the useState initializer does NOT run — it is lazy and ran only on mount.<br/>`promise` comes from setPromise, so it is newPromise.
            H->>React: const data = use(newPromise)

            Note over React: PENDING — inside a Transition, so React does not replace<br/>already revealed content with the Suspense fallback.
            React-->>Cmp: the current data stays on screen (isRefreshing = true)

            Note over React: newPromise settles → React commits this render → isRefreshing = false

            alt fulfilled
                React-->>H: use(newPromise) returns the fresh value
                H-->>Cmp: return { data, refreshFetch, isRefreshing: false }
            else rejected (ApiError)
                React-->>Cmp: use(newPromise) throws the ApiError → nearest Error Boundary fallback shown
            end
        end
    else reader unmounted before that render runs
        Note over H,Cache: The render never happens, so use() never reads newPromise.<br/>The no-op rejection listener keeps a rejected newPromise from firing unhandledrejection.<br/>It stays cached AS REJECTED, so the next mount takes the cache-hit path on it —<br/>clear it with fetchClient.remove(fetchKey).
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

## `fetchKey` changes — a new read, not a refresh

`fetchKey` is the identity of the read, so changing it asks for a **different** resource, not a fresh copy
of the same one. The trigger is a **new key arriving on a mounted reader** — not `refreshFetch()`, not a
tag event — and the hook moves its promise state onto that key **during** the render.

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

    Note over Cmp,React: PRECONDITION — this useFetch is mounted on previousFetchKey,<br/>so promise A is its state and A's data is on screen.

    rect rgba(128,128,128,0.12)
        Note over Cmp,React: UPDATE — a new fetchKey arrives, and this render sets state
        Cmp->>H: useFetch(fetch, { fetchKey, tags })
        H->>Cache: has(fetchKey)
        Cache-->>H: false → cache MISS, no one warmed the new key

        Note over H,API: `fetch` is the consumer's callback, invoked exactly ONCE.<br/>Its promise is cached as-is — fetchwire derives nothing from it.
        H->>Fn: fetch()
        Fn->>API: HTTP request
        Fn-->>H: promise B (pending)
        H->>H: rawPromise = B — cached exactly as `fetch` returned it, no derived promise

        H->>FC: cachePromiseAndRegisterTags(fetchKey, rawPromise, tags)
        FC->>FC: void rawPromise.catch(() => {}) — attach a no-op rejection listener<br/>so a promise nobody reads cannot fire unhandledrejection.
        FC->>Cache: set(fetchKey, rawPromise) — the previousFetchKey entry is left untouched
        FC->>FC: map each tag → fetchKey (tagToFetchKeysMap)

        Note over H,React: the useState initializer does NOT run — it is lazy and ran only on mount,<br/>so `promise` still holds promise A.
        H->>H: fetchKey !== previousFetchKey
        H->>React: setPreviousFetchKey(fetchKey) + setPromise(Cache.get(fetchKey))
        H->>React: const data = use(promise A) — `promise` is this render's snapshot, so setPromise did NOT change it<br/>A is already fulfilled, so use() returns its data instead of suspending

        Note over React: React calls the component again IMMEDIATELY after this render returns.<br/>The children do not render with it and the DOM is not updated,<br/>so this render is discarded — A's data is never painted under the new key.
    end

    rect rgba(128,128,128,0.12)
        Note over Cmp,React: IMMEDIATE RE-RUN — the same component again, before anything commits
        Cmp->>H: useFetch(fetch, { fetchKey, tags })
        H->>Cache: has(fetchKey)
        Cache-->>H: true → the entry the previous render wrote, so fetch() is NOT called again
        H->>FC: registerTags(fetchKey, tags)
        Note over H,React: `promise` comes from setPromise, so it is promise B.
        H->>React: const data = use(promise B)

        Note over React: PENDING — this update is NOT a Transition, so React DOES<br/>replace the already revealed content with the Suspense fallback.
        React-->>Cmp: component suspends → nearest Suspense fallback shown
    end

    Note over Cache,React: promise B settles<br/>React retries the suspended tree — fulfilled → data, rejected (ApiError) → Error Boundary
```

> **Why the promise is re-pointed during render, not in an Effect.** An Effect runs only after a render
> commits, so the browser would paint one frame of the previous key's data under the new key before the
> correction landed. Setting state during render keeps that frame from existing: React calls the
> component again before its children render and before the DOM is touched. The
> `fetchKey !== previousFetchKey` comparison is what keeps it from looping. (React's documented pattern
> for adjusting state when a prop changes —
> [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect).)

> **Why a key change suspends but a refresh does not.** `refreshFetch` swaps the promise inside
> `startTransition`, which is what keeps the current data on screen. This swap runs during render, with no
> `startTransition` around it, so the update stays urgent and the Suspense fallback replaces the current
> data. Keeping it on screen is the caller's job — change whatever the key is built from inside their own
> `startTransition`.

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
