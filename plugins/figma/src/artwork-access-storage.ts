import {
  readSavedReviewSync,
  type SavedReviewSync,
} from "./review-sync-storage";
export const ARTWORK_ACCESS_KEY = "framebridge-artwork-access-v1";
export type SavedArtworkAccess = SavedReviewSync & { pending?: true };
/** A proposed private capability survives a lost connect response without minting another grant. */
export function readArtworkAccess(
  raw: unknown,
  origin?: string,
  userId?: string,
): SavedArtworkAccess | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const { pending, ...base } = raw as SavedArtworkAccess;
  if (pending !== undefined && pending !== true) return;
  const clean = readSavedReviewSync(base, origin, userId);
  return clean
    ? { ...clean, ...(pending === true ? { pending: true as const } : {}) }
    : undefined;
}
