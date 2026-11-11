import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONBOARDING,
  firstLaunchStage,
  readOnboarding,
  createOnboardingStorage,
  onboardingStep,
} from "../plugins/figma/src/onboarding";
import {
  TOUR_STEPS,
  isTourStep,
  placeTourCard,
  tourLesson,
} from "../plugins/figma/src/onboarding-tour";

describe("guided feature tour", () => {
  it("offers sign-in before the tutorial and remembers either skip", () => {
    const disconnected = { accountEnabled: true, connected: false };
    expect(firstLaunchStage(DEFAULT_ONBOARDING, disconnected)).toBe("sign-in");
    expect(
      firstLaunchStage(DEFAULT_ONBOARDING, {
        ...disconnected,
        connected: true,
      }),
    ).toBe("tutorial");
    expect(
      firstLaunchStage(DEFAULT_ONBOARDING, {
        ...disconnected,
        accountEnabled: false,
      }),
    ).toBe("tutorial");
    const skipped = readOnboarding({
      ...DEFAULT_ONBOARDING,
      skippedSignIn: true,
    })!;
    expect(firstLaunchStage(skipped, disconnected)).toBe("tutorial");
    for (const status of ["active", "dismissed", "complete"] as const) {
      expect(
        firstLaunchStage({ ...skipped, status }, disconnected),
      ).toBeUndefined();
    }
    expect(
      firstLaunchStage({ ...DEFAULT_ONBOARDING, tourDone: true }, disconnected),
    ).toBeUndefined();
  });

  it("offers the new onboarding once after an old dismissal", async () => {
    let saved: unknown = { version: 1, status: "dismissed", route: "download" };
    const storage = createOnboardingStorage({
      getAsync: async () => saved,
      setAsync: async (_, value) => {
        saved = value;
      },
    });
    const connected = { accountEnabled: true, connected: true };
    const upgraded = await storage.load();
    expect(upgraded).toEqual({ ...DEFAULT_ONBOARDING, route: "download" });
    expect(firstLaunchStage(upgraded, connected)).toBe("tutorial");
    expect(firstLaunchStage(upgraded, { ...connected, connected: false })).toBe(
      "sign-in",
    );
    await storage.save({
      ...upgraded,
      status: "dismissed",
      skippedSignIn: true,
    });
    expect(firstLaunchStage(await storage.load(), connected)).toBeUndefined();
  });

  it("preserves completed legacy guides and paused lessons", () => {
    expect(
      readOnboarding({ version: 1, status: "complete", route: "download" }),
    ).toEqual({ version: 2, status: "complete", route: "download" });
    expect(
      readOnboarding({
        version: 1,
        status: "active",
        route: "connect",
        tourDone: true,
      })?.status,
    ).toBe("complete");
    expect(
      readOnboarding({
        version: 1,
        status: "active",
        route: "connect",
        tourStep: "properties",
      }),
    ).toEqual({ ...DEFAULT_ONBOARDING, tourStep: "properties" });
    expect(
      readOnboarding({
        ...DEFAULT_ONBOARDING,
        status: "complete",
        tourStep: "layouts",
        tourDone: false,
      }),
    ).toEqual({
      ...DEFAULT_ONBOARDING,
      status: "complete",
      tourStep: "layouts",
      tourDone: false,
    });
    expect(
      readOnboarding({
        ...DEFAULT_ONBOARDING,
        tourStep: "deleted-lesson",
        tourDone: "yes",
      }),
    ).toEqual(DEFAULT_ONBOARDING);
  });
  it("persists a paused lesson and keeps tour completion separate from a real import", async () => {
    let saved: unknown;
    const storage = createOnboardingStorage({
      getAsync: async () => saved,
      setAsync: async (_, value) => {
        saved = value;
      },
    });
    await storage.save({
      ...DEFAULT_ONBOARDING,
      status: "active",
      tourStep: "images",
      tourDone: false,
    });
    expect((await storage.load()).tourStep).toBe("images");
    await storage.save({ ...(await storage.load()), tourDone: true });
    expect((await storage.load()).tourDone).toBe(true);
    expect(
      onboardingStep("connect", {
        analyzed: true,
        connected: true,
        downloaded: false,
        receipt: "queued",
      }),
    ).toBe(2);
  });
  it("provides stable unique lessons, skips unknown saved lessons safely and ends with transfer", () => {
    expect(new Set(TOUR_STEPS.map((step) => step.id)).size).toBe(
      TOUR_STEPS.length,
    );
    expect(isTourStep("layouts")).toBe(true);
    expect(isTourStep("__proto__")).toBe(false);
    expect(tourLesson(undefined).id).toBe("analyze");
    expect(TOUR_STEPS[TOUR_STEPS.length - 1]?.id).toBe("studio");
  });
});

describe("coach placement", () => {
  it("leaves the highlighted sidebar exposed when adjacent space is available", () => {
    expect(
      placeTourCard(
        { left: 0, top: 60, width: 260, height: 680 },
        { width: 1100, height: 800 },
        { width: 340, height: 420 },
      ),
    ).toEqual({ left: 276, top: 76 });
    expect(
      placeTourCard(
        { left: 780, top: 60, width: 320, height: 680 },
        { width: 1100, height: 800 },
        { width: 340, height: 420 },
      ),
    ).toEqual({ left: 424, top: 76 });
  });
  it("uses vertical space for a wide, short control", () => {
    expect(
      placeTourCard(
        { left: 20, top: 60, width: 1060, height: 80 },
        { width: 1100, height: 800 },
        { width: 340, height: 420 },
      ),
    ).toEqual({ left: 20, top: 156 });
    expect(
      placeTourCard(
        { left: 20, top: 600, width: 1060, height: 100 },
        { width: 1100, height: 800 },
        { width: 340, height: 420 },
      ),
    ).toEqual({ left: 20, top: 164 });
  });
  it("keeps the card reachable with absent targets and compact windows", () => {
    for (const viewport of [
      { width: 360, height: 480 },
      { width: 640, height: 420 },
      { width: 1400, height: 1000 },
    ]) {
      const card = {
        width: Math.min(340, viewport.width - 24),
        height: Math.min(480, viewport.height - 24),
      };
      for (const target of [
        undefined,
        { left: 0, top: 0, width: viewport.width, height: viewport.height },
      ]) {
        const result = placeTourCard(target, viewport, card);
        expect(result.left).toBeGreaterThanOrEqual(12);
        expect(result.top).toBeGreaterThanOrEqual(12);
        expect(result.left + card.width).toBeLessThanOrEqual(
          viewport.width - 12,
        );
        expect(result.top + card.height).toBeLessThanOrEqual(
          viewport.height - 12,
        );
      }
    }
  });
});
