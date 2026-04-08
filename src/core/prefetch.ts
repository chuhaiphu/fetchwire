import { HttpResponse } from '../interface';
import { extractHttpResponseData } from '../util/helper';
import { promiseCacheMap } from './promise-cache-map';

export function prefetch<T>(
  fetchKey: string,
  fetchFn: () => Promise<HttpResponse<T> | T>
) {
  // If the promise is already in the cacheMap, return it
  if (promiseCacheMap.has(fetchKey)) {
    return promiseCacheMap.get(fetchKey);
  }

  // Otherwise, execute the fetch function and store in the cacheMap then return it
  const promise = fetchFn().then((res) => extractHttpResponseData(res));
  promiseCacheMap.set(fetchKey, promise)
  return promise;
}
