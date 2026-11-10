import { node } from "./demo";
import { compile } from "./compiler";
import type { DesignNode, ExportOptions } from "./types";
const at = (x: number, y: number): DesignNode["transform"] => [
  [1, 0, x],
  [0, 1, y],
];
export function interactionExampleDesign(): DesignNode[] {
  const label = (id: string, characters: string, x = 0, y = 0, width = 160) =>
    node(id, {
      id,
      type: "TEXT",
      width,
      height: 28,
      transform: at(x, y),
      fills: [],
      text: {
        characters,
        align: "CENTER",
        verticalAlign: "CENTER",
        runs: [
          {
            text: characters,
            fontFamily: "Roboto",
            fontStyle: "Regular",
            fontSize: 18,
            color: { r: 0.94, g: 0.95, b: 1, a: 1 },
          },
        ],
      },
    });
  const visual = (kind: string, color: { r: number; g: number; b: number }) =>
    node(
      `${kind[0].toUpperCase() + kind.slice(1)} appearance [state:${kind}]`,
      {
        id: `visual-${kind}`,
        width: 160,
        height: 40,
        visible: kind === "default",
        fills: [{ type: "SOLID", color }],
      },
    );
  return [
    node("Interaction examples", {
      id: "screen",
      width: 600,
      height: 520,
      children: [
        label("example-title", "Interaction examples", 20, 20, 360),
        node("Open shop [open:Shop]", {
          id: "open",
          width: 160,
          height: 40,
          transform: at(20, 90),
          children: [
            visual("default", { r: 0.2, g: 0.2, b: 0.3 }),
            visual("hover", { r: 0.3, g: 0.4, b: 0.6 }),
            visual("pressed", { r: 0.1, g: 0.2, b: 0.4 }),
            visual("disabled", { r: 0.4, g: 0.4, b: 0.4 }),
            label("open-label", "Open shop", 0, 6),
          ],
        }),
        node("Shop [panel]", {
          id: "shop",
          width: 320,
          height: 280,
          visible: false,
          transform: at(240, 90),
          fills: [{ type: "SOLID", color: { r: 0.16, g: 0.18, b: 0.24 } }],
          children: [
            node("Close [close]", {
              id: "close",
              width: 80,
              height: 36,
              transform: at(220, 10),
              children: [label("close-label", "Close", 0, 4, 80)],
            }),
            label("coins", "Coins: {Coins}", 20, 90, 280),
            label("shop-title", "Shop", 20, 40, 200),
          ],
        }),
        node("Toggle shop [toggle:Shop]", {
          id: "toggle",
          width: 160,
          height: 40,
          transform: at(20, 145),
          children: [label("toggle-label", "Toggle shop", 0, 6)],
        }),
        node("Tabs [tabgroup]", {
          id: "tabs",
          width: 200,
          height: 150,
          transform: at(20, 280),
          children: [
            node("Inventory [panel]", {
              id: "inventory",
              width: 200,
              height: 150,
              children: [
                label("inventory-title", "Inventory content", 0, 56, 200),
              ],
            }),
            node("Settings [panel]", {
              id: "settings",
              width: 200,
              height: 150,
              visible: false,
              children: [
                label("settings-title", "Settings content", 0, 56, 200),
              ],
            }),
          ],
        }),
        node("Inventory tab [tab:Inventory]", {
          id: "inventory-tab",
          width: 100,
          height: 36,
          transform: at(20, 225),
          children: [
            node("Selection [state:selected]", {
              id: "inventory-selected",
              width: 100,
              height: 36,
              fills: [{ type: "SOLID", color: { r: 0.16, g: 0.32, b: 0.62 } }],
            }),
            label("inventory-tab-label", "Inventory", 0, 4, 100),
          ],
        }),
        node("Settings tab [tab:Settings]", {
          id: "settings-tab",
          width: 100,
          height: 36,
          transform: at(130, 225),
          children: [
            node("Selection [state:selected]", {
              id: "settings-selected",
              width: 100,
              height: 36,
              visible: false,
              fills: [{ type: "SOLID", color: { r: 0.16, g: 0.32, b: 0.62 } }],
            }),
            label("settings-tab-label", "Settings", 0, 4, 100),
          ],
        }),
      ],
    }),
  ];
}
export function interactionExamplePackage(
  options: Partial<ExportOptions> = {},
) {
  return compile(
    interactionExampleDesign(),
    "behavior-fixture",
    { layout: "responsive", ...options },
    "fixed",
  );
}
