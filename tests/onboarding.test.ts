import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOnboardingSession,
  createOnboardingStorage,
  DEFAULT_ONBOARDING,
  onboardingStep,
  ONBOARDING_KEY,
  readOnboarding,
  type OnboardingPreferences,
} from "../plugins/figma/src/onboarding";

afterEach(() => vi.useRealTimers());

describe("first import guide", () => {
  it("tracks the current design and waits for an actual Studio import receipt", () => {
    const facts = { analyzed: false, connected: false, downloaded: false };
    expect(onboardingStep("connect", facts)).toBe(0);
    expect(onboardingStep("connect", { ...facts, connected: true })).toBe(0);
    facts.analyzed = true;
    expect(onboardingStep("connect", facts)).toBe(1);
    facts.connected = true;
    expect(onboardingStep("connect", facts)).toBe(2);
    for (const receipt of [
      "pending",
      "ready",
      "queued",
      "failed",
      "superseded",
    ] as const)
      expect(onboardingStep("connect", { ...facts, receipt })).toBe(2);
    expect(onboardingStep("connect", { ...facts, receipt: "imported" })).toBe(
      3,
    );
    expect(onboardingStep("connect", { ...facts, connected: false })).toBe(1);
    expect(onboardingStep("connect", { ...facts, analyzed: false })).toBe(0);
  });

  it("provides an offline path without implying a download proves an import", () => {
    const facts = { analyzed: true, connected: false, downloaded: false };
    expect(onboardingStep("download", facts)).toBe(1);
    expect(onboardingStep("download", { ...facts, downloaded: true })).toBe(2);
    expect(onboardingStep("download", { ...facts, receipt: "imported" })).toBe(
      1,
    );
    expect(
      onboardingStep("download", {
        ...facts,
        analyzed: false,
        downloaded: true,
      }),
    ).toBe(0);
  });

  it("restores skip/completion and rejects incompatible or malformed saved preferences", () => {
    for (const status of ["new", "active", "dismissed", "complete"] as const) {
      const saved = {
        ...DEFAULT_ONBOARDING,
        status,
        route: "download" as const,
        secret: "discard",
      };
      expect(readOnboarding(saved)).toEqual({
        version: 2,
        status,
        route: "download",
      });
    }
    for (const value of [
      null,
      "complete",
      { ...DEFAULT_ONBOARDING, version: 3 },
      { ...DEFAULT_ONBOARDING, status: "imported" },
      { ...DEFAULT_ONBOARDING, route: "automatic" },
    ])
      expect(readOnboarding(value)).toBeUndefined();
  });

  it("orders rapid choices, restores the latest save and flushes before closing", async () => {
    let saved: unknown, release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writes: unknown[] = [];
    const storage = createOnboardingStorage({
      getAsync: async (key) => {
        expect(key).toBe(ONBOARDING_KEY);
        return saved;
      },
      setAsync: async (key, value) => {
        expect(key).toBe(ONBOARDING_KEY);
        writes.push(value);
        if (writes.length === 1) await paused;
        saved = value;
      },
    });
    expect(await storage.load()).toEqual(DEFAULT_ONBOARDING);
    const active = storage.save({ ...DEFAULT_ONBOARDING, status: "active" });
    const completed = storage.save({
      ...DEFAULT_ONBOARDING,
      status: "complete",
    });
    const reopening = storage.load();
    await Promise.resolve();
    expect(writes).toHaveLength(1);
    release();
    await Promise.all([active, completed, storage.flush()]);
    expect(await reopening).toEqual({
      ...DEFAULT_ONBOARDING,
      status: "complete",
    });
    await expect(storage.save({ version: 3 })).rejects.toThrow(
      "Invalid onboarding",
    );
  });

  it("recovers from a failed save without poisoning subsequent writes", async () => {
    let fail = true,
      saved: unknown;
    const storage = createOnboardingStorage({
      getAsync: async () => saved,
      setAsync: async (_key, value) => {
        if (fail) throw new Error("Unavailable");
        saved = value;
      },
    });
    await expect(
      storage.save({ ...DEFAULT_ONBOARDING, status: "dismissed" }),
    ).rejects.toThrow("Unavailable");
    fail = false;
    await storage.save({ ...DEFAULT_ONBOARDING, status: "dismissed" });
    expect((await storage.load()).status).toBe("dismissed");
  });
});

function session() {
  const send = vi.fn();
  const changed = vi.fn();
  const manager = createOnboardingSession({ send, changed, timeoutMs: 100 });
  const lastRequest = () =>
    send.mock.lastCall![1] as {
      revision: number;
      onboarding?: OnboardingPreferences;
    };
  return { send, changed, manager, lastRequest };
}

describe("onboarding preference messages", () => {
  it("does not reopen a dismissed guide when a delayed load arrives after an explicit choice", () => {
    vi.useFakeTimers();
    const { manager, lastRequest } = session();
    manager.load();
    const load = lastRequest();
    manager.choose({ status: "dismissed" });
    const save = lastRequest();
    manager.receive({
      type: "onboarding",
      revision: load.revision,
      onboarding: DEFAULT_ONBOARDING,
    });
    expect(manager.snapshot().preferences.status).toBe("dismissed");
    manager.receive({ type: "onboarding-saved", revision: save.revision });
    expect(manager.snapshot().saving).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(manager.snapshot().error).toBe("");
    manager.dispose();
  });

  it("ignores stale save failures and allows replay after saved completion", () => {
    vi.useFakeTimers();
    const { manager, lastRequest } = session();
    manager.load();
    manager.receive({
      type: "onboarding",
      revision: lastRequest().revision,
      onboarding: { ...DEFAULT_ONBOARDING, status: "complete" },
    });
    expect(manager.snapshot().preferences.status).toBe("complete");
    manager.choose({ status: "active" });
    const first = lastRequest();
    manager.choose({ route: "download" });
    manager.receive({
      type: "onboarding-error",
      action: "save",
      revision: first.revision,
    });
    expect(manager.snapshot().error).toBe("");
    manager.receive({
      type: "onboarding-saved",
      revision: lastRequest().revision,
    });
    expect(manager.snapshot().preferences).toEqual({
      version: 2,
      status: "active",
      route: "download",
    });
    manager.dispose();
  });

  it("keeps the workspace usable on load failure, and retries the latest preference on save failure", () => {
    vi.useFakeTimers();
    const { manager, lastRequest } = session();
    manager.load();
    vi.advanceTimersByTime(100);
    expect(manager.snapshot().loaded).toBe(false);
    expect(manager.snapshot().error).toContain("restored");
    manager.retry();
    manager.receive({
      type: "onboarding",
      revision: lastRequest().revision,
      onboarding: DEFAULT_ONBOARDING,
    });
    expect(manager.snapshot().loaded).toBe(true);
    manager.choose({ status: "dismissed" });
    manager.receive({
      type: "onboarding-error",
      action: "save",
      revision: lastRequest().revision,
    });
    expect(manager.snapshot().error).toContain("saved");
    manager.retry();
    expect(lastRequest().onboarding?.status).toBe("dismissed");
    manager.receive({
      type: "onboarding-saved",
      revision: lastRequest().revision,
    });
    expect(manager.snapshot().error).toBe("");
    manager.dispose();
  });

  it("stops updates and outstanding timers after the plugin closes", () => {
    vi.useFakeTimers();
    const { manager, changed, lastRequest } = session();
    manager.load();
    const load = lastRequest();
    manager.dispose();
    const before = changed.mock.calls.length;
    manager.receive({
      type: "onboarding",
      revision: load.revision,
      onboarding: DEFAULT_ONBOARDING,
    });
    manager.choose({ status: "active" });
    vi.advanceTimersByTime(1000);
    expect(changed).toHaveBeenCalledTimes(before);
  });
});
