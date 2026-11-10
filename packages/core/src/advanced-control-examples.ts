import { node } from "./demo";
import { compile } from "./compiler";
import type { DesignNode, ExportOptions, LayerOverride } from "./types";
const at = (x: number, y: number): DesignNode["transform"] => [
  [1, 0, x],
  [0, 1, y],
];
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
    fills: [{ type: "SOLID", color: { r: 0.14, g: 0.2, b: 0.3 } }],
    children,
  });
const label = (id: string, text: string, x = 0, y = 0, w = 180) =>
  node(text, {
    id,
    type: "TEXT",
    width: w,
    height: 28,
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
export const advancedControlOverrides: Record<string, LayerOverride> = {
  progress: {
    behavior: {
      control: {
        kind: "progress",
        min: 0,
        max: 100,
        value: 75,
        axis: "X",
        fill: "progress-fill",
        data: { source: "attribute", key: "Health" },
      },
    },
  },
  toggle: { behavior: { control: { kind: "toggle", value: false } } },
  slider: {
    behavior: {
      control: {
        kind: "slider",
        min: 0,
        max: 100,
        value: 25,
        step: 5,
        axis: "X",
        fill: "slider-fill",
        thumb: "slider-thumb",
      },
    },
  },
  cooldown: {
    behavior: {
      control: { kind: "cooldown", duration: 1, fill: "cooldown-fill" },
      action: { kind: "toggle", target: "window" },
    },
  },
  tip: {
    behavior: { control: { kind: "tooltip", target: "tooltip", delay: 0.2 } },
  },
  tooltip: { behavior: { role: "panel", initialVisible: false } },
  window: {
    behavior: {
      role: "panel",
      control: { kind: "window", handle: "window-handle", constrain: true },
    },
  },
  tabs: { behavior: { role: "tabGroup" } },
  "panel-one": { behavior: { role: "panel", initialVisible: true } },
  "panel-two": { behavior: { role: "panel", initialVisible: false } },
  "tab-one": { behavior: { action: { kind: "tab", target: "panel-one" } } },
  "tab-two": { behavior: { action: { kind: "tab", target: "panel-two" } } },
  "skill-one": {
    behavior: { control: { kind: "skill", requires: [], unlocked: false } },
  },
  "skill-two": {
    behavior: {
      control: { kind: "skill", requires: ["skill-one"], unlocked: false },
    },
  },
  roulette: {
    behavior: {
      control: {
        kind: "roulette",
        items: ["Coins", "Gems", "Boost"],
        duration: 1,
      },
    },
  },
  coins: {
    behavior: {
      binding: {
        source: "leaderstats",
        key: "Coins",
        template: "Coins: {value}",
      },
    },
  },
};
export function advancedControlDesign(): DesignNode[] {
  return [
    box("advanced-screen", 0, 0, 800, 620, [
      label("title", "Advanced controls · local game UI", 20, 15, 500),
      box("progress", 20, 70, 240, 28, [box("progress-fill", 0, 0, 240, 28)]),
      label("progress-caption", "Health progress (player data)", 20, 104, 240),
      box("toggle", 290, 70, 160, 40, [
        label("toggle-label", "Toggle", 0, 6, 160),
      ]),
      box("slider", 20, 155, 240, 28, [
        box("slider-fill", 0, 0, 240, 28),
        box("slider-thumb", 0, 0, 12, 28),
      ]),
      label("slider-caption", "Slider · drag or arrows", 20, 190, 240),
      box("cooldown", 290, 155, 160, 40, [
        box("cooldown-fill", 0, 0, 160, 40),
        label("cooldown-label", "Window (1s cooldown)", 0, 6, 160),
      ]),
      box("tip", 480, 70, 160, 40, [
        label("tip-label", "Tooltip · hover", 0, 6, 160),
      ]),
      box("tooltip", 480, 118, 260, 60, [
        label("tooltip-label", "Mouse, touch or selection", 10, 12, 240),
      ]),
      box("window", 480, 250, 280, 150, [
        box("window-handle", 0, 0, 280, 36, [
          label("handle-label", "Drag window here", 0, 4, 280),
        ]),
        label("window-text", "Edit styling in Properties", 10, 65, 260),
      ]),
      box("tabs", 20, 270, 240, 100, [
        box("panel-one", 0, 0, 240, 100, [
          label("one-text", "First tab", 10, 20),
        ]),
        box("panel-two", 0, 0, 240, 100, [
          label("two-text", "Second tab", 10, 20),
        ]),
      ]),
      box("tab-one", 20, 225, 110, 36, [
        label("tab-one-text", "Tab 1", 0, 4, 110),
      ]),
      box("tab-two", 150, 225, 110, 36, [
        label("tab-two-text", "Tab 2", 0, 4, 110),
      ]),
      box("skill-one", 20, 410, 160, 40, [
        label("skill-one-text", "Unlock base skill", 0, 6, 160),
      ]),
      box("skill-two", 200, 410, 160, 40, [
        label("skill-two-text", "Requires base skill", 0, 6, 160),
      ]),
      box("roulette", 20, 485, 240, 40, [
        label("roulette-text", "Spin · visual result only", 0, 6, 240),
      ]),
      label("coins", "Coins: {value}", 290, 485, 160),
      label(
        "game-note",
        "Client attributes are inspectable. The game server owns rewards and skill authorization.",
        20,
        565,
        760,
      ),
    ]),
  ];
}
export function advancedControlPackage(options: Partial<ExportOptions> = {}) {
  return compile(
    advancedControlDesign(),
    "framebridge-example:advanced-controls",
    {
      ...options,
      layerOverrides: Object.fromEntries(
        [
          ...new Set([
            ...Object.keys(advancedControlOverrides),
            ...Object.keys(options.layerOverrides ?? {}),
          ]),
        ].map((id) => [
          id,
          { ...advancedControlOverrides[id], ...options.layerOverrides?.[id] },
        ]),
      ),
    },
    "2026-10-03T00:00:00Z",
  );
}
