/** Shared design/session bounds. Daily hosting quotas are configured separately. */
export const IMAGE_BATCH_LIMITS = {
  unique: 1000,
  references: 10000,
  pngBytes: 20_000_000,
  analysisBytes: 64 * 1024 * 1024,
  concurrency: 2,
  previewBytes: 16 * 1024 * 1024,
};
/** Bounded transient render retention; eviction only removes an optimization. */
export function createRenderCache<T extends { bytes: Uint8Array }>(
  maximumEntries = IMAGE_BATCH_LIMITS.unique,
) {
  if (
    !Number.isInteger(maximumEntries) ||
    maximumEntries < 1 ||
    maximumEntries > IMAGE_BATCH_LIMITS.references * 2
  )
    throw new Error("Invalid render cache capacity.");
  const entries = new Map<string, T>();
  const references = new Map<Uint8Array, number>();
  let bytes = 0;
  const remove = (key: string) => {
    const value = entries.get(key)!;
    entries.delete(key);
    const count = references.get(value.bytes)!;
    if (count === 1) {
      references.delete(value.bytes);
      bytes -= value.bytes.length;
    } else references.set(value.bytes, count - 1);
  };
  return {
    get: (key: string) => entries.get(key),
    set(key: string, value: T) {
      const old = entries.get(key);
      if (old) remove(key);
      if (value.bytes.length > IMAGE_BATCH_LIMITS.analysisBytes) return;
      while (
        entries.size >= maximumEntries ||
        bytes + (references.has(value.bytes) ? 0 : value.bytes.length) >
          IMAGE_BATCH_LIMITS.analysisBytes
      ) {
        const key = entries.keys().next().value!;
        remove(key);
      }
      entries.set(key, value);
      const count = references.get(value.bytes) ?? 0;
      references.set(value.bytes, count + 1);
      if (!count) bytes += value.bytes.length;
    },
    entries: () => entries.entries(),
    usage: () => ({ entries: entries.size, bytes }),
  };
}
/** Exact byte pooling, with collision checks; also runs in Figma's ES-only sandbox. */
export function createArtworkPool() {
  const buckets = new Map<string, { bytes: Uint8Array; array: number[] }[]>();
  let count = 0,
    total = 0;
  return {
    add(bytes: Uint8Array) {
      if (!bytes.length || bytes.length > IMAGE_BATCH_LIMITS.pngBytes)
        throw new Error(
          "Each rendered PNG must be smaller than 20 MB. Reduce image resolution.",
        );
      let hash = 2166136261;
      for (const value of bytes) hash = Math.imul(hash ^ value, 16777619) >>> 0;
      const key = bytes.length + ":" + hash,
        bucket = buckets.get(key) ?? [];
      const same = bucket.find((entry) =>
        entry.bytes.every((value, index) => value === bytes[index]),
      );
      if (same) return same.array;
      if (count >= IMAGE_BATCH_LIMITS.unique)
        throw new Error(
          "This design exceeds 1,000 unique rendered images. Export smaller sections.",
        );
      if (total + bytes.length > IMAGE_BATCH_LIMITS.analysisBytes)
        throw new Error(
          "Rendered artwork exceeds 64 MiB. Reduce image resolution or export smaller sections.",
        );
      const entry = { bytes, array: Array.from(bytes) };
      bucket.push(entry);
      buckets.set(key, bucket);
      count++;
      total += bytes.length;
      return entry.array;
    },
    usage: () => ({ unique: count, bytes: total }),
  };
}
