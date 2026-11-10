export const IMAGE_PAGE_SIZE = 40;
/** Keep thumbnail decoding and DOM cost bounded while all data remains available. */
export function imagePage<T>(items: readonly T[], requested: number) {
  const pages = Math.max(1, Math.ceil(items.length / IMAGE_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, requested));
  const start = page * IMAGE_PAGE_SIZE;
  return {
    page,
    pages,
    total: items.length,
    start,
    end: Math.min(items.length, start + IMAGE_PAGE_SIZE),
    items: items.slice(start, start + IMAGE_PAGE_SIZE),
  };
}
