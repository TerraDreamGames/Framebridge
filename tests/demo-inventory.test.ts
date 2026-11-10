import { expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import {
  DEMO_INTERFACE_RESOURCES,
  demoDesign,
  demoResult,
  demoSvg,
} from "../packages/core/src/demo";
import {
  DEFAULT_OPTIONS,
  flatten,
  type DesignNode,
} from "../packages/core/src/types";

it("uses the generated backpack header while retaining its native fallback", () => {
  const href = "data:image/png;base64,backpack";
  const result = demoResult(DEFAULT_OPTIONS, { "inventory-backpack": href });
  const backpack = flatten(result.package.roots).find(
    (node) => node.name === "Backpack icon",
  )!;
  expect(backpack.className).toBe("ImageLabel");
  expect(backpack.children).toEqual([]);
  expect(result.package.assets).toHaveLength(1);
  expect(demoSvg(result.designs!, { "inventory-backpack": href })).toContain(
    `href="${href}"`,
  );
  expect(
    demoDesign()[0].children.find((node) => node.name === "Backpack icon")!
      .children.length,
  ).toBeGreaterThan(0);
});

it("exports the inventory example's authored 4×3 grid and category list as native layouts", () => {
  const designs = demoDesign();
  const source = designs[0].children.find(
    (child) => child.id === "demo:item-grid",
  )!;
  expect(source.layout?.grid).toMatchObject({
    columns: 4,
    rows: 3,
    rowGap: 8,
    columnGap: 8,
  });
  expect(source.children).toHaveLength(12);
  const result = compile(
    designs,
    "inventory-demo",
    { layout: "responsive" },
    "fixed",
  );
  const nodes = flatten(result.roots);
  const grid = nodes.find((node) => node.id === "demo:item-grid/grid")!;
  expect(grid.className).toBe("UIGridLayout");
  expect(grid.properties).toMatchObject({
    CellSize: { type: "UDim2", value: [0, 92, 0, 112] },
    CellPadding: { type: "UDim2", value: [0, 8, 0, 8] },
    FillDirectionMaxCells: 4,
  });
  const parent = nodes.find((node) => node.id === "demo:item-grid")!;
  expect(
    parent.children.filter((node) => node.className.endsWith("Button")),
  ).toHaveLength(12);
  expect(
    nodes.find((node) => node.id === "demo:categories/layout")?.className,
  ).toBe("UIListLayout");
  expect(result.issues).toEqual([]);
});

it("uses supplied PNG resources for item art while preserving native layouts and artwork centers", () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  const artwork = Object.fromEntries(
    [
      "wayfinder-sword",
      "iron-shield",
      "health-potion",
      "azure-crystal",
      "oak-wood",
      "gold-coins",
    ].map((key) => [key, png]),
  );
  const all = (nodes: DesignNode[]): DesignNode[] =>
    nodes.flatMap((node) => [node, ...all(node.children)]);
  const original = new Map(all(demoDesign()).map((node) => [node.id, node]));
  const result = demoResult(
    { ...DEFAULT_OPTIONS, layout: "responsive" },
    artwork,
  );
  const images = all(result.designs!).filter((node) =>
    node.fills.some((paint) => paint.type === "IMAGE"),
  );
  expect(images).toHaveLength(13);
  const center = (node: DesignNode) => {
    const [[a, c, tx], [b, d, ty]] = node.transform;
    return [
      (a * node.width) / 2 + (c * node.height) / 2 + tx,
      (b * node.width) / 2 + (d * node.height) / 2 + ty,
    ];
  };
  for (const image of images) {
    expect(image.type).toBe("RECTANGLE");
    expect(image.children).toEqual([]);
    expect(image.transform[0].slice(0, 2)).toEqual([1, 0]);
    expect(image.transform[1].slice(0, 2)).toEqual([0, 1]);
    center(image).forEach((value, axis) =>
      expect(value).toBeCloseTo(center(original.get(image.id)!)[axis]),
    );
  }
  const nodes = flatten(result.package.roots);
  expect(nodes.filter((node) => node.className === "ImageLabel")).toHaveLength(
    13,
  );
  expect(result.package.assets.map((asset) => asset.nodeId).sort()).toEqual(
    images.map((node) => node.id).sort(),
  );
  expect(
    nodes.find((node) => node.id === "demo:item-grid/grid")?.className,
  ).toBe("UIGridLayout");
  expect(
    nodes.find((node) => node.id === "demo:categories/layout")?.className,
  ).toBe("UIListLayout");
  const svg = demoSvg(result.designs!, artwork);
  expect(svg.match(/<image /g)).toHaveLength(13);
  expect(svg).toContain(`href="${png}"`);
  expect(
    decodeURIComponent(
      result.previews!["demo:inventory"].split(",").slice(1).join(","),
    ),
  ).toBe(svg);
});

it("keeps unsupplied artwork native and escapes embedded SVG image attributes", () => {
  const href = 'data:image/png;base64,example" onload="not-an-attribute';
  const artwork = { "wayfinder-sword": href };
  const designs = demoDesign(artwork);
  const svg = demoSvg(designs, artwork);
  expect(svg.match(/<image /g)).toHaveLength(3);
  expect(svg).toContain("example&quot; onload=&quot;not-an-attribute");
  expect(svg).not.toContain(' onload="');
  const result = compile(designs, "partial-art", { layout: "responsive" });
  expect(result.assets).toHaveLength(3);
  expect(
    flatten(result.roots).find((node) => node.id === "demo:art-shield-718BA9-1")
      ?.className,
  ).toBe("Frame");
});

it("uses distinct generated variants for consumables, crystals and the dagger", () => {
  const keys = [
    "wayfinder-sword",
    "trail-dagger",
    "iron-shield",
    "health-potion",
    "energy-potion",
    "mana-potion",
    "azure-crystal",
    "amethyst-crystal",
    "ruby-crystal",
    "emerald-crystal",
    "oak-wood",
    "gold-coins",
  ];
  const artwork = Object.fromEntries(
    keys.map((key) => [key, `data:image/png;base64,${key}`]),
  );
  const result = demoResult(DEFAULT_OPTIONS, artwork);
  const hashes = new Set<string>();
  const visit = (nodes: DesignNode[]) => {
    for (const node of nodes) {
      for (const paint of node.fills)
        if (paint.imageHash) hashes.add(paint.imageHash);
      visit(node.children);
    }
  };
  visit(result.designs!);
  expect([...hashes].sort()).toEqual(keys.sort());
  expect(result.package.assets).toHaveLength(13);
});

it("keeps generated interface skins beneath native controls, text and responsive layouts", () => {
  const png = "data:image/png;base64,interface-art";
  const artwork = Object.fromEntries(
    DEMO_INTERFACE_RESOURCES.map((key) => [key, png]),
  );
  const result = demoResult(
    { ...DEFAULT_OPTIONS, layout: "responsive" },
    artwork,
  );
  const root = result.designs![0];
  expect(root.fills).toEqual([]);
  expect(root.children[0]).toMatchObject({
    id: "demo:inventory/surface",
    type: "RECTANGLE",
    fills: [{ type: "IMAGE", imageHash: "window-skin" }],
    constraints: { horizontal: "STRETCH", vertical: "STRETCH" },
  });
  const nodes = flatten(result.package.roots);
  expect(nodes.find((node) => node.id === "demo:inventory")?.className).toBe(
    "Frame",
  );
  expect(
    nodes.find((node) => node.id === "demo:item-grid/grid")?.className,
  ).toBe("UIGridLayout");
  expect(
    nodes.find((node) => node.id === "demo:categories/layout")?.className,
  ).toBe("UIListLayout");
  expect(nodes.find((node) => node.name === "Title")?.properties.Text).toBe(
    "Inventory",
  );
  expect(
    nodes.find((node) => node.name === "Equip label")?.properties.Text,
  ).toBe("Equip");
  expect(nodes.find((node) => node.name === "Close icon")).toBeUndefined();
  const close = nodes.find((node) => node.name === "Close")!;
  expect(close.className).toBe("TextButton");
  expect(close.children.some((node) => node.className === "ImageLabel")).toBe(
    true,
  );
  expect(result.package.assets).toHaveLength(23);
  const svg = demoSvg(result.designs!, artwork);
  expect(svg.match(/preserveAspectRatio="none"/g)).toHaveLength(23);
});
