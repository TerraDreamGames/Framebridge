import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node, demoResult } from "../packages/core/src/demo";
import {
  COMPONENT_CLASSES,
  defaultProperties,
  retainLinkedAssets,
  validProperty,
} from "../packages/core/src/editor";
import {
  DEFAULT_OPTIONS,
  flatten,
  type ExportOptions,
  type LayerOverride,
  type Value,
} from "../packages/core/src/types";
const options = (
  layerOverrides: Record<string, LayerOverride>,
): ExportOptions => ({ ...DEFAULT_OPTIONS, layerOverrides });
const text = node("Outlined title", {
  id: "title",
  type: "TEXT",
  text: {
    characters: "Hello",
    runs: [
      { text: "Hello", fontFamily: "Roboto", fontStyle: "Bold", fontSize: 24 },
    ],
    align: "LEFT",
    verticalAlign: "TOP",
  },
  strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
  strokeWeight: 2,
});
const fixture = () => [
  node("Menu", {
    id: "menu",
    width: 400,
    height: 300,
    children: [structuredClone(text), node("Sibling", { id: "sibling" })],
  }),
];
describe("per-layer conversion", () => {
  it("bakes only the requested text layer and preserves siblings and hierarchy", () => {
    const pkg = compile(
      fixture(),
      "source",
      options({ title: { renderMode: "image" } }),
    );
    const nodes = flatten(pkg.roots);
    expect(nodes.find((n) => n.id === "title")?.className).toBe("ImageLabel");
    expect(nodes.find((n) => n.id === "menu")?.className).toBe("Frame");
    expect(nodes.find((n) => n.id === "sibling")?.className).toBe("Frame");
    expect(pkg.assets.map((a) => a.nodeId)).toEqual(["title"]);
  });
  it("per-layer native choice overrides global raster preference and text tags", () => {
    const design = fixture();
    design[0].children[0].name += " [raster]";
    const pkg = compile(design, "source", {
      ...options({ title: { renderMode: "native", className: "TextBox" } }),
      preserveText: false,
    });
    const input = flatten(pkg.roots).find((n) => n.id === "title")!;
    expect(input.className).toBe("TextBox");
    expect(input.properties.Text).toBe("Hello");
    expect(input.properties.TextEditable).toBe(true);
    expect(pkg.assets).toHaveLength(0);
  });
  it("configured child prevents automatic flattening of its parent", () => {
    const design = fixture();
    design[0].effects = ["DROP_SHADOW"];
    const pkg = compile(design, "source", {
      ...options({
        title: { renderMode: "image", properties: { ImageTransparency: 0.25 } },
      }),
      preserveText: false,
    });
    expect(flatten(pkg.roots).find((n) => n.id === "menu")?.className).toBe(
      "Frame",
    );
    expect(pkg.assets[0].nodeId).toBe("title");
  });
  it("exclude affects counts and parent descendants without changing original nodes", () => {
    const original = fixture();
    const before = JSON.stringify(original);
    const pkg = compile(
      original,
      "source",
      options({ title: { renderMode: "skip" } }),
    );
    expect(flatten(pkg.roots).some((n) => n.id === "title")).toBe(false);
    expect(JSON.stringify(original)).toBe(before);
    expect(pkg.stats.instances).toBe(flatten(pkg.roots).length);
  });
  it("supports native scrolling with children and auto canvas defaults", () => {
    const pkg = compile(
      fixture(),
      "source",
      options({ menu: { renderMode: "native", className: "ScrollingFrame" } }),
    );
    const frame = flatten(pkg.roots).find((n) => n.id === "menu")!;
    expect(frame.properties.AutomaticCanvasSize).toEqual({
      type: "Enum",
      value: ["AutomaticSize", "Y"],
    });
    expect(frame.children.some((n) => n.id === "title")).toBe(true);
  });
  it("does not emit text-only properties on a Frame or a ScrollingFrame", () => {
    for (const className of ["Frame", "ScrollingFrame"]) {
      const pkg = compile(
        fixture(),
        "source",
        options({ title: { className, renderMode: "native" } }),
      );
      expect(
        flatten(pkg.roots).find((n) => n.id === "title")!.properties.Text,
      ).toBeUndefined();
    }
  });
  it("validates class overrides before rendering artwork", () =>
    expect(() =>
      compile(fixture(), "source", options({ title: { className: "Script" } })),
    ).toThrow("Unsupported"));
});
describe("Roblox properties and modifiers", () => {
  it("applies properties to screen, layer and modifier with stable identities", () => {
    const pkg = compile(
      fixture(),
      "source",
      options({
        "screen:menu": { name: "ShopGui", properties: { DisplayOrder: 20 } },
        title: {
          name: "Heading",
          properties: { Text: "Welcome", TextSize: 32 },
          components: { stroke: { Thickness: 4 } },
        },
        "title/stroke": { properties: { Transparency: 0.3 } },
      }),
    );
    const nodes = flatten(pkg.roots);
    expect(pkg.roots[0].name).toBe("ShopGui");
    expect(pkg.roots[0].properties.DisplayOrder).toBe(20);
    expect(nodes.find((n) => n.id === "title")?.properties.Text).toBe(
      "Welcome",
    );
    expect(nodes.filter((n) => n.id === "title/stroke")).toHaveLength(1);
    expect(
      nodes.find((n) => n.id === "title/stroke")?.properties.Thickness,
    ).toBe(4);
    expect(
      nodes.find((n) => n.id === "title/stroke")?.properties.Transparency,
    ).toBe(0.3);
  });
  it("adds every supported modifier with data-only defaults", () => {
    for (const [key, className] of Object.entries(COMPONENT_CLASSES)) {
      const pkg = compile(
        fixture(),
        "source",
        options({
          title: { components: { [key]: defaultProperties(className) } },
        }),
      );
      expect(
        flatten(pkg.roots).find((n) => n.id === `title/${key}`)?.className,
      ).toBe(className);
    }
  });
  it("new grid replaces source list instead of installing competing layouts", () => {
    const design = fixture();
    design[0].layout = {
      mode: "VERTICAL",
      spacing: 8,
      padding: [4, 4, 4, 4],
      primary: "MIN",
      counter: "MIN",
      wrap: false,
    };
    const pkg = compile(design, "source", {
      ...options({
        menu: { components: { grid: defaultProperties("UIGridLayout") } },
      }),
      layout: "responsive",
    });
    expect(
      flatten(pkg.roots).filter((n) => n.className === "UIListLayout"),
    ).toHaveLength(0);
    expect(
      flatten(pkg.roots).filter((n) => n.className === "UIGridLayout"),
    ).toHaveLength(1);
  });
  it("can remove generated stroke without flattening or modifying Figma", () => {
    const pkg = compile(
      fixture(),
      "source",
      options({ "title/stroke": { renderMode: "skip" } }),
    );
    expect(flatten(pkg.roots).some((n) => n.className === "UIStroke")).toBe(
      false,
    );
    expect(flatten(pkg.roots).find((n) => n.id === "title")?.className).toBe(
      "TextLabel",
    );
  });
  it("rejects invalid numeric ranges, enums, shapes and asset URLs", () => {
    expect(
      validProperty("Frame", "Size", {
        type: "UDim2",
        value: [1, -24, 1, -24],
      }),
    ).toBe(true);
    for (const value of [NaN, Infinity, -0.1, 1.1])
      expect(validProperty("Frame", "BackgroundTransparency", value)).toBe(
        false,
      );
    expect(
      validProperty("ScrollingFrame", "ScrollingDirection", {
        type: "Enum",
        value: ["FillDirection", "Vertical"],
      }),
    ).toBe(false);
    expect(
      validProperty("Frame", "AnchorPoint", { type: "Vector2", value: [0.5] }),
    ).toBe(false);
    expect(
      validProperty("ImageLabel", "Image", "https://attacker.example/image"),
    ).toBe(false);
    expect(() =>
      compile(
        fixture(),
        "source",
        options({ title: { properties: { TextSize: NaN } } }),
      ),
    ).toThrow("Invalid TextSize");
  });
  it("validates minimum and maximum constraints together", () => {
    expect(() =>
      compile(
        fixture(),
        "source",
        options({
          title: {
            components: { textSize: { MinTextSize: 50, MaxTextSize: 20 } },
          },
        }),
      ),
    ).toThrow("Minimum text size");
    expect(() =>
      compile(
        fixture(),
        "source",
        options({
          title: {
            components: {
              size: {
                MinSize: { type: "Vector2", value: [100, 100] },
                MaxSize: { type: "Vector2", value: [50, 50] },
              },
            },
          },
        }),
      ),
    ).toThrow("MinSize");
  });
  it("retains inactive properties and warns rather than leaking them to another class", () => {
    const pkg = compile(
      fixture(),
      "source",
      options({ title: { renderMode: "image", properties: { TextSize: 35 } } }),
    );
    expect(
      flatten(pkg.roots).find((n) => n.id === "title")?.properties.TextSize,
    ).toBeUndefined();
    expect(pkg.issues.some((i) => i.code === "inactive-property")).toBe(true);
  });
});
describe("image bindings across configuration changes", () => {
  function imageResult() {
    const result = demoResult();
    result.package.assets = [
      {
        id: "art",
        nodeId: "title",
        name: "Title",
        filename: "title.png",
        width: 10,
        height: 10,
        scale: 2,
        reason: "image",
        robloxId: "123",
      },
    ];
    result.package.roots[0].children[0].assetRef = "art";
    result.assets = { art: [1, 2, 3] };
    return result;
  }
  it("keeps links only for byte-identical artwork from the same document", () => {
    const old = imageResult();
    const next = structuredClone(old);
    delete next.package.assets[0].robloxId;
    expect(retainLinkedAssets(old, next).package.assets[0].robloxId).toBe(
      "123",
    );
    expect(next.package.roots[0].children[0].properties.Image).toBe(
      "rbxassetid://123",
    );
    const changed = structuredClone(next);
    delete changed.package.assets[0].robloxId;
    changed.assets.art = [1, 2, 4];
    expect(
      retainLinkedAssets(old, changed).package.assets[0].robloxId,
    ).toBeUndefined();
    const another = structuredClone(next);
    delete another.package.assets[0].robloxId;
    another.package.sourceId = "another";
    expect(
      retainLinkedAssets(old, another).package.assets[0].robloxId,
    ).toBeUndefined();
  });
  it("respects a deliberately cleared image ID", () => {
    const old = imageResult();
    const next = structuredClone(old);
    delete next.package.assets[0].robloxId;
    expect(
      retainLinkedAssets(old, next, { title: { properties: { Image: "" } } })
        .package.assets[0].robloxId,
    ).toBeUndefined();
  });
});
