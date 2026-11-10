import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createLiveSync,
  type SyncRun,
  type SyncState,
} from "../plugins/figma/src/live-sync";
import { createSyncAnalysis } from "../plugins/figma/src/sync-analysis";
import {
  DEFAULT_OPTIONS,
  type AnalysisResult,
} from "../packages/core/src/types";

const target = { ids: ["1:2", "1:3"], names: ["Shop", "HUD"] };
function setup(run = vi.fn(async (_job: SyncRun) => "Imported")) {
  const states: SyncState[] = [],
    watch = vi.fn();
  const sync = createLiveSync(run, (state) => states.push(state), watch);
  return { sync, states, watch, run };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => vi.useRealTimers());

it("starts off, does no work for edits, and waits for an intentional delivery before arming", async () => {
  const { sync, run, watch } = setup();
  sync.edited();
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).not.toHaveBeenCalled();
  sync.setEnabled(true);
  sync.edited();
  expect(sync.state().phase).toBe("waiting");
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).not.toHaveBeenCalled();
  sync.delivered(target, "Imported");
  expect(watch).toHaveBeenLastCalledWith(target);
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).not.toHaveBeenCalled();
  sync.edited();
  await vi.advanceTimersByTimeAsync(1000);
  expect(run).toHaveBeenCalledOnce();
  expect(run.mock.calls[0][0].target).toEqual(target);
});

it("coalesces rapid edits and limits the rate of repeated exports", async () => {
  const { sync, run } = setup();
  sync.delivered(target, "Imported");
  sync.setEnabled(true);
  await vi.advanceTimersByTimeAsync(700);
  sync.edited();
  await vi.advanceTimersByTimeAsync(700);
  expect(run).not.toHaveBeenCalled();
  sync.edited();
  await vi.advanceTimersByTimeAsync(1000);
  expect(run).toHaveBeenCalledOnce();
  sync.edited();
  await vi.advanceTimersByTimeAsync(2499);
  expect(run).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(run).toHaveBeenCalledTimes(2);
});

it("cancels outdated preparation but waits for it to drain before running the latest edit", async () => {
  let finish!: () => void;
  const run = vi.fn(
    (_job: SyncRun) =>
      new Promise<string>((resolve) => {
        finish = () => resolve("Imported");
      }),
  );
  const { sync } = setup(run);
  sync.delivered(target, "Imported");
  sync.setEnabled(true);
  await vi.advanceTimersByTimeAsync(1000);
  const job = run.mock.calls[0][0];
  sync.edited();
  sync.edited();
  expect(job.signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).toHaveBeenCalledOnce();
  finish();
  await vi.advanceTimersByTimeAsync(1000);
  expect(run).toHaveBeenCalledTimes(2);
  expect(sync.state().lastSync).toBe(10_000);
  finish();
  await vi.advanceTimersByTimeAsync(0);
});

it("finishes a publication and receipt before publishing the next revision", async () => {
  let finish!: () => void;
  const run = vi.fn((job: SyncRun) => {
    job.sending();
    job.publishing();
    return new Promise<string>((resolve) => {
      finish = () => resolve("Waiting for Studio import");
    });
  });
  const { sync } = setup(run);
  sync.delivered(target, "Imported");
  sync.setEnabled(true);
  await vi.advanceTimersByTimeAsync(1000);
  sync.edited();
  expect(run.mock.calls[0][0].signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).toHaveBeenCalledOnce();
  finish();
  await vi.advanceTimersByTimeAsync(1000);
  expect(run).toHaveBeenCalledTimes(2);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(sync.state().message).toBe("Waiting for Studio import");
});

it("disabling clears pending work and aborts an active pipeline without rearming", async () => {
  const { sync, run, watch } = setup();
  sync.delivered(target, "Imported");
  sync.setEnabled(true);
  sync.setEnabled(false);
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).not.toHaveBeenCalled();
  expect(watch).toHaveBeenLastCalledWith(undefined);
  let finish!: () => void;
  const held = setup(
    vi.fn(
      (_job: SyncRun) =>
        new Promise<string>((resolve) => {
          finish = () => resolve("Imported");
        }),
    ),
  );
  held.sync.delivered(target, "Imported");
  held.sync.setEnabled(true);
  await vi.advanceTimersByTimeAsync(1000);
  held.sync.setEnabled(false);
  expect(held.run.mock.calls[0][0].signal.aborted).toBe(true);
  finish();
  await vi.advanceTimersByTimeAsync(5000);
  expect(held.run).toHaveBeenCalledOnce();
  expect(held.sync.state().phase).toBe("off");
});

it("pauses failures without retry storms and retries only on explicit resume", async () => {
  const run = vi.fn(async (_job: SyncRun) => {
    throw new Error("Roblox rejected the upload");
  });
  const { sync } = setup(run);
  sync.delivered(target, "Imported");
  sync.setEnabled(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(sync.state().phase).toBe("paused");
  expect(sync.state().message).toBe("Roblox rejected the upload");
  sync.edited();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(run).toHaveBeenCalledOnce();
  sync.resume();
  await vi.advanceTimersByTimeAsync(1000);
  expect(run).toHaveBeenCalledTimes(2);
});

it("holds behind manual work and resets targets when the connection context changes", async () => {
  const { sync, run } = setup();
  sync.delivered(target, "Imported");
  sync.hold(true);
  sync.setEnabled(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).not.toHaveBeenCalled();
  sync.hold(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(run).toHaveBeenCalledOnce();
  sync.reset();
  sync.edited();
  await vi.advanceTimersByTimeAsync(5000);
  expect(sync.state().target).toBeUndefined();
  expect(run).toHaveBeenCalledOnce();
});

it("disposing releases scheduled work and stops watching the Figma source", async () => {
  const { sync, run, states, watch } = setup();
  sync.delivered(target, "Imported");
  sync.setEnabled(true);
  sync.dispose();
  const count = states.length;
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).not.toHaveBeenCalled();
  expect(states).toHaveLength(count);
  expect(watch).toHaveBeenLastCalledWith(undefined);
  expect(vi.getTimerCount()).toBe(0);
});

it("analysis uses pinned IDs and only resolves after the controller is idle", async () => {
  const send = vi.fn(),
    busy = vi.fn(),
    progress = vi.fn();
  const client = createSyncAnalysis(send, busy, progress);
  const result = { revision: 2 } as AnalysisResult;
  const promise = client.request(
    DEFAULT_OPTIONS,
    target.ids,
    new AbortController().signal,
  );
  const jobId = send.mock.calls[0][1].jobId;
  expect(send.mock.calls[0]).toEqual([
    "analyze",
    { options: DEFAULT_OPTIONS, rootIds: target.ids, jobId },
  ]);
  let resolved = false;
  void promise.then(() => {
    resolved = true;
  });
  client.receive({ type: "progress", jobId, label: "Rendering", progress: 30 });
  expect(progress).toHaveBeenCalledWith("Rendering", 30);
  client.receive({ type: "result", jobId, result });
  await Promise.resolve();
  expect(resolved).toBe(false);
  expect(client.receive({ type: "selection" })).toBe(false);
  client.receive({ type: "idle", jobId });
  await expect(promise).resolves.toBe(result);
  expect(busy.mock.calls).toEqual([[true], [false]]);
});

it("cancellation drains native analysis, ignores late results and cleans its abort listener", async () => {
  const send = vi.fn(),
    client = createSyncAnalysis(send, vi.fn(), vi.fn());
  const abort = new AbortController();
  const promise = client.request(DEFAULT_OPTIONS, target.ids, abort.signal);
  const observed = promise.catch((error) => error);
  const jobId = send.mock.calls[0][1].jobId;
  abort.abort();
  expect(send).toHaveBeenLastCalledWith("cancel", { jobId });
  await expect(
    client.request(DEFAULT_OPTIONS, target.ids, new AbortController().signal),
  ).rejects.toThrow("still finishing");
  client.receive({ type: "result", jobId, result: {} as AnalysisResult });
  client.receive({ type: "idle", jobId });
  expect((await observed).name).toBe("AbortError");
  const next = client.request(
    DEFAULT_OPTIONS,
    target.ids,
    new AbortController().signal,
  );
  const nextObserved = next.catch((error) => error);
  expect(
    client.receive({ type: "error", jobId, message: "Late failure" }),
  ).toBe(true);
  const nextId = send.mock.calls.at(-1)![1].jobId;
  client.receive({ type: "error", jobId: nextId, message: "Missing source" });
  client.receive({ type: "idle", jobId: nextId });
  expect((await nextObserved).message).toBe("Missing source");
});
