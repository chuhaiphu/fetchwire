/**
 * @example
 * generateTagEventName('todos');
 * // → 'tag:todos'
 */
export function generateTagEventName(tag: string): string {
  return `tag:${tag}`;
}
