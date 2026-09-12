/**
 * A `Map`-backed store that caches in-flight Promises by string key.
 *
 * Reusing one Promise across renders is what stops `useFetch` from suspending forever: a fresh
 * Promise on every render would suspend, discard the render, and start again.
 */
class PromiseCacheStore {
  private cacheMap = new Map<string, Promise<unknown>>();

  get(key: string) {
    return this.cacheMap.get(key);
  }

  set(key: string, promise: Promise<unknown>) {
    this.cacheMap.set(key, promise);
  }

  has(key: string) {
    return this.cacheMap.has(key);
  }

  delete(key: string) {
    this.cacheMap.delete(key);
  }

  clear() {
    this.cacheMap.clear();
  }
}

export const promiseCacheStore = new PromiseCacheStore();
