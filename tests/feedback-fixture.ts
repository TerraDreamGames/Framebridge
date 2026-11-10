import { createHash } from "node:crypto";
import type { FeedbackReport } from "../packages/core/src/feedback";
import type {
  FeedbackStore,
  FeedbackRecord,
} from "../packages/relay/src/feedback";
export const feedbackReport = (): FeedbackReport => ({
  format: "framebridge-feedback",
  version: 1,
  clientVersion: "0.1.0",
  category: "conversion",
  title: "Grid stops scrolling",
  steps: "Import the grid and resize its parent.",
  expected: "Content stays scrollable.",
  actual: "The final row is clipped.",
});
export const feedbackHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function feedbackMemory() {
  const records = new Map<string, FeedbackRecord>(),
    reports = new Map<string, string>(),
    retired = new Map<string, number>();
  const store: FeedbackStore = {
    owner: (owner) => [...records.values()].find((r) => r.owner === owner),
    find: (id) => records.get(id),
    records: () => [...records.values()],
    usage: (invite) => ({
      count: records.size,
      perInvite: [...records.values()].filter((r) => r.invite === invite)
        .length,
      bytes: [...records.values()].reduce((n, r) => n + r.bytes, 0),
    }),
    save: (r, raw) => {
      records.set(r.id, r);
      reports.set(r.id, raw);
    },
    read: (id) => reports.get(id)!,
    remove: (r) => {
      records.delete(r.id);
      reports.delete(r.id);
      retired.set(r.owner, r.expiresAt);
    },
    retired: (owner) => retired.has(owner),
    retire: (owner, expires) => {
      retired.set(owner, expires);
    },
    pruneRetired: (now) => {
      for (const [id, until] of retired) if (until <= now) retired.delete(id);
    },
  };
  return { store, records, reports, retired };
}
