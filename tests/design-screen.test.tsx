import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import {
  flatten,
  type ExportOptions,
  type DesignNode,
} from "../packages/core/src/types";
import { defaultWorldSettings } from "../packages/core/src/world-space";
import { DesignScreenSettings } from "../plugins/figma/src/DesignScreenSettings";
import { DEFAULT_FIGMA_OPTIONS } from "../plugins/figma/src/design-screen";
import { RobloxPreview } from "../plugins/figma/src/RobloxPreview";
import { DEFAULT_PREVIEW_VIEWPORT } from "../plugins/figma/src/preview-viewport";

const panel = (extra: Partial<DesignNode> = {}) =>
  node("Settings", {
    id: "panel",
    width: 800,
    height: 600,
    transform: [
      [1, 0, 48000],
      [0, 1, -32000],
    ],
    children: [
      node("Content", {
        id: "content",
        width: 180,
        height: 32,
        transform: [
          [1, 0, 100],
          [0, 1, 100],
        ],
      }),
    ],
    ...extra,
  });
const convert = (design = panel(), options: Partial<ExportOptions> = {}) =>
  compile(
    [design],
    "design-screen-qa",
    { ...DEFAULT_FIGMA_OPTIONS, ...options },
    "fixed",
  );

describe("standalone panel screen reference", () => {
  it.each(["exact", "responsive"] as const)(
    "keeps an 800px panel proportional to a 1920px screen in %s mode",
    (layout) => {
      const data = convert(panel(), { layout });
      const root = data.roots[0],
        main = root.children[0];
      expect(root.referenceSize).toEqual([1920, 1080]);
      expect(main.properties.Size).toEqual({
        type: "UDim2",
        value: [800 / 1920, 0, 600 / 1080, 0],
      });
      expect(main.properties.Position).toEqual({
        type: "UDim2",
        value: [0.5, 0, 0.5, 0],
      });
      expect(main.properties.AnchorPoint).toEqual({
        type: "Vector2",
        value: [0.5, 0.5],
      });
      expect(
        main.children.find((n) => n.id === "content")!.properties.Position,
      ).toEqual({ type: "UDim2", value: [0, 100, 0, 100] });
      expect(JSON.stringify(data)).not.toMatch(/48000|-32000/);
    },
  );
  it("only fills the screen when the selected frame actually matches its dimensions", () => {
    const main = convert(panel({ width: 1920, height: 1080 })).roots[0]
      .children[0];
    expect(main.properties.Size).toEqual({
      type: "UDim2",
      value: [1, 0, 1, 0],
    });
  });
  it("supports a different design screen and top-left placement", () => {
    const root = convert(panel(), {
      screenSize: [2560, 1440],
      rootPlacement: "top-left",
    }).roots[0];
    expect(root.referenceSize).toEqual([2560, 1440]);
    expect(root.children[0].properties).toMatchObject({
      Size: { type: "UDim2", value: [800 / 2560, 0, 600 / 1440, 0] },
      Position: { type: "UDim2", value: [0, 0, 0, 0] },
      AnchorPoint: { type: "Vector2", value: [0, 0] },
    });
  });
  it("lets an intentional full-screen design use the selected frame as its reference", () => {
    const root = convert(panel(), { screenSize: null, layout: "responsive" })
      .roots[0];
    expect(root.referenceSize).toEqual([800, 600]);
    expect(root.children[0].properties.Size).toEqual({
      type: "UDim2",
      value: [1, 0, 1, 0],
    });
    expect(root.children[0].properties.Position).toEqual({
      type: "UDim2",
      value: [0, 0, 0, 0],
    });
  });
  it("keeps the core's authored-canvas default for programmatic examples", () => {
    const root = compile([panel()], "legacy", { layout: "responsive" })
      .roots[0];
    expect(root.referenceSize).toEqual([800, 600]);
    expect(root.children[0].properties.Size).toEqual({
      type: "UDim2",
      value: [1, 0, 1, 0],
    });
  });
  it("freezes the measured selected host without changing its children's Hug sizing", () => {
    const design = panel({
      layoutSizing: { horizontal: "FILL", vertical: "HUG" },
    });
    design.children[0].layoutSizing = { horizontal: "FIXED", vertical: "HUG" };
    const main = convert(design, { layout: "responsive" }).roots[0].children[0];
    expect(main.layoutSizing).toBeUndefined();
    expect(main.properties.AutomaticSize).toEqual({
      type: "Enum",
      value: ["AutomaticSize", "None"],
    });
    expect(main.properties.Size).toEqual({
      type: "UDim2",
      value: [800 / 1920, 0, 600 / 1080, 0],
    });
    const content = main.children.find((n) => n.id === "content")!;
    expect(content.layoutSizing).toEqual(["FIXED", "HUG"]);
    expect(content.properties.AutomaticSize).toEqual({
      type: "Enum",
      value: ["AutomaticSize", "Y"],
    });
  });
  it.each(["center", "top-left"] as const)(
    "preserves asymmetric image bounds around the logical panel with %s placement",
    (rootPlacement) => {
      const main = convert(
        panel({
          type: "VECTOR",
          rasterBounds: { x: -10, y: -20, width: 840, height: 650 },
        }),
        { rootPlacement, layout: "responsive" },
      ).roots[0].children[0];
      expect(main.assetRef).toBeTruthy();
      expect(main.properties.Size).toEqual({
        type: "UDim2",
        value: [840 / 1920, 0, 650 / 1080, 0],
      });
      expect(main.properties.Position).toEqual({
        type: "UDim2",
        value:
          rootPlacement === "center"
            ? [0.5 + 10 / 1920, 0, 0.5 + 5 / 1080, 0]
            : [-10 / 1920, 0, -20 / 1080, 0],
      });
    },
  );
  it("ignores a previous raster crop when the root is now native", () => {
    const main = convert(
      panel({ rasterBounds: { x: -10, y: -20, width: 840, height: 650 } }),
    ).roots[0].children[0];
    expect(main.assetRef).toBeUndefined();
    expect(main.properties.Size).toEqual({
      type: "UDim2",
      value: [800 / 1920, 0, 600 / 1080, 0],
    });
  });
  it("keeps explicit property overrides authoritative", () => {
    const Size = { type: "UDim2" as const, value: [0.3, 0, 0.2, 0] };
    const Position = { type: "UDim2" as const, value: [0.7, 0, 0.4, 0] };
    const main = convert(panel(), {
      layerOverrides: { panel: { properties: { Size, Position } } },
    }).roots[0].children[0];
    expect(main.properties).toMatchObject({ Size, Position });
  });
  it.each(["surface", "billboard", "prompt"] as const)(
    "keeps %s UI on its authored world canvas",
    (kind) => {
      const data = convert(panel(), {
        layerOverrides: { panel: { worldUI: defaultWorldSettings(kind) } },
      });
      expect(data.roots[0].referenceSize).toEqual([800, 600]);
      expect(
        flatten(data.roots).find((n) => n.id === "panel")!.properties.Size,
      ).toEqual({ type: "UDim2", value: [0, 800, 0, 600] });
    },
  );
  it("rejects invalid screen settings before producing an export", () => {
    for (const screenSize of [
      [0, 1080],
      [1920, 63],
      [8193, 1080],
      [1920.5, 1080],
      [1920],
      [NaN, 1080],
      "1920x1080",
    ])
      expect(() =>
        convert(panel(), { screenSize } as Partial<ExportOptions>),
      ).toThrow(/Design screen dimensions/);
    expect(() =>
      convert(panel(), {
        rootPlacement: "elsewhere",
      } as unknown as Partial<ExportOptions>),
    ).toThrow(/main frame placement/);
  });
});

describe("design screen controls and preview", () => {
  it("uses the shared accessible dropdowns and editable dimensions", () => {
    const html = renderToStaticMarkup(
      <DesignScreenSettings
        options={DEFAULT_FIGMA_OPTIONS}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Design screen"');
    expect(html).toContain('aria-label="Design screen width"');
    expect(html).toContain('aria-label="Design screen height"');
    expect(html).toContain('aria-label="Main frame placement"');
    expect(html).toContain('value="1920"');
    expect(html.match(/<button[^>]*role="combobox"/g)).toHaveLength(2);
    for (const select of html.match(/<select[^>]*>/g) ?? [])
      expect(select).toContain('aria-hidden="true"');
  });
  it("previews the centered panel at its measured 800×600 size inside the design screen", () => {
    const html = renderToStaticMarkup(
      <RobloxPreview
        result={{ package: convert(), assets: {}, previews: {}, revision: 1 }}
        active="panel"
        selected=""
        onSelect={() => {}}
        zoom={1}
        viewportChoice={DEFAULT_PREVIEW_VIEWPORT}
        onViewportChange={() => {}}
      />,
    );
    expect(html).toContain('data-preview-canvas="1920x1080"');
    expect(html).toContain('data-preview-framing="artwork"');
    expect(html).toContain('data-preview-frame="560,240,800,600"');
    const main = html.match(/<div[^>]*data-preview-layer="panel"[^>]*>/)![0];
    expect(main).toContain("left:560px;");
    expect(main).toContain("top:240px;");
    expect(main).toContain("width:800px;");
    expect(main).toContain("height:600px;");
  });
});
