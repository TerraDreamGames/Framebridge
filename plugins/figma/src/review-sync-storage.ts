import { relayOrigin } from "./roblox-account-storage";
export const REVIEW_SYNC_KEY = "framebridge-review-sync-v1";
export type SavedReviewSync = {
  version: 1;
  origin: string;
  userId: string;
  grantToken: string;
  scope: { kind: "personal" | "group"; id: string; label: string };
};
export function readSavedReviewSync(
  raw: unknown,
  origin?: string,
  userId?: string,
): SavedReviewSync | undefined {
  const v = raw as SavedReviewSync;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some(
      (k) =>
        !["version", "origin", "userId", "grantToken", "scope"].includes(k),
    ) ||
    v.version !== 1 ||
    typeof v.origin !== "string" ||
    v.origin.length > 256 ||
    !relayOrigin(v.origin) ||
    (origin !== undefined && v.origin !== origin) ||
    (userId !== undefined && v.userId !== userId) ||
    typeof v.userId !== "string" ||
    !/^[1-9]\d{0,19}$/.test(v.userId) ||
    typeof v.grantToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.grantToken) ||
    !v.scope ||
    Object.keys(v.scope).some((k) => !["kind", "id", "label"].includes(k)) ||
    !["personal", "group"].includes(v.scope.kind) ||
    typeof v.scope.id !== "string" ||
    !/^[1-9]\d{0,19}$/.test(v.scope.id) ||
    typeof v.scope.label !== "string" ||
    !v.scope.label ||
    v.scope.label.length > 100
  )
    return;
  return {
    version: 1,
    origin: v.origin,
    userId: v.userId,
    grantToken: v.grantToken,
    scope: { ...v.scope },
  };
}
