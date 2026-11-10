import { afterEach, expect, it, vi } from "vitest";
import { createImagePreparationBridge } from "../plugins/figma/src/image-preparation-bridge";
import {
  createImagePreparationClient,
  type PreparationWorker,
} from "../plugins/figma/src/image-preparation-client";
import {
  prepareImageJob,
  type PreparationJob,
} from "../plugins/figma/src/image-preparation-job";
import { iconPng, PNG } from "./image-tools-fixtures";
import { scrollbarPng } from "./scrollbar-fixtures";
import { batchPng } from "./image-batch-fixtures";
import { preparePng } from "../packages/core/src/image-processing";
const codec = {
  encode: (bytes: Uint8Array) => Buffer.from(bytes).toString("base64"),
  decode: (png: string) => new Uint8Array(Buffer.from(png, "base64")),
};
afterEach(() => vi.useRealTimers());
function workerMock() {
  const pending: PreparationJob[] = [];
  const worker: PreparationWorker = {
    postMessage: vi.fn((job) => pending.push(job)),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
  return {
    worker,
    pending,
    complete() {
      const job = pending.shift()!;
      worker.onmessage?.({ data: prepareImageJob(job) } as MessageEvent);
    },
  };
}
it("runs one PNG at a time off the UI thread and preserves identical prepared pixels", () => {
  const send = vi.fn(),
    mock = workerMock(),
    factory = vi.fn(() => mock.worker);
  const client = createImagePreparationClient(send, factory);
  for (let id = 1; id <= 3; id++)
    client.receive({
      type: "prepare-image",
      preparationId: id,
      png: codec.encode(iconPng(id)),
      processing: { edgeCleanup: true },
    });
  expect(factory).toHaveBeenCalledTimes(1);
  expect(mock.pending).toHaveLength(1);
  expect(send).not.toHaveBeenCalled();
  for (let id = 1; id <= 3; id++) {
    mock.complete();
    expect(send.mock.calls[id - 1]).toEqual([
      "image-prepared",
      {
        preparationId: id,
        png: codec.encode(preparePng(iconPng(id), { edgeCleanup: true })),
      },
    ]);
    expect(mock.pending).toHaveLength(id === 3 ? 0 : 1);
  }
  client.dispose();
  expect(mock.worker.terminate).toHaveBeenCalledTimes(1);
});
it("terminates active pixel work on cancellation, preserves other queued jobs and ignores late worker results", () => {
  const send = vi.fn(),
    first = workerMock(),
    second = workerMock();
  const factory = vi
    .fn()
    .mockReturnValueOnce(first.worker)
    .mockReturnValueOnce(second.worker);
  const client = createImagePreparationClient(send, factory);
  for (let id = 1; id <= 3; id++)
    client.receive({
      type: "prepare-image",
      preparationId: id,
      png: codec.encode(iconPng()),
      processing: { edgeCleanup: true },
    });
  const late = first.worker.onmessage!;
  client.receive({ type: "cancel-image-preparation", preparationIds: [1, 3] });
  expect(first.worker.terminate).toHaveBeenCalledTimes(1);
  expect(second.pending.map((job) => job.preparationId)).toEqual([2]);
  late({ data: { preparationId: 1, unchanged: true } } as MessageEvent);
  expect(send).not.toHaveBeenCalled();
  second.complete();
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1].preparationId).toBe(2);
  client.dispose();
});
it.each(["constructor", "startup", "post"])(
  "falls back losslessly if workers fail during %s",
  async (stage) => {
    vi.useFakeTimers();
    const send = vi.fn(),
      mock = workerMock();
    const factory = vi.fn(() => {
      if (stage === "constructor") throw Error("Blocked worker");
      return mock.worker;
    });
    if (stage === "post")
      mock.worker.postMessage = () => {
        throw Error("Worker stopped");
      };
    const client = createImagePreparationClient(send, factory);
    client.receive({
      type: "prepare-image",
      preparationId: 1,
      png: codec.encode(iconPng()),
      processing: { edgeCleanup: true },
    });
    if (stage === "startup")
      mock.worker.onerror!({
        preventDefault: vi.fn(),
      } as unknown as ErrorEvent);
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledWith("image-prepared", {
      preparationId: 1,
      png: codec.encode(preparePng(iconPng(), { edgeCleanup: true })),
    });
    expect(factory).toHaveBeenCalledTimes(1);
    client.dispose();
  },
);
function connected() {
  const messages: any[] = [];
  const client = createImagePreparationClient((type, data) =>
    bridge.receive({ type, ...data }),
  );
  const bridge = createImagePreparationBridge((type, data) => {
    const message = { type, ...data };
    messages.push(message);
    client.receive(message);
  }, codec);
  bridge.configure(1);
  return { bridge, client, messages };
}
it("prepares transparent RGB in the browser while preserving visible colors, alpha, bounds and original input", async () => {
  const { bridge, client, messages } = connected(),
    raw = iconPng(),
    original = raw.slice();
  const output = await bridge.prepare(raw, { edgeCleanup: true });
  const decoded = PNG.sync.read(Buffer.from(output));
  expect([decoded.width, decoded.height]).toEqual([7, 5]);
  expect([...decoded.data.subarray(0, 4)]).toEqual([80, 100, 180, 0]);
  expect([...decoded.data.subarray((7 + 2) * 4, (7 + 2) * 4 + 4)]).toEqual([
    80, 100, 180, 1,
  ]);
  expect(output).toEqual(preparePng(raw, { edgeCleanup: true }));
  expect(raw).toEqual(original);
  expect(messages).toHaveLength(1);
  expect(messages[0].png).toBe(codec.encode(raw));
  client.dispose();
});
it.each(["X", "Y"] as const)(
  "preserves prepared 16-bit %s scrollbar samples and rotation",
  async (axis) => {
    const { bridge, client } = connected(),
      raw = scrollbarPng(axis, 16),
      slice = { axis, start: 0.25, end: 0.5 };
    expect(
      await bridge.prepare(raw, { whiteMask: true, edgeCleanup: true }, slice),
    ).toEqual(preparePng(raw, { whiteMask: true, edgeCleanup: true }, slice));
    client.dispose();
  },
);
it("uses the original bytes without another encoded response for unchanged opaque artwork, and skips transport when opted out", async () => {
  const { bridge, client, messages } = connected(),
    raw = batchPng(7);
  expect(await bridge.prepare(raw, { edgeCleanup: true })).toBe(raw);
  expect(await bridge.prepare(raw, { edgeCleanup: false })).toBe(raw);
  expect(messages).toHaveLength(1);
  client.dispose();
});
it("retains equivalent processing for legacy/headless clients without sending a browser request", async () => {
  const send = vi.fn(),
    bridge = createImagePreparationBridge(send, codec),
    raw = iconPng();
  for (const version of [undefined, 0, 2, "1"]) {
    bridge.configure(version);
    expect(await bridge.prepare(raw, { edgeCleanup: true })).toEqual(
      preparePng(raw, { edgeCleanup: true }),
    );
  }
  expect(send).not.toHaveBeenCalled();
});
it("cancels queued browser pixel work and ignores stale replies when a new request starts", async () => {
  vi.useFakeTimers();
  const { bridge, client, messages } = connected(),
    raw = iconPng();
  const cancelled = bridge.prepare(raw, { edgeCleanup: true });
  const rejection = expect(cancelled).rejects.toThrow("Export cancelled");
  bridge.cancel();
  await rejection;
  const next = bridge.prepare(raw, { whiteMask: true });
  bridge.receive({
    type: "image-prepared",
    preparationId: messages[0].preparationId,
    unchanged: true,
  });
  await vi.runAllTimersAsync();
  expect(await next).toEqual(preparePng(raw, { whiteMask: true }));
  expect(
    messages
      .filter((m) => m.type === "prepare-image")
      .map((m) => m.preparationId),
  ).toEqual([1, 2]);
  client.dispose();
});
it("bounds missing responses and rejects changed dimensions, malformed replies and unchanged scrollbar claims", async () => {
  vi.useFakeTimers();
  const messages: any[] = [],
    bridge = createImagePreparationBridge(
      (type, data) => messages.push({ type, ...data }),
      codec,
      100,
    );
  bridge.configure(1);
  const missing = expect(
    bridge.prepare(iconPng(), { edgeCleanup: true }),
  ).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(100);
  await missing;
  expect(messages.at(-1).type).toBe("cancel-image-preparation");
  for (const reply of [
    { png: codec.encode(scrollbarPng()) },
    { png: 17 },
    { error: "Invalid PNG checksum" },
  ]) {
    const pending = expect(
      bridge.prepare(iconPng(), { edgeCleanup: true }),
    ).rejects.toThrow();
    bridge.receive({
      type: "image-prepared",
      preparationId: messages.at(-1).preparationId,
      ...reply,
    });
    await pending;
  }
  const sliced = expect(
    bridge.prepare(
      scrollbarPng(),
      { edgeCleanup: true },
      { axis: "Y", start: 0, end: 1 },
    ),
  ).rejects.toThrow("slice must be prepared");
  bridge.receive({
    type: "image-prepared",
    preparationId: messages.at(-1).preparationId,
    unchanged: true,
  });
  await sliced;
});
it("propagates processor errors and disposes browser jobs before they can return pixels", async () => {
  const { bridge, client } = connected();
  const bad = iconPng();
  bad[bad.length - 1] ^= 1;
  await expect(bridge.prepare(bad, { edgeCleanup: true })).rejects.toThrow(
    "checksum",
  );
  vi.useFakeTimers();
  const send = vi.fn(),
    disposable = createImagePreparationClient(send);
  disposable.receive({
    type: "prepare-image",
    preparationId: 1,
    png: codec.encode(iconPng()),
    processing: { edgeCleanup: true },
  });
  disposable.dispose();
  await vi.runAllTimersAsync();
  expect(send).not.toHaveBeenCalled();
  client.dispose();
});
