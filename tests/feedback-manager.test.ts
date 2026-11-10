import { describe, expect, it, vi } from "vitest";
import { createFeedbackManager } from "../plugins/figma/src/feedback-manager";
import {
  readFeedbackRecords,
  readFeedbackReceipt,
  type SavedFeedback,
} from "../plugins/figma/src/feedback-storage";
import { feedbackReport } from "./feedback-fixture";
import type { FeedbackReceipt } from "../packages/relay/src/feedback";
const origin = "https://relay.test",
  token = "b".repeat(64),
  now = 1791050000000;
const receipt: FeedbackReceipt = {
  id: "11111111-2222-4333-8444-555555555555",
  category: "conversion",
  title: "Grid stops scrolling",
  receivedAt: now,
  expiresAt: now + 14 * 86400000,
};
function fixture() {
  let records: SavedFeedback[] = [],
    clock = now;
  const events: string[] = [];
  const storage = {
    load: vi.fn(async () => structuredClone(records)),
    save: vi.fn(async (value: SavedFeedback[]) => {
      events.push("saved");
      records = structuredClone(value);
    }),
  };
  const api = {
    submit: vi.fn(async () => {
      events.push("submitted");
      return receipt;
    }),
    inspect: vi.fn(async () => ({ receipt, report: feedbackReport() })),
    withdraw: vi.fn(async () => {}),
  };
  const create = (serviceOrigin = origin) =>
    createFeedbackManager(serviceOrigin, storage, api, () => {}, {
      now: () => clock,
      token: () => token,
    });
  return {
    create,
    storage,
    api,
    events,
    records: () => records,
    setNow: (value: number) => {
      clock = value;
    },
    setRecords: (r: SavedFeedback[]) => {
      records = r;
    },
  };
}
describe("reviewed report manager", () => {
  it("remembers a later retry window before posting while retaining the same capability", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    f.api.submit.mockRejectedValue(new Error("lost response"));
    await m.submit(feedbackReport(), "invite");
    const initial = f.records()[0].expiresAt;
    f.setNow(now + 13 * 86400000);
    await m.retry(token, "invite");
    expect(f.records()[0].expiresAt).toBeGreaterThan(initial);
    expect(f.records()[0].reportToken).toBe(token);
    expect(f.api.submit).toHaveBeenCalledTimes(2);
    f.storage.save.mockRejectedValue(new Error("disk full"));
    await m.retry(token, "invite");
    expect(f.api.submit).toHaveBeenCalledTimes(2);
  });
  it("remembers pending content before sending and retains only receipt metadata after delivery", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    await m.submit(feedbackReport(), "invite");
    expect(f.events).toEqual(["saved", "submitted", "saved"]);
    expect(f.records()[0].report).toBeUndefined();
    expect(m.snapshot().records[0].receipt).toEqual(receipt);
    m.dispose();
  });
  it("does not send if persistence fails", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    f.storage.save.mockRejectedValue(new Error("disk full"));
    await m.submit(feedbackReport(), "invite");
    expect(f.api.submit).not.toHaveBeenCalled();
    expect(m.snapshot().error).toContain("disk full");
  });
  it("retries exactly the same attempt after a lost response and does not auto-send on reopening", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    f.api.submit.mockRejectedValueOnce(new Error("Timed out"));
    await m.submit(feedbackReport(), "invite");
    m.dispose();
    const reopened = f.create();
    await reopened.restore();
    expect(f.api.submit).toHaveBeenCalledTimes(1);
    expect(reopened.snapshot().records[0].report).toEqual(feedbackReport());
    await reopened.retry(token, "invite");
    expect(f.api.submit.mock.calls[0].slice(0, 3)).toEqual(
      f.api.submit.mock.calls[1].slice(0, 3),
    );
    expect(f.records()[0].receipt).toEqual(receipt);
  });
  it("recovers a received report when receipt persistence failed", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    f.storage.save
      .mockImplementationOnce(async (r) => f.setRecords(structuredClone(r)))
      .mockRejectedValueOnce(new Error("disk full"));
    await m.submit(feedbackReport(), "invite");
    expect(m.snapshot().error).toContain("saving its receipt failed");
    expect(f.records()[0].report).toBeDefined();
    await m.inspect(token);
    expect(f.records()[0].receipt).toEqual(receipt);
    expect(f.api.submit).toHaveBeenCalledTimes(1);
  });
  it("preserves the retry handle on failed status and withdrawal", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    f.api.submit.mockRejectedValue(new Error("offline"));
    await m.submit(feedbackReport(), "invite");
    f.api.inspect.mockRejectedValue(new Error("not received"));
    await m.inspect(token);
    f.api.withdraw.mockRejectedValue(new Error("offline"));
    await m.withdraw(token, "invite");
    expect(f.records()[0].reportToken).toBe(token);
    expect(m.snapshot().error).toBe("offline");
  });
  it("uses pending cancellation and received withdrawal independently", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    f.api.submit.mockRejectedValueOnce(new Error("timeout"));
    await m.submit(feedbackReport(), "invite");
    await m.withdraw(token, "invite");
    expect(f.api.withdraw.mock.calls[0].slice(0, 3)).toEqual([
      token,
      "invite",
      true,
    ]);
    expect(f.records()).toEqual([]);
    await m.submit(feedbackReport(), "invite");
    await m.withdraw(token, "invite");
    expect(f.api.withdraw.mock.calls[1].slice(0, 3)).toEqual([
      token,
      "invite",
      false,
    ]);
  });
  it("prevents network submission if the window closes during initial persistence", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    let release: () => void = () => {};
    f.storage.save.mockImplementation(async (r) => {
      f.setRecords(r);
      await new Promise<void>((resolve) => (release = resolve));
    });
    const action = m.submit(feedbackReport(), "invite");
    await Promise.resolve();
    await Promise.resolve();
    m.dispose();
    release();
    await action;
    expect(f.api.submit).not.toHaveBeenCalled();
    expect(f.records()[0].report).toBeDefined();
  });
  it("aborts an in-flight request on closing and preserves a recoverable pending attempt", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    let signal: AbortSignal | undefined;
    f.api.submit.mockImplementation(async (...args: any[]) => {
      signal = args[3];
      return new Promise((_resolve, reject) =>
        signal!.addEventListener("abort", () => reject(new Error("closed"))),
      );
    });
    const action = m.submit(feedbackReport(), "invite");
    for (let n = 0; n < 8; n++) await Promise.resolve();
    expect(signal).toBeDefined();
    m.dispose();
    await action;
    expect(signal!.aborted).toBe(true);
    expect(f.records()[0].report).toBeDefined();
  });
  it("never sends capabilities to a different backend origin", async () => {
    const f = fixture();
    f.setRecords([
      {
        origin,
        reportToken: token,
        expiresAt: receipt.expiresAt,
        report: feedbackReport(),
      },
    ]);
    const m = f.create("https://other.test");
    await m.restore();
    expect(m.snapshot().records).toEqual([]);
    await m.inspect(token);
    await m.withdraw(token, "invite");
    expect(f.api.inspect).not.toHaveBeenCalled();
    expect(f.api.withdraw).not.toHaveBeenCalled();
    expect(f.records()).toHaveLength(1);
  });
  it("rejects an unexpected status snapshot without clearing the saved report", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    f.api.submit.mockRejectedValue(new Error("offline"));
    await m.submit(feedbackReport(), "invite");
    f.api.inspect.mockResolvedValue({
      receipt,
      report: { ...feedbackReport(), actual: "Different report" },
    });
    await m.inspect(token);
    expect(m.snapshot().error).toContain("differs");
    expect(f.records()[0].report).toBeDefined();
  });
  it("blocks duplicate submission while a pending attempt needs resolution", async () => {
    const f = fixture(),
      m = f.create();
    await m.restore();
    f.api.submit.mockRejectedValue(new Error("offline"));
    await m.submit(feedbackReport(), "invite");
    await m.submit({ ...feedbackReport(), actual: "New notes" }, "invite");
    expect(f.api.submit).toHaveBeenCalledTimes(1);
    expect(m.snapshot().error).toContain("pending report");
  });
  it("does not send when saved records are unreadable", async () => {
    const f = fixture(),
      m = f.create();
    f.storage.load.mockResolvedValue([{ invalid: true }] as any);
    await m.restore();
    await m.submit(feedbackReport(), "invite");
    expect(m.snapshot().loaded).toBe(false);
    expect(f.api.submit).not.toHaveBeenCalled();
  });
});
describe("device-local report records", () => {
  it("prunes expired and duplicate records and rejects credential-bearing origins", () => {
    const r = {
      origin,
      reportToken: token,
      expiresAt: receipt.expiresAt,
      receipt,
    };
    expect(readFeedbackRecords([r, r], now)).toHaveLength(1);
    expect(readFeedbackRecords([r], receipt.expiresAt)).toEqual([]);
    for (const url of [
      "https://x:y@relay.test",
      "https://relay.test/path",
      "http://relay.test",
      "https://relay.test?token=no",
    ])
      expect(() => readFeedbackRecords([{ ...r, origin: url }], now)).toThrow();
  });
  it("requires closed receipts, expiry consistency and exactly one saved snapshot or receipt", () => {
    const r = {
      origin,
      reportToken: token,
      expiresAt: receipt.expiresAt,
      receipt,
    };
    for (const v of [
      { ...receipt, id: "-".repeat(36) },
      { ...receipt, extra: "no" },
      { ...receipt, expiresAt: receipt.expiresAt + 1 },
    ])
      expect(() => readFeedbackReceipt(v)).toThrow();
    expect(() =>
      readFeedbackRecords([{ ...r, expiresAt: r.expiresAt + 1 }], now),
    ).toThrow();
    expect(() =>
      readFeedbackRecords([{ ...r, report: feedbackReport() }], now),
    ).toThrow();
    expect(() => readFeedbackRecords(Array(6).fill(r), now)).toThrow();
  });
});
