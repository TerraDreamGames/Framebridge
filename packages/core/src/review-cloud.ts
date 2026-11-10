import {
  readReviewPreferences,
  type ReviewPreferences,
} from "./structure-review";
import type { ReviewScope, ReviewVersion } from "./private-cloud-types";
export type { ReviewScope, ReviewVersion } from "./private-cloud-types";
export const REVIEW_CLOUD_LIMITS = {
  bytes: 32768,
  profiles: 100,
  perInvite: 30,
  grants: 200,
  perAccount: 8,
  days: 180,
} as const;
export type ReviewSnapshot = ReviewVersion & {
  scope: ReviewScope;
  updatedAt: number;
  preferences: ReviewPreferences;
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (object(v))
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
};
/** Cloud accepts only the exact typed preference schema, never source/package data. */
export function validateCloudPreferences(value: unknown): ReviewPreferences {
  if (
    !object(value) ||
    value.version !== 1 ||
    typeof value.enabled !== "boolean" ||
    !Array.isArray(value.rules) ||
    value.rules.length > 200 ||
    new TextEncoder().encode(JSON.stringify(value)).length >
      REVIEW_CLOUD_LIMITS.bytes
  )
    throw new Error(
      "Preferences exceed their limits or have an invalid schema.",
    );
  const clean = readReviewPreferences(value);
  if (canonical(value) !== canonical(clean))
    throw new Error(
      "Only typed review choices, hints and naming preferences can be synced.",
    );
  return clean;
}
export function validReviewVersion(v: unknown): v is ReviewVersion {
  return (
    object(v) &&
    Object.keys(v).every((k) => ["generation", "revision"].includes(k)) &&
    typeof v.generation === "string" &&
    /^[a-f0-9]{32}$/.test(v.generation) &&
    Number.isSafeInteger(v.revision) &&
    Number(v.revision) >= 0
  );
}
export const reviewVersion = (snapshot: ReviewVersion): ReviewVersion => ({
  generation: snapshot.generation,
  revision: snapshot.revision,
});
export function readReviewSnapshot(value: unknown): ReviewSnapshot {
  if (
    !object(value) ||
    !validReviewVersion({
      generation: value.generation,
      revision: value.revision,
    }) ||
    !object(value.scope) ||
    !["personal", "group"].includes(String(value.scope.kind)) ||
    typeof value.scope.id !== "string" ||
    !/^[1-9]\d{0,19}$/.test(value.scope.id) ||
    typeof value.scope.label !== "string" ||
    !value.scope.label ||
    value.scope.label.length > 100 ||
    !Number.isSafeInteger(value.updatedAt) ||
    Number(value.updatedAt) < 0
  )
    throw new Error("The preference service returned an invalid record.");
  return {
    generation: value.generation as string,
    revision: Number(value.revision),
    updatedAt: Number(value.updatedAt),
    scope: {
      kind: value.scope.kind as ReviewScope["kind"],
      id: value.scope.id,
      label: value.scope.label,
    },
    preferences: validateCloudPreferences(value.preferences),
  };
}
