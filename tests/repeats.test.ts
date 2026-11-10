import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { relativeTo } from "../packages/core/src/geometry";
import { linearRepeatPlan } from "../packages/core/src/repeats";
import { MOTION_DEFAULTS } from "../packages/core/src/motion";
import { flatten, type DesignNode } from "../packages/core/src/types";
import { validatePackage } from "../packages/relay/src/protocol";
import { snapshot } from "../plugins/figma/src/snapshot";
import { entries, type Entry } from "../plugins/figma/src/layer-entries";

const realFigma = JSON.parse(
  readFileSync(
    new URL("./fixtures/native-repeats.figma.json", import.meta.url),
    "utf8",
  ),
) as DesignNode[];
const modifier = (
  extra: Partial<NonNullable<DesignNode["transformModifiers"]>[number]> = {},
) =>
  ({
    type: "REPEAT",
    repeatType: "LINEAR",
    count: 3,
    unitType: "PIXELS",
    offset: 30,
    axis: "HORIZONTAL",
    ...extra,
  }) as NonNullable<DesignNode["transformModifiers"]>[number];
const group = (extra: Partial<DesignNode> = {}) =>
  node("Repeat", {
    id: "repeat",
    type: "TRANSFORM_GROUP",
    width: 80,
    height: 10,
    transformModifiers: [modifier()],
    children: [
      node("Item", { id: "item", type: "RECTANGLE", width: 20, height: 10 }),
    ],
    ...extra,
  });
const exported = (g: DesignNode, options: Parameters<typeof compile>[2] = {}) =>
  compile(
    [node("Screen", { id: "root", children: [g] })],
    "repeat-test",
    options,
    "fixed",
  );
const pos = (n: ReturnType<typeof flatten>[number]) =>
  (n.properties.Position as { value: number[] }).value;

describe("actual Figma repeat geometry", () => {
  const expected = [
    [
      [0, 0],
      [30, 0],
      [60, 0],
    ],
    [
      [0, 0],
      [30, 0],
      [60, 0],
    ],
    [
      [0, 0],
      [30, 0],
    ],
    [
      [0, 0],
      [40, 20],
      [75, 0],
      [115, 20],
      [150, 0],
      [190, 20],
    ],
    [
      [0, 0],
      [30, 0],
      [60, 0],
      [0, 25],
      [30, 25],
      [60, 25],
    ],
  ];
  realFigma.forEach((design, index) => {
    it(`matches Figma's rendered SVG for ${design.name}`, () => {
      const before = JSON.stringify(design);
      const pkg = compile([design], "actual-figma", {}, "fixed");
      const original = design.children[0];
      const repeat = flatten(pkg.roots).find((n) => n.id === original.id)!;
      expect(repeat.className).toBe("Frame");
      expect(repeat.children.map((n) => [pos(n)[1], pos(n)[3]])).toEqual(
        expected[index],
      );
      expect((repeat.properties.Size as { value: number[] }).value).toEqual([
        0,
        original.width,
        0,
        original.height,
      ]);
      expect(pkg.assets).toHaveLength(0);
      expect(pkg.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(pkg.stats.instances).toBe(flatten(pkg.roots).length);
      expect(() => validatePackage(pkg)).not.toThrow();
      expect(JSON.stringify(design)).toBe(before);
    });
  });
  it("corrects group children from absolute transforms without changing ordinary frame coordinates", () => {
    vi.stubGlobal("figma", { mixed: Symbol("mixed") });
    try {
      const child = {
        id: "child",
        name: "Item",
        type: "RECTANGLE",
        width: 20,
        height: 10,
        visible: true,
        relativeTransform: [
          [1, 0, 30],
          [0, 1, 20],
        ],
        absoluteTransform: [
          [1, 0, 1650],
          [0, 1, 180],
        ],
      };
      const raw = {
        id: "g",
        name: "Repeat",
        type: "TRANSFORM_GROUP",
        width: 80,
        height: 10,
        visible: true,
        relativeTransform: [
          [1, 0, 30],
          [0, 1, 20],
        ],
        absoluteTransform: [
          [1, 0, 1650],
          [0, 1, 180],
        ],
        transformModifiers: [modifier()],
        children: [child],
      };
      const before = JSON.stringify(raw);
      const result = snapshot(raw as unknown as TransformGroupNode);
      expect(result.children[0].transform).toEqual([
        [1, 0, 0],
        [0, 1, 0],
      ]);
      expect(result.transformModifiers).toEqual([modifier()]);
      expect(JSON.stringify(raw)).toBe(before);
      const grouped = snapshot({
        ...raw,
        type: "GROUP",
      } as unknown as GroupNode);
      expect(grouped.children[0].transform).toEqual(result.children[0].transform);
      const ordinary = snapshot({
        ...raw,
        type: "FRAME",
        children: [{
          ...child,
          absoluteTransform: [[1, 0, 1680], [0, 1, 200]],
        }],
      } as unknown as FrameNode);
      expect(ordinary.children[0].transform).toEqual(child.relativeTransform);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps mask semantics in the snapshot for the clipping stage", () => {
    vi.stubGlobal("figma", { mixed: Symbol("mixed") });
    try {
      const shape = {
        id: "mask",
        name: "Mask",
        type: "RECTANGLE",
        width: 20,
        height: 10,
        visible: true,
        relativeTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        isMask: true,
        maskType: "VECTOR",
      };
      expect(snapshot(shape as unknown as RectangleNode).maskType).toBe(
        "VECTOR",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("repeat conversion and updates", () => {
  it("uses the complete preceding pattern for relative modifier spacing", () => {
    const source = group({
      transformModifiers: [
        modifier(),
        modifier({ unitType: "RELATIVE", offset: 1, count: 2 }),
      ],
      width: 160,
    });
    expect(linearRepeatPlan(source).offsets?.map((p) => p.x)).toEqual([
      0, 30, 60, 80, 110, 140,
    ]);
  });
  it("supports negative and overlapping spacing", () => {
    const source = group({
      transformModifiers: [modifier({ offset: -30 })],
      children: [
        node("Item", {
          id: "item",
          width: 20,
          height: 10,
          transform: [
            [1, 0, 60],
            [0, 1, 0],
          ],
        }),
      ],
    });
    const repeat = flatten(exported(source).roots).find(
      (n) => n.id === "repeat",
    )!;
    expect(repeat.children.map((n) => pos(n)[1])).toEqual([60, 30, 0]);
    expect(
      linearRepeatPlan(group({ transformModifiers: [modifier({ offset: 0 })] }))
        .offsets,
    ).toHaveLength(3);
  });
  it("keeps IDs stable when the count increases and applies overrides to every copy", () => {
    const settings = {
      layerOverrides: { item: { properties: { BackgroundTransparency: 0.3 } } },
    };
    const first = exported(group(), settings);
    const second = exported(
      group({ width: 110, transformModifiers: [modifier({ count: 4 })] }),
      settings,
    );
    const a = flatten(first.roots).find((n) => n.id === "repeat")!.children;
    const b = flatten(second.roots).find((n) => n.id === "repeat")!.children;
    expect(b.slice(0, 3).map((n) => n.id)).toEqual(a.map((n) => n.id));
    expect(b.every((n) => n.properties.BackgroundTransparency === 0.3)).toBe(
      true,
    );
    expect(new Set(flatten(second.roots).map((n) => n.id)).size).toBe(
      flatten(second.roots).length,
    );
  });
  it("retains pixel and scale constraints even when the first copy starts at zero", () => {
    for (const scale of [false, true]) {
      const source = group();
      source.children[0].constraints = {
        horizontal: scale ? "SCALE" : "MIN",
        vertical: "MIN",
      };
      const repeat = flatten(
        exported(source, { layout: "responsive" }).roots,
      ).find((n) => n.id === "repeat")!;
      expect(repeat.children.map((n) => pos(n).slice(0, 2))).toEqual(
        scale
          ? [
              [0, 0],
              [0.375, 0],
              [0.75, 0],
            ]
          : [
              [0, 0],
              [0, 30],
              [0, 60],
            ],
      );
    }
  });
  it("shares prepared and manually linked artwork across all copies", () => {
    const source = group({
      children: [
        node("Icon", { id: "art", type: "VECTOR", width: 20, height: 10 }),
      ],
    });
    const pkg = exported(source, {
      layerOverrides: {
        art: {
          imageProcessing: { whiteMask: true },
          properties: { ImageColor3: { type: "Color3", value: [0, 1, 0] } },
        },
      },
      assetIds: { "image:art:mask-v1:bleed-v2": "123" },
    });
    const copies = flatten(pkg.roots).find((n) => n.id === "repeat")!.children;
    expect(pkg.assets).toHaveLength(1);
    expect(copies.map((n) => n.assetRef)).toEqual(
      Array(3).fill(pkg.assets[0].id),
    );
    expect(
      copies.every(
        (n) =>
          n.properties.ImageColor3 &&
          JSON.stringify(n.properties.ImageColor3) ===
            JSON.stringify({ type: "Color3", value: [0, 1, 0] }),
      ),
    ).toBe(true);
    expect(pkg.stats.raster).toBe(3);
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("remaps local actions and motion owners/slots to each independent copy", () => {
    const source = group({
      height: 40,
      children: [
        node("Card", {
          id: "card",
          width: 20,
          height: 40,
          children: [
            node("Details [panel]", { id: "details" }),
            node("Show [open:details]", { id: "show", width: 20, height: 10 }),
          ],
        }),
      ],
    });
    const pkg = exported(source, {
      layerOverrides: {
        show: {
          behavior: {
            action: { kind: "open", target: "details" },
            motion: { hover: structuredClone(MOTION_DEFAULTS.hover) },
          },
        },
      },
    });
    for (let i = 1; i < 3; i++) {
      const suffix = `/repeat:repeat:${i}`;
      const button = flatten(pkg.roots).find((n) => n.id === `show${suffix}`)!;
      expect(button.behavior?.action?.target).toBe(`details${suffix}`);
      expect(button.behavior?.motion?.owner).toBe(`show${suffix}`);
      expect(button.behavior?.motion?.slot).toBe(`show${suffix}/motion-slot`);
    }
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("retains external targets and repeats state artwork under its own copied button", () => {
    const source = group({
      children: [
        node("Open [button]", {
          id: "button",
          children: [node("Hover [state:hover]", { id: "hover" })],
        }),
      ],
    });
    const pkg = compile(
      [
        node("Screen", {
          id: "root",
          children: [source, node("Shop [panel]", { id: "shop" })],
        }),
      ],
      "test",
      {
        layerOverrides: {
          button: { behavior: { action: { kind: "open", target: "shop" } } },
        },
      },
      "fixed",
    );
    const nodes = flatten(pkg.roots);
    expect(
      nodes.find((n) => n.id === "button/repeat:repeat:1")?.behavior?.action
        ?.target,
    ).toBe("shop");
    expect(
      nodes.find((n) => n.id === "hover/repeat:repeat:1")?.behavior?.state
        ?.owner,
    ).toBe("button/repeat:repeat:1");
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("expands nested patterns bottom-up with complete unique identities and statistics", () => {
    const inner = group({ id: "inner", width: 80 });
    const outer = group({
      id: "outer",
      width: 170,
      transformModifiers: [modifier({ count: 2, offset: 90 })],
      children: [inner],
    });
    const pkg = exported(outer);
    const objects = flatten(pkg.roots);
    expect(objects.filter((n) => n.sourceType === "RECTANGLE")).toHaveLength(6);
    expect(pkg.stats.layers).toBe(10);
    expect(pkg.stats.native).toBe(10);
    expect(pkg.stats.instances).toBe(objects.length);
    expect(new Set(objects.map((n) => n.id)).size).toBe(objects.length);
    expect(() => validatePackage(pkg)).not.toThrow();
  });
});

describe("repeat inspector and draw order", () => {
  function rows(
    designs: DesignNode[],
    pkg = compile(designs, "repeat-inspector", {}, "fixed"),
  ) {
    const collect = (layers: Entry[]): Entry[] =>
      layers.flatMap((layer) => [layer, ...collect(layer.children)]);
    return collect(
      entries({ designs, package: pkg, previews: {}, assets: {}, revision: 1 }),
    );
  }
  it("points actual copied Figma layers to their original without offering dead source edits", () => {
    const all = rows(realFigma);
    for (const design of realFigma) {
      const repeat = design.children[0];
      for (const child of repeat.children) {
        const original = all.find((row) => row.node.id === child.id)!;
        const copies = all.filter((row) => row.repeatOriginalId === child.id);
        expect(original.source?.id).toBe(child.id);
        expect(copies.length).toBeGreaterThan(0);
        expect(copies.every((row) => !row.source)).toBe(true);
      }
    }
  });
  it("finds the original for nested copies and copied helpers, preserving normal source identities", () => {
    const inner = group({
      id: "inner:1",
      width: 80,
      children: [node("Rounded", { id: "round:2", radius: 4 })],
    });
    const outer = group({
      id: "outer:2",
      width: 170,
      transformModifiers: [modifier({ count: 2, offset: 90 })],
      children: [inner],
    });
    const all = rows([node("Screen", { id: "root", children: [outer] })]);
    const nested = all.find(
      (row) => row.node.id === "round:2/repeat:inner:1:1/repeat:outer:2:1",
    )!;
    expect(nested.repeatOriginalId).toBe("round:2");
    const helper = all.find(
      (row) =>
        row.node.className === "UICorner" &&
        row.node.id.includes("/repeat:outer:2:1"),
    )!;
    expect(
      all.find((row) => row.node.id === helper.repeatOriginalId)?.node
        .className,
    ).toBe("UICorner");
    expect(
      all.find((row) => row.node.id === "round:2")?.repeatOriginalId,
    ).toBeUndefined();
  });
  it("draws each whole overlapping pattern after the preceding one and assigns distinct layout order", () => {
    const source = group({
      children: [node("A", { id: "a" }), node("B", { id: "b" })],
      transformModifiers: [modifier({ offset: 0 })],
    });
    const pkg = exported(source, {
      layerOverrides: {
        a: { properties: { ZIndex: 4, LayoutOrder: 12 } },
        b: { properties: { ZIndex: 8, LayoutOrder: 14 } },
      },
    });
    const pattern = flatten(pkg.roots).find((n) => n.id === "repeat")!.children;
    expect(pattern.map((n) => n.properties.ZIndex)).toEqual([
      4, 8, 9, 13, 14, 18,
    ]);
    expect(pattern.map((n) => n.properties.LayoutOrder)).toEqual([
      12, 14, 15, 17, 18, 20,
    ]);
    expect(() => validatePackage(pkg)).not.toThrow();
  });
});

describe("unsupported repeats and bounded expansion", () => {
  it.each([
    { repeatType: "RADIAL" },
    { count: 1 },
    { count: 2.5 },
    { offset: Infinity },
    { count: 10001 },
  ] as Partial<NonNullable<DesignNode["transformModifiers"]>[number]>[])(
    "uses an explicit image fallback for %j",
    (invalid) => {
      const pkg = exported(group({ transformModifiers: [modifier(invalid)] }));
      expect(flatten(pkg.roots).find((n) => n.id === "repeat")?.className).toBe(
        "ImageLabel",
      );
      expect(pkg.assets).toHaveLength(1);
      expect(pkg.issues.some((i) => i.code === "repeat-fallback")).toBe(true);
    },
  );
  it("reports an error instead of presenting one native child as a complete unsupported repeat", () => {
    const pkg = exported(
      group({ transformModifiers: [modifier({ repeatType: "RADIAL" })] }),
      { layerOverrides: { repeat: { renderMode: "native" } } },
    );
    expect(
      pkg.issues.some(
        (i) => i.code === "repeat-fallback" && i.severity === "error",
      ),
    ).toBe(true);
  });
  it("blocks an unsupported repeat assigned directly to a native class", () => {
    const pkg = exported(
      group({ transformModifiers: [modifier({ repeatType: "RADIAL" })] }),
      { layerOverrides: { repeat: { className: "Frame" } } },
    );
    expect(flatten(pkg.roots).find((n) => n.id === "repeat")?.className).toBe(
      "Frame",
    );
    expect(
      pkg.issues.some(
        (i) => i.code === "repeat-fallback" && i.severity === "error",
      ),
    ).toBe(true);
  });
  it("bounds the actual expanded subtree, including native helpers", () => {
    const source = group({
      width: 30,
      children: [
        node("Card", {
          id: "card",
          radius: 4,
          children: [node("A", { id: "a" }), node("B", { id: "b" })],
        }),
      ],
      transformModifiers: [modifier({ count: 3000, offset: 0 })],
    });
    expect(() => exported(source)).toThrow(/10,000 Roblox instances/);
  });
  it("does not duplicate an intentionally rasterized linear group", () => {
    const pkg = exported(group(), {
      layerOverrides: { repeat: { renderMode: "image" } },
    });
    expect(pkg.assets).toHaveLength(1);
    expect(flatten(pkg.roots).find((n) => n.id === "repeat")?.children).toEqual(
      [],
    );
  });
  it("rejects singular coordinate systems rather than making up locations", () => {
    expect(() =>
      relativeTo(
        [
          [0, 0, 0],
          [0, 0, 0],
        ],
        [
          [1, 0, 0],
          [0, 1, 0],
        ],
      ),
    ).toThrow(/singular/);
    expect(
      relativeTo(
        [
          [0, -1, 100],
          [1, 0, 50],
        ],
        [
          [0, -1, 90],
          [1, 0, 70],
        ],
      ),
    ).toEqual([
      [1, 0, 20],
      [0, 1, 10],
    ]);
  });
});
