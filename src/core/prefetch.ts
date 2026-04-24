import { FetchOptions, HttpResponse } from '../interface';
import { extractHttpResponseData } from '../util/helper';
import { fetchClient } from './fetch-client';
import { promiseCacheStore } from './promise-cache-store';

export function prefetch<T>(
  fetchFn: () => Promise<HttpResponse<T> | T>,
  options: FetchOptions
) {
  // If the promise is already in the cacheMap, return it
  if (promiseCacheStore.has(options.fetchKey)) {
    return promiseCacheStore.get(options.fetchKey);
  }

  // Otherwise, execute the fetch function and store in the cacheMap then return it
  const promise = fetchFn().then((res) => extractHttpResponseData(res));
  fetchClient.setFetchKeyToTags(options.fetchKey, promise, options?.tags);
  return promise;
}
