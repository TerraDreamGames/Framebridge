import { node } from "./demo";
import { compile } from "./compiler";
import { REST_POSE, type KeyframeSettings } from "./keyframes";
import type { DesignNode, LayerOverride, ExportOptions } from "./types";
const at = (x: number, y: number): DesignNode["transform"] => [
  [1, 0, x],
  [0, 1, y],
];
const label = (id: string, text: string, x: number, y: number, w = 180) =>
  node(text, {
    id,
    type: "TEXT",
    width: w,
    height: 30,
    transform: at(x, y),
    text: {
      characters: text,
      align: "CENTER",
      verticalAlign: "CENTER",
      runs: [
        {
          text,
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize: 16,
          color: { r: 1, g: 1, b: 1, a: 1 },
        },
      ],
    },
  });
const box = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  children: DesignNode[] = [],
) =>
  node(id, {
    id,
    width: w,
    height: h,
    transform: at(x, y),
    fills: [{ type: "SOLID", color: { r: 0.2, g: 0.3, b: 0.5 } }],
    children,
  });
export function exampleChain(
  trigger: KeyframeSettings["trigger"],
  extra: Partial<KeyframeSettings> = {},
): KeyframeSettings {
  return {
    trigger,
    interruption: "restart",
    finish: "hold",
    repeats: 0,
    yoyo: false,
    frames: [
      { ...REST_POSE, time: 0, easing: "linear", direction: "out" },
      {
        ...REST_POSE,
        x: 40,
        y: -12,
        scale: 1.1,
        rotation: 12,
        opacity: 0.5,
        time: 0.5,
        easing: "quad",
        direction: "inOut",
      },
      { ...REST_POSE, x: 60, time: 1, easing: "cubic", direction: "out" },
    ],
    ...extra,
  };
}
export function keyframeDesign(): DesignNode[] {
  return [
    box("keyframe-screen", 0, 0, 800, 600, [
      label("title", "Keyframe chains · recorded native poses", 20, 20, 700),
      box("mount", 30, 80, 170, 45, [
        label("mount-label", "Mount · repeat/yoyo", 0, 6, 170),
      ]),
      box("hover", 300, 80, 170, 45, [
        label("hover-label", "Hover / focus", 0, 6, 170),
      ]),
      box("press", 30, 200, 170, 45, [
        label("press-label", "Hold pressed", 0, 6, 170),
      ]),
      box("activate", 300, 200, 170, 45, [
        label("activate-label", "Activate / restart", 0, 6, 170),
      ]),
      box("open", 550, 80, 180, 45, [
        label("open-label", "Toggle animated panel", 0, 6, 180),
      ]),
      box("panel", 550, 170, 180, 120, [
        label("panel-label", "Entrance on visible", 0, 45, 180),
      ]),
      box("selected", 30, 330, 170, 45, [
        label("selected-label", "Selected state", 0, 6, 170),
      ]),
      box("attribute", 300, 330, 170, 45, [
        label("attribute-label", "Layer attribute trigger", 0, 6, 170),
      ]),
      label(
        "note",
        "Choose poses, easing and triggers. Game scripts own application state.",
        20,
        510,
        750,
      ),
    ]),
  ];
}
export const keyframeOverrides: Record<string, LayerOverride> = {
  mount: {
    behavior: {
      keyframes: exampleChain("mount", {
        repeats: 1,
        yoyo: true,
        finish: "restore",
      }),
    },
  },
  hover: {
    behavior: { keyframes: exampleChain("hover", { finish: "restore" }) },
  },
  press: {
    behavior: { keyframes: exampleChain("pressed", { finish: "restore" }) },
  },
  activate: { behavior: { keyframes: exampleChain("activate") } },
  open: { behavior: { action: { kind: "toggle", target: "panel" } } },
  panel: {
    behavior: {
      role: "panel",
      initialVisible: false,
      keyframes: exampleChain("visible", {
        frames: [
          {
            ...REST_POSE,
            time: 0,
            opacity: 0,
            y: 30,
            easing: "linear",
            direction: "out",
          },
          { ...REST_POSE, time: 0.5, easing: "back", direction: "out" },
        ],
      }),
    },
  },
  selected: {
    behavior: { keyframes: exampleChain("selected", { finish: "restore" }) },
  },
  attribute: {
    behavior: {
      keyframes: exampleChain("attribute", { attribute: "FramebridgeAnimate" }),
    },
  },
};
export function keyframePackage(options: Partial<ExportOptions> = {}) {
  return compile(
    keyframeDesign(),
    "framebridge-example:keyframes",
    {
      ...options,
      layerOverrides: Object.fromEntries(
        [
          ...new Set([
            ...Object.keys(keyframeOverrides),
            ...Object.keys(options.layerOverrides ?? {}),
          ]),
        ].map((id) => [
          id,
          { ...keyframeOverrides[id], ...options.layerOverrides?.[id] },
        ]),
      ),
    },
    "2026-10-03T00:00:00Z",
  );
}
