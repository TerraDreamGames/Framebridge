/** Upload metadata only; keep the design's layer and instance names intact. */
export function robloxAssetName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  let result = "",
    bytes = 0;
  // A conservative 50-byte bound also fits a 50-character limit. Iterate whole
  // Unicode code points so a cut never leaves half an emoji or UTF-8 sequence.
  for (let character of cleaned) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) character = "\ufffd";
    const length =
      point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + length > 50) break;
    result += character;
    bytes += length;
  }
  return result.replace(/[\u200c\u200d]/g, "").trim()
    ? result.trim()
    : "Framebridge artwork";
}
