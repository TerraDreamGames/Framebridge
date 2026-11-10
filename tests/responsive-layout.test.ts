import { describe, expect, it, vi } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { flatten, type DesignNode } from "../packages/core/src/types";
import {
  responsiveDesigns,
  responsivePackages,
} from "./responsive-layout-fixtures";
import { snapshot } from "../plugins/figma/src/snapshot";
import { validProperty } from "../packages/core/src/editor";

const pkg = (name: keyof typeof responsiveDesigns) =>
  responsivePackages()[name];
const find = (name: keyof typeof responsiveDesigns, id: string) =>
  flatten(pkg(name).roots).find((n) => n.id === id)!;
describe("native responsive layout conversion", () => {
  it("uses flex rather than fixed grid gaps for space-between wrapped rows", () => {
    const design = structuredClone(responsiveDesigns.wrap);
    design.children[0].layout!.primary = "SPACE_BETWEEN";
    design.children[0].layout!.counterSpacing = 10;
    const out = compile([design], "distributed-wrap", { layout: "responsive" });
    const list = flatten(out.roots).find(
      (n) => n.className === "UIListLayout",
    )!;
    expect(list.properties.Wraps).toBe(true);
    expect(list.properties.HorizontalFlex).toEqual({
      type: "Enum",
      value: ["UIFlexAlignment", "SpaceBetween"],
    });
  });
  it("retains explicit empty grid cells instead of packing items into them", () => {
    const design = structuredClone(responsiveDesigns.grid);
    design.children[0].children.splice(1, 1);
    const out = compile([design], "sparse-grid", { layout: "responsive" });
    expect(flatten(out.roots).some((n) => n.className === "UIGridLayout")).toBe(
      false,
    );
    expect(out.issues.some((i) => i.code === "layout-frozen")).toBe(true);
  });
  it("keeps a baked Hug label visible at its measured dimensions", () => {
    const design = structuredClone(responsiveDesigns.variable);
    const child = design.children[0].children[0];
    child.name = "Artwork [raster]";
    child.layoutSizing = { horizontal: "HUG", vertical: "HUG" };
    const out = compile([design], "baked-hug", { layout: "responsive" });
    const art = flatten(out.roots).find((n) => n.id === child.id)!;
    expect(art.className).toBe("ImageLabel");
    expect(art.properties.Size).toEqual({
      type: "UDim2",
      value: [0, 80, 0, 20],
    });
    expect(art.properties.AutomaticSize).toBeUndefined();
  });
  it("allows editing proportional grid sizes with fixed gap corrections", () => {
    expect(
      validProperty("UIGridLayout", "CellSize", {
        type: "UDim2",
        value: [1 / 3, -20 / 3, 0, 50],
      }),
    ).toBe(true);
  });
  it("uses native flex with weighted Fill and fixed siblings", () => {
    expect(find("flex", "panel/layout").properties.HorizontalFlex).toEqual({
      type: "Enum",
      value: ["UIFlexAlignment", "Fill"],
    });
    expect(find("flex", "fixed/flex").properties.FlexMode).toEqual({
      type: "Enum",
      value: ["UIFlexMode", "None"],
    });
    expect(find("flex", "grow2/flex").properties.GrowRatio).toBe(2);
    expect(find("flex", "grow1").properties.Size).toEqual({
      type: "UDim2",
      value: [0, 0, 0, 30],
    });
  });
  it("lets Hug shrink by starting automatic axes at zero", () => {
    expect(find("hug", "panel").properties.Size).toEqual({
      type: "UDim2",
      value: [0, 0, 0, 0],
    });
    expect(find("hug", "panel").layoutSizing).toEqual(["HUG", "HUG"]);
    expect(find("hug", "panel").referenceSize).toEqual([128, 66]);
  });
  it("wraps equal cells as a grid and variable cells as a flex list", () => {
    expect(find("wrap", "panel/grid").properties.CellPadding).toEqual({
      type: "UDim2",
      value: [0, 10, 0, 12],
    });
    expect(find("wrap", "panel/grid").layoutSizing).toEqual(["FIXED", "FIXED"]);
    expect(find("variable", "panel/layout").properties.Wraps).toBe(true);
  });
  it("keeps absolute overlays out of flow and Hug measurement", () => {
    expect(
      find("absolute", "panel/flow").children.some((n) => n.id === "badge"),
    ).toBe(false);
    expect(
      find("absolute", "panel/absolute").children.map((n) => n.id),
    ).toEqual(["badge"]);
    expect(find("absolute", "panel/flow").properties.AutomaticSize).toEqual({
      type: "Enum",
      value: ["AutomaticSize", "Y"],
    });
  });
  it("uses flex track proportions and fixed row heights in a Figma grid", () => {
    expect(find("grid", "panel/grid").layoutSizing).toEqual(["FILL", "FIXED"]);
    expect(find("grid", "panel/grid").properties.CellSize).toEqual({
      type: "UDim2",
      value: [0.33333, -6.66667, 0, 50],
    });
    expect(find("grid", "cell5").properties.LayoutOrder).toBe(5);
  });
  it("infers a reflowing scrolling grid from measured regular cards", () => {
    expect(find("scroll", "panel").className).toBe("ScrollingFrame");
    expect(find("scroll", "panel/grid").properties.FillDirectionMaxCells).toBe(
      0,
    );
    expect(pkg("scroll").issues.some((i) => i.code === "grid-detected")).toBe(
      true,
    );
  });
  it("does not pack deliberate holes in a manually positioned grid", () => {
    const design = structuredClone(responsiveDesigns.scroll);
    design.children[0].children.splice(1, 1);
    const out = compile([design], "holes", { layout: "responsive" });
    expect(flatten(out.roots).some((n) => n.className === "UIGridLayout")).toBe(
      false,
    );
  });
  it("keeps decoration out of a scrolling layout while allowing its canvas to grow", () => {
    const content = find("decoratedScroll", "panel/content");
    expect(content.children.some((n) => n.className === "UIListLayout")).toBe(
      true,
    );
    expect(content.children.some((n) => n.id.startsWith("panel/fill:"))).toBe(
      false,
    );
    expect(content.properties.AutomaticSize).toEqual({
      type: "Enum",
      value: ["AutomaticSize", "Y"],
    });
  });
  it("keeps rotation and expanded raster bounds inside stable layout slots", () => {
    const design = structuredClone(responsiveDesigns.variable);
    const art = design.children[0].children[0];
    art.type = "VECTOR";
    art.rasterBounds = { x: -4, y: -6, width: 88, height: 32 };
    const out = compile([design], "slots", {
      layout: "responsive",
      assetIds: { [`image:${art.id}:bleed-v2`]: "42" },
    });
    const slot = flatten(out.roots).find((n) => n.id === `${art.id}/slot`)!;
    expect(slot.properties.Size).toEqual({
      type: "UDim2",
      value: [0, 80, 0, 20],
    });
    expect(slot.children[0].properties.Position).toEqual({
      type: "UDim2",
      value: [0, -4, 0, -6],
    });
    expect(slot.children[0].id).toBe(art.id);
  });
  it("keeps explicit layout overrides authoritative and isolates stacked fills", () => {
    const design = structuredClone(responsiveDesigns.decoratedScroll);
    const out = compile([design], "override", {
      layout: "responsive",
      layerOverrides: {
        panel: {
          components: {
            layout: false,
            grid: { CellSize: { type: "UDim2", value: [0, 40, 0, 20] } },
          },
        },
      },
    });
    const nodes = flatten(out.roots);
    expect(nodes.some((n) => n.className === "UIListLayout")).toBe(false);
    const content = nodes.find((n) => n.id === "panel/content")!;
    expect(content.children.some((n) => n.className === "UIGridLayout")).toBe(
      true,
    );
    expect(content.children.some((n) => n.id.startsWith("panel/fill:"))).toBe(
      false,
    );
  });
  it("reports unsupported spacing instead of changing source geometry", () => {
    const design = structuredClone(responsiveDesigns.variable);
    design.children[0].layout!.counterSpacing = 20;
    const out = compile([design], "unequal", { layout: "responsive" });
    expect(out.issues.some((i) => i.code === "layout-frozen")).toBe(true);
    expect(flatten(out.roots).some((n) => n.className === "UIListLayout")).toBe(
      false,
    );
  });
  it("captures Figma sizing, scrolling, grid tracks and cell placement", () => {
    vi.stubGlobal("figma", { mixed: Symbol("mixed") });
    try {
      const parent = { layoutMode: "GRID" };
      const source = {
        ...node("Grid"),
        relativeTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        cornerRadius: 0,
        effects: [],
        layoutMode: "GRID",
        layoutWrap: "NO_WRAP",
        layoutSizingHorizontal: "FILL",
        layoutSizingVertical: "HUG",
        itemSpacing: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        primaryAxisAlignItems: "MIN",
        counterAxisAlignItems: "MIN",
        gridRowCount: 2,
        gridColumnCount: 3,
        gridRowGap: 8,
        gridColumnGap: 10,
        gridRowSizes: [{ type: "FIXED", value: 50 }],
        gridColumnSizes: [{ type: "FLEX", value: 1 }],
        overflowDirection: "VERTICAL",
        gridRowAnchorIndex: 1,
        gridColumnAnchorIndex: 2,
        gridRowSpan: 1,
        gridColumnSpan: 1,
        parent,
      };
      const actual = snapshot(source as unknown as SceneNode);
      expect(actual.layoutSizing).toEqual({
        horizontal: "FILL",
        vertical: "HUG",
      });
      expect(actual.scrolling).toBe("VERTICAL");
      expect(actual.layout?.grid?.columnSizes).toEqual([
        { type: "FLEX", value: 1 },
      ]);
      expect(actual.gridCell).toEqual({
        row: 1,
        column: 2,
        rowSpan: 1,
        columnSpan: 1,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
