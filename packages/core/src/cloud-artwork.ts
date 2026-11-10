import type { ReviewScope, ReviewVersion } from "./private-cloud-types";
export const ARTWORK_LIMITS = {
  pngBytes: 512 * 1024,
  edge: 1024,
  pixels: 1048576,
  items: 100,
  scopeBytes: 16 * 1024 * 1024,
  folders: 20,
  globalItems: 500,
  globalBytes: 64 * 1024 * 1024,
  globalFolders: 100,
  inviteItems: 200,
  inviteBytes: 32 * 1024 * 1024,
  libraries: 50,
  inviteLibraries: 20,
  grants: 200,
  accountGrants: 8,
  cancellations: 200,
  accountCancellations: 32,
  uploadAccountDay: 10,
  uploadScopeDay: 20,
  uploadGlobalDay: 50,
  downloadAccountDay: 100,
  requestsHour: 120,
  retentionDays: 180,
} as const;
export type ArtworkFolder = { id: string; name: string };
export type ArtworkItem = {
  id: string;
  name: string;
  folder: string | null;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  savedAt: number;
};
export type ArtworkSnapshot = ReviewVersion & {
  scope: ReviewScope;
  folders: ArtworkFolder[];
  items: ArtworkItem[];
  usage: { items: number; bytes: number; pending: number; cleanup: number };
};
export const artworkId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
export function artworkName(v: unknown, max = 100): string {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[\u0000-\u001f\u007f]/.test(v)
  )
    throw new Error(`Choose a name with 1–${max} characters.`);
  return v.trim();
}
export function readArtworkSnapshot(value: unknown): ArtworkSnapshot {
  const v = value as ArtworkSnapshot;
  if (
    !v ||
    !artworkId(v.generation) ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 0 ||
    !v.scope ||
    !["personal", "group"].includes(v.scope.kind) ||
    typeof v.scope.id !== "string" ||
    !/^[1-9]\d{0,19}$/.test(v.scope.id) ||
    artworkName(v.scope.label) !== v.scope.label ||
    !Array.isArray(v.folders) ||
    v.folders.length > ARTWORK_LIMITS.folders ||
    !Array.isArray(v.items) ||
    v.items.length > ARTWORK_LIMITS.items ||
    !v.usage ||
    [v.usage.items, v.usage.bytes, v.usage.pending, v.usage.cleanup].some(
      (n) => !Number.isSafeInteger(n) || n < 0,
    ) ||
    v.usage.items > ARTWORK_LIMITS.items ||
    v.usage.bytes > ARTWORK_LIMITS.scopeBytes
  )
    throw new Error("The artwork service returned an invalid library.");
  const ids = new Set<string>();
  const folders = v.folders.map((f) => {
    if (!artworkId(f.id) || ids.has(f.id))
      throw new Error("Invalid artwork folder.");
    ids.add(f.id);
    return { id: f.id, name: artworkName(f.name, 64) };
  });
  const imageIds = new Set<string>();
  const items = v.items.map((i) => {
    if (
      !artworkId(i.id) ||
      imageIds.has(i.id) ||
      (i.folder !== null && !ids.has(i.folder)) ||
      typeof i.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(i.sha256) ||
      !Number.isSafeInteger(i.bytes) ||
      i.bytes < 45 ||
      i.bytes > ARTWORK_LIMITS.pngBytes ||
      !Number.isSafeInteger(i.width) ||
      !Number.isSafeInteger(i.height) ||
      i.width < 1 ||
      i.height < 1 ||
      i.width > ARTWORK_LIMITS.edge ||
      i.height > ARTWORK_LIMITS.edge ||
      i.width * i.height > ARTWORK_LIMITS.pixels ||
      !Number.isSafeInteger(i.savedAt) ||
      i.savedAt < 0
    )
      throw new Error("Invalid cloud artwork item.");
    imageIds.add(i.id);
    return {
      id: i.id,
      name: artworkName(i.name),
      folder: i.folder,
      sha256: i.sha256,
      bytes: i.bytes,
      width: i.width,
      height: i.height,
      savedAt: i.savedAt,
    };
  });
  if (
    items.length + v.usage.pending + v.usage.cleanup !== v.usage.items ||
    items.reduce((sum, i) => sum + i.bytes, 0) > v.usage.bytes
  )
    throw new Error("Invalid cloud artwork usage.");
  return {
    generation: v.generation,
    revision: v.revision,
    scope: { kind: v.scope.kind, id: v.scope.id, label: v.scope.label },
    folders,
    items,
    usage: {
      items: v.usage.items,
      bytes: v.usage.bytes,
      pending: v.usage.pending,
      cleanup: v.usage.cleanup,
    },
  };
}
