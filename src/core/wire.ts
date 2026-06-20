import { HttpResponse, WireRequestInit } from "../interface";
import { ApiError } from "../util/api-error";
import { getWireConfig } from "./config";

/**
 * Sends an API request and returns the response.
 * @param endpoint - The API endpoint to call. Example: '/api/v1/users'.
 * @param options - The request options: a `RequestInit` plus optional fetchwire flags
 *   (e.g. `skipToken` to send the request without an `Authorization` header).
 */
export async function wireApi<T>(
  endpoint: string,
  options: WireRequestInit = {},
): Promise<HttpResponse<T>> {
  // Split fetchwire-specific flags off so only standard RequestInit reaches fetch/onRequest.
  const { skipToken, ...requestInit } = options;
  const config = getWireConfig();
  const url = `${config.baseUrl}${endpoint}`;
  // `skipToken` requests never touch getToken — this is what lets the token-refresh call
  // itself go through wireApi without recursing into the refresh it is performing.
  const accessToken = skipToken ? null : await config.getToken();

  const isFormData = requestInit.body instanceof FormData;
  const headers = new Headers({
    ...config.headers,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...requestInit.headers,
  });
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Build ONE request object and share its reference with both the interceptor and fetch.
  // ---
  // Why use a shared variable instead of spreading inline at each function:
  // `onRequest` lets callers mutate the request before it is sent (e.g. add a header).
  // Mutation only works if the interceptor and fetch point to the SAME object.
  // Spreading `{ ...options, headers }` at each function (onRequest, fetch)
  // would create a separate object per call, so the interceptor would mutate one object
  // while fetch sends a different one — the change would be silently lost.
  const finalRequestConfig: RequestInit = {
    ...requestInit,
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
        errorResponseJson = {
          message: "Unknown server error",
          error: "UNKNOWN",
        };
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
            response.status,
        );
      }

      // Notify the single global error sink for every non-OK response.
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
      message: jsonResponse.message ?? "",
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error ? error.message : "Network error",
      "NETWORK_ERROR",
      520,
    );
  }
}
