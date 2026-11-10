import { advancedControlOverrides } from "../../../packages/core/src/advanced-control-examples";
import { exampleChain } from "../../../packages/core/src/keyframe-examples";
import { MOTION_DEFAULTS } from "../../../packages/core/src/motion";
import type { DemoScene } from "./scenes";
export const featureSelection: Record<string, string> = {
  interactions: "cooldown",
  tooltip: "tip",
  skill: "skill-two",
  data: "coins",
  motion: "cooldown",
  keyframes: "cooldown",
  rules: "cooldown",
  particles: "cooldown",
};
export function featureOverrides(scene: DemoScene) {
  const edits = structuredClone(advancedControlOverrides);
  const id = featureSelection[scene] ?? scene;
  edits[id] ??= {};
  if (scene === "motion")
    edits[id].behavior = {
      motion: { enter: { ...MOTION_DEFAULTS.enter, kind: "slide" } },
    };
  if (scene === "keyframes")
    edits[id].behavior = { keyframes: exampleChain("activate") };
  if (scene === "rules")
    edits[id].behavior = {
      rules: [
        {
          id: "coins-rule",
          branches: [
            {
              when: {
                mode: "all",
                predicates: [
                  {
                    source: "leaderstats",
                    key: "Coins",
                    operator: "gte",
                    value: 100,
                  },
                ],
              },
              then: [{ target: "cooldown", property: "Visible", value: true }],
            },
          ],
        },
      ],
    };
  return edits;
}
