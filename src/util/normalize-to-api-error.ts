import { ApiError } from "./api-error";

/**
 * Normalizes an unknown thrown value into a real `ApiError`.
 *
 * @param error - The value caught in a `catch` block.
 * @param fallbackErrorCode - `errorCode` for the new `ApiError`, used only when `error` is
 *   not already one.
 * @param fallbackStatusCode - `statusCode` for the new `ApiError`, used only when `error` is
 *   not already one.
 * @returns `error` itself when it already is an `ApiError`, otherwise a new `ApiError`
 *   carrying whatever message could be recovered.
 */
export function normalizeToApiError(
  error: unknown,
  fallbackErrorCode = "UNKNOWN_ERROR",
  fallbackStatusCode?: number,
): ApiError {
  // Return it untouched so a genuine errorCode/statusCode — set by wireRaw or by the
  // consumer's own transformError — is never overwritten by the fallbacks.
  if (error instanceof ApiError) return error;

  // Recover a message without assuming a shape: `throw new Error(...)` and `throw 'string'`
  // are both ordinary JavaScript, and neither one is an ApiError.
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string" && error
        ? error
        : "Unknown error";

  return new ApiError(message, fallbackErrorCode, fallbackStatusCode);
}
