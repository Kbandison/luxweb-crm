/**
 * Supabase typing returns embedded relations as `T | T[]` because the
 * supabase-js type inference can't always prove which it'll be at compile
 * time (a `!inner` join on a single-row FK is still typed as a union).
 *
 * Callers repeatedly write:
 *
 *     const c = flattenJoin(r.contacts);
 *
 * This helper makes it a one-liner. Returns the single row when the
 * relation is an array, or the value itself otherwise.
 */
export function flattenJoin<T>(value: T | T[]): T {
  return Array.isArray(value) ? (value[0] as T) : value;
}
