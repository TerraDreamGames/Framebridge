import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import type { DesignNode, ExportOptions } from "../packages/core/src/types";

const paint = { type: "SOLID", color: { r: 0.2, g: 0.45, b: 0.7 } };
const item = (id: string, props: Partial<DesignNode> = {}) =>
  node(id, { id, width: 60, height: 20, fills: [paint], ...props });
const panel = (props: Partial<DesignNode> = {}) =>
  node("Panel", {
    id: "panel",
    width: 200,
    height: 100,
    constraints: { horizontal: "SCALE", vertical: "SCALE" },
    fills: [paint],
    transform: [
      [1, 0, 20],
      [0, 1, 20],
    ],
    ...props,
  });
const scene = (content: DesignNode) =>
  node("Style canvas", {
    id: "canvas",
    width: 400,
    height: 300,
    children: [content],
  });
const list = (extra: Partial<NonNullable<DesignNode["layout"]>> = {}) => ({
  mode: "VERTICAL",
  spacing: 8,
  padding: [10, 20, 10, 20] as [number, number, number, number],
  primary: "MIN",
  counter: "MIN",
  wrap: false,
  ...extra,
});
const grid = (flex = true) =>
  panel({
    width: 320,
    height: 160,
    layout: list({
      mode: "GRID",
      spacing: 10,
      padding: [10, 10, 10, 10],
      grid: {
        rows: 2,
        columns: 3,
        rowGap: 10,
        columnGap: 10,
        rowSizes: [
          { type: "FIXED", value: 50 },
          { type: "FIXED", value: 50 },
        ],
        columnSizes: Array.from({ length: 3 }, () =>
          flex ? { type: "FLEX", value: 1 } : { type: "FIXED", value: 80 },
        ),
      },
    }),
    children: Array.from({ length: 6 }, (_, i) =>
      item("cell" + i, {
        width: flex ? 280 / 3 : 80,
        height: 50,
        gridCell: {
          row: Math.floor(i / 3),
          column: i % 3,
          rowSpan: 1,
          columnSpan: 1,
        },
      }),
    ),
  });

export const styleSizingDesigns = {
  appearance: scene(
    panel({
      corners: [4, 8, 12, 16],
      strokeWeight: 2,
      strokes: [paint],
      effects: ["DROP_SHADOW"],
      shadows: [
        {
          type: "DROP_SHADOW",
          radius: 12,
          spread: -2,
          offset: { x: 3, y: -4 },
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          blendMode: "NORMAL",
        },
      ],
      children: [
        item("label", {
          type: "TEXT",
          width: 120,
          height: 30,
          strokes: [paint],
          strokeWeight: 1,
          text: {
            characters: "Scale me",
            align: "LEFT",
            verticalAlign: "TOP",
            runs: [
              {
                text: "Scale me",
                fontFamily: "Roboto",
                fontStyle: "Regular",
                fontSize: 20,
              },
            ],
          },
        }),
      ],
    }),
  ),
  list: scene(
    panel({ layout: list(), children: [item("first"), item("second")] }),
  ),
  hug: scene(
    panel({
      height: 68,
      layout: list({ sizingY: "HUG" }),
      children: [item("first"), item("second")],
    }),
  ),
  manualScroll: scene(
    panel({
      name: "Manual scroll",
      scrolling: "VERTICAL",
      layout: list(),
      children: [item("first"), item("second")],
    }),
  ),
  autoY: scene(
    panel({
      scrolling: "VERTICAL",
      layout: list(),
      children: [item("first"), item("second")],
    }),
  ),
  autoX: scene(
    panel({
      scrolling: "HORIZONTAL",
      layout: list({ mode: "HORIZONTAL" }),
      children: [item("first"), item("second")],
    }),
  ),
  flexGrid: scene(grid()),
  fixedGrid: scene(grid(false)),
  autoGrid: scene({ ...grid(), scrolling: "BOTH" }),
  paddedParent: {
    ...scene(
      panel({
        scrolling: "VERTICAL",
        layout: list(),
        children: [item("first"), item("second")],
      }),
    ),
    layout: list(),
  },
  removedParentPadding: {
    ...scene(
      panel({
        scrolling: "VERTICAL",
        layout: list(),
        children: [item("first"), item("second")],
      }),
    ),
    layout: list(),
  },
  nestedCanvas: scene(
    node("Outer scroll", {
      id: "outer",
      width: 200,
      height: 100,
      scrolling: "VERTICAL",
      children: [
        panel({
          scrolling: "VERTICAL",
          layout: list(),
          children: [item("first"), item("second")],
        }),
      ],
    }),
  ),
  decoratedAutoY: scene(
    panel({
      scrolling: "VERTICAL",
      fills: [
        paint,
        { ...paint, color: { r: 0.7, g: 0.2, b: 0.4 }, opacity: 0.4 },
      ],
      layout: list(),
      children: [item("first"), item("second")],
    }),
  ),
};
export type StyleCase = keyof typeof styleSizingDesigns;
export function styleSizingPackage(
  name: StyleCase,
  settings: Partial<ExportOptions> = {},
) {
  const manual: ExportOptions["layerOverrides"] = [
    "manualScroll",
    "paddedParent",
    "removedParentPadding",
    "nestedCanvas",
  ].includes(name)
    ? {
        panel: {
          properties: {
            AutomaticCanvasSize: {
              type: "Enum" as const,
              value: ["AutomaticSize", "None"] as [string, string],
            },
            CanvasSize: { type: "UDim2" as const, value: [3, 0, 4, 0] },
          },
        },
        ...(name === "paddedParent"
          ? {
              canvas: {
                components: {
                  padding: {
                    PaddingLeft: { type: "UDim" as const, value: [0, 40] },
                    PaddingRight: { type: "UDim" as const, value: [0, 30] },
                    PaddingTop: { type: "UDim" as const, value: [0, 15] },
                    PaddingBottom: { type: "UDim" as const, value: [0, 5] },
                  },
                },
              },
            }
          : {}),
        ...(name === "removedParentPadding"
          ? { canvas: { components: { padding: false as const } } }
          : {}),
        ...(name === "nestedCanvas"
          ? {
              outer: {
                properties: {
                  CanvasSize: {
                    type: "UDim2" as const,
                    value: [0, 600, 0, 400],
                  },
                  AutomaticCanvasSize: {
                    type: "Enum" as const,
                    value: ["AutomaticSize", "None"] as [string, string],
                  },
                },
                components: {
                  padding: {
                    PaddingLeft: { type: "UDim" as const, value: [0, 10] },
                    PaddingRight: { type: "UDim" as const, value: [0, 10] },
                    PaddingTop: { type: "UDim" as const, value: [0, 10] },
                    PaddingBottom: { type: "UDim" as const, value: [0, 10] },
                  },
                },
              },
            }
          : {}),
      }
    : {};
  return compile(
    [structuredClone(styleSizingDesigns[name])],
    "style:" + name,
    {
      layout: "responsive",
      styleSizing: "scale",
      layerOverrides: manual,
      ...settings,
    },
    "fixed",
  );
}
export function styleSizingPackages() {
  return Object.fromEntries(
    Object.keys(styleSizingDesigns).map((key) => [
      "scaled" + key[0].toUpperCase() + key.slice(1),
      styleSizingPackage(key as StyleCase),
    ]),
  );
}
