/**
 * @example
 * generateFetchKeyEventName('todos');
 * // → 'fetchKey:todos'
 */
export function generateFetchKeyEventName(fetchKey: string): string {
  return `fetchKey:${fetchKey}`;
}
