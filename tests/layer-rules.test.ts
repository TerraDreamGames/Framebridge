import { describe, expect, it } from "vitest";
import {
  matchLayers,
  validLayerMatchRule,
} from "../packages/core/src/layer-rules";
import {
  conditionalExampleDesign,
  conditionalExamplePackage,
  conditionalExampleOverrides,
} from "../packages/core/src/conditional-examples";
import { flatten } from "../packages/core/src/types";
import {
  propertyChanges,
  classChanges,
  applyOverrideChanges,
} from "../packages/core/src/bulk-editor";
import { selectRuleLayers } from "../plugins/figma/src/select-rule-layers";
const layers = () => {
  const sources = new Map<
    string,
    ReturnType<typeof conditionalExampleDesign>[number]
  >();
  const visit = (items: ReturnType<typeof conditionalExampleDesign>) =>
    items.forEach((n) => {
      sources.set(n.id, n);
      visit(n.children);
    });
  visit(conditionalExampleDesign());
  return flatten(conditionalExamplePackage().roots).map((n) => ({
    node: n,
    source: sources.get(n.id),
    baked: false,
  }));
};
describe("rule-based bulk layer selection and editing", () => {
  it("matches all/any typed tests and applies one shared edit preserving configured rules", () => {
    const overrides = conditionalExampleOverrides(),
      before = JSON.stringify(overrides);
    const matches = matchLayers(layers(), overrides, {
      mode: "all",
      predicates: [
        { field: "sourceType", operator: "eq", value: "TEXT" },
        { field: "width", operator: "gte", value: 250 },
        { field: "name", operator: "notContains", value: "premium" },
      ],
    });
    expect(matches.map((m) => m.node.id)).toEqual(["status", "buy", "compact"]);
    const next = applyOverrideChanges(
      overrides,
      propertyChanges(matches, overrides, "TextColor3", {
        type: "Color3",
        value: [1, 0, 0],
      }),
    );
    expect(next["rules-screen"]).toEqual(overrides["rules-screen"]);
    expect(next.status.properties?.RichText).toBe(true);
    expect(JSON.stringify(overrides)).toBe(before);
    const buttons = applyOverrideChanges(
      next,
      classChanges(matches, next, "TextButton"),
    );
    expect(
      matches.every((m) => buttons[m.node.id].className === "TextButton"),
    ).toBe(true);
    expect(
      matchLayers(layers(), overrides, {
        mode: "any",
        predicates: [
          { field: "className", operator: "eq", value: "textbutton" },
          { field: "name", operator: "contains", value: "PREMIUM" },
        ],
      }).map((m) => m.node.id),
    ).toContain("buy");
  });
  it("distinguishes manual settings, source text, visibility and baked layers", () => {
    const all = layers();
    all.find((l) => l.node.id === "premium")!.baked = true;
    expect(
      matchLayers(all, conditionalExampleOverrides(), {
        mode: "all",
        predicates: [{ field: "baked", operator: "eq", value: true }],
      }).map((l) => l.node.id),
    ).toEqual(["premium"]);
    expect(
      matchLayers(all, conditionalExampleOverrides(), {
        mode: "all",
        predicates: [
          { field: "overridden", operator: "eq", value: true },
          { field: "text", operator: "contains", value: "design" },
        ],
      }).map((l) => l.node.id),
    ).toEqual(["status"]);
  });
  it.each([
    { mode: "eval", predicates: [] },
    {
      mode: "all",
      predicates: [{ field: "name", operator: "regex", value: ".*" }],
    },
    {
      mode: "all",
      predicates: [{ field: "width", operator: "gte", value: "10" }],
    },
    {
      mode: "all",
      predicates: [{ field: "visible", operator: "eq", value: "true" }],
    },
    {
      mode: "all",
      predicates: Array(9).fill({
        field: "name",
        operator: "contains",
        value: "a",
      }),
    },
  ])("rejects executable, untyped or oversized matcher %j", (rule) => {
    expect(validLayerMatchRule(rule)).toBe(false);
  });
  it("resolves native Figma selection transactionally and keeps existing selection on stale, cross-page and cancelled jobs", async () => {
    const page: any = { id: "page", selection: [{ id: "original" }] },
      other: any = { id: "other-page" };
    const nodes: any = {
      a: { id: "a", width: 100, parent: page },
      b: { id: "b", width: 100, parent: page },
      foreign: { id: "foreign", width: 100, parent: other },
    };
    const api: any = {
      currentPage: page,
      getNodeByIdAsync: async (id: string) => nodes[id] ?? null,
      viewport: {
        scrollAndZoomIntoView: (items: any) => {
          expect(items).toEqual([nodes.a, nodes.b]);
        },
      },
    };
    await expect(selectRuleLayers(api, ["a", "b"])).resolves.toBe(2);
    const before = page.selection;
    for (const ids of [
      ["a", "missing"],
      ["foreign"],
      ["a", "a"],
      Array(1001).fill("a"),
    ])
      await expect(selectRuleLayers(api, ids)).rejects.toThrow();
    expect(page.selection).toBe(before);
    await expect(selectRuleLayers(api, ["a"], () => true)).rejects.toThrow(
      "cancelled",
    );
    expect(page.selection).toBe(before);
    let changed = false;
    api.getNodeByIdAsync = async (id: string) => {
      changed = true;
      return nodes[id];
    };
    await expect(selectRuleLayers(api, ["a"], () => changed)).rejects.toThrow(
      "cancelled",
    );
    expect(page.selection).toBe(before);
  });
});
