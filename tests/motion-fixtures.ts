import { interactionExamplePackage } from "../packages/core/src/interaction-examples";
import { MOTION_DEFAULTS } from "../packages/core/src/motion";

/** Stable resting geometry for comparing real renderer output before interaction. */
export function motionExportPackage() {
  const pkg = interactionExamplePackage({
    layerOverrides: {
      open: {
        components: {
          size: {
            MinSize: { type: "Vector2", value: [80, 20] },
            MaxSize: { type: "Vector2", value: [320, 80] },
          },
        },
        behavior: {
          action: { kind: "open", target: "shop" },
          motion: {
            hover: MOTION_DEFAULTS.hover,
            press: MOTION_DEFAULTS.press,
          },
        },
      },
      shop: {
        behavior: {
          role: "panel",
          initialVisible: false,
          motion: { enter: { ...MOTION_DEFAULTS.enter, kind: "slide" } },
        },
      },
    },
  });
  pkg.sourceId = "motion-export-fixture";
  return pkg;
}
