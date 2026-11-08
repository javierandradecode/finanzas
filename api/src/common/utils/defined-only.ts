/**
 * Returns a copy of `obj` without keys whose value is `undefined`.
 * Validated DTO instances carry every declared field (as `undefined` when the
 * client omitted it), so assigning them straight onto a document would erase data.
 */
export function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
