import { promiseCacheStore } from './promise-cache-store';
import { eventEmitter } from './event-emitter';

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
   * Set the promise in cache and track the relationship between tags and fetch keys for invalidation
   * @param fetchKey - The unique key for the fetch function, used in promise cache store
   * @param promise - The promise to be stored in the cache
   * @param tags - Optional array of tags associated with this fetch key, used for invalidation
   */
  setFetchKeyToTags(fetchKey: string, promise: Promise<unknown>, tags?: string[]) {
    promiseCacheStore.set(fetchKey, promise);

    if (tags && tags.length > 0) {
      tags.forEach((tag) => {
        let associatedFetchKeys = this.tagToFetchKeysMap.get(tag);
        if (!associatedFetchKeys) {
          associatedFetchKeys = new Set();
          this.tagToFetchKeysMap.set(tag, associatedFetchKeys);
        }
        associatedFetchKeys.add(fetchKey);
      });
    }
  }

  /**
   * Invalidate the tags, which will clear all promises in cache store associated with the fetch keys related to those tags
   * This also emit events to trigger refresh on mounted components.
   * @param tags - An array of tags to be invalidated
   */
  invalidateTags(tags: string[]) {
    tags.forEach((tag) => {
      const associatedFetchKeys = this.tagToFetchKeysMap.get(tag);
      if (associatedFetchKeys) {
        associatedFetchKeys.forEach((key) => promiseCacheStore.delete(key));
        this.tagToFetchKeysMap.delete(tag);
      }
      eventEmitter.emit(tag);
    });
  }

  /**
   * Remove a single fetchKey from the cache without emitting any events.
   * Use this to clear a rejected Promise so the next render initiates a fresh fetch.
   * @param fetchKey - The fetchKey passed to `useFetch` / `prefetch`.
   */
  remove(fetchKey: string) {
    promiseCacheStore.delete(fetchKey);
  }

  /**
   * Clear all the promises in cache store and the tag to fetch keys map.
   */
  clear() {
    promiseCacheStore.clear();
    this.tagToFetchKeysMap.clear();
  }
}

export const fetchClient = new FetchClient();
