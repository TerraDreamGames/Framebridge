import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import type { DesignNode, LayerOverride } from "../packages/core/src/types";

const color = (r: number, g: number, b: number) => ({
  type: "SOLID",
  color: { r, g, b },
});
const at = (x: number, y: number): DesignNode["transform"] => [
  [1, 0, x],
  [0, 1, y],
];
const label = (
  id: string,
  text: string,
  x: number,
  y: number,
  width: number,
  size = 16,
) =>
  node(text, {
    id,
    type: "TEXT",
    width,
    height: 24,
    transform: at(x, y),
    constraints: { horizontal: "STRETCH", vertical: "MIN" },
    text: {
      characters: text,
      align: "LEFT",
      verticalAlign: "CENTER",
      autoResize: "NONE",
      runs: [
        {
          text,
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize: size,
          color: { r: 0.94, g: 0.96, b: 1 },
        },
      ],
    },
  });

export function devicePreviewDesign() {
  const cards = Array.from({ length: 12 }, (_, i) =>
    node(`Supply ${i + 1}`, {
      id: `card-${i}`,
      width: 132,
      height: 116,
      transform: at(12 + (i % 6) * 144, 12 + Math.floor(i / 6) * 128),
      radius: 10,
      fills: [color(0.12, 0.17, 0.25)],
      children: [
        label(
          `name-${i}`,
          ["Rations", "Lantern", "Medkit", "Rope"][i % 4],
          12,
          10,
          108,
        ),
        label(`price-${i}`, `${(i + 1) * 50} coins`, 12, 38, 108, 13),
        node("Details [button]", {
          id: `details-${i}`,
          width: 108,
          height: 28,
          transform: at(12, 76),
          radius: 6,
          fills: [color(0.22, 0.4, 0.64)],
          children: [label(`details-label-${i}`, "Details", 8, 2, 92, 13)],
        }),
      ],
    }),
  );
  return [
    node("Responsive inventory", {
      id: "device-inventory",
      width: 1024,
      height: 768,
      fills: [color(0.055, 0.075, 0.11)],
      children: [
        label("heading", "Outpost supplies", 24, 20, 976, 24),
        label(
          "description",
          "Browse supplies for your next expedition.",
          24,
          58,
          976,
          14,
        ),
        node("Supplies", {
          id: "inventory",
          width: 976,
          height: 648,
          transform: at(24, 96),
          constraints: { horizontal: "STRETCH", vertical: "STRETCH" },
          clipsContent: true,
          scrolling: "VERTICAL",
          children: cards,
        }),
        node("Supply details", {
          id: "details-panel",
          width: 280,
          height: 180,
          transform: at(372, 294),
          constraints: { horizontal: "CENTER", vertical: "CENTER" },
          radius: 12,
          fills: [color(0.14, 0.2, 0.29)],
          children: [
            label(
              "details-heading",
              "Ready for the expedition?",
              16,
              20,
              248,
              18,
            ),
            label(
              "details-body",
              "Gameplay logic belongs in your game.",
              16,
              62,
              248,
              12,
            ),
            node("Close [button]", {
              id: "details-close",
              width: 248,
              height: 32,
              transform: at(16, 128),
              radius: 6,
              fills: [color(0.22, 0.4, 0.64)],
              children: [
                label("close-label", "Back to supplies", 12, 4, 224, 14),
              ],
            }),
          ],
        }),
      ],
    }),
  ];
}

export const devicePreviewOverrides: Record<string, LayerOverride> = {
  heading: { properties: { TextWrapped: true } },
  description: { properties: { TextWrapped: true } },
  inventory: {
    className: "ScrollingFrame",
    components: {
      grid: {
        CellSize: { type: "UDim2", value: [0, 132, 0, 116] },
        CellPadding: { type: "UDim2", value: [0, 12, 0, 12] },
        FillDirection: { type: "Enum", value: ["FillDirection", "Horizontal"] },
        FillDirectionMaxCells: 0,
      },
      padding: {
        PaddingLeft: { type: "UDim", value: [0, 12] },
        PaddingRight: { type: "UDim", value: [0, 12] },
        PaddingTop: { type: "UDim", value: [0, 12] },
        PaddingBottom: { type: "UDim", value: [0, 12] },
      },
    },
  },
  "details-panel": { behavior: { role: "panel", initialVisible: false } },
  "details-close": {
    behavior: { action: { kind: "close", target: "details-panel" } },
  },
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [
      `details-${i}`,
      {
        behavior: { action: { kind: "open", target: "details-panel" } },
      },
    ]),
  ),
};

export function devicePreviewPackage() {
  return compile(
    devicePreviewDesign(),
    "framebridge-example:responsive-inventory",
    {
      layout: "responsive",
      layerOverrides: devicePreviewOverrides,
    },
  );
}
