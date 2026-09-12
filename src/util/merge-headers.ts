/**
 * Merges header sets left to right, so each source overrides the ones before it.
 *
 * @param headersInitList - Header sets, lowest precedence first. `undefined` entries are skipped.
 * @returns A new `Headers`.
 */
export function mergeHeaders(...headersInitList: (HeadersInit | undefined)[]): Headers {
  const mergedHeaders = new Headers();

  for (const headersInit of headersInitList) {
    if (!headersInit) continue;

    new Headers(headersInit).forEach((headerValue, headerKey) => {
      mergedHeaders.set(headerKey, headerValue);
    });
  }

  return mergedHeaders;
}
