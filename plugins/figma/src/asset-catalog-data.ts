import { validAssetId } from "../../../packages/core/src/geometry";
export const ASSET_CATALOG_KEY = "framebridge-image-library-v1";
export const CATALOG_LIMIT = 1000;
export const CATALOG_BYTES = 2_000_000;
export type AssetOwner = { ownerType: "user" | "group"; ownerId: string };
export type CatalogEntry = {
  owner: string;
  fingerprint: string;
  assetId: string;
  name: string;
  width: number;
  height: number;
  moderation: string;
  savedAt: number;
  thumbnail?: string;
};
export function ownerKey(owner: AssetOwner) {
  return /^(?:[1-9]\d{0,19})$/.test(owner.ownerId)
    ? `${owner.ownerType}:${owner.ownerId}`
    : "";
}
/** Storage contains image references only. No credentials, full artwork or remote URLs. */
export function readCatalog(value: unknown): CatalogEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const records: CatalogEntry[] = [];
  for (const candidate of value.slice(0, 2000)) {
    if (!candidate || typeof candidate !== "object") continue;
    const v = candidate as Record<string, unknown>;
    if (
      typeof v.owner !== "string" ||
      !/^(user|group):[1-9]\d{0,19}$/.test(v.owner) ||
      typeof v.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(v.fingerprint) ||
      typeof v.assetId !== "string" ||
      !validAssetId(v.assetId) ||
      typeof v.savedAt !== "number" ||
      !Number.isFinite(v.savedAt) ||
      v.savedAt < 0 ||
      typeof v.name !== "string" ||
      typeof v.width !== "number" ||
      typeof v.height !== "number" ||
      !Number.isInteger(v.width) ||
      !Number.isInteger(v.height) ||
      v.width < 1 ||
      v.height < 1 ||
      v.width > 4096 ||
      v.height > 4096
    )
      continue;
    const thumbnail =
      typeof v.thumbnail === "string" &&
      /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.thumbnail) &&
      v.thumbnail.length <= 12_000
        ? v.thumbnail
        : undefined;
    records.push({
      owner: v.owner,
      fingerprint: v.fingerprint,
      assetId: validAssetId(v.assetId)!,
      name: v.name.slice(0, 100),
      width: v.width,
      height: v.height,
      moderation:
        v.moderation === "MODERATION_STATE_APPROVED"
          ? v.moderation
          : "MODERATION_STATE_UNKNOWN",
      savedAt: v.savedAt,
      ...(thumbnail ? { thumbnail } : {}),
    });
  }
  // Retain bounded reference metadata first. Optional thumbnails must never evict
  // the confirmed links needed to resume a 1,000-image design on a new session.
  const result: CatalogEntry[] = [],
    previews = new Map<string, string>();
  let bytes = 2;
  for (const entry of records.sort((a, b) => b.savedAt - a.savedAt)) {
    const key = `${entry.owner}:${entry.fingerprint}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { thumbnail, ...reference } = entry,
      size = JSON.stringify(reference).length * 3 + 1;
    if (result.length >= CATALOG_LIMIT || bytes + size > CATALOG_BYTES)
      continue;
    bytes += size;
    result.push(reference);
    if (thumbnail) previews.set(key, thumbnail);
  }
  for (const entry of result) {
    const thumbnail = previews.get(`${entry.owner}:${entry.fingerprint}`);
    if (!thumbnail) continue;
    const size = (thumbnail.length + 16) * 3;
    if (bytes + size <= CATALOG_BYTES) {
      bytes += size;
      entry.thumbnail = thumbnail;
    }
  }
  return result;
}
