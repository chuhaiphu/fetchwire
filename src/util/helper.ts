import { HttpResponse } from '../interface';

/**
 * Extracts the payload value from either:
 * - a full `HttpResponse<T>` envelope (`{ data, message, status }`), or
 * - a raw payload value `T`.
 *
 * This keeps `useFetch` flexible so callers can return either `wireApi(...)`
 * style responses or plain data values.
 *
 * @param res - The response value returned by a fetch function.
 * @returns The normalized payload of type `T`.
 */
export function extractHttpResponseData<T>(res: HttpResponse<T> | T) {
  // Check if res has the shape of HttpResponse<T>
  if (
    res !== null &&
    typeof res === 'object' &&
    'data' in res &&
    'message' in res &&
    'status' in res
  ) {
    return res.data as T;
  }

  // If any of the required fields are missing, assume it's the raw data type T
  return res as T;
}
