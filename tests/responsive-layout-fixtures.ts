import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import type { DesignNode } from "../packages/core/src/types";

const layout = (
  mode = "HORIZONTAL",
  extra: Partial<NonNullable<DesignNode["layout"]>> = {},
) => ({
  mode,
  spacing: 10,
  padding: [10, 10, 10, 10] as [number, number, number, number],
  primary: "MIN",
  counter: "MIN",
  wrap: false,
  ...extra,
});
const cell = (id: string, w = 60, h = 30, extra: Partial<DesignNode> = {}) =>
  node(id, {
    id,
    width: w,
    height: h,
    fills: [{ type: "SOLID", color: { r: 0.2, g: 0.5, b: 0.8 } }],
    ...extra,
  });
const scene = (panel: DesignNode) =>
  node("Canvas", { id: "canvas", width: 400, height: 400, children: [panel] });

export const responsiveDesigns = {
  scrollingHug: scene(
    node("Hug scrolling list", {
      id: "panel",
      width: 230,
      height: 80,
      scrolling: "VERTICAL",
      fills: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.1 },
        { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      ],
      layout: layout("VERTICAL", { sizingX: "HUG" }),
      children: Array.from({ length: 4 }, (_, i) => cell(`cell${i}`, 100, 30)),
    }),
  ),
  textHug: scene(
    node("Wrapping text", {
      id: "panel",
      width: 300,
      height: 60,
      layout: layout("VERTICAL", { sizingY: "HUG" }),
      children: [
        cell("label", 280, 40, {
          type: "TEXT",
          layoutSizing: { horizontal: "FILL", vertical: "HUG" },
          text: {
            characters:
              "A paragraph that changes its height when the available width gets smaller. The container follows the wrapped text.",
            align: "LEFT",
            verticalAlign: "TOP",
            autoResize: "HEIGHT",
            runs: [
              {
                text: "A paragraph that changes its height when the available width gets smaller. The container follows the wrapped text.",
                fontFamily: "Roboto",
                fontStyle: "Regular",
                fontSize: 16,
              },
            ],
          },
        }),
      ],
    }),
  ),
  decoratedHug: scene(
    node("Painted Hug", {
      id: "panel",
      width: 128,
      height: 66,
      fills: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.1 },
        { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      ],
      layout: layout("VERTICAL", {
        spacing: 8,
        padding: [4, 4, 4, 4],
        sizingX: "HUG",
        sizingY: "HUG",
      }),
      children: [cell("first", 80, 20), cell("second", 120, 30)],
    }),
  ),
  crossFill: scene(
    node("Cross-axis fill", {
      id: "panel",
      width: 300,
      height: 160,
      layout: layout("VERTICAL"),
      children: [
        cell("stretch", 280, 30, {
          stretch: true,
          layoutSizing: { horizontal: "FILL", vertical: "FIXED" },
        }),
      ],
    }),
  ),
  rasterSlot: scene(
    node("Artwork row", {
      id: "panel",
      width: 250,
      height: 60,
      layout: layout(),
      children: [
        cell("art", 80, 20, {
          type: "VECTOR",
          rasterBounds: { x: -4, y: -6, width: 88, height: 32 },
        }),
        cell("next", 50, 30),
      ],
    }),
  ),
  flex: scene(
    node("Fill row", {
      id: "panel",
      width: 300,
      height: 60,
      layout: layout(),
      children: [
        cell("fixed", 40, 30),
        cell("grow1", 70, 30, {
          grow: 1,
          layoutSizing: { horizontal: "FILL", vertical: "FIXED" },
        }),
        cell("grow2", 140, 30, {
          grow: 2,
          layoutSizing: { horizontal: "FILL", vertical: "FIXED" },
        }),
      ],
    }),
  ),
  hug: scene(
    node("Hug list", {
      id: "panel",
      width: 128,
      height: 66,
      layout: layout("VERTICAL", {
        spacing: 8,
        padding: [4, 4, 4, 4],
        sizingX: "HUG",
        sizingY: "HUG",
      }),
      children: [cell("first", 80, 20), cell("second", 120, 30)],
    }),
  ),
  wrap: scene(
    node("Wrapped grid", {
      id: "panel",
      width: 230,
      height: 150,
      layout: layout("HORIZONTAL", { wrap: true, counterSpacing: 12 }),
      children: Array.from({ length: 6 }, (_, i) => cell(`cell${i}`)),
    }),
  ),
  variable: scene(
    node("Wrapped list", {
      id: "panel",
      width: 230,
      height: 150,
      layout: layout("HORIZONTAL", { wrap: true }),
      children: [
        cell("first", 80, 20),
        cell("second", 50, 30),
        cell("third", 70, 25),
        cell("fourth", 100, 40),
      ],
    }),
  ),
  absolute: scene(
    node("Hug with overlay", {
      id: "panel",
      width: 150,
      height: 66,
      layout: layout("VERTICAL", {
        spacing: 8,
        padding: [4, 4, 4, 4],
        sizingY: "HUG",
      }),
      children: [
        cell("first", 80, 20),
        cell("second", 120, 30),
        cell("badge", 20, 20, {
          absolute: true,
          transform: [
            [1, 0, 250],
            [0, 1, 250],
          ],
        }),
      ],
    }),
  ),
  grid: scene(
    node("Figma Grid", {
      id: "panel",
      width: 300,
      height: 150,
      layout: layout("GRID", {
        grid: {
          rows: 2,
          columns: 3,
          rowGap: 8,
          columnGap: 10,
          rowSizes: [
            { type: "FIXED", value: 50 },
            { type: "FIXED", value: 50 },
          ],
          columnSizes: Array.from({ length: 3 }, () => ({
            type: "FLEX",
            value: 1,
          })),
        },
      }),
      children: Array.from({ length: 6 }, (_, i) =>
        cell(`cell${i}`, 260 / 3, 50, {
          gridCell: {
            row: Math.floor(i / 3),
            column: i % 3,
            rowSpan: 1,
            columnSpan: 1,
          },
        }),
      ),
    }),
  ),
  scroll: scene(
    node("Inventory", {
      id: "panel",
      width: 230,
      height: 80,
      scrolling: "VERTICAL",
      children: Array.from({ length: 6 }, (_, i) =>
        cell(`cell${i}`, 60, 30, {
          transform: [
            [1, 0, 10 + (i % 3) * 70],
            [0, 1, 10 + Math.floor(i / 3) * 40],
          ],
        }),
      ),
    }),
  ),
  decoratedScroll: scene(
    node("Painted scroll", {
      id: "panel",
      width: 230,
      height: 80,
      scrolling: "VERTICAL",
      fills: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.1 },
        { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      ],
      layout: layout("VERTICAL"),
      children: Array.from({ length: 4 }, (_, i) => cell(`cell${i}`, 100, 30)),
    }),
  ),
};
export function responsivePackages() {
  return Object.fromEntries(
    Object.entries(responsiveDesigns).map(([name, design]) => [
      name,
      compile(
        [design],
        `responsive-${name}`,
        { layout: "responsive", assetIds: { "image:art:bleed-v2": "42" } },
        "fixed",
      ),
    ]),
  );
}
