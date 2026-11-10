import { afterEach, expect, it, vi } from "vitest";
import { mapConcurrent } from "../packages/core/src/concurrency";
import { Waiters, waitMilliseconds } from "../packages/relay/src/waiters";
import { connectionLifetime } from "../plugins/figma/src/connection-lifetime";
afterEach(() => vi.useRealTimers());
it.each([
  [7200000, "2h 0m", false],
  [3660000, "1h 1m", false],
  [300001, "6m", false],
  [300000, "5m", true],
  [299000, "4:59", true],
  [61000, "1:01", true],
  [1, "0:01", true],
  [0, "Expired", true],
  [-1000, "Expired", true],
])("formats connection lifetime at %i ms", (remaining, label, soon) => {
  expect(connectionLifetime(10000 + remaining, 10000)).toMatchObject({
    label,
    soon,
  });
});
it("overlaps bounded work, preserves input order, and waits for started cleanup on failure", async () => {
  let active = 0,
    peak = 0;
  const release: (() => void)[] = [];
  const run = mapConcurrent([0, 1, 2, 3], 2, async (n) => {
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => {
      release[n] = resolve;
    });
    active--;
    return n;
  });
  expect(peak).toBe(2);
  release[1]();
  await vi.waitFor(() => expect(release[2]).toBeTypeOf("function"));
  release[0]();
  await vi.waitFor(() => expect(release[3]).toBeTypeOf("function"));
  release[3]();
  release[2]();
  expect(await run).toEqual([0, 1, 2, 3]);
  expect(peak).toBe(2);
  const started: number[] = [],
    cleaned: number[] = [];
  let finish!: () => void;
  const failed = mapConcurrent([0, 1, 2], 2, async (n) => {
    started.push(n);
    if (!n) throw new Error("failed");
    await new Promise<void>((r) => {
      finish = r;
    });
    cleaned.push(n);
  });
  const assertion = expect(failed).rejects.toThrow("failed");
  await Promise.resolve();
  expect(started).toEqual([0, 1]);
  expect(cleaned).toEqual([]);
  finish();
  await assertion;
  expect(cleaned).toEqual([1]);
});
it("bounds waiting requests, isolates sessions, and releases listeners on abort or timeout", async () => {
  vi.useFakeTimers();
  const waiters = new Waiters(),
    abort = new AbortController();
  const first = waiters.wait("one:inbox", 15000, abort.signal);
  const second = waiters.wait("one:inbox", 15000);
  expect(() => waiters.wait("one:inbox", 15000)).toThrow("two waiting");
  let otherFinished = false;
  const other = waiters.wait("other:inbox", 15000).then(() => {
    otherFinished = true;
  });
  abort.abort();
  await first;
  const receipt = waiters.wait("one:receipt", 15000);
  waiters.notify("one");
  await Promise.all([second, receipt]);
  expect(otherFinished).toBe(false);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(15000);
  await other;
  expect(vi.getTimerCount()).toBe(0);
  const reused = waiters.wait("one:inbox", 5);
  await vi.advanceTimersByTimeAsync(5);
  await reused;
  expect(vi.getTimerCount()).toBe(0);
  for (const [query, expected] of [
    ["150000", 15000],
    ["-5", 0],
    ["oops", 0],
    ["50", 50],
  ] as const)
    expect(waitMilliseconds(new URL("https://test/?wait=" + query))).toBe(
      expected,
    );
});
