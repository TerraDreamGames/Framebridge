import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import {
  PARTICLE_DEFAULTS,
  type ParticleSettings,
} from "../packages/core/src/particles";
import { DEFAULT_THEMES } from "../packages/core/src/theme-tokens";
import {
  DEFAULT_OPTIONS,
  type ExportOptions,
} from "../packages/core/src/types";
export const particleSettings = (change: Partial<ParticleSettings> = {}) => ({
  ...structuredClone(PARTICLE_DEFAULTS),
  ...change,
});
export function particleDesign() {
  return [
    node("Particles QA", {
      id: "particle-screen",
      width: 480,
      height: 320,
      children: [
        node("Celebrate", {
          id: "celebrate",
          width: 180,
          height: 60,
          transform: [
            [1, 0, 30],
            [0, 1, 80],
          ],
          fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8 } }],
        }),
        node("Ambient emitter", {
          id: "ambient",
          width: 180,
          height: 80,
          transform: [
            [1, 0, 250],
            [0, 1, 60],
          ],
          fills: [{ type: "SOLID", color: { r: 0.1, g: 0.15, b: 0.2 } }],
        }),
        node("Installed Emitter2D", {
          id: "external",
          width: 180,
          height: 80,
          transform: [
            [1, 0, 250],
            [0, 1, 170],
          ],
        }),
      ],
    }),
  ];
}
export function particleOptions(
  change: Partial<ExportOptions> = {},
): ExportOptions {
  return {
    ...DEFAULT_OPTIONS,
    themes: structuredClone(DEFAULT_THEMES),
    layerOverrides: {
      celebrate: {
        theme: { background: "surface" },
        behavior: {
          particles: particleSettings({
            count: 12,
            capacity: 24,
            lifetime: [0.5, 0.5],
            clip: false,
          }),
        },
      },
      ambient: {
        behavior: {
          particles: particleSettings({
            kind: "emitter2d",
            trigger: "mount",
            count: 4,
            rate: 4,
            capacity: 12,
            lifetime: [1, 1],
            speed: [20, 40],
            spread: 360,
            acceleration: [0, 0],
          }),
        },
      },
      external: {
        behavior: {
          particles: particleSettings({
            kind: "emitter2d",
            engine: "dogwarrior24-template-v1",
            acceleration: [0, 0],
            trigger: "manual",
            count: 3,
            capacity: 6,
            lifetime: [0.1, 2],
            texture: "rbxassetid://123456789",
            dependency: {
              template: "FramebridgeParticleQA",
              configVersion: "1",
              clientRevision: "reviewed-qa-v1",
            },
          }),
        },
      },
    },
    ...change,
  };
}
export const particlePackage = (change: Partial<ExportOptions> = {}) =>
  compile(
    particleDesign(),
    "particle-qa",
    particleOptions(change),
    "2026-10-03T00:00:00Z",
  );
