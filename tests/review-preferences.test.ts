import { describe, it, expect } from "vitest";
import {
  structureReview,
  reviewChanges,
  readReviewPreferences,
  EMPTY_REVIEW_PREFERENCES,
} from "../packages/core/src/structure-review";
import { validateCloudPreferences } from "../packages/core/src/review-cloud";
import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import { readSavedReviewSync } from "../plugins/figma/src/review-sync-storage";
const prefs = {
  ...EMPTY_REVIEW_PREFERENCES,
  naming: { style: "pascal" as const, prefix: "UI" },
  hints: [
    {
      phrase: "purchase",
      sourceType: "*",
      decision: { kind: "class" as const, value: "TextButton" as const },
    },
  ],
};
describe("review conventions and private sync schema", () => {
  it("restores typed hints/naming and proposes reviewed changes without modifying design/export/manual settings", () => {
    const design = node("purchase panel", {
        id: "purchase",
        children: [node("Decoration", { id: "child" })],
      }),
      pkg = compile([design], "review");
    const before = JSON.stringify({ design, pkg });
    const report = structureReview([design], pkg, {}, prefs);
    const layer = report.layers.find((l) => l.source.id === "purchase")!;
    expect(layer.suggestions).toContainEqual(
      expect.objectContaining({
        decision: { kind: "name", value: "UIPurchasePanel" },
        confidence: "Saved choice",
      }),
    );
    expect(layer.suggestions).toContainEqual(
      expect.objectContaining({
        decision: { kind: "class", value: "TextButton" },
      }),
    );
    expect(
      reviewChanges(layer, { kind: "name", value: "UIPurchasePanel" }, {}),
    ).toContainEqual(
      expect.objectContaining({
        id: "purchase",
        value: expect.objectContaining({ name: "UIPurchasePanel" }),
      }),
    );
    expect(JSON.stringify({ design, pkg })).toBe(before);
    expect(
      structureReview(
        [design],
        pkg,
        { purchase: { name: "Pinned", className: "Frame" } },
        prefs,
      ).layers[0].suggestions.some((s) => s.confidence === "Saved choice"),
    ).toBe(false);
    expect(
      structureReview(
        [design],
        pkg,
        {},
        { ...prefs, enabled: false },
      ).layers[0].suggestions.some((s) => s.confidence === "Saved choice"),
    ).toBe(false);
    expect(readReviewPreferences(JSON.parse(JSON.stringify(prefs)))).toEqual(
      prefs,
    );
  });
  it("does not suggest incompatible classes or rules on baked descendants", () => {
    const design = node("purchase art", {
        id: "art",
        type: "VECTOR",
        children: [node("purchase layer", { id: "child" })],
      }),
      pkg = compile([design], "review");
    const report = structureReview(
      [design],
      pkg,
      {},
      {
        ...prefs,
        hints: [
          {
            phrase: "purchase",
            sourceType: "*",
            decision: { kind: "class", value: "TextBox" },
          },
        ],
      },
    );
    expect(
      report.layers[0].suggestions.some(
        (s) => s.decision.kind === "class" && s.decision.value === "TextBox",
      ),
    ).toBe(false);
    expect(
      report.layers.find((l) => l.source.id === "child")?.suggestions,
    ).toEqual([]);
  });
  it("strictly rejects unknown/design/credential fields, malformed conventions and excessive hint/value sizes", () => {
    expect(validateCloudPreferences(prefs)).toEqual(prefs);
    for (const invalid of [
      { ...prefs, apiKey: "secret" },
      { ...prefs, package: {} },
      { ...prefs, naming: { ...prefs.naming, sourceId: "design" } },
      {
        ...prefs,
        hints: [
          {
            ...prefs.hints[0],
            decision: {
              kind: "class",
              value: "TextButton",
              script: "print(1)",
            },
          },
        ],
      },
      { ...prefs, hints: Array(33).fill(prefs.hints[0]) },
      { ...prefs, naming: { style: "expression", prefix: "" } },
      { ...prefs, rules: Array(201).fill({}) },
    ])
      expect(() => validateCloudPreferences(invalid)).toThrow();
  });
  it("binds saved grants to their exact service/account and discards malformed or expanded records", () => {
    const saved = {
      version: 1,
      origin: "https://relay.test",
      userId: "123",
      grantToken: "a".repeat(64),
      scope: { kind: "personal", id: "123", label: "Creator" },
    };
    expect(readSavedReviewSync(saved, "https://relay.test", "123")).toEqual(
      saved,
    );
    expect(
      readSavedReviewSync(saved, "https://other.test", "123"),
    ).toBeUndefined();
    expect(
      readSavedReviewSync(saved, "https://relay.test", "456"),
    ).toBeUndefined();
    for (const invalid of [
      { ...saved, token: "secret" },
      { ...saved, origin: "https://relay.test/path" },
      { ...saved, grantToken: 123 },
      { ...saved, scope: { ...saved.scope, credentials: {} } },
    ])
      expect(readSavedReviewSync(invalid)).toBeUndefined();
  });
});
