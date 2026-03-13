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

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...config.headers,
    ...options.headers,
  };

  try {
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: 'Unknown server error', error: 'UNKNOWN' };
      }

      const apiError = new ApiError(
        errorData.message,
        errorData.error,
        response.status
      );

      // Resolve effective status-code mappings with default values
      const unauthorizedStatusCodes =
        config.unauthorizedStatusCodes && config.unauthorizedStatusCodes.length > 0
          ? config.unauthorizedStatusCodes
          : [401];

      const forbiddenStatusCodes =
        config.forbiddenStatusCodes && config.forbiddenStatusCodes.length > 0
          ? config.forbiddenStatusCodes
          : [403];

      // Trigger interceptors based on configured status codes
      if (
        config.interceptors?.onUnauthorized &&
        unauthorizedStatusCodes.includes(response.status)
      ) {
        config.interceptors.onUnauthorized(apiError);
      } else if (
        config.interceptors?.onForbidden &&
        forbiddenStatusCodes.includes(response.status)
      ) {
        config.interceptors.onForbidden(apiError);
      } else if (config.interceptors?.onError) {
        config.interceptors.onError(apiError);
      }

      throw apiError;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      'NETWORK_ERROR',
      520
    );
  }
}
