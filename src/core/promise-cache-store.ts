/**
 * A `Map`-backed store that caches in-flight Promises by string key.
 *
 * Used internally by `useFetch` to ensure the same Promise is reused across
 * re-renders during suspension — without this, React would create a new
 * pending Promise on every re-render and the component would suspend
 * indefinitely.
 */
class PromiseCacheStore {
  private cacheMap = new Map<string, Promise<unknown>>();

  /**
   * Returns the cached Promise for the given key, or `undefined` if no entry exists.
   * @param key - The `fetchKey` used when calling `useFetch`.
   */
  get(key: string) {
    return this.cacheMap.get(key);
  }

  /**
   * Stores a Promise under the given key, replacing any existing entry.
   * @param key - The `fetchKey` used when calling `useFetch`.
   * @param promise - The Promise to cache.
   */
  set(key: string, promise: Promise<unknown>) {
    this.cacheMap.set(key, promise);
  }

  /**
   * Returns `true` if a Promise is currently cached for the given key.
   * @param key - The `fetchKey` used when calling `useFetch`.
   */
  has(key: string) {
    return this.cacheMap.has(key);
  }

  /**
   * Removes the cached Promise for the given key.
   *
   * After deletion, the next render of a `useFetch` component with this key
   * will start a fresh fetch from scratch
   *
   * @param key - The `fetchKey` used when calling `useFetch`.
   */
  delete(key: string) {
    this.cacheMap.delete(key);
  }

  /**
   * Removes all cached Promises.
   *
   */
  clear() {
    this.cacheMap.clear();
  }
}
export const promiseCacheStore = new PromiseCacheStore();
