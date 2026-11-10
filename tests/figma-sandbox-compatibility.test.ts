import { afterEach, describe, expect, it, vi } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { cloneSettings } from "../packages/core/src/clone-settings";
import { node } from "../packages/core/src/demo";
import { advancedControlPackage } from "../packages/core/src/advanced-control-examples";
import { conditionalExamplePackage } from "../packages/core/src/conditional-examples";
import { keyframePackage } from "../packages/core/src/keyframe-examples";
import { MOTION_DEFAULTS } from "../packages/core/src/motion";
import { PARTICLE_DEFAULTS } from "../packages/core/src/particles";
import { flatten } from "../packages/core/src/types";
import { validateExportPackage } from "../packages/core/src/export-package";

afterEach(() => vi.unstubAllGlobals());

describe("Figma sandbox settings compatibility", () => {
  it.each([
    ["controls", advancedControlPackage, "control"],
    ["conditional rules", conditionalExamplePackage, "rules"],
    ["keyframes", keyframePackage, "keyframes"],
    [
      "motion and particles",
      () =>
        compile(
          [
            node("Screen", {
              id: "screen",
              children: [node("Control [hover]", { id: "control" })],
            }),
          ],
          "sandbox",
          {
            layerOverrides: {
              control: {
                behavior: {
                  particles: cloneSettings(PARTICLE_DEFAULTS),
                  motion: {
                    hover: cloneSettings(MOTION_DEFAULTS.hover),
                  },
                },
              },
            },
          },
        ),
      "particles",
    ],
  ] as const)(
    "exports %s when structuredClone is unavailable",
    (_, build, key) => {
      vi.stubGlobal("structuredClone", undefined);
      const pkg = build();
      expect(pkg.issues.filter((issue) => issue.severity === "error")).toEqual(
        [],
      );
      expect(flatten(pkg.roots).some((layer) => !!layer.behavior?.[key])).toBe(
        true,
      );
      expect(() => validateExportPackage(pkg)).not.toThrow();
    },
  );

  it("detects motion tags without browser globals and keeps presets independent", () => {
    vi.stubGlobal("structuredClone", undefined);
    const pkg = compile(
      [node("Screen", { children: [node("Button [smooth]")] })],
      "sandbox-tags",
    );
    expect(pkg.issues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    const motion = flatten(pkg.roots).find((layer) => layer.behavior?.motion)
      ?.behavior?.motion;
    expect(motion?.hover).toEqual(MOTION_DEFAULTS.hover);
    expect(motion?.hover).not.toBe(MOTION_DEFAULTS.hover);
  });
});
