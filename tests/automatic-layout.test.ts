import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import {
  flatten,
  type DesignNode,
  type ExportOptions,
} from "../packages/core/src/types";
import { previewFlow } from "../plugins/figma/src/preview-layout";
import { validateExportPackage } from "../packages/core/src/export-package";
import {
  reviewChanges,
  structureReview,
} from "../packages/core/src/structure-review";
import { applyOverrideChanges } from "../packages/core/src/bulk-editor";

// Measured from InventoryUI's freeform slot frame, with no artwork or private metadata.
const inventory = () =>
  node("Inventory slots", {
    id: "slots",
    width: 715,
    height: 307,
    children: Array.from({ length: 5 }, (_, i) =>
      node(`Slot ${i + 1}`, {
        id: `slot-${i}`,
        type: "VECTOR",
        width: 157.25,
        height: 138,
        transform: [
          [1, 0, 6 + (i % 4) * 182.25],
          [0, 1, 6 + Math.floor(i / 4) * 157],
        ],
      }),
    ),
  });
const list = (horizontal = false) =>
  node("Freeform list", {
    id: "list",
    width: horizontal ? 300 : 180,
    height: horizontal ? 100 : 200,
    children: [0, 1, 2].map((i) =>
      node(`Item ${i}`, {
        id: `item-${i}`,
        width: horizontal ? 40 + i * 10 : 100 + i * 10,
        height: horizontal ? 30 + i * 10 : 30 + i * 10,
        transform: horizontal
          ? [
              [1, 0, 12 + [0, 48, 106][i]],
              [0, 1, 10],
            ]
          : [
              [1, 0, 12],
              [0, 1, 10 + [0, 38, 86][i]],
            ],
      }),
    ),
  });
function convert(source: DesignNode, options: Partial<ExportOptions> = {}) {
  const pkg = compile([source], "automatic-layout-test", {
    layout: "responsive",
    ...options,
  });
  validateExportPackage(pkg);
  return { pkg, nodes: new Map(flatten(pkg.roots).map((n) => [n.id, n])) };
}
const automatic = (source: DesignNode, options: Partial<ExportOptions> = {}) =>
  [...convert(source, options).nodes.values()].filter((n) =>
    ["UIListLayout", "UIGridLayout"].includes(n.className),
  );

describe("automatic layouts from measured Figma geometry", () => {
  it.each([false, true])(
    "restores automatic layout after a generated modifier was removed (list=%s)",
    (isList) => {
      const source = isList ? list() : inventory();
      const overrides: ExportOptions["layerOverrides"] = {
        [source.id]: {
          name: "Keep my name",
          components: {
            layout: false,
            grid: false,
            corner: { CornerRadius: { type: "UDim", value: [0, 8] } },
          },
        },
        [`${source.id}/${isList ? "layout" : "grid"}`]: { renderMode: "skip" },
      };
      const first = convert(source, { layerOverrides: overrides }).pkg;
      const layer = structureReview([source], first, overrides).layers[0];
      const changes = reviewChanges(
        layer,
        { kind: "layout", value: "source" },
        overrides,
      );
      const restored = applyOverrideChanges(overrides, changes);
      const { nodes } = convert(source, { layerOverrides: restored });
      expect(
        nodes.get(`${source.id}/${isList ? "layout" : "grid"}`),
      ).toBeDefined();
      expect(nodes.get(source.id)!.name).toBe("Keep my name");
      expect(nodes.get(`${source.id}/corner`)).toBeDefined();
      expect(overrides[`${source.id}/${isList ? "layout" : "grid"}`]).toEqual({
        renderMode: "skip",
      });
    },
  );
  it("converts InventoryUI's non-scrolling vector slots without a modifier", () => {
    const source = inventory(),
      before = JSON.stringify(source);
    source.children.reverse();
    const { pkg, nodes } = convert(source);
    const grid = nodes.get("slots/grid")!;
    expect(grid.properties).toMatchObject({
      CellSize: { type: "UDim2", value: [0, 157.25, 0, 138] },
      CellPadding: { type: "UDim2", value: [0, 25, 0, 19] },
      FillDirectionMaxCells: 0,
    });
    expect(nodes.get("slots/padding")!.properties).toEqual({
      PaddingTop: { type: "UDim", value: [0, 6] },
      PaddingRight: { type: "UDim", value: [0, 5] },
      PaddingBottom: { type: "UDim", value: [0, 6] },
      PaddingLeft: { type: "UDim", value: [0, 6] },
    });
    for (let i = 0; i < 5; i++) {
      expect(nodes.get(`slot-${i}`)!.className).toBe("ImageLabel");
      expect(nodes.get(`slot-${i}`)!.properties.LayoutOrder).toBe(i);
    }
    const panel = nodes.get("slots")!;
    const authored = previewFlow(panel, 715, 307).boxes;
    for (const child of source.children)
      expect(authored.get(child.id)).toEqual({
        x: child.transform[0][2],
        y: child.transform[1][2],
        w: child.width,
        h: child.height,
      });
    const narrow = previewFlow(panel, 400, 500).boxes;
    expect(narrow.get("slot-2")!.y).toBe(163);
    expect(narrow.get("slot-4")!.y).toBe(320);
    expect(pkg.issues.some((i) => i.code === "grid-detected")).toBe(true);
    source.children.reverse();
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each([false, true])(
    "detects a freeform list with variable item sizes (horizontal=%s)",
    (horizontal) => {
      const source = list(horizontal);
      source.children.reverse();
      const { pkg, nodes } = convert(source);
      const layout = nodes.get("list/layout")!;
      expect(layout.properties.FillDirection).toEqual({
        type: "Enum",
        value: ["FillDirection", horizontal ? "Horizontal" : "Vertical"],
      });
      expect(layout.properties.Padding).toEqual({
        type: "UDim",
        value: [0, 8],
      });
      const boxes = previewFlow(
        nodes.get("list")!,
        source.width,
        source.height,
      ).boxes;
      for (const child of source.children)
        expect(boxes.get(child.id)).toEqual({
          x: child.transform[0][2],
          y: child.transform[1][2],
          w: child.width,
          h: child.height,
        });
      expect(pkg.issues.some((i) => i.code === "list-detected")).toBe(true);
    },
  );

  it.each([0.5, 1])(
    "preserves cross-axis alignment for variable-size list entries (%s)",
    (factor) => {
      const source = list();
      for (const c of source.children)
        c.transform[0][2] = 12 + (120 - c.width) * factor;
      const { nodes } = convert(source);
      const boxes = previewFlow(
        nodes.get("list")!,
        source.width,
        source.height,
      ).boxes;
      for (const c of source.children)
        expect(boxes.get(c.id)!.x).toBe(c.transform[0][2]);
    },
  );

  it("preserves asymmetric trailing padding instead of mirroring the leading edges", () => {
    const source = inventory();
    source.width += 20;
    source.height += 40;
    const { nodes } = convert(source);
    expect(nodes.get("slots/padding")!.properties.PaddingRight).toEqual({
      type: "UDim",
      value: [0, 25],
    });
    expect(nodes.get("slots/padding")!.properties.PaddingBottom).toEqual({
      type: "UDim",
      value: [0, 46],
    });
  });

  it("handles tiny subpixel noise without reversing the order of items in a row", () => {
    const source = inventory();
    source.children[1].transform[1][2] -= 0.05;
    source.children[2].transform[0][2] += 0.05;
    const { nodes } = convert(source);
    expect(nodes.get("slots/grid")).toBeDefined();
    for (let i = 0; i < 5; i++)
      expect(nodes.get(`slot-${i}`)!.properties.LayoutOrder).toBe(i);
  });

  it("supports scaled style spacing and existing scrolling frames", () => {
    const source = inventory();
    source.scrolling = "VERTICAL";
    const { nodes } = convert(source, { styleSizing: "scale" });
    const panel = nodes.get("slots")!;
    expect(panel.className).toBe("ScrollingFrame");
    const boxes = previewFlow(panel, 715, 307).boxes;
    expect(boxes.get("slot-4")!.x).toBeCloseTo(6, 2);
    expect(boxes.get("slot-4")!.y).toBeCloseTo(163, 2);
  });

  it("leaves Preserve geometry and explicit free-positioning choices authoritative", () => {
    expect(automatic(inventory(), { layout: "exact" })).toHaveLength(0);
    expect(
      automatic(inventory(), {
        layerOverrides: {
          slots: { components: { grid: false, layout: false } },
        },
      }),
    ).toHaveLength(0);
  });

  it("ignores hidden decorative children by default but includes them when requested", () => {
    const source = inventory();
    source.children.push(
      node("Hidden backdrop", {
        id: "backdrop",
        visible: false,
        width: 700,
        height: 300,
      }),
    );
    expect(automatic(source)).toHaveLength(1);
    expect(automatic(source, { includeHidden: true })).toHaveLength(0);
  });

  it("uses explicit Figma auto layout even when the measured positions are irregular", () => {
    const source = list();
    source.children[1].transform[1][2] += 10;
    source.layout = {
      mode: "VERTICAL",
      spacing: 12,
      padding: [4, 5, 6, 7],
      primary: "MIN",
      counter: "MIN",
      wrap: false,
    };
    const { nodes } = convert(source);
    expect(nodes.get("list/layout")!.properties.Padding).toEqual({
      type: "UDim",
      value: [0, 12],
    });
  });

  it.each([
    ["a missing grid cell", (n: DesignNode) => n.children.splice(1, 1)],
    [
      "a duplicate grid cell",
      (n: DesignNode) => {
        n.children[4].transform = structuredClone(n.children[0].transform);
      },
    ],
    [
      "unequal cell dimensions",
      (n: DesignNode) => {
        n.children[1].width += 12;
      },
    ],
    [
      "irregular spacing",
      (n: DesignNode) => {
        n.children[1].transform[0][2] += 12;
      },
    ],
    [
      "a rotated cell",
      (n: DesignNode) => {
        n.children[1].transform = [
          [0, -1, 100],
          [1, 0, 20],
        ];
      },
    ],
    [
      "a skewed cell",
      (n: DesignNode) => {
        n.children[1].transform[0][1] = 0.3;
      },
    ],
    [
      "an absolute overlay",
      (n: DesignNode) => {
        n.children[1].absolute = true;
      },
    ],
    [
      "negative leading placement",
      (n: DesignNode) => {
        for (const c of n.children) c.transform[0][2] -= 20;
      },
    ],
  ] as const)("preserves authored geometry for %s", (_, mutate) => {
    const source = inventory();
    mutate(source);
    expect(automatic(source)).toHaveLength(0);
  });

  it("does not mistake a two-layer button or overlapping artwork for a list", () => {
    const source = list();
    source.children.pop();
    expect(automatic(source)).toHaveLength(0);
    const overlap = list();
    overlap.children[1].transform[1][2] = 20;
    expect(automatic(overlap)).toHaveLength(0);
  });
});
