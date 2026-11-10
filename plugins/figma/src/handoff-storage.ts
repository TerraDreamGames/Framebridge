export const HANDOFF_STORAGE_KEY = "framebridge.privateHandoffs.v1";
export type SavedHandoff = {
  origin: string;
  ownerToken: string;
  name: string;
  expiresAt: number;
  code?: string;
};
export function readHandoffs(raw: unknown, now = Date.now()): SavedHandoff[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 20)
    throw new Error("Invalid saved design codes.");
  const result: SavedHandoff[] = [],
    seen = new Set<string>();
  for (const record of raw) {
    if (
      !record ||
      typeof record !== "object" ||
      Object.keys(record).some(
        (key) =>
          !["origin", "ownerToken", "name", "expiresAt", "code"].includes(key),
      ) ||
      typeof record.origin !== "string" ||
      !/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)(:|\/|$))/.test(
        record.origin,
      ) ||
      record.origin.length > 2048 ||
      typeof record.ownerToken !== "string" ||
      !/^[a-f0-9]{64}$/.test(record.ownerToken) ||
      typeof record.name !== "string" ||
      record.name.length > 1000 ||
      !Number.isFinite(record.expiresAt) ||
      (record.code !== undefined &&
        (typeof record.code !== "string" ||
          !/^FB-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/.test(record.code)))
    )
      throw new Error("Invalid saved design codes.");
    // A pending attempt has no authoritative server expiry yet: image preparation
    // can take time, and the creation response may be lost. Keep its bounded
    // management record until Check status resolves or removes it.
    if ((record.code && record.expiresAt <= now) || seen.has(record.ownerToken))
      continue;
    seen.add(record.ownerToken);
    result.push({ ...record });
  }
  return result;
}
