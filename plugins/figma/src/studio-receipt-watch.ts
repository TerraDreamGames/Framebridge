import type { StudioReceipt } from "./transfer";

export type StudioReceiptTarget = {
  senderToken: string;
  revision: number;
  expiresAt: number;
};

type Options = {
  readReceipt(
    token: string,
    revision: number,
    signal: AbortSignal,
  ): Promise<StudioReceipt>;
  changed(receipt: StudioReceipt): void;
  expired(revision: number): void;
  authorizationLost(revision: number): void;
  now?: () => number;
  intervalMs?: number;
};

export function studioReceiptMessage(receipt: StudioReceipt): string {
  switch (receipt.status) {
    case "imported":
      return "Imported into Studio. Your UI is ready to arrange.";
    case "queued":
      return "Sent to Studio. Import will finish when you stop the play test.";
    case "failed":
      return (
        receipt.message ??
        "Studio could not import this design. Review the Studio plugin."
      );
    case "superseded":
      return "This export was replaced by a newer design sent to Studio.";
    default:
      return "Delivered to Studio. Review your design and click Import there.";
  }
}

function checkedReceipt(value: unknown, revision: number): StudioReceipt {
  if (!value || typeof value !== "object")
    throw new Error("Invalid Studio receipt.");
  const receipt = value as Record<string, unknown>;
  if (
    receipt.revision !== revision ||
    typeof receipt.status !== "string" ||
    ![
      "pending",
      "ready",
      "queued",
      "imported",
      "failed",
      "superseded",
    ].includes(receipt.status) ||
    (receipt.message !== undefined && typeof receipt.message !== "string")
  )
    throw new Error("Invalid Studio receipt.");
  return {
    revision,
    status: receipt.status as StudioReceipt["status"],
    ...(receipt.message === undefined
      ? {}
      : { message: receipt.message as string }),
  };
}

/** Delivery finishes at ready/queued; observe its later outcome without holding Send open. */
export function createStudioReceiptWatch(options: Options) {
  const now = options.now ?? Date.now;
  if (options.intervalMs !== undefined && !Number.isFinite(options.intervalMs))
    throw new Error("Invalid receipt watch interval.");
  const firstInterval = Math.max(
    2500,
    Math.min(30_000, options.intervalMs ?? 5000),
  );
  type Watch = {
    target: StudioReceiptTarget;
    startedAt: number;
    failures: number;
    last: StudioReceipt;
    pollTimer?: ReturnType<typeof setTimeout>;
    expiryTimer?: ReturnType<typeof setTimeout>;
    request?: AbortController;
  };
  let active: Watch | undefined;
  let destroyed = false;
  const current = (watch: Watch) => !destroyed && active === watch;
  const stop = () => {
    const watch = active;
    active = undefined;
    if (!watch) return;
    clearTimeout(watch.pollTimer);
    clearTimeout(watch.expiryTimer);
    watch.request?.abort();
  };
  // A UI callback must not leave an orphaned request or disrupt watcher cleanup.
  const notify = <T>(callback: (value: T) => void, value: T) => {
    try {
      callback(value);
    } catch {}
  };
  const expire = (watch: Watch) => {
    if (!current(watch)) return;
    stop();
    notify(options.expired, watch.target.revision);
  };
  const armExpiry = (watch: Watch) => {
    if (!current(watch)) return;
    const remaining = watch.target.expiresAt - now();
    if (remaining <= 0) {
      expire(watch);
      return;
    }
    watch.expiryTimer = setTimeout(
      () => armExpiry(watch),
      Math.min(remaining, 2_147_483_647),
    );
  };
  const cadence = (watch: Watch) =>
    Math.max(
      firstInterval,
      now() - watch.startedAt < 30_000 ? firstInterval : 15_000,
    );
  const schedule = (watch: Watch, delay: number) => {
    if (!current(watch)) return;
    watch.pollTimer = setTimeout(() => void poll(watch), delay);
  };
  async function poll(watch: Watch) {
    watch.pollTimer = undefined;
    if (!current(watch)) return;
    if (now() >= watch.target.expiresAt) {
      expire(watch);
      return;
    }
    const request = new AbortController();
    watch.request = request;
    try {
      const value = await options.readReceipt(
        watch.target.senderToken,
        watch.target.revision,
        request.signal,
      );
      if (!current(watch) || request.signal.aborted) return;
      if (now() >= watch.target.expiresAt) {
        expire(watch);
        return;
      }
      const receipt = checkedReceipt(value, watch.target.revision);
      watch.failures = 0;
      if (["imported", "failed", "superseded"].includes(receipt.status)) {
        stop();
        notify(options.changed, receipt);
        return;
      }
      if (
        receipt.status !== "pending" &&
        (receipt.status !== watch.last.status ||
          receipt.message !== watch.last.message)
      ) {
        watch.last = receipt;
        notify(options.changed, receipt);
      }
      schedule(watch, cadence(watch));
    } catch (error) {
      if (!current(watch) || request.signal.aborted) return;
      if (now() >= watch.target.expiresAt) {
        expire(watch);
        return;
      }
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 401
      ) {
        stop();
        notify(options.authorizationLost, watch.target.revision);
        return;
      }
      watch.failures++;
      schedule(
        watch,
        Math.max(
          cadence(watch),
          Math.min(30_000, firstInterval * 2 ** Math.min(watch.failures, 4)),
        ),
      );
    } finally {
      if (watch.request === request) watch.request = undefined;
    }
  }
  return {
    replace(target: StudioReceiptTarget, initial: StudioReceipt) {
      stop();
      if (destroyed) return;
      if (
        !/^[a-f0-9]{64}$/.test(target.senderToken) ||
        !Number.isSafeInteger(target.revision) ||
        target.revision < 1 ||
        !Number.isSafeInteger(target.expiresAt)
      )
        throw new Error("Invalid Studio delivery.");
      const receipt = checkedReceipt(initial, target.revision);
      if (receipt.status !== "ready" && receipt.status !== "queued") return;
      const watch: Watch = {
        target: { ...target },
        startedAt: now(),
        failures: 0,
        last: receipt,
      };
      active = watch;
      if (now() >= target.expiresAt) {
        expire(watch);
        return;
      }
      armExpiry(watch);
      schedule(watch, firstInterval);
    },
    cancel: stop,
    destroy() {
      stop();
      destroyed = true;
    },
  };
}
