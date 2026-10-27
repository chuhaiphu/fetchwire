import { generateTagEventName } from '../generator/generate-tag-event-name.js';
import { eventEmitter } from './event-emitter.js';
import { promiseCacheStore } from './promise-cache-store.js';

class FetchClient {
  /**
   * The key of the Map is a tag, its value is the Set of every `fetchKey` whose read declared that tag.
   *
   * @example
   * // Three reads. Each has one fetchKey, and declares one or more tags:
   * useFetch(getCarList, { fetchKey: "car-list-page-1", tags: ["cars"] });
   * useFetch(() => getCar(7), { fetchKey: "car-detail-7", tags: ["cars", "car-7"] });
   * useFetch(() => getCar(9), { fetchKey: "car-detail-9", tags: ["cars", "car-9"] });
   *
   * // tagToFetchKeysMap after those reads:
   * Map {
   *   // tag   => Set of fetchKeys
   *   "cars"  => Set { "car-list-page-1", "car-detail-7", "car-detail-9" },
   *   "car-7" => Set { "car-detail-7" },
   *   "car-9" => Set { "car-detail-9" }
   * }
   */
  private tagToFetchKeysMap = new Map<string, Set<string>>();

  /**
   * Registers the tag-to-`fetchKey` links without touching the cached Promise.
   *
   * @param fetchKey - The key under which this request's Promise is cached.
   * @param tags - Tags to associate with this `fetchKey`.
   */
  registerTags(fetchKey: string, tags?: string[]) {
    if (!tags) return;

    tags.forEach((tag) => {
      if (!tag) return;

      // Shape:  registerTags("car-detail-9", ["cars", "car-9"]), on tag "cars":
      //         before add: Set { "car-list-page-1", "car-detail-7" }
      //         after add:  Set { "car-list-page-1", "car-detail-7", "car-detail-9" }
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
   * @param tags - Tags to associate with this `fetchKey`, used for invalidation.
   */
  cachePromiseAndRegisterTags(fetchKey: string, promise: Promise<unknown>, tags?: string[]) {
    void promise.catch(() => {});

    promiseCacheStore.set(fetchKey, promise);
    this.registerTags(fetchKey, tags);
  }

  /**
   * Clears every cached Promise whose `fetchKey` is associated with those tags,
   * then emits an event per tag (`generateTagEventName`) so mounted hooks refresh.
   *
   * Every Promise is cleared before the first event.
   *
   * @param tags - The tags to invalidate.
   */
  invalidateTags(tags: string[]) {
    const invalidatedTagList = tags.filter((tag) => !!tag);

    for (const invalidatedTag of invalidatedTagList) {
      // Shape:  invalidateTags(["cars"]), on tag "cars":
      //         Set { "car-list-page-1", "car-detail-7", "car-detail-9" }
      //         → the cached Promises of those three fetchKeys are deleted
      const associatedFetchKeys = this.tagToFetchKeysMap.get(invalidatedTag);
      associatedFetchKeys?.forEach((fetchKey) => promiseCacheStore.delete(fetchKey));
    }

    for (const invalidatedTag of invalidatedTagList) {
      eventEmitter.emit(generateTagEventName(invalidatedTag));
    }
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
   * Clears every cached Promise and the whole tag-to-`fetchKey` map.
   */
  clear() {
    promiseCacheStore.clear();
    this.tagToFetchKeysMap.clear();
  }
}

export const fetchClient = new FetchClient();
