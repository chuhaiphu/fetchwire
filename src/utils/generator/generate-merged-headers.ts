/**
 * @param headersInitList - Header sets, lowest precedence first, e.g.
 *   `{ Accept: 'application/json' }`, `undefined`, `{ Accept: 'text/plain' }`. `undefined` is skipped.
 * @returns A new `Headers` in which a later set overrides an earlier one, e.g.
 *   `Headers { accept: 'text/plain' }`.
 *
 * @example
 * generateMergedHeaders({ Accept: 'application/json' }, undefined, { Accept: 'text/plain' });
 * // → Headers { accept: 'text/plain' }  the later set wins
 */
export function generateMergedHeaders(...headersInitList: (HeadersInit | undefined)[]): Headers {
  const mergedHeaders = new Headers();

  for (const headersInit of headersInitList) {
    if (!headersInit) continue;

    new Headers(headersInit).forEach((headerValue, headerKey) => {
      mergedHeaders.set(headerKey, headerValue);
    });
  }

  return mergedHeaders;
}
