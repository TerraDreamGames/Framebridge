import { describe, it, expect } from "vitest";
import {
  advancedControlPackage,
  advancedControlDesign,
  advancedControlOverrides,
} from "../packages/core/src/advanced-control-examples";
import {
  validControl,
  remapControl,
  controlReferences,
} from "../packages/core/src/advanced-controls";
import { node } from "../packages/core/src/demo";
import { BEHAVIOR_VERSION } from "../packages/core/src/behavior-runtime.mjs";
import { readFileSync } from "node:fs";
import { compile } from "../packages/core/src/compiler";
import { flatten } from "../packages/core/src/types";
import { validateExportPackage } from "../packages/core/src/export-package";
import { validatePackage } from "../packages/relay/src/protocol";
import {
  SOURCE_FORMATS,
  generateSource,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { createOverrideHistory } from "../plugins/figma/src/override-history";
const get = (p: ReturnType<typeof advancedControlPackage>, id: string) =>
  flatten(p.roots).find((n) => n.id === id)!;
describe("advanced control data and full exports", () => {
  it("keeps the native importer gate aligned with the trusted runtime version", () => {
    const importer = readFileSync(
      new URL("../plugins/studio/src/Importer.luau", import.meta.url),
      "utf8",
    );
    expect(importer).toContain(`runtime.version == "${BEHAVIOR_VERSION}"`);
  });
  it("expands repeat copies with independent native fill and thumb identities", () => {
    const design = node("Repeat screen", {
      id: "repeat-root",
      width: 500,
      height: 200,
      children: [
        node("Repeat", {
          id: "repeat",
          type: "TRANSFORM_GROUP",
          width: 240,
          height: 30,
          transformModifiers: [
            {
              type: "REPEAT",
              repeatType: "LINEAR",
              count: 3,
              unitType: "PIXELS",
              offset: 80,
              axis: "HORIZONTAL",
            },
          ],
          children: [
            node("Slider", {
              id: "repeat-slider",
              width: 60,
              height: 20,
              children: [
                node("Fill", { id: "repeat-fill", width: 60, height: 20 }),
                node("Thumb", { id: "repeat-thumb", width: 8, height: 20 }),
              ],
            }),
          ],
        }),
      ],
    });
    const p = compile([design], "control-repeat", {
      layerOverrides: {
        "repeat-slider": {
          behavior: {
            control: {
              kind: "slider",
              min: 0,
              max: 10,
              value: 3,
              step: 1,
              axis: "X",
              fill: "repeat-fill",
              thumb: "repeat-thumb",
            },
          },
        },
      },
    });
    expect(p.issues.filter((i) => i.severity === "error")).toEqual([]);
    for (let index = 1; index < 3; index++)
      expect(
        get(p, `repeat-slider/repeat:repeat:${index}`).behavior?.control,
      ).toMatchObject({
        fill: `repeat-fill/repeat:repeat:${index}`,
        thumb: `repeat-thumb/repeat:repeat:${index}`,
      });
    expect(() => validatePackage(p)).not.toThrow();
  });
  it("compiles all controls as native editable content with stable targets", () => {
    const p = advancedControlPackage();
    expect(p.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(() => validateExportPackage(p)).not.toThrow();
    expect(() => validatePackage(p)).not.toThrow();
    for (const id of [
      "toggle",
      "slider",
      "cooldown",
      "tip",
      "skill-one",
      "skill-two",
      "roulette",
    ])
      expect(get(p, id).className).toBe("TextButton");
    expect(get(p, "progress").behavior?.control?.kind).toBe("progress");
    expect(get(p, "window").properties.Active).toBe(true);
    expect(get(p, "tooltip").properties.Visible).toBe(false);
    expect(get(p, "coins").behavior?.binding?.key).toBe("Coins");
  });
  it("resolves unique names and preserves IDs across renaming/Undo/Redo", () => {
    const history = createOverrideHistory();
    const original = structuredClone(advancedControlOverrides);
    const changed = structuredClone(original);
    changed.slider.name = "Volume";
    changed.slider.behavior = {
      control: {
        kind: "slider",
        min: 0,
        max: 10,
        value: 3,
        step: 1,
        axis: "X",
        fill: "slider-fill",
      },
    };
    history.record(original, changed);
    original.slider.behavior = false;
    expect(
      get(
        advancedControlPackage({ layerOverrides: history.undo(changed)! }),
        "slider",
      ).behavior?.control,
    ).toMatchObject({ value: 25, thumb: "slider-thumb" });
    expect(
      get(
        advancedControlPackage({
          layerOverrides: history.redo(advancedControlOverrides)!,
        }),
        "slider",
      ).name,
    ).toBe("Volume");
  });
  it.each([
    null,
    false,
    [],
    { kind: "code", source: "print(1)" },
    { kind: "roulette", items: ["one"], duration: 1 },
    { kind: "roulette", items: Array(65).fill("one"), duration: 1 },
    { kind: "cooldown", duration: Infinity },
    { kind: "window", constrain: "yes" },
    { kind: "slider", min: 0, max: 1, value: 2, step: 1, axis: "X" },
    {
      kind: "toggle",
      value: false,
      data: { source: "attribute", key: "Parent.Source" },
    },
    { kind: "skill", requires: ["a", "a"], unlocked: false },
  ])("rejects malformed/unbounded control %j", (v) => {
    expect(validControl(v)).toBe(false);
  });
  it("blocks cycles, shared artwork, excluded/cross-screen targets and conflicting owners", () => {
    for (const patch of [
      {
        "skill-one": {
          behavior: {
            control: {
              kind: "skill",
              requires: ["skill-two"],
              unlocked: false,
            },
          },
        },
      },
      {
        progress: {
          behavior: {
            control: {
              kind: "progress",
              min: 0,
              max: 100,
              value: 0,
              axis: "X",
              fill: "slider-fill",
            },
          },
        },
      },
      {
        slider: {
          behavior: {
            control: {
              kind: "slider",
              min: 0,
              max: 100,
              value: 0,
              step: 1,
              axis: "X",
              fill: "missing",
            },
          },
        },
      },
      { "slider-fill": { renderMode: "skip" } },
      { toggle: { className: "Frame" } },
      {
        toggle: {
          behavior: {
            control: { kind: "toggle", value: false },
            action: { kind: "open", target: "window" },
          },
        },
      },
    ] as any[])
      expect(
        advancedControlPackage({ layerOverrides: patch }).issues.some(
          (i) => i.severity === "error",
        ),
      ).toBe(true);
    const malformed = advancedControlPackage();
    (get(malformed, "toggle").behavior as any).control = false;
    expect(() => validatePackage(malformed)).toThrow();
    const rotated = advancedControlPackage();
    get(rotated, "window").properties.Rotation = 5;
    expect(() => validatePackage(rotated)).toThrow();
    const p = advancedControlPackage();
    (get(p, "toggle").behavior!.control as any).source = "print(1)";
    expect(() => validatePackage(p)).toThrow();
  });
  it("remaps every identity for repeats and reusable components", () => {
    for (const n of flatten(advancedControlPackage().roots))
      if (n.behavior?.control) {
        const c = n.behavior.control;
        expect(
          controlReferences(remapControl(c, (id) => "copy:" + id)),
        ).toEqual(controlReferences(c).map((id) => "copy:" + id));
      }
  });
  it("emits the trusted controls runtime in every renderer and standalone model", () => {
    const p = advancedControlPackage();
    for (const format of SOURCE_FORMATS) {
      const code = generateSource(p, format.id);
      expect(code).toContain("FramebridgeBehavior");
      if (format.id !== "tsx") {
        expect(code).toContain("FramebridgeCooldownRemaining");
        expect(code).toContain("FramebridgeRouletteStatus");
      }
    }
    expect(generateModel(p)).toContain("FramebridgeSkillStatus");
  });
  it("keeps explicit controls out of raster fallbacks", () => {
    const design = advancedControlDesign();
    design[0].effects = ["LAYER_BLUR"];
    const p = compile(design, "controls", {
      layerOverrides: advancedControlOverrides,
    });
    expect(get(p, "slider").behavior?.control?.kind).toBe("slider");
    expect(get(p, "advanced-screen").assetRef).toBeUndefined();
  });
});
