
class PromiseCacheMap {
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

export const promiseCacheMap = new PromiseCacheMap();
