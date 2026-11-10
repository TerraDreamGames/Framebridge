/** Bounded work; let started jobs settle so their cleanup/partial results survive failures. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0,
    failed = false,
    failure: unknown;
  const worker = async () => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await work(items[index], index);
      } catch (error) {
        failed = true;
        failure ??= error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(items.length, Math.max(1, limit)) }, worker),
  );
  if (failed) throw failure;
  return results;
}
