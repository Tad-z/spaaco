/**
 * Every value at a dotted path, flattening arrays on the way: `coAuthors.photo`
 * on `{ coAuthors: [{ photo: a }, { photo: b }] }` is `[a, b]`, as MongoDB
 * reads the same path. A leaf array (a carousel's ids) is flattened too, and a
 * missing step yields nothing.
 */
export function valuesAt(doc: unknown, path: string): unknown[] {
  let current: unknown[] = [doc];

  for (const segment of path.split('.')) {
    current = current
      .flatMap((value) => (Array.isArray(value) ? (value as unknown[]) : [value]))
      .filter(
        (value): value is Record<string, unknown> => typeof value === 'object' && value !== null
      )
      .map((value) => value[segment]);
  }

  return current.flatMap((value) => (Array.isArray(value) ? (value as unknown[]) : [value]));
}
