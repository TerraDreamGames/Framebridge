import { describe, expect, it } from "vitest";
import { flatten } from "../packages/core/src/types";
import {
  defaultWorldSettings,
  validWorldSettings,
  validateWorldRoots,
  worldProperties,
} from "../packages/core/src/world-space";
import { validateExportPackage } from "../packages/core/src/export-package";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { validatePackage } from "../packages/relay/src/protocol";
import { BEHAVIOR_VERSION } from "../packages/core/src/behavior-runtime.mjs";
import { worldPackage } from "./world-space-fixtures";
import { exampleChain } from "../packages/core/src/keyframe-examples";
import { validateBehaviors } from "../packages/core/src/behaviors";

describe("world-space transfer and exports", () => {
  it("rejects malformed canvases and billboard dimensions beyond transferable bounds", () => {
    const settings = { ...defaultWorldSettings("billboard"), widthStuds: 1000 };
    expect(() => worldProperties(settings, [1, 100000])).toThrow(
      /Billboard height/,
    );
    expect(() =>
      worldProperties(settings, [280] as unknown as [number, number]),
    ).toThrow(/canvas/);
    expect(worldProperties(settings, [1, 1000]).Size).toEqual({
      type: "UDim2",
      value: [1000, 0, 1_000_000, 0],
    });
  });
  for (const kind of ["surface", "billboard", "prompt"] as const) {
    it(
      "converts and validates " + kind + " with a stable authored canvas",
      () => {
        const pkg = worldPackage(kind),
          root = pkg.roots[0];
        expect(root.className).toBe(
          kind === "surface" ? "SurfaceGui" : "BillboardGui",
        );
        expect(root.worldUI?.kind).toBe(kind);
        expect(root.referenceSize).toEqual([280, 140]);
        expect(root.children[0].id).toBe("screen:world/world-canvas");
        expect(root.children[0].properties.Size).toEqual({
          type: "UDim2",
          value: [0, 280, 0, 140],
        });
        expect(
          flatten(pkg.roots).filter((n) => n.id === "progress"),
        ).toHaveLength(1);
        expect(pkg.stats.instances).toBe(flatten(pkg.roots).length);
        expect(() => validatePackage(pkg)).not.toThrow();
        expect(() => validateExportPackage(pkg)).not.toThrow();
      },
    );
    it(
      "keeps world metadata and native root classes in " +
        kind +
        " models and all source formats",
      () => {
        const pkg = worldPackage(kind);
        for (const format of SOURCE_FORMATS) {
          const source = generateSource(pkg, format.id);
          expect(source).toContain("FramebridgeWorldCanvas");
          expect(source).toContain("FramebridgeWorld");
          expect(source.toLowerCase().includes("worldtargets")).toBe(true);
        }
        const xml = generateModel(pkg);
        expect(xml).toContain('class="' + pkg.roots[0].className + '"');
        expect(xml).toContain('class="LocalScript"');
        expect(xml).toContain(
          "Framebridge generated interactions v" + BEHAVIOR_VERSION,
        );
        expect(xml).toContain("WorldCanvas");
      },
    );
  }
  it("rejects paths, extra fields, incompatible settings and non-finite bounds", () => {
    const surface = defaultWorldSettings("surface");
    for (const config of [
      { ...surface, target: "Workspace.Part" },
      { ...surface, widthStuds: 4 },
      { ...surface, maxDistance: Infinity },
      { ...surface, lightInfluence: 2 },
      { ...surface, face: "Unknown" },
    ])
      expect(validWorldSettings(config)).toBe(false);
    const prompt = defaultWorldSettings("prompt");
    expect(
      validWorldSettings({
        ...prompt,
        prompt: { ...prompt.prompt!, keyboardKey: "Enter" },
      }),
    ).toBe(false);
    expect(
      validWorldSettings({
        ...prompt,
        prompt: { ...prompt.prompt!, labels: { callback: "loadstring()" } },
      }),
    ).toBe(false);
  });
  it("rejects cross-design, duplicate and incompatible prompt bindings", () => {
    for (const labels of [
      { action: "other-design" },
      { action: "progress" },
      { action: "action", object: "action" },
      { hold: "key" },
    ]) {
      const pkg = worldPackage("prompt");
      pkg.roots[0].worldUI!.prompt!.labels = labels;
      expect(() => validateWorldRoots(pkg.roots)).toThrow(/compatible/);
    }
  });
  it("rejects nested world configuration and mismatched root collectors", () => {
    const pkg = worldPackage("surface");
    pkg.roots[0].children[0].worldUI = defaultWorldSettings("surface");
    expect(() => validateWorldRoots(pkg.roots)).toThrow(/root collector/);
    delete pkg.roots[0].children[0].worldUI;
    pkg.roots[0].className = "BillboardGui";
    expect(() => validateWorldRoots(pkg.roots)).toThrow(/agree/);
  });
  it("keeps unsupported SurfaceGui compositing explicit", () => {
    const pkg = worldPackage("surface");
    pkg.roots[0].children[0].children[0].className = "CanvasGroup";
    expect(() => validateWorldRoots(pkg.roots)).toThrow(/CanvasGroup/);
  });
  it("rejects hold-progress layers controlled by a layout or size constraint", () => {
    for (const className of [
      "UIGridLayout",
      "UIListLayout",
      "UIAspectRatioConstraint",
      "UISizeConstraint",
    ]) {
      const pkg = worldPackage("prompt");
      const parent = flatten(pkg.roots).find((n) =>
        n.children.some((child) => child.id === "progress"),
      )!;
      const progress = parent.children.find((n) => n.id === "progress")!;
      (className.endsWith("Layout") ? parent : progress).children.push({
        id: "incompatible-helper",
        name: className,
        className,
        properties: {},
        children: [],
      });
      expect(() => validateWorldRoots(pkg.roots)).toThrow(/Hold progress/);
    }
  });
  it("rejects keyframe ownership of a native prompt hold-progress layer", () => {
    const pkg = worldPackage("prompt");
    const progress = flatten(pkg.roots).find((node) => node.id === "progress")!;
    const chain = exampleChain("mount");
    progress.behavior = {
      keyframes: {
        ...chain,
        frames: chain.frames.map((frame) => ({
          ...frame,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
        })),
      },
    };
    expect(() => validateBehaviors(pkg.roots)).not.toThrow();
    expect(() => validateWorldRoots(pkg.roots)).toThrow(/Hold progress/);
    expect(() => validatePackage(pkg)).toThrow(/Invalid UI interaction/);
    expect(() => generateModel(pkg)).toThrow(/Hold progress/);
  });
});
