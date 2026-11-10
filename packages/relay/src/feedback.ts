import { createHash, randomUUID } from "node:crypto";
import {
  normalizeFeedback,
  FEEDBACK_LIMITS,
  type FeedbackReport,
  type FeedbackReceipt,
} from "../../core/src/feedback";
export type { FeedbackReceipt } from "../../core/src/feedback";
import { PublicError } from "./roblox";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const DAY = 86400000;
export const REPORT_RETENTION = 14 * DAY;
export type FeedbackRecord = FeedbackReceipt & {
  owner: string;
  invite: string;
  fingerprint: string;
  bytes: number;
};
export interface FeedbackStore {
  owner(hash: string): FeedbackRecord | undefined;
  find(id: string): FeedbackRecord | undefined;
  records(): FeedbackRecord[];
  usage(invite: string): { count: number; perInvite: number; bytes: number };
  save(record: FeedbackRecord, raw: string): void;
  read(id: string): string;
  remove(record: FeedbackRecord): void;
  retired(owner: string): boolean;
  retire(owner: string, expires: number): void;
  pruneRetired(now: number): void;
}
const receipt = (r: FeedbackRecord): FeedbackReceipt => ({
  id: r.id,
  title: r.title,
  category: r.category,
  receivedAt: r.receivedAt,
  expiresAt: r.expiresAt,
});
const capability = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new PublicError("Report access is invalid or expired.", 401);
  return hash(value);
};
export class Feedbacks {
  constructor(
    private store: FeedbackStore,
    private deps: {
      now(): number;
      active(invite: string): boolean;
      enabled(): boolean;
      count(scope: string, maximum: number, window: number): void;
      knownSecrets?(): readonly string[];
    },
  ) {}
  config() {
    return {
      available: this.deps.enabled(),
      retentionDays: 14,
      maximumBytes: FEEDBACK_LIMITS.reportBytes,
      screenshotBytes: FEEDBACK_LIMITS.screenshotBytes,
    };
  }
  prune() {
    const now = this.deps.now();
    for (const r of this.store.records())
      if (r.expiresAt <= now || !this.deps.active(r.invite))
        this.store.remove(r);
    this.store.pruneRetired(now);
  }
  create(invite: string, input: unknown) {
    this.prune();
    if (!this.deps.active(invite))
      throw new PublicError("Private beta access required.", 403);
    if (!this.deps.enabled())
      throw new PublicError(
        "Private reports are not enabled on this service. Export the report locally.",
        503,
      );
    const body = input as { reportToken?: unknown; report?: unknown };
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((k) => !["reportToken", "report"].includes(k))
    )
      throw new PublicError("Invalid report request.");
    const owner = capability(body.reportToken);
    let report: FeedbackReport;
    try {
      report = normalizeFeedback(body.report, this.deps.knownSecrets?.());
    } catch (e) {
      throw new PublicError(e instanceof Error ? e.message : "Invalid report.");
    }
    const raw = JSON.stringify(report),
      fingerprint = hash(raw),
      previous = this.store.owner(owner);
    if (this.store.retired(owner))
      throw new PublicError(
        "This report was withdrawn or expired. Start a new report.",
        410,
      );
    if (previous) {
      if (previous.invite !== invite || previous.fingerprint !== fingerprint)
        throw new PublicError(
          "This report attempt belongs to another snapshot. Review a new report.",
          409,
        );
      return receipt(previous);
    }
    const usage = this.store.usage(invite),
      bytes = Buffer.byteLength(raw);
    if (
      usage.count >= 100 ||
      usage.perInvite >= 10 ||
      usage.bytes + bytes > 16000000
    )
      throw new PublicError(
        "Private report storage is full. Export your report locally.",
        429,
      );
    const now = this.deps.now(),
      day = Math.floor(now / DAY),
      window = (day + 1) * DAY - now;
    this.deps.count(`feedback:${day}`, 30, window);
    this.deps.count(`feedback:${invite}:${day}`, 5, window);
    const record: FeedbackRecord = {
      id: randomUUID(),
      title: report.title,
      category: report.category,
      receivedAt: now,
      expiresAt: now + REPORT_RETENTION,
      owner,
      invite,
      fingerprint,
      bytes,
    };
    this.store.save(record, raw);
    return receipt(record);
  }
  inspect(token: unknown) {
    this.prune();
    const r = this.store.owner(capability(token));
    if (!r || !this.deps.active(r.invite))
      throw new PublicError("Report access is invalid or expired.", 404);
    return {
      receipt: receipt(r),
      report: JSON.parse(this.store.read(r.id)) as FeedbackReport,
    };
  }
  withdraw(token: unknown) {
    this.prune();
    const owner = capability(token),
      r = this.store.owner(owner);
    if (r) this.store.remove(r);
    else if (!this.store.retired(owner))
      throw new PublicError("Report access is invalid or expired.", 404);
    return { withdrawn: true };
  }
  list(page = 0) {
    this.prune();
    if (!Number.isSafeInteger(page) || page < 0 || page > 5)
      throw new PublicError("Invalid report page.");
    const records = this.store
      .records()
      .sort((a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id));
    return {
      reports: records.slice(page * 20, (page + 1) * 20).map(receipt),
      more: records.length > (page + 1) * 20,
    };
  }
  cancel(invite: string, token: unknown) {
    this.prune();
    if (!this.deps.active(invite))
      throw new PublicError("Private beta access required.", 403);
    const owner = capability(token),
      r = this.store.owner(owner);
    if (r && r.invite !== invite)
      throw new PublicError("Report access is invalid.", 403);
    if (r) this.store.remove(r);
    else if (!this.store.retired(owner)) {
      const now = this.deps.now(),
        day = Math.floor(now / DAY),
        window = (day + 1) * DAY - now;
      this.deps.count(`feedback:${day}`, 30, window);
      this.deps.count(`feedback:${invite}:${day}`, 5, window);
      this.store.retire(owner, now + REPORT_RETENTION);
    }
    return { withdrawn: true };
  }
  review(id: string) {
    this.prune();
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new PublicError("Report not found.", 404);
    const r = this.store.find(id);
    if (!r) throw new PublicError("Report not found.", 404);
    return {
      receipt: receipt(r),
      report: JSON.parse(this.store.read(id)) as FeedbackReport,
    };
  }
}
