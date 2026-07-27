# Tag-Based Cache Invalidation Pattern

How fetchwire answers the hardest question in caching: _after a write, which cached reads are now stale —
and how do we refresh exactly those?

This is the same model used by RTK Query (`providesTags` / `invalidatesTags`) and Next.js (`cacheTag` /
`revalidateTag`): a **read declares the tags it belongs to**, a **write declares the tags it invalidates**,
and the library maps between them.

---

## What

### What is a `fetchKey`

Every read in fetchwire carries a **`fetchKey`** — a string that is the read's **identity**. fetchwire caches
the read's promise under this key in a module-level store
([`promiseCacheStore`](../../src/core/promise-cache-store.ts)), so two reads with the same `fetchKey` share a
single cached promise and the same request is never fired twice.

Name it so that two reads share a `fetchKey` **iff** they are the same read and may share a cache entry — the
key encodes exactly the inputs that make the read distinct:

```ts
fetchKey: `trip-${tripId}`;                     // one specific trip
fetchKey: `assignment-list-in-trip-${tripId}`;  // the assignment list under one trip
fetchKey: `car-list`;                           // the full car list
```

The moment we cache, we inherit **staleness**: a mutation elsewhere can make a cached entry wrong, and the
next reader of that key would serve the outdated copy.

### What is a `tag`

A `fetchKey` answers "_which_ read is this?" — but a writer performing a mutation does not know which keys are
mounted. A single "create assignment" call cannot know that `assignment-list-in-trip-42` and `car-list`
happen to be cached right now. **The writer knows the _kind_ of thing it changed, not the _identities_ of the
reads affected.**

A **`tag`** bridges that gap. A tag is a **name for a kind of data**: each read declares the tags it belongs
to, each write declares the tags it invalidates, and fetchwire translates a write's tags back into the
concrete `fetchKey`s to evict.

A read typically carries one **narrow** tag (its record or child-list tag) plus the **collection** tag it
belongs to, so a write can refresh it either surgically or as part of its whole group.

### Two identifiers on two different axes

The whole pattern rests on not conflating these:

|                 | `fetchKey`                                                    | `tag`                                          |
| --------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| **Answers**     | "_which_ data is this?"                                       | "_what kind_ of data is this?"                 |
| **Granularity** | one specific read                                             | a group of reads                               |
| **Role**        | unit of **caching** (one key ↔ one cached promise)            | unit of **invalidation** (one tag ↔ many keys) |
| **Declared by** | every read (`useFetch`/`useFetchFn`/`prefetch`)               | reads (`tags`) and writes (`invalidatesTags`)  |
| **Example**     | `car-7`                                                       | `car-list`                                     |

A mutation invalidates **tags**; the cache evicts **fetchKeys**. The library is the translator in between.

The relationship is many-to-many:

- **One tag → many fetchKeys.** The collection tag `car-list` covers every read that declares it — the
  full-list read `car-list` and each single-car read `car-7`, `car-9`, ….
- **One fetchKey → many tags.** A single-car read may declare `tags: ['car-7', 'car-list']` — that one key
  belongs to its record group and the collection group at once.

### Two invalidation mechanisms, one call

`invalidateTags(tags)` drives **two independent channels** — this split is the crux of correctness:

|                        | Channel A — `eventEmitter`                                          | Channel B — `tagToFetchKeysMap`                                          |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Purpose**            | refresh readers **currently mounted**                               | evict cache for readers **not mounted**                                  |
| **How**                | reader subscribed each tag on mount → `emit(tag)` fires its refresh | delete every fetchKey linked to the tag from `promiseCacheStore`         |
| **If it were missing** | a visible list would keep showing old data                          | an unmounted screen would re-mount later onto a **stale cached promise** |

Channel A keeps live UI correct _now_; Channel B keeps the cache correct for _later_. A write needs both,
which is why `invalidateTags` both deletes keys **and** emits.

### The two write-side methods

Only new promises should overwrite the cache; tag links must be registered in **both** the fresh-fetch and the cache-hit path. Hence two methods on `fetchClient`:

- **`cachePromiseAndRegisterTags(fetchKey, promise, tags?)`** — store a _new_ promise **and** register its tags.
  Used on a cache **miss** or a **refresh**.
- **`registerTags(fetchKey, tags?)`** — register tags **without** touching the cached promise.
  Used on a cache **hit** (e.g. a key warmed by [`prefetch`](../architecture/PREFETCH-FLOW.md)), so a reader
  that reuses an existing promise still enters its tags into the index. Skipping this would leave that key
  unreachable by Channel B — a stale-cache-on-next-mount bug.

---

## Notes

- **Tags are matched by exact string.** There is no hierarchy or wildcard; `'car-list'` does not imply
  `'car-7'`. Overlap is achieved only by a read carrying **multiple** tags.
- **Tag strings must not contain commas.** Reads join their tags into a single key with `,`, so a comma in a
  tag would split it. (This is why a read with no tags degenerates to `['']`, which the index ignores.)
- **A rejected read stays cached.** Invalidation clears entries by tag; to force a single failed key to
  refetch outside the tag system, use `fetchClient.remove(fetchKey)`.

**See also:** [USE-MUTATION-FN-FLOW](../architecture/USE-MUTATION-FN-FLOW.md) (what emits invalidation) ·
[USE-FETCH-FLOW](../architecture/USE-FETCH-FLOW.md) / [USE-FETCH-FN-FLOW](../architecture/USE-FETCH-FN-FLOW.md)
(how a read subscribes) · [PREFETCH-FLOW](../architecture/PREFETCH-FLOW.md) (warming a key before mount).
