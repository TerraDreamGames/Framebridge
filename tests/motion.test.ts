import { BEHAVIOR_VERSION } from "../packages/core/src/behavior-runtime.mjs";
import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import {
  layerBehavior,
  validateBehaviors,
} from "../packages/core/src/behaviors";
import {
  MOTION_DEFAULTS,
  motionParent,
  sampleMotion,
  validMotion,
} from "../packages/core/src/motion";
import { flatten } from "../packages/core/src/types";
import { validatePackage } from "../packages/relay/src/protocol";
import { generateModel } from "../packages/core/src/model-export";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { behaviorPackage } from "./behavior-fixtures";
const presets = () => structuredClone(MOTION_DEFAULTS);
const interactive = () =>
  behaviorPackage({
    layerOverrides: {
      open: {
        behavior: {
          action: { kind: "open", target: "shop" },
          motion: { hover: presets().hover, press: presets().press },
        },
      },
      shop: {
        behavior: {
          role: "panel",
          initialVisible: false,
          motion: { enter: { ...presets().enter, kind: "slide" } },
        },
      },
      inventory: {
        behavior: { role: "panel", motion: { float: presets().float } },
      },
      settings: {
        behavior: { role: "panel", motion: { pulse: presets().pulse } },
      },
    },
  });
const get = (pkg: ReturnType<typeof interactive>, id: string) =>
  flatten(pkg.roots).find((n) => n.id === id)!;
describe("motion conversion and bounded data", () => {
  it("keeps hidden animated panels actionable and wrapped tab panels in their logical group", () => {
    const pkg = interactive();
    expect(pkg.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(get(pkg, "shop").properties.Visible).toBe(false);
    expect(get(pkg, "shop/motion-slot").properties.Visible).toBe(false);
    expect(get(pkg, "open").behavior?.motion?.owner).toBe("open");
    expect(get(pkg, "shop").behavior?.motion?.slot).toBe("shop/motion-slot");
    expect(get(pkg, "open").behavior?.action?.target).toBe("shop");
    expect(() => validatePackage(pkg)).not.toThrow();
    const parents = new Map(
      flatten(pkg.roots).flatMap((n) =>
        n.children.map((c) => [c.id, n] as const),
      ),
    );
    expect(motionParent(get(pkg, "inventory"), parents)?.id).toBe("tabs");
    expect(motionParent(pkg.roots[0], parents)).toBeUndefined();
  });
  it("animates child artwork from the existing button without creating a nested input target", () => {
    const pkg = compile(
      [
        node("Screen", {
          id: "root",
          children: [
            node("Buy [button]", {
              id: "buy",
              children: [node("Art [lean]", { id: "art" })],
            }),
          ],
        }),
      ],
      "test",
    );
    expect(pkg.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(get(pkg, "art").className).toBe("Frame");
    expect(get(pkg, "art").behavior?.motion?.owner).toBe("buy");
    expect(get(pkg, "buy").className).toBe("TextButton");
    const standalone = compile([node("Icon [lean]", { id: "art" })], "test");
    expect(standalone.issues.some((i) => i.severity === "error")).toBe(true);
  });
  it("reserves list cells and keeps flex and size constraints on the layout slot", () => {
    const pkg = compile(
      [
        node("List", {
          id: "list",
          layout: {
            mode: "HORIZONTAL",
            spacing: 16,
            padding: [0, 0, 0, 0],
            primary: "MIN",
            counter: "MIN",
            wrap: false,
          },
          children: [
            node("Card [smooth]", { id: "card", width: 120, height: 60 }),
            node("Other", {
              id: "other",
              width: 120,
              height: 60,
              transform: [
                [1, 0, 136],
                [0, 1, 0],
              ],
            }),
          ],
        }),
      ],
      "test",
      {
        layout: "responsive",
        layerOverrides: {
          card: {
            components: {
              size: { MinSize: { type: "Vector2", value: [80, 40] } },
            },
          },
        },
      },
    );
    expect(pkg.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(
      get(pkg, "list").children.some((n) => n.className === "UIListLayout"),
    ).toBe(true);
    expect(
      get(pkg, "card/motion-slot").children.some(
        (n) => n.className === "UISizeConstraint",
      ),
    ).toBe(true);
    expect(
      get(pkg, "card").children.some((n) => n.className === "UISizeConstraint"),
    ).toBe(false);
    expect(get(pkg, "card").properties.Position).toEqual({
      type: "UDim2",
      value: [0.5, 0, 0.5, 0],
    });
    expect(get(pkg, "card/motion-slot").properties.LayoutOrder).toBe(0);
  });
  it("rejects executable fields, invalid speeds, flash rates, owners and shared cells at transfer boundaries", () => {
    for (const value of [
      { spin: { speed: Infinity } },
      { spin: { speed: 2000 } },
      { source: "code" },
      { ...presets(), slot: "redirect" },
      { blink: { visible: 0.1, hidden: 0.1, fade: 0, delay: 0 } },
      { sounds: { volume: 1, hover: "https://example.com/code" } },
    ])
      expect(validMotion(value)).toBe(false);
    expect(validMotion(presets())).toBe(true);
    const wrongOwner = interactive();
    get(wrongOwner, "open").behavior!.motion!.owner = "close";
    expect(() => validateBehaviors(wrongOwner.roots)).toThrow(/Motion input/);
    const shared = interactive();
    get(shared, "open/motion-slot").children.push(node("Foreign") as any);
    expect(() => validateBehaviors(shared.roots)).toThrow();
    const malicious = interactive();
    (get(malicious, "open").behavior!.motion as any).code = "print(1)";
    expect(() => validatePackage(malicious)).toThrow();
  });
  it("uses tags only when enabled, strips them from names and distinguishes one-shot glints", () => {
    expect(layerBehavior(node("Art [spin] [glint]"))?.motion).toMatchObject({
      spin: { speed: 90 },
      shine: { trigger: "hover" },
    });
    expect(
      layerBehavior(node("Art [spin]"), { behavior: false }),
    ).toBeUndefined();
    expect(layerBehavior(node("Art [spin]"), { behavior: {} })).toBeUndefined();
    const pkg = compile([node("Art [spin]", { id: "art" })], "test");
    expect(get(pkg, "art").name).toBe("Art");
  });
  it("samples idle motion around authored positions and reduced motion returns resting geometry", () => {
    const config = {
      float: presets().float,
      spin: presets().spin,
      enter: { ...presets().enter, kind: "slide" as const },
    };
    const first = sampleMotion(config, 0);
    expect(first.opacity).toBe(0);
    expect(first.y).toBe(-24);
    const later = sampleMotion(config, 0.75);
    expect(later.y).toBeCloseTo(-6);
    expect(later.rotation).toBeCloseTo(67.5);
    expect(later.opacity).toBe(1);
    expect(sampleMotion(config, 10, "hover", true)).toEqual({
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      opacity: 1,
      shine: -2,
      driftX: 0,
      driftY: 0,
    });
  });
  it("carries motion and stable layout slots through every source format and models", () => {
    const pkg = interactive();
    for (const format of SOURCE_FORMATS) {
      const source = generateSource(pkg, format.id);
      expect(source).toContain("motion-slot");
      expect(source).toContain("FramebridgeBehavior");
    }
    const model = generateModel(pkg);
    expect(model.includes("Motion slot")).toBe(true);
    expect(
      model.includes("Framebridge generated interactions v" + BEHAVIOR_VERSION),
    ).toBe(true);
  });
});
