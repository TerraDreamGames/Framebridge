import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import {
  conditionalExampleDesign,
  conditionalExampleOverrides,
  conditionalExamplePackage,
  conditionalExampleRules,
} from "../packages/core/src/conditional-examples";
import {
  evaluatePredicate,
  evaluateRule,
  validRules,
  validateConditionalRules,
  conditionalInputs,
  type ConditionalRule,
  type RuleAction,
} from "../packages/core/src/conditional-rules";
import { validLayerBehavior } from "../packages/core/src/behaviors";
import { flatten } from "../packages/core/src/types";
import { validateExportPackage } from "../packages/core/src/export-package";
import { validatePackage } from "../packages/relay/src/protocol";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { buildSourceExport } from "../packages/core/src/source-export";
import { CONDITIONAL_VALIDATOR } from "../packages/core/src/conditional-runtime.mjs";
import { createPreviewUI } from "../plugins/figma/src/preview-interactions";
import { createOverrideHistory } from "../plugins/figma/src/override-history";
const nodes = () => flatten(conditionalExamplePackage().roots);
const get = (pkg: ReturnType<typeof conditionalExamplePackage>, id: string) =>
  flatten(pkg.roots).find((n) => n.id === id)!;
describe("bounded conditional UI rules", () => {
  it("compiles authorable branches to stable IDs and preserves optional native hierarchy", () => {
    const pkg = conditionalExamplePackage();
    expect(pkg.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(() => validateExportPackage(pkg)).not.toThrow();
    expect(() => validatePackage(pkg)).not.toThrow();
    expect(get(pkg, "rules-screen").behavior?.rules).toEqual(
      conditionalExampleRules,
    );
    expect(get(pkg, "premium/motion-slot")).toBeDefined();
    expect(get(pkg, "status").behavior?.ruleDesign).toMatch(/^[a-f0-9]{16}$/);
    const renamed = conditionalExamplePackage({
      layerOverrides: { status: { name: "Renamed status" } },
    });
    expect(
      get(renamed, "rules-screen").behavior?.rules?.[0].branches[0].then[1]
        .target,
    ).toBe("status");
    const settings = conditionalExampleOverrides();
    settings["rules-screen"].behavior = settings["rules-screen"]
      .behavior as any;
    (
      settings["rules-screen"].behavior as any
    ).rules[0].branches[0].then[1].target = "Purchase status";
    expect(
      get(
        compile(conditionalExampleDesign(), "test", {
          layerOverrides: settings,
        }),
        "rules-screen",
      ).behavior?.rules?.[0].branches[0].then[1].target,
    ).toBe("status");
  });
  it("uses first-match IF/ELSE IF, all/any tests, typed equality and explicit missing data", () => {
    const rule = conditionalExampleRules[0];
    expect(evaluateRule(rule, {}).branch).toBe(-1);
    expect(
      evaluateRule(rule, {
        leaderstats: { Coins: 100 },
        attribute: { Ready: true },
      }).branch,
    ).toBe(0);
    expect(
      evaluateRule(rule, {
        leaderstats: { Coins: 100 },
        attribute: { Ready: false },
      }).branch,
    ).toBe(1);
    expect(
      evaluatePredicate(
        { source: "attribute", key: "Ready", operator: "eq", value: true },
        { attribute: { Ready: "true" } },
      ),
    ).toBe(false);
    expect(
      evaluatePredicate(
        { source: "attribute", key: "Ready", operator: "ne", value: true },
        {},
      ),
    ).toBe(false);
    expect(
      evaluatePredicate(
        { source: "attribute", key: "Ready", operator: "missing" },
        {},
      ),
    ).toBe(true);
    expect(
      evaluatePredicate(
        { source: "leaderstats", key: "Coins", operator: "exists" },
        { leaderstats: { Coins: 0 } },
      ),
    ).toBe(true);
    expect(
      evaluatePredicate(
        { source: "attribute", key: "toString", operator: "exists" },
        {},
      ),
    ).toBe(false);
    expect(
      evaluateRule(conditionalExampleRules[3], { leaderstats: { Coins: 200 } })
        .actions,
    ).toHaveLength(1);
    expect(evaluateRule(conditionalExampleRules[3], {}).actions).toEqual([]);
  });
  it("simulates data updates, native button disabling, motion slot visibility, viewport rules and design fallback without mutating exports", () => {
    const pkg = conditionalExamplePackage(),
      before = JSON.stringify(pkg);
    const ui = createPreviewUI(pkg.roots[0]);
    expect(ui.state("buy")).toBe("disabled");
    expect(ui.properties.get("status")?.Text).toBe("Awaiting player data");
    expect(ui.visible.get("premium/motion-slot")).toBe(false);
    ui.setData({
      leaderstats: { Coins: 150 },
      attribute: { Ready: true, VIP: true },
      viewport: { width: 390, height: 844 },
    });
    expect(ui.state("buy")).toBe("default");
    expect(ui.properties.get("status")?.Text).toBe("Buy <b>now</b>");
    expect(ui.visible.get("premium")).toBe(true);
    expect(ui.visible.get("premium/motion-slot")).toBe(true);
    expect(ui.visible.get("compact")).toBe(true);
    expect(ui.properties.get("status")?.BackgroundTransparency).toBe(0.25);
    ui.setData({ viewport: { width: 720, height: 400 } });
    expect(ui.visible.get("compact")).toBe(false);
    expect(ui.properties.get("status")?.BackgroundTransparency).toBe(0.6);
    expect(JSON.stringify(pkg)).toBe(before);
    expect(
      conditionalInputs(pkg.roots[0]).map((p) => p.source + "/" + p.key),
    ).toEqual([
      "leaderstats/Coins",
      "attribute/Ready",
      "attribute/VIP",
      "viewport/width",
    ]);
  });
  it("keeps manual author settings and deep undo history when rules are edited or disabled", () => {
    const before = conditionalExampleOverrides(),
      next = structuredClone(before);
    (
      next["rules-screen"].behavior as any
    ).rules[0].branches[0].when.predicates[0].value = 300;
    const history = createOverrideHistory();
    history.record(before, next);
    expect(history.undo(next)).toEqual(before);
    expect(history.redo(before)).toEqual(next);
    expect(next.status.properties?.RichText).toBe(true);
    const pkg = conditionalExamplePackage({
      layerOverrides: { "rules-screen": { behavior: false } },
    });
    expect(get(pkg, "rules-screen").behavior).toBeUndefined();
    expect(get(pkg, "status").behavior).toBeUndefined();
  });
  it("exports inspectable rule data and static runtime in all four source formats and the standalone model", () => {
    const pkg = conditionalExamplePackage();
    for (const format of SOURCE_FORMATS) {
      const source = generateSource(pkg, format.id);
      expect(source).toContain("FramebridgeBehavior");
      expect(source).toContain("purchase");
      expect(source).toContain("ruleDesign");
    }
    const files = unzipSync(
      buildSourceExport(
        {
          package: pkg,
          designs: conditionalExampleDesign(),
          assets: {},
          previews: {},
          revision: 1,
        },
        "tsx",
      ).data,
    );
    expect(strFromU8(files["FramebridgeInteractions.luau"])).toContain(
      "local mountRules",
    );
    const xml = generateModel(pkg);
    expect(xml.includes('class="LocalScript"')).toBe(true);
    expect(xml.includes("FramebridgeRule_")).toBe(true);
  });
  it("blocks missing, excluded, ambiguous, cross-screen and wrong-class targets at every untrusted boundary", () => {
    for (const target of [
      "missing",
      "screen:rules-screen",
      "status/motion-slot",
    ]) {
      const pkg = conditionalExamplePackage();
      get(pkg, "rules-screen").behavior!.rules![0].branches[0].then[0].target =
        target;
      expect(() => validatePackage(pkg)).toThrow();
      expect(() => validateExportPackage(pkg)).toThrow();
    }
    const pkg = conditionalExamplePackage();
    get(pkg, "rules-screen").behavior!.rules![0].branches[0].then[0].target =
      "status";
    expect(() => validateConditionalRules(flatten(pkg.roots))).toThrow(
      "compatible targets",
    );
    const excluded = conditionalExamplePackage({
      layerOverrides: { status: { renderMode: "skip" } },
    });
    expect(excluded.issues.some((i) => i.severity === "error")).toBe(true);
    const designs = conditionalExampleDesign();
    designs[0].children.push(node("Purchase status", { id: "duplicate" }));
    const overrides = conditionalExampleOverrides();
    (
      overrides["rules-screen"].behavior as any
    ).rules[0].branches[0].then[1].target = "Purchase status";
    expect(
      compile(designs, "test", { layerOverrides: overrides }).issues.some((i) =>
        i.message.includes("ambiguous"),
      ),
    ).toBe(true);
  });
  it("rejects feedback/executable inputs and bounded malformed values", () => {
    for (const mutation of [
      (r: any) => (r.source = "print(1)"),
      (r: any) => (r.branches[0].when.predicates[0].source = "node"),
      (r: any) => (r.branches[0].when.predicates[0].key = "Parent.Source"),
      (r: any) => (r.branches[0].when.predicates[0].value = Infinity),
      (r: any) => (r.branches[0].when.predicates[0].value = "100"),
      (r: any) => (r.branches[0].then[0].value = "true"),
      (r: any) => (r.branches[0].then[0].property = "Source"),
      (r: any) => (r.branches[0].then[1].value = "雪".repeat(1500)),
      (r: any) => {
        r.branches[0].when.predicates[0] = {
          source: "attribute", key: "Label", operator: "eq", value: "雪".repeat(1500),
        };
      },
      (r: any) => (r.branches = Array(9).fill(r.branches[0])),
      (r: any) =>
        (r.branches[0].when.predicates = Array(9).fill(
          r.branches[0].when.predicates[0],
        )),
      (r: any) => (r.branches[0].then = Array(9).fill(r.branches[0].then[0])),
      (r: any) => (r.id = "bad.id"),
    ]) {
      const r = structuredClone(conditionalExampleRules[0]);
      mutation(r);
      expect(validRules([r])).toBe(false);
      expect(validLayerBehavior({ rules: [r] })).toBe(false);
    }
    const oversized = structuredClone(conditionalExampleRules[0]);
    oversized.branches[0].then = [
      ...Array.from(
        { length: 4 },
        (_, i) =>
          ({
            target: `text-${i}`,
            property: "Text",
            value: "雪".repeat(4096),
          }) as RuleAction,
      ),
    ];
    expect(validRules([oversized])).toBe(false);
    expect(validRules(Array(9).fill(conditionalExampleRules[0]))).toBe(false);
  });
  it("rejects conflicting property owners while allowing mutually exclusive branches of one rule", () => {
    const base = nodes();
    expect(() => validateConditionalRules(base)).not.toThrow();
    const owner = base.find((n) => n.id === "rules-screen")!;
    const duplicate = structuredClone(owner.behavior!.rules![0]);
    duplicate.id = "competing";
    owner.behavior!.rules!.push(duplicate);
    expect(() => validateConditionalRules(base)).toThrow(
      "one conditional rule",
    );
    for (const kind of ["binding", "state", "motion"]) {
      const list = nodes(),
        target = list.find((n) => n.id === "status")!;
      if (kind === "binding")
        target.behavior = {
          binding: { source: "attribute", key: "Coins", template: "{value}" },
        };
      if (kind === "state")
        target.behavior = { state: { kind: "default", owner: "buy" } };
      if (kind === "motion")
        target.behavior = {
          motion: {
            hover: {
              scale: 1,
              rotation: 0,
              lift: 0,
              duration: 0,
              tint: [1, 0, 0],
            },
          },
        };
      if (kind === "state") {
        const r = list.find((n) => n.id === "rules-screen")!.behavior!
          .rules![0];
        r.branches[0].then = [
          { target: "status", property: "Visible", value: true },
        ];
      }
      expect(() => validateConditionalRules(list)).toThrow("conflict");
    }
  });
  it("caps rules per screen and fingerprints changing design defaults without depending on names", () => {
    const pkg = conditionalExamplePackage(),
      first = get(pkg, "status").behavior!.ruleDesign;
    get(pkg, "status").name = "Changed";
    expect(get(pkg, "status").behavior!.ruleDesign).toBe(first);
    const changed = conditionalExamplePackage({
      layerOverrides: {
        status: {
          properties: { RichText: true, BackgroundTransparency: 0.25 },
        },
      },
    });
    expect(get(changed, "status").behavior!.ruleDesign).not.toBe(first);
    const list = nodes();
    for (let i = 0; i < 33; i++) {
      list.push({
        id: `owner${i}`,
        name: `Owner ${i}`,
        className: "Frame",
        properties: {},
        children: [],
        behavior: {
          rules: [
            {
              id: "check",
              branches: [
                {
                  when: {
                    mode: "all",
                    predicates: [
                      { source: "attribute", key: "Ready", operator: "exists" },
                    ],
                  },
                  then: [
                    { target: `owner${i}`, property: "Visible", value: true },
                  ],
                },
              ],
            },
          ],
        },
      });
    }
    expect(() => validateConditionalRules(list)).toThrow("limit");
  });
  it("keeps native importer validation identical to the runtime validator", () => {
    expect(readFileSync("plugins/studio/src/Importer.luau", "utf8")).toContain(
      CONDITIONAL_VALIDATOR,
    );
  });
});
