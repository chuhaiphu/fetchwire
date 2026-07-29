import { promiseCacheStore } from "./promise-cache-store";
import { eventEmitter } from "./event-emitter";

class FetchClient {
  // Why do we need this?
  // 1. When a mutation occurs, we emit events to trigger refresh on useFetch and useFetchFn hooks based on tags.
  // 2. But that only happens when the component is already mounted,
  // 3. If the component is not mounted when the mutation occurs,
  // 4. the refresh event will be missed and the fetch key in promise cache store will not be cleared,
  // 5. and the data will be stale with the old promise result.
  // 6. Then when the component is mounted later, it will get the stale data.
  // So when we invalidate tags, we need to clear all the promises that has fetch keys associated with tags.

  // A map to track the relationship between tags and fetch keys for invalidation
  // One tag can be associated with a Set of fetch keys
  private tagToFetchKeysMap = new Map<string, Set<string>>();

  /**
   * Register all the tags to `fetchKey` links WITHOUT touching the cached Promise.
   *
   * @param fetchKey - The key under which this request's Promise is cached.
   * @param tags - Optional array of tags to associate with this fetch key.
   */
  registerTags(fetchKey: string, tags?: string[]) {
    if (!tags) return;

    tags.forEach((tag) => {
      // Skip empty tag keys
      if (!tag) return;

      let associatedFetchKeys = this.tagToFetchKeysMap.get(tag);
      if (!associatedFetchKeys) {
        associatedFetchKeys = new Set();
        this.tagToFetchKeysMap.set(tag, associatedFetchKeys);
      }
      associatedFetchKeys.add(fetchKey);
    });
  }

  /**
   * Cache the Promise under `fetchKey` AND register its `tags`.
   *
   * @param fetchKey - The key under which this request's Promise is cached.
   * @param promise - The Promise to cache.
   * @param tags - Optional array of tags associated with this fetch key, used for invalidation.
   */
  cachePromiseAndRegisterTags(
    fetchKey: string,
    promise: Promise<unknown>,
    tags?: string[],
  ) {
    // Why do we need this?
    // 1. A cached promise is meant to be READ by React's `use(promise)` during render.
    //    that read is what throws a rejection to the nearest <ErrorBoundary>.
    // 2. But a refresh triggered by a tag event creates the promise OUTSIDE render,
    //    it only schedules a re-render to read it on the next pass.
    // 3. If the reader unmounts before that re-render runs
    //    — e.g. it navigates away right after firing the mutation that invalidated the tag — 
    //    `use()` will never able to reads the promise, so nothing consumes the rejection.
    // 4. A rejected promise with no handler is reported as an "Unhandled promise rejection".
    //
    // What this line does:
    // `promise.catch(() => {})` registers a rejection handler on the promise we are about to cache.
    // It runs once, synchronously, every time a promise enters the cache.
    void promise.catch(() => {});

    promiseCacheStore.set(fetchKey, promise);
    this.registerTags(fetchKey, tags);
  }

  /**
   * Clears every Promise in the Promise cache whose fetch key is associated with those tags.
   * It also emits events to trigger a refresh on mounted components.
   * @param tags - An array of tags to be invalidated.
   */
  invalidateTags(tags: string[]) {
    tags.forEach((tag) => {
      if (!tag) return;

      const associatedFetchKeys = this.tagToFetchKeysMap.get(tag);
      if (associatedFetchKeys) {
        associatedFetchKeys.forEach((key) => promiseCacheStore.delete(key));
        this.tagToFetchKeysMap.delete(tag);
      }
      eventEmitter.emit(tag);
    });
  }

  /**
   * Remove a single fetchKey from the Promise cache without emitting any events.
   * Use this to clear a rejected Promise so the next render initiates a fresh fetch.
   * @param fetchKey - The fetchKey passed to `useFetch` / `prefetch`.
   */
  remove(fetchKey: string) {
    promiseCacheStore.delete(fetchKey);
  }

  /**
   * Clear every Promise in the Promise cache and the tag-to-fetchKey map.
   */
  clear() {
    promiseCacheStore.clear();
    this.tagToFetchKeysMap.clear();
  }
}

export const fetchClient = new FetchClient();
