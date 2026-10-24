/**
 * A `Map`-backed store that caches Promises by string key, in flight or settled.
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
