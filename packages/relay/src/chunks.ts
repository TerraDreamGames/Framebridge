/** SQLite encodes each string independently as UTF-8. Keep surrogate pairs
 * together so emoji survive chunk storage and reconstruction. */
export function textChunks(raw: string, maximum = 250_000): string[] {
  if (!Number.isInteger(maximum) || maximum < 2)
    throw new Error("Invalid chunk size");
  const chunks: string[] = [];
  for (let start = 0; start < raw.length;) {
    let end = Math.min(start + maximum, raw.length);
    const last = raw.charCodeAt(end - 1),
      next = raw.charCodeAt(end);
    if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff)
      end--;
    chunks.push(raw.slice(start, end));
    start = end;
  }
  return chunks;
}
