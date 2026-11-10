import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { themePackage } from "./theme-fixtures";
import { conditionalExamplePackage } from "../packages/core/src/conditional-examples";
import { flatten } from "../packages/core/src/types";
import { validateExportPackage } from "../packages/core/src/export-package";
import {
  validateConditionalRules,
  type ConditionalRule,
} from "../packages/core/src/conditional-rules";
import {
  BEHAVIOR_CLIENT_SOURCE,
  THEMED_BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_BOOTSTRAP_SOURCE,
  behaviorModuleSource,
} from "../packages/core/src/behavior-runtime.mjs";
import { keyframePackage, exampleChain } from "../packages/core/src/keyframe-examples";
import { validateThemes } from "../packages/core/src/theme-tokens";
import { CONDITIONAL_VALIDATOR } from "../packages/core/src/conditional-runtime.mjs";
import { generateModel } from "../packages/core/src/model-export";

const rule = (
  target: string,
  property: string,
  value: unknown,
): ConditionalRule =>
  ({
    id: "owned-property",
    branches: [
      {
        when: {
          mode: "all",
          predicates: [
            { source: "attribute", key: "Ready", operator: "exists" },
          ],
        },
        then: [{ target, property, value }],
      },
    ],
  }) as ConditionalRule;

describe("combined runtime ownership and teardown export", () => {
  it("rejects conditional writes to themed base and hover properties at transfer/export boundaries", () => {
    for (const property of [
      "BackgroundColor3",
      "BackgroundTransparency",
    ] as const) {
      const pkg = themePackage();
      const nodes = flatten(pkg.roots),
        owner = nodes.find((n) => n.id === "theme-screen")!;
      owner.behavior = {
        rules: [
          rule(
            "buy",
            property,
            property.endsWith("Color3")
              ? { type: "Color3", value: [0, 0, 0] }
              : 0.4,
          ),
        ],
      };
      expect(() => validateExportPackage(pkg)).toThrow("theme property owner");
    }
  });
  it("permits conditional button availability alongside independent theme properties", () => {
    const pkg = themePackage(),
      nodes = flatten(pkg.roots);
    nodes.find((n) => n.id === "theme-screen")!.behavior = {
      rules: [rule("buy", "Interactable", false)],
    };
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
  it("rejects rule visibility on an advanced tooltip panel", () => {
    const pkg = conditionalExamplePackage(),
      nodes = flatten(pkg.roots);
    nodes.find((n) => n.id === "buy")!.behavior!.control = {
      kind: "tooltip",
      target: "compact",
      delay: 0.2,
    };
    expect(() => validateConditionalRules(nodes)).toThrow("property owner");
  });
  it("rejects conditional transparency shared with keyframes while permitting independent availability", () => {
    const pkg = keyframePackage();
    const nodes = flatten(pkg.roots);
    const owner=nodes.find(n=>n.id==="activate-label")!;
    owner.behavior = {rules:[rule("activate", "BackgroundTransparency", 0.4)]};
    expect(() => validateConditionalRules(nodes)).toThrow("animated fade owner");
    owner.behavior.rules = [rule("activate", "Interactable", false)];
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
  it("keeps alpha writers separate across CanvasGroup isolation", () => {
    const pkg=themePackage();
    const buy=flatten(pkg.roots).find(n=>n.id==="buy")!;
    buy.behavior={keyframes:exampleChain("mount")};
    expect(()=>validateThemes(pkg.roots)).toThrow("fade/blink");
    delete buy.behavior;
    const root=pkg.roots[0];
    root.children=[{id:"alpha-group",name:"Alpha group",className:"CanvasGroup",properties:{},behavior:{keyframes:exampleChain("mount")},children:root.children}];
    expect(()=>validateThemes(pkg.roots)).not.toThrow();
    root.children[0].children.push({id:"plain-alpha",name:"Plain alpha",className:"Frame",properties:{BackgroundTransparency:0.5},children:[]});
    root.children[0].behavior!.rules=[rule("plain-alpha", "BackgroundTransparency", 0.4)];
    // A child alpha property is independent of the group's composed opacity.
    expect(()=>validateConditionalRules(flatten(pkg.roots))).not.toThrow();
  });
  it("keeps the native conditional validator identical after keyframe ownership integration", () => {
    const importer=readFileSync("plugins/studio/src/Importer.luau","utf8");
    expect(importer).toContain(CONDITIONAL_VALIDATOR);
  });
  it("emits a static bootstrap with a child initializer, retaining the complete plain/themed cleanup code", () => {
    const importer = readFileSync("plugins/studio/src/Importer.luau", "utf8");
    expect(importer).toContain(JSON.stringify(BEHAVIOR_BOOTSTRAP_SOURCE));
    for (const source of [
      BEHAVIOR_CLIENT_SOURCE,
      THEMED_BEHAVIOR_CLIENT_SOURCE,
    ]) {
      const module = behaviorModuleSource(source);
      expect(module).toContain(
        "local runtimeModule=script\nlocal script=runtimeModule.Parent",
      );
      expect(module).toContain("connect(script.Destroying,cleanup)");
      expect(module).toContain("connect(root.Destroying,cleanup)");
      expect(module).toContain("connect(runtimeModule.Destroying,cleanup)");
    }
    const xml = generateModel(themePackage());
    expect(xml).toContain('class="ModuleScript"');
    expect(xml).toContain('<string name="Name">FramebridgeRuntime</string>');
    expect(xml).toContain("runtimeModule.Parent");
    expect(xml).toContain("mountTheme");
  });
});
