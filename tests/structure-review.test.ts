import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { flatten, type LayerOverride } from "../packages/core/src/types";
import { applyOverrideChanges } from "../packages/core/src/bulk-editor";
import { validateExportPackage } from "../packages/core/src/export-package";
import {
  structureReview,
  reviewChanges,
  rememberReview,
  readReviewPreferences,
  EMPTY_REVIEW_PREFERENCES,
  canRememberReview,
} from "../packages/core/src/structure-review";
import {
  correctedReview,
  reviewDesign,
  reviewPackage,
} from "./structure-review-fixtures";
const report = (overrides: Record<string, LayerOverride> = {}) =>
  structureReview([reviewDesign()], reviewPackage(overrides), overrides);
const layer = (id: string, overrides: Record<string, LayerOverride> = {}) =>
  report(overrides).layers.find((l) => l.source.id === id)!;
describe("reviewable structure", () => {
  it("explains existing artwork conversion rather than suggesting that vectors become frames", () => {
    const logo = layer("logo");
    expect(logo.node?.className).toBe("ImageLabel");
    expect(logo.reasons.join(" ")).toMatch(/Image export.*vector/i);
    expect(logo.suggestions).toEqual([]);
  });
  it("distinguishes possible intent from measured regular layout", () => {
    expect(layer("ambiguous-button").suggestions).toContainEqual(
      expect.objectContaining({
        category: "class",
        confidence: "Possible",
        decision: { kind: "class", value: "TextButton" },
      }),
    );
    expect(layer("manual-list").suggestions).toContainEqual(
      expect.objectContaining({
        category: "scroll",
        confidence: "Possible",
        decision: { kind: "scroll", value: "Y" },
      }),
    );
    expect(layer("manual-list").suggestions).toContainEqual(
      expect.objectContaining({
        category: "layout",
        confidence: "Likely",
        decision: { kind: "layout", value: "list-y" },
      }),
    );
    expect(layer("manual-grid").suggestions).toContainEqual(
      expect.objectContaining({
        category: "layout",
        decision: { kind: "layout", value: "grid" },
      }),
    );
    expect(layer("panel").suggestions).toContainEqual(
      expect.objectContaining({
        category: "role",
        decision: { kind: "role", value: "panel" },
      }),
    );
  });
  it("leaves packages, source names and overrides unchanged during review", () => {
    const designs = [reviewDesign()],
      pkg = reviewPackage(),
      overrides = {};
    const before = JSON.stringify({ designs, pkg, overrides });
    structureReview(designs, pkg, overrides);
    expect(JSON.stringify({ designs, pkg, overrides })).toBe(before);
  });
  it("applies accepted classifications, roles and geometry through the actual converter", () => {
    const result = correctedReview(),
      nodes = new Map(flatten(result.package.roots).map((n) => [n.id, n]));
    validateExportPackage(result.package);
    expect(nodes.get("ambiguous-button")).toMatchObject({
      className: "TextButton",
      name: "ClaimButton",
    });
    expect(nodes.get("button-label")?.className).toBe("TextLabel");
    expect(nodes.get("manual-list")).toMatchObject({
      className: "ScrollingFrame",
      properties: {
        ScrollingDirection: {
          type: "Enum",
          value: ["ScrollingDirection", "Y"],
        },
        AutomaticCanvasSize: { type: "Enum", value: ["AutomaticSize", "Y"] },
      },
    });
    expect(nodes.get("manual-list/layout")?.properties.Padding).toEqual({
      type: "UDim",
      value: [0, 12],
    });
    expect(nodes.get("manual-grid/grid")?.properties).toMatchObject({
      CellSize: { type: "UDim2", value: [0, 80, 0, 80] },
      CellPadding: { type: "UDim2", value: [0, 12, 0, 12] },
      FillDirectionMaxCells: 2,
    });
    [0, 1, 2, 3].forEach((i) =>
      expect(nodes.get(`slot-${i}`)?.properties.LayoutOrder).toBe(i + 1),
    );
    expect(nodes.get("panel")?.behavior?.role).toBe("panel");
    expect(reviewDesign().children[0].name).toBe("Frame 17");
  });
  it("preserves unrelated application settings and makes layout order part of one batch", () => {
    const overrides = {
      "manual-grid": { name: "Kept", properties: { Rotation: 9 } },
      "slot-3": { properties: { ZIndex: 8 } },
    };
    const changes = reviewChanges(
      layer("manual-grid", overrides),
      { kind: "layout", value: "grid" },
      overrides,
    );
    expect(changes).toHaveLength(5);
    expect(changes[0].value).toMatchObject({
      name: "Kept",
      properties: { Rotation: 9 },
    });
    expect(
      changes.find((c) => c.id === "slot-3")?.value?.properties,
    ).toMatchObject({ ZIndex: 8, LayoutOrder: 4 });
  });
  it("keeps a deliberately explicit child button after its parent becomes a button", () => {
    const edits = {
      ...correctedReview().overrides,
      "button-label": {
        className: "TextButton",
        renderMode: "native" as const,
      },
    };
    expect(
      flatten(reviewPackage(edits).roots).find((n) => n.id === "button-label")
        ?.className,
    ).toBe("TextButton");
  });
  it("respects explicit class, rendering, role, name and layout choices", () => {
    const overrides = {
      "ambiguous-button": {
        className: "Frame",
        renderMode: "native" as const,
        name: "Kept",
      },
      "manual-list": {
        className: "Frame",
        components: { layout: false as const, grid: false as const },
      },
      panel: { behavior: false as const },
    };
    expect(layer("ambiguous-button", overrides).suggestions).toEqual([]);
    expect(layer("manual-list", overrides).suggestions).toEqual([]);
    expect(layer("panel", overrides).suggestions).toEqual([]);
  });
  it("can keep free positioning and restore source classification without removing other properties", () => {
    const initial = {
      "ambiguous-button": {
        className: "TextButton",
        renderMode: "native" as const,
        properties: { ZIndex: 6 },
      },
    };
    const next = applyOverrideChanges(
      initial,
      reviewChanges(
        layer("ambiguous-button", initial),
        { kind: "class", value: "auto" },
        initial,
      ),
    );
    expect(next["ambiguous-button"]).toEqual({ properties: { ZIndex: 6 } });
    const free = applyOverrideChanges(
      {},
      reviewChanges(
        layer("manual-list"),
        { kind: "layout", value: "free" },
        {},
      ),
    );
    expect(
      layer("manual-list", free).suggestions.some(
        (s) => s.category === "layout",
      ),
    ).toBe(false);
  });
  it("does not turn uneven, overlapping, rotated or absolutely placed items into a native list", () => {
    for (const mutate of [
      (n: any) => (n.children[1].transform[1][2] = 70),
      (n: any) => (n.children[1].transform[1][2] = 10),
      (n: any) =>
        (n.children[1].transform = [
          [0, -1, 0],
          [1, 0, 60],
        ]),
      (n: any) => (n.children[1].absolute = true),
      (n: any) =>
        n.children.push(
          node("Absolute overlay", { id: "absolute-overlay", absolute: true }),
        ),
    ]) {
      const source = reviewDesign();
      mutate(source.children[1]);
      const pkg = compile([source], "irregular", { layout: "exact" });
      const result = structureReview([source], pkg);
      expect(
        result.layers
          .find((l) => l.source.id === "manual-list")
          ?.suggestions.some((s) => s.category === "layout"),
      ).toBe(false);
    }
  });
  it("identifies baked children and prevents edits that cannot reach an exported instance", () => {
    const source = node("Art", {
      id: "art",
      type: "GROUP",
      children: [node("Path", { id: "path", type: "VECTOR" })],
    });
    const pkg = compile([source], "baked");
    const result = structureReview([source], pkg);
    const child = result.layers.find((l) => l.source.id === "path")!;
    expect(child.blocked).toMatch(/image/);
    expect(() =>
      reviewChanges(child, { kind: "class", value: "Frame" }, {}),
    ).toThrow(/editable source/);
  });
  it("rejects holes in a manual grid while allowing a partial final row", () => {
    for (const sparse of [false, true]) {
      const source = reviewDesign(),
        grid = source.children[2];
      const extra = structuredClone(grid.children[0]);
      extra.id = "extra-cell";
      extra.transform[0][2] = sparse ? 92 : 0;
      extra.transform[1][2] = 184;
      grid.children.push(extra);
      const pkg = compile([source], "grid-review", { layout: "exact" });
      const reviewed = structureReview([source], pkg).layers.find(
        (l) => l.source.id === "manual-grid",
      )!;
      expect(
        reviewed.suggestions.some(
          (s) => s.category === "layout" && s.decision.value === "grid",
        ),
      ).toBe(!sparse);
      if (sparse)
        expect(() =>
          reviewChanges(reviewed, { kind: "layout", value: "grid" }, {}),
        ).toThrow(/Grid inference/);
    }
  });
  it("does not infer scrolling from an unmeasured rotated child or on artwork", () => {
    const source = reviewDesign(),
      list = source.children[1];
    list.children[2].transform = [
      [0, -1, 0],
      [1, 0, 120],
    ];
    const pkg = compile([source], "rotated", { layout: "exact" });
    const reviewed = structureReview([source], pkg).layers.find(
      (l) => l.source.id === "manual-list",
    )!;
    expect(reviewed.suggestions.some((s) => s.category === "scroll")).toBe(
      false,
    );
    expect(() =>
      reviewChanges(layer("logo"), { kind: "scroll", value: "Y" }, {}),
    ).toThrow(/editable container/);
  });
  it("explains the actual exported class when automatic button detection is off", () => {
    const source = node("Claim", { id: "claim" });
    const pkg = compile([source], "no-buttons", { detectButtons: false });
    const reviewed = structureReview([source], pkg).layers[0];
    expect(reviewed.node?.className).toBe("Frame");
    expect(reviewed.reasons.join(" ")).not.toMatch(/Button choice/);
  });
  it("does not replace a Figma auto layout with a guessed layout", () => {
    const source = reviewDesign();
    source.children[1].layout = {
      mode: "VERTICAL",
      spacing: 12,
      padding: [0, 0, 0, 0],
      primary: "MIN",
      counter: "MIN",
      wrap: false,
    };
    const pkg = compile([source], "source-layout", { layout: "responsive" });
    expect(
      structureReview([source], pkg)
        .layers.find((l) => l.source.id === "manual-list")
        ?.suggestions.some((s) => s.category === "layout"),
    ).toBe(false);
  });
  it("bounds large source scans and reports the omitted portion", () => {
    const designs = Array.from({ length: 10001 }, (_, i) =>
      node("Layer", { id: String(i) }),
    );
    const pkg = reviewPackage();
    const result = structureReview(designs, pkg);
    expect(result.layers).toHaveLength(10000);
    expect(result.truncated).toBe(true);
  });
});
describe("owned correction preferences", () => {
  it("recommends a saved choice on a new identity without silently changing the package", () => {
    const source = node("Confirm card", {
      id: "old",
      width: 180,
      height: 48,
      children: [node("Decoration", { id: "art" })],
    });
    const prefs = rememberReview(EMPTY_REVIEW_PREFERENCES, source, {
      kind: "class",
      value: "TextButton",
    });
    const next = { ...source, id: "new" },
      pkg = compile([next], "new-doc");
    const before = JSON.stringify(pkg);
    const result = structureReview([next], pkg, {}, prefs);
    expect(result.layers[0].suggestions).toContainEqual(
      expect.objectContaining({
        confidence: "Saved choice",
        decision: { kind: "class", value: "TextButton" },
      }),
    );
    expect(JSON.stringify(pkg)).toBe(before);
    expect(JSON.stringify(prefs)).not.toContain('"old"');
  });
  it("does not match a different name, source type or content family", () => {
    const source = reviewDesign().children[1],
      prefs = rememberReview(EMPTY_REVIEW_PREFERENCES, source, {
        kind: "scroll",
        value: "Y",
      });
    for (const other of [
      { ...source, name: "Different" },
      { ...source, type: "GROUP" },
      { ...source, children: [] },
    ]) {
      const pkg = compile([other], "other");
      expect(
        structureReview([other], pkg, {}, prefs).layers[0].suggestions.some(
          (s) => s.confidence === "Saved choice",
        ),
      ).toBe(false);
    }
  });
  it("keeps explicit corrections above memory and supports disable/reset", () => {
    const source = reviewDesign().children[1],
      prefs = rememberReview(EMPTY_REVIEW_PREFERENCES, source, {
        kind: "class",
        value: "TextButton",
      }),
      overrides = {
        [source.id]: { className: "Frame", renderMode: "native" as const },
      };
    const pkg = compile([source], "explicit", { layerOverrides: overrides });
    expect(
      structureReview(
        [source],
        pkg,
        overrides,
        prefs,
      ).layers[0].suggestions.some((s) => s.confidence === "Saved choice"),
    ).toBe(false);
    expect(
      structureReview(
        [source],
        pkg,
        {},
        { ...prefs, enabled: false },
      ).layers[0].suggestions.some((s) => s.confidence === "Saved choice"),
    ).toBe(false);
    expect(readReviewPreferences(null).rules).toEqual([]);
  });
  it("rejects generic names and caps remembered choices rather than broadening a match", () => {
    const generic = reviewDesign().children[0];
    expect(canRememberReview(generic)).toBe(false);
    expect(() =>
      rememberReview(EMPTY_REVIEW_PREFERENCES, generic, {
        kind: "class",
        value: "TextButton",
      }),
    ).toThrow(/meaningful name/);
    let prefs = EMPTY_REVIEW_PREFERENCES;
    for (let i = 0; i < 200; i++)
      prefs = rememberReview(prefs, node(`Card ${i}`), {
        kind: "class",
        value: "Frame",
      });
    expect(() =>
      rememberReview(prefs, node("One more"), {
        kind: "class",
        value: "Frame",
      }),
    ).toThrow(/full/);
  });
  it("replaces the same preference category and strips unknown credential fields", () => {
    const source = reviewDesign().children[1];
    let prefs = rememberReview(EMPTY_REVIEW_PREFERENCES, source, {
      kind: "class",
      value: "Frame",
    });
    prefs = rememberReview(prefs, source, { kind: "scroll", value: "Y" });
    expect(prefs.rules).toHaveLength(1);
    const raw = {
      ...prefs,
      token: "secret",
      rules: prefs.rules.map((r) => ({
        ...r,
        apiKey: "secret",
        sourceId: "secret",
      })),
    };
    const read = readReviewPreferences(raw);
    expect(JSON.stringify(read)).not.toContain("secret");
    expect(read).toEqual(prefs);
  });
  it("does not accept executable, arbitrary-name, invalid or unbounded choices", () => {
    const base = { name: "Confirm", sourceType: "FRAME", family: "container" };
    const rules = [
      { ...base, decision: { kind: "scroll", value: { toString: () => "Y" } } },
      {
        ...base,
        name: "Frame 17 [button]",
        decision: { kind: "class", value: "TextButton" },
      },
      { ...base, decision: { kind: "class", value: "Script" } },
      { ...base, decision: { kind: "name", value: "Injected" } },
      {
        ...base,
        decision: { kind: "role", value: "panel", script: "malicious" },
      },
      {
        ...base,
        name: "x".repeat(101),
        decision: { kind: "class", value: "Frame" },
      },
    ];
    expect(readReviewPreferences({ version: 1, rules }).rules).toEqual([]);
  });
});
