/**
 * Merges header sets left to right, so each source overrides the ones before it.
 *
 * @param headersInitList - Header sets, lowest precedence first. `undefined` entries are skipped.
 * @returns A new `Headers`.
 */
export function mergeHeaders(
  ...headersInitList: (HeadersInit | undefined)[]
): Headers {
  const mergedHeaders = new Headers();

  for (const headersInit of headersInitList) {
    // skip sources that were not provided
    if (!headersInit) continue;

    // translate this source into a `Headers`.
    const sourceHeaders = new Headers(headersInit);

    // `set` rather than `append`: this is a defaults-then-overrides merge,
    // a later `Accept: application/xml` replaces an earlier `Accept: application/json`.
    sourceHeaders.forEach((headerValue, headerKey) => {
      mergedHeaders.set(headerKey, headerValue);
    });
  }

  return mergedHeaders;
}
