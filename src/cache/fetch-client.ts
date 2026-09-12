import { promiseCacheStore } from './promise-cache-store';
import { eventEmitter } from './event-emitter';

class FetchClient {
  private tagToFetchKeysMap = new Map<string, Set<string>>();

  /**
   * Registers the tag-to-`fetchKey` links without touching the cached Promise.
   *
   * @param fetchKey - The key under which this request's Promise is cached.
   * @param tags - Tags to associate with this fetch key.
   */
  registerTags(fetchKey: string, tags?: string[]) {
    if (!tags) return;

    tags.forEach((tag) => {
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
   * Caches the Promise under `fetchKey` and registers its `tags`.
   *
   * A no-op rejection handler is attached as the Promise enters the cache, so a rejection
   * nothing ends up reading is not reported as an unhandled rejection.
   *
   * @param fetchKey - The key under which this request's Promise is cached.
   * @param promise - The Promise to cache.
   * @param tags - Tags to associate with this fetch key, used for invalidation.
   */
  cachePromiseAndRegisterTags(fetchKey: string, promise: Promise<unknown>, tags?: string[]) {
    void promise.catch(() => {});

    promiseCacheStore.set(fetchKey, promise);
    this.registerTags(fetchKey, tags);
  }

  /**
   * Clears every cached Promise whose fetch key is associated with those tags, then emits an
   * event per tag so mounted hooks refresh.
   *
   * @param tags - The tags to invalidate.
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
   * Removes a single `fetchKey` from the Promise cache without emitting any events.
   * Use this to clear a rejected Promise so the next render starts a fresh fetch.
   *
   * @param fetchKey - The `fetchKey` passed to `useFetch` / `prefetch`.
   */
  remove(fetchKey: string) {
    promiseCacheStore.delete(fetchKey);
  }

  /**
   * Clears every cached Promise and the whole tag-to-fetchKey map.
   */
  clear() {
    promiseCacheStore.clear();
    this.tagToFetchKeysMap.clear();
  }
}

export const fetchClient = new FetchClient();
