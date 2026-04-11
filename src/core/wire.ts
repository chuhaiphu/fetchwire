import { HttpResponse } from '../interface';
import { ApiError } from '../util/api-error';
import { getWireConfig } from './config';

/**
 * Sends an API request and returns the response.
 * @param endpoint - The API endpoint to call. Example: '/api/v1/users'.
 * @param options - The request options is a RequestInit object.
 */
export async function wireApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<HttpResponse<T>> {
  const config = getWireConfig();
  const url = `${config.baseUrl}${endpoint}`;
  const accessToken = await config.getToken();

  const isFormData = options.body instanceof FormData;
  const headers = new Headers({
    ...config.headers,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...options.headers,
  });
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Build the final RequestInit object to allow interceptors to modify it before the request is sent.
  // ---
  // If we pass original ({...options, headers}) directly to function onRequest, fetch, etc.,
  // A brand new RequestInit object will be created each time we spread options,
  // Thus make any modification in the interceptor (e.g. adding a header) not work as expected because the modified RequestInit object is not used in the fetch function.
  const finalRequestConfig: RequestInit = {
    ...options,
    headers,
  };

  try {
    if (config.interceptors?.onRequest) {
      await config.interceptors.onRequest(url, finalRequestConfig);
    }
    const response = await fetch(url, finalRequestConfig);

    if (config.interceptors?.onResponse) {
      await config.interceptors.onResponse(url, response);
    }

    if (!response.ok) {
      let errorResponseJson;
      try {
        errorResponseJson = await response.json();
      } catch {
        errorResponseJson = { message: 'Unknown server error', error: 'UNKNOWN' };
      }

      let apiError: ApiError;

      if (config.transformError) {
        // Preserve the ApiError instance returned by transformError.
        apiError = config.transformError(errorResponseJson);
        if (apiError.statusCode == null) {
          apiError.statusCode = response.status;
        }
      } else {
        apiError = new ApiError(
          errorResponseJson.message,
          errorResponseJson.error,
          errorResponseJson.statusCode ??
            errorResponseJson.status ??
            response.status
        );
      }

      // Resolve effective status-code mappings with default values
      const unauthorizedStatusCodes =
        config.unauthorizedStatusCodes && config.unauthorizedStatusCodes.length > 0
          ? config.unauthorizedStatusCodes
          : [401];

      const forbiddenStatusCodes =
        config.forbiddenStatusCodes && config.forbiddenStatusCodes.length > 0
          ? config.forbiddenStatusCodes
          : [403];

      // Trigger interceptors based on configured status codes.
      // Cascade behavior: specific handlers (onUnauthorized / onForbidden) fire
      // first, then onError always fires for every non-OK response.
      if (unauthorizedStatusCodes.includes(response.status)) {
        await config.interceptors?.onUnauthorized?.(apiError);
      } else if (forbiddenStatusCodes.includes(response.status)) {
        await config.interceptors?.onForbidden?.(apiError);
      }
      await config.interceptors?.onError?.(apiError);

      throw apiError;
    }

    const textResponse = await response.text();
    // If the response has no content, return an empty object to avoid JSON parsing errors.
    const jsonResponse = textResponse ? JSON.parse(textResponse) : {};
    if (config.transformResponse) {
      return config.transformResponse(jsonResponse) as HttpResponse<T>;
    }

    return {
      data: jsonResponse.data ?? jsonResponse,
      status: jsonResponse.status ?? jsonResponse.statusCode ?? response.status,
      message: jsonResponse.message ?? '',
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      'NETWORK_ERROR',
      520
    );
  }
}
