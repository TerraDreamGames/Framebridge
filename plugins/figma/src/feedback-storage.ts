import {
  normalizeFeedback,
  type FeedbackReport,
} from "../../../packages/core/src/feedback";
import type { FeedbackReceipt } from "../../../packages/core/src/feedback";
export const FEEDBACK_STORAGE_KEY = "framebridge.privateFeedback.v1";
// The same validator runs in Figma's controller, without the browser URL API.
export function feedbackOrigin(value: string) {
  const match = /^(https?):\/\/([a-z0-9.-]+)(?::([1-9]\d{0,4}))?$/.exec(value);
  if (!match || value.length > 256) return false;
  const [, scheme, host, port] = match;
  return (
    host
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    (scheme === "https" || host === "localhost" || host === "127.0.0.1") &&
    (!port ||
      (Number(port) <= 65535 && port !== (scheme === "https" ? "443" : "80")))
  );
}
export type SavedFeedback = {
  origin: string;
  reportToken: string;
  expiresAt: number;
  report?: FeedbackReport;
  receipt?: FeedbackReceipt;
};
export function readFeedbackReceipt(value: unknown): FeedbackReceipt {
  const v = value as FeedbackReceipt;
  if (
    !v ||
    typeof v !== "object" ||
    Object.keys(v).some(
      (k) =>
        !["id", "title", "category", "receivedAt", "expiresAt"].includes(k),
    ) ||
    typeof v.id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      v.id,
    ) ||
    typeof v.title !== "string" ||
    v.title.length < 3 ||
    v.title.length > 120 ||
    !["conversion", "images", "connection", "interface", "other"].includes(
      v.category,
    ) ||
    !Number.isSafeInteger(v.receivedAt) ||
    v.receivedAt <= 0 ||
    !Number.isSafeInteger(v.expiresAt) ||
    v.expiresAt !== v.receivedAt + 14 * 86400000
  )
    throw new Error("Invalid report receipt.");
  return {
    id: v.id,
    title: v.title,
    category: v.category,
    receivedAt: v.receivedAt,
    expiresAt: v.expiresAt,
  };
}
export function readFeedbackRecords(
  value: unknown,
  now = Date.now(),
): SavedFeedback[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 5)
    throw new Error("Invalid saved reports.");
  const seen = new Set<string>(),
    out: SavedFeedback[] = [];
  for (const v of value) {
    if (
      !v ||
      typeof v !== "object" ||
      Object.keys(v).some(
        (k) =>
          !["origin", "reportToken", "expiresAt", "report", "receipt"].includes(
            k,
          ),
      ) ||
      typeof v.origin !== "string" ||
      v.origin.length > 2048 ||
      typeof v.reportToken !== "string" ||
      !/^[a-f0-9]{64}$/.test(v.reportToken) ||
      !Number.isSafeInteger(v.expiresAt) ||
      v.expiresAt <= 0 ||
      !!v.report === !!v.receipt
    )
      throw new Error("Invalid saved reports.");
    if (!feedbackOrigin(v.origin))
      throw new Error("Invalid report service origin.");
    const record: SavedFeedback = {
      origin: v.origin,
      reportToken: v.reportToken,
      expiresAt: v.expiresAt,
      ...(v.report
        ? { report: normalizeFeedback(v.report) }
        : { receipt: readFeedbackReceipt(v.receipt) }),
    };
    if (record.receipt && record.expiresAt !== record.receipt.expiresAt)
      throw new Error("Invalid report expiry.");
    if (record.expiresAt <= now || seen.has(record.reportToken)) continue;
    seen.add(record.reportToken);
    out.push(record);
  }
  return out;
}
