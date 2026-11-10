import {
  normalizeFeedback,
  type FeedbackReport,
} from "../../../packages/core/src/feedback";
import {
  readFeedbackRecords,
  readFeedbackReceipt,
  type SavedFeedback,
} from "./feedback-storage";
import type { FeedbackReceipt } from "../../../packages/core/src/feedback";
export type FeedbackState = {
  loaded: boolean;
  busy: boolean;
  records: SavedFeedback[];
  error: string;
  notice: string;
};
export function createFeedbackManager(
  origin: string,
  storage: {
    load(): Promise<unknown>;
    save(value: SavedFeedback[]): Promise<void>;
  },
  api: {
    submit(
      token: string,
      report: FeedbackReport,
      beta: string,
      signal: AbortSignal,
    ): Promise<FeedbackReceipt>;
    inspect(
      token: string,
      signal: AbortSignal,
    ): Promise<{ receipt: FeedbackReceipt; report: FeedbackReport }>;
    withdraw(
      token: string,
      beta: string,
      pending: boolean,
      signal: AbortSignal,
    ): Promise<void>;
  },
  changed: (state: FeedbackState) => void,
  deps: { now?(): number; token?(): string } = {},
) {
  const now = deps.now ?? Date.now,
    token =
      deps.token ??
      (() =>
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join(""));
  let records: SavedFeedback[] = [],
    state: FeedbackState = {
      loaded: false,
      busy: false,
      records: [],
      error: "",
      notice: "",
    },
    disposed = false,
    request: AbortController | undefined,
    working = false,
    restoring = false;
  let queue = Promise.resolve();
  const publish = (patch: Partial<FeedbackState>) => {
    if (!disposed) {
      state = {
        ...state,
        ...patch,
        records: records.filter((r) => r.origin === origin),
      };
      changed(state);
    }
  };
  const save = async (next: SavedFeedback[]) => {
    const clean = readFeedbackRecords(next, now()),
      write = queue.then(() => storage.save(clean));
    queue = write.catch(() => {});
    await write;
    records = clean;
    publish({});
  };
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (working || disposed || !state.loaded) return;
    working = true;
    request = new AbortController();
    publish({ busy: true, error: "", notice: "" });
    try {
      await action(request.signal);
    } catch (e) {
      publish({
        error:
          e instanceof Error
            ? e.message
            : "Could not confirm the report action.",
      });
    } finally {
      working = false;
      publish({ busy: false });
    }
  };
  const selected = (cap: string) => {
    const record = records.find(
      (r) => r.origin === origin && r.reportToken === cap,
    );
    if (!record || record.expiresAt <= now())
      throw new Error("This saved report expired.");
    return record;
  };
  const send = async (
    record: SavedFeedback,
    beta: string,
    signal: AbortSignal,
  ) => {
    if (!record.report) throw new Error("This report already has a receipt.");
    const receipt = readFeedbackReceipt(
      await api.submit(record.reportToken, record.report, beta, signal),
    );
    if (disposed) return;
    try {
      await save(
        records.map((r) =>
          r.reportToken === record.reportToken
            ? {
                origin,
                reportToken: r.reportToken,
                expiresAt: receipt.expiresAt,
                receipt,
              }
            : r,
        ),
      );
    } catch {
      throw new Error(
        "Report received, but saving its receipt failed. Check status to recover it.",
      );
    }
    publish({
      notice:
        "Report received privately. This is a delivery receipt; it does not mean the issue has been reviewed.",
    });
  };
  return {
    snapshot: () => state,
    async restore() {
      if (working || disposed || restoring) return;
      restoring = true;
      publish({ loaded: false, error: "" });
      try {
        records = readFeedbackRecords(await storage.load(), now());
        publish({ loaded: true });
      } catch {
        publish({
          error:
            "Saved reports could not be read. Retry storage before sending another report.",
        });
      } finally {
        restoring = false;
      }
    },
    submit(report: FeedbackReport, beta: string) {
      return run(async (signal) => {
        const live = readFeedbackRecords(records, now());
        if (live.length !== records.length) await save(live);
        if (records.some((r) => r.origin === origin && r.report))
          throw new Error(
            "Resolve or withdraw the pending report before starting another.",
          );
        if (records.length >= 5)
          throw new Error(
            "Five reports are saved on this device. Withdraw one or export locally.",
          );
        const record: SavedFeedback = {
          origin,
          reportToken: token(),
          // Leave a minute for the bounded storage/network deadlines before
          // server receipt time. The confirmed receipt becomes authoritative.
          expiresAt: now() + 14 * 86400000 + 60000,
          report: normalizeFeedback(report),
        };
        await save([...records, record]);
        if (disposed) return;
        await send(record, beta, signal);
      });
    },
    retry(cap: string, beta: string) {
      return run(async (signal) => {
        const record = selected(cap);
        if (!record.report)
          throw new Error("This report already has a receipt.");
        const next = { ...record, expiresAt: now() + 14 * 86400000 + 60000 };
        // A later first successful send can create a later server expiry. Keep
        // the same capability recoverable for that attempt before requesting it.
        await save(records.map((r) => (r.reportToken === cap ? next : r)));
        if (!disposed) await send(next, beta, signal);
      });
    },
    inspect(cap: string) {
      return run(async (signal) => {
        const record = selected(cap);
        const result = await api.inspect(cap, signal);
        if (disposed) return;
        if (
          record.report &&
          JSON.stringify(normalizeFeedback(result.report)) !==
            JSON.stringify(record.report)
        )
          throw new Error(
            "The received report differs from the saved snapshot. Keep the saved report and try again.",
          );
        const receipt = readFeedbackReceipt(result.receipt);
        await save(
          records.map((r) =>
            r.reportToken === cap
              ? {
                  origin,
                  reportToken: cap,
                  expiresAt: receipt.expiresAt,
                  receipt,
                }
              : r,
          ),
        );
        publish({ notice: "The service confirmed this report was received." });
      });
    },
    withdraw(cap: string, beta: string) {
      return run(async (signal) => {
        const record = selected(cap);
        await api.withdraw(cap, beta, !!record.report, signal);
        if (disposed) return;
        await save(records.filter((r) => r.reportToken !== cap));
        publish({
          notice:
            "Report withdrawn. Its stored notes and screenshot were removed.",
        });
      });
    },
    dispose() {
      disposed = true;
      request?.abort();
    },
  };
}
