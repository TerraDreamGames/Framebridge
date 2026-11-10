import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createStudioReceiptWatch,
  studioReceiptMessage,
  type StudioReceiptTarget,
} from "../plugins/figma/src/studio-receipt-watch";
import type { StudioReceipt } from "../plugins/figma/src/transfer";

const token = "a".repeat(64);
const target = (
  revision = 1,
  expiresAt = Date.now() + 3_600_000,
): StudioReceiptTarget => ({
  senderToken: token,
  revision,
  expiresAt,
});
const ready: StudioReceipt = { revision: 1, status: "ready" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

async function http(
  reply: (revision: number) => Promise<Response> | Response = (revision) =>
    new Response(JSON.stringify({ revision, status: "ready", longPoll: true })),
) {
  vi.stubEnv("VITE_FRAMEBRIDGE_RELAY_URL", "https://receipt.test");
  vi.resetModules();
  const requests: {
    url: string;
    method: string;
    headers: Headers;
    signal: AbortSignal;
    at: number;
  }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      signal: init!.signal!,
      at: Date.now(),
    });
    expect(new URL(url).pathname).toBe("/v1/receipt");
    expect(init?.body).toBeUndefined();
    return reply(Number(new URL(url).searchParams.get("revision")));
  });
  vi.stubGlobal("fetch", fetch);
  const client = await import("../plugins/figma/src/transfer");
  const changed = vi.fn(),
    expired = vi.fn(),
    authorizationLost = vi.fn();
  const watch = createStudioReceiptWatch({
    readReceipt: (senderToken, revision, signal) =>
      client.relayRequest<StudioReceipt>(
        `/v1/receipt?revision=${revision}`,
        senderToken,
        undefined,
        signal,
      ),
    changed,
    expired,
    authorizationLost,
  });
  return { watch, requests, fetch, changed, expired, authorizationLost };
}

it("polls real receipt GETs at a bounded cadence, then shows a late import without publishing or exposing tokens", async () => {
  let status: StudioReceipt["status"] = "ready";
  const test = await http(
    (revision) =>
      new Response(
        JSON.stringify({
          revision,
          status,
          longPoll: true,
          senderToken: "unexpected-response-field",
        }),
      ),
  );
  test.watch.replace(target(), ready);
  await vi.advanceTimersByTimeAsync(4999);
  expect(test.fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await vi.advanceTimersByTimeAsync(35_000);
  expect(test.requests.map(({ at }) => at - 10_000)).toEqual([
    5000, 10_000, 15_000, 20_000, 25_000, 30_000,
  ]);
  expect(test.changed).not.toHaveBeenCalled();
  status = "imported";
  await vi.advanceTimersByTimeAsync(5000);
  expect(test.changed).toHaveBeenCalledExactlyOnceWith({
    revision: 1,
    status: "imported",
  });
  expect(JSON.stringify(test.changed.mock.calls)).not.toContain("senderToken");
  for (const request of test.requests) {
    expect(request.method).toBe("GET");
    expect(request.headers.get("Authorization")).toBe(`Bearer ${token}`);
    expect(request.url).not.toContain(token);
  }
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(test.requests).toHaveLength(7);
  expect(test.expired).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["imported", "failed", "superseded"] as const)(
  "stops before notifying a terminal %s result",
  async (status) => {
    const test = await http(
      (revision) =>
        new Response(
          JSON.stringify({ revision, status, message: "Studio result" }),
        ),
    );
    test.watch.replace(target(), { revision: 1, status: "queued" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(test.changed).toHaveBeenCalledExactlyOnceWith({
      revision: 1,
      status,
      message: "Studio result",
    });
    expect(test.requests[0].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(test.requests).toHaveLength(1);
    expect(test.expired).not.toHaveBeenCalled();
  },
);

it("reports queue release to review once and continues watching for manual import", async () => {
  let status = "ready";
  const test = await http(
    (revision) => new Response(JSON.stringify({ revision, status })),
  );
  test.watch.replace(target(), { revision: 1, status: "queued" });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(test.changed).toHaveBeenCalledExactlyOnceWith(ready);
  status = "imported";
  await vi.advanceTimersByTimeAsync(5000);
  expect(test.changed).toHaveBeenLastCalledWith({
    revision: 1,
    status: "imported",
  });
  expect(test.changed).toHaveBeenCalledTimes(2);
});

it("does not downgrade a delivered status for pending responses", async () => {
  const test = await http(
    (revision) => new Response(JSON.stringify({ revision, status: "pending" })),
  );
  test.watch.replace(target(), ready);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(test.requests).toHaveLength(4);
  expect(test.changed).not.toHaveBeenCalled();
  test.watch.cancel();
});

it("aborts a pending GET on cancel and ignores its eventual completion", async () => {
  const reply = deferred<Response>();
  const test = await http(() => reply.promise);
  test.watch.replace(target(), ready);
  await vi.advanceTimersByTimeAsync(5000);
  test.watch.cancel();
  expect(test.requests[0].signal.aborted).toBe(true);
  reply.resolve(
    new Response(JSON.stringify({ revision: 1, status: "imported" })),
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(test.changed).not.toHaveBeenCalled();
  expect(test.requests).toHaveLength(1);
  expect(test.expired).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["revision", "sender"] as const)(
  "replaces the tracked %s, aborts the old GET, and ignores an out-of-order old result",
  async (change) => {
    const old = deferred<Response>();
    let count = 0;
    const test = await http((revision) =>
      ++count === 1
        ? old.promise
        : new Response(JSON.stringify({ revision, status: "imported" })),
    );
    const first = target();
    test.watch.replace(first, ready);
    await vi.advanceTimersByTimeAsync(5000);
    const latest =
      change === "revision"
        ? target(2)
        : { ...target(), senderToken: "b".repeat(64) };
    test.watch.replace(latest, { revision: latest.revision, status: "ready" });
    expect(test.requests[0].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(test.changed).toHaveBeenCalledExactlyOnceWith({
      revision: latest.revision,
      status: "imported",
    });
    old.resolve(
      new Response(
        JSON.stringify({
          revision: first.revision,
          status: "failed",
          message: "Old import failed",
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(test.changed).toHaveBeenCalledOnce();
    expect(test.requests).toHaveLength(2);
    expect(test.requests[1].headers.get("Authorization")).toBe(
      `Bearer ${latest.senderToken}`,
    );
  },
);

it("expires and aborts an in-flight GET even if it never settles, then ignores a late import", async () => {
  const reply = deferred<Response>();
  const test = await http(() => reply.promise);
  test.watch.replace(target(1, Date.now() + 12_000), ready);
  await vi.advanceTimersByTimeAsync(5000);
  await vi.advanceTimersByTimeAsync(7000);
  expect(test.requests[0].signal.aborted).toBe(true);
  expect(test.expired).toHaveBeenCalledExactlyOnceWith(1);
  reply.resolve(
    new Response(JSON.stringify({ revision: 1, status: "imported" })),
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(test.changed).not.toHaveBeenCalled();
  expect(test.requests).toHaveLength(1);
  expect(test.expired).toHaveBeenCalledOnce();
  expect(test.authorizationLost).not.toHaveBeenCalled();
});

it.each([0, 1500])(
  "expires before the first poll without making a request (%d ms)",
  async (remaining) => {
    const test = await http();
    test.watch.replace(target(1, Date.now() + remaining), ready);
    await vi.advanceTimersByTimeAsync(5000);
    expect(test.expired).toHaveBeenCalledExactlyOnceWith(1);
    expect(test.fetch).not.toHaveBeenCalled();
  },
);

it("destroy aborts work and prevents future replacement from restarting it", async () => {
  const reply = deferred<Response>();
  const test = await http(() => reply.promise);
  test.watch.replace(target(), ready);
  await vi.advanceTimersByTimeAsync(5000);
  test.watch.destroy();
  expect(test.requests[0].signal.aborted).toBe(true);
  test.watch.replace(target(2), { revision: 2, status: "queued" });
  reply.resolve(
    new Response(JSON.stringify({ revision: 1, status: "imported" })),
  );
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(test.fetch).toHaveBeenCalledOnce();
  expect(test.changed).not.toHaveBeenCalled();
  expect(test.expired).not.toHaveBeenCalled();
});

it("stops on a real relay 401 before authorization recovery, without forwarding the error body", async () => {
  const test = await http(
    () =>
      new Response(JSON.stringify({ error: "private-error-body" }), {
        status: 401,
      }),
  );
  let atRecovery: { aborted: boolean; timers: number } | undefined;
  test.authorizationLost.mockImplementation(() => {
    atRecovery = {
      aborted: test.requests[0].signal.aborted,
      timers: vi.getTimerCount(),
    };
  });
  test.watch.replace(target(), ready);
  await vi.advanceTimersByTimeAsync(5000);
  expect(test.authorizationLost).toHaveBeenCalledExactlyOnceWith(1);
  expect(atRecovery).toEqual({ aborted: true, timers: 0 });
  expect(JSON.stringify(test.authorizationLost.mock.calls)).not.toContain(
    "private-error-body",
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(test.fetch).toHaveBeenCalledOnce();
  expect(test.changed).not.toHaveBeenCalled();
  expect(test.expired).not.toHaveBeenCalled();
});

it("ignores a late 401 from a replaced sender so it cannot invalidate the new pairing", async () => {
  const old = deferred<Response>();
  let count = 0;
  const test = await http((revision) =>
    ++count === 1
      ? old.promise
      : new Response(JSON.stringify({ revision, status: "imported" })),
  );
  test.watch.replace(target(), ready);
  await vi.advanceTimersByTimeAsync(5000);
  test.watch.replace({ ...target(), senderToken: "b".repeat(64) }, ready);
  old.resolve(
    new Response(JSON.stringify({ error: "Old sender expired" }), {
      status: 401,
    }),
  );
  await vi.advanceTimersByTimeAsync(5000);
  expect(test.authorizationLost).not.toHaveBeenCalled();
  expect(test.changed).toHaveBeenCalledExactlyOnceWith({
    revision: 1,
    status: "imported",
  });
  expect(test.requests[1].headers.get("Authorization")).toBe(
    `Bearer ${"b".repeat(64)}`,
  );
});

it("backs off transient HTTP failures to at most one request per 30 seconds and recovers", async () => {
  let count = 0;
  const test = await http((revision) =>
    ++count < 5
      ? new Response(JSON.stringify({ error: "temporary outage" }), {
          status: 503,
        })
      : new Response(JSON.stringify({ revision, status: "imported" })),
  );
  test.watch.replace(target(), ready);
  await vi.advanceTimersByTimeAsync(94_999);
  expect(test.requests.map(({ at }) => at - 10_000)).toEqual([
    5000, 15_000, 35_000, 65_000,
  ]);
  expect(test.changed).not.toHaveBeenCalled();
  expect(test.authorizationLost).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(test.requests[4].at - 10_000).toBe(95_000);
  expect(test.changed).toHaveBeenCalledExactlyOnceWith({
    revision: 1,
    status: "imported",
  });
});

it.each([
  null,
  { revision: 2, status: "imported" },
  { revision: "1", status: "imported" },
  { revision: 1, status: "unknown" },
  { revision: 1, status: ["imported"] },
  { revision: 1, status: "imported", message: { private: "value" } },
])(
  "rejects a malformed or mismatched receipt without corrupting delivery state: %j",
  async (invalid) => {
    let count = 0;
    const test = await http(
      (revision) =>
        new Response(
          JSON.stringify(
            ++count === 1 ? invalid : { revision, status: "imported" },
          ),
        ),
    );
    test.watch.replace(target(), ready);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(test.fetch).toHaveBeenCalledOnce();
    expect(test.changed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(test.changed).toHaveBeenCalledExactlyOnceWith({
      revision: 1,
      status: "imported",
    });
  },
);

it("keeps watching beyond ten minutes until the actual session expires", async () => {
  const test = await http();
  test.watch.replace(target(1, Date.now() + 11 * 60_000), ready);
  await vi.advanceTimersByTimeAsync(10 * 60_000 + 15_000);
  expect(test.requests.at(-1)!.at - 10_000).toBe(10 * 60_000 + 15_000);
  expect(test.expired).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(45_000);
  expect(test.expired).toHaveBeenCalledExactlyOnceWith(1);
  const count = test.requests.length;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(test.requests).toHaveLength(count);
});

it("isolates throwing UI callbacks and leaves no timer after terminal completion", async () => {
  const test = await http(
    (revision) =>
      new Response(JSON.stringify({ revision, status: "imported" })),
  );
  test.changed.mockImplementation(() => {
    throw new Error("UI unmounted");
  });
  test.watch.replace(target(), ready);
  await vi.advanceTimersByTimeAsync(5000);
  expect(test.changed).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(test.requests).toHaveLength(1);
});

it("ignores an already terminal initial receipt and snapshots mutable delivery targets", async () => {
  const test = await http(
    (revision) =>
      new Response(JSON.stringify({ revision, status: "imported" })),
  );
  test.watch.replace(target(), { revision: 1, status: "imported" });
  await vi.advanceTimersByTimeAsync(5000);
  expect(test.fetch).not.toHaveBeenCalled();
  const mutable = target();
  test.watch.replace(mutable, ready);
  mutable.senderToken = "b".repeat(64);
  mutable.revision = 2;
  await vi.advanceTimersByTimeAsync(5000);
  expect(test.changed).toHaveBeenCalledExactlyOnceWith({
    revision: 1,
    status: "imported",
  });
  expect(test.requests[0].headers.get("Authorization")).toBe(`Bearer ${token}`);
});

it("rejects invalid initial deliveries without leaking their token or scheduling work", async () => {
  const test = await http();
  expect(() =>
    test.watch.replace(
      { ...target(), senderToken: "private-invalid-value" },
      ready,
    ),
  ).toThrow("Invalid Studio delivery.");
  expect(() => test.watch.replace(target(2), ready)).toThrow(
    "Invalid Studio receipt.",
  );
  expect(test.fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  ["imported", "Imported into Studio. Your UI is ready to arrange."],
  ["queued", "Sent to Studio. Import will finish when you stop the play test."],
  ["ready", "Delivered to Studio. Review your design and click Import there."],
  [
    "pending",
    "Delivered to Studio. Review your design and click Import there.",
  ],
  ["failed", "Studio could not import this design. Review the Studio plugin."],
  ["superseded", "This export was replaced by a newer design sent to Studio."],
] as const)("formats the %s status consistently", (status, message) => {
  expect(studioReceiptMessage({ revision: 1, status })).toBe(message);
});

it("preserves the actual Studio failure message", () => {
  expect(
    studioReceiptMessage({
      revision: 1,
      status: "failed",
      message: "Another operation is recording.",
    }),
  ).toBe("Another operation is recording.");
});
