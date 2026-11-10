import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { validProperty } from "../packages/core/src/editor";
import { generateModel } from "../packages/core/src/model-export";
import { validatePackage } from "../packages/relay/src/protocol";
import { flatten, type TransferPackage } from "../packages/core/src/types";
import { RobloxPreview } from "../plugins/figma/src/RobloxPreview";
import { previewFlow } from "../plugins/figma/src/preview-layout";
import {
  styleSizingDesigns,
  styleSizingPackage,
  type StyleCase,
} from "./style-sizing-fixtures";

const find = (pkg: TransferPackage, id: string) =>
  flatten(pkg.roots).find((n) => n.id === id)!;
const props = (name: StyleCase, id: string) =>
  find(styleSizingPackage(name), id).properties;
const scalar = (value: unknown, type: string) => {
  expect(value).toMatchObject({ type });
  return (value as { value: number[] }).value;
};
const box = (html: string, id: string) =>
  html.match(
    new RegExp('<div[^>]*data-preview-layer="' + id + '"[^>]*>'),
  )?.[0] ?? "";

describe("optional native style sizing", () => {
  it("keeps existing pixel exports unchanged unless scale is chosen", () => {
    const old = compile(
      [styleSizingDesigns.appearance],
      "default",
      {},
      "fixed",
    );
    const pixels = compile(
      [styleSizingDesigns.appearance],
      "default",
      { styleSizing: "pixels" },
      "fixed",
    );
    expect(pixels).toEqual(old);
    expect(old.options.styleSizing).toBeUndefined();
    expect(find(old, "panel/stroke").properties.Thickness).toBe(2);
    expect(find(old, "panel/corner").properties.TopRightRadius).toEqual({
      type: "UDim",
      value: [0, 8],
    });
  });
  it("preserves authored appearance with proportional native units", () => {
    const pkg = styleSizingPackage("appearance");
    expect(pkg.assets).toHaveLength(0);
    expect(
      scalar(find(pkg, "panel/corner").properties.TopRightRadius, "UDim"),
    ).toEqual([0.08, 0]);
    expect(find(pkg, "panel/stroke").properties).toMatchObject({
      Thickness: 0.02,
      StrokeSizingMode: {
        type: "Enum",
        value: ["StrokeSizingMode", "ScaledSize"],
      },
    });
    expect(find(pkg, "label").properties.TextSize).toBe(23);
    const textThickness = Number(
      find(pkg, "label/stroke").properties.Thickness,
    );
    expect(textThickness).toBeCloseTo(1 / 23);
    expect(textThickness * 23).toBeCloseTo(1);
    const shadow = find(pkg, "panel/shadow").properties;
    expect(scalar(shadow.BlurRadius, "UDim")).toEqual([0.12, 0]);
    expect(scalar(shadow.Offset, "UDim2")).toEqual([0.015, 0, -0.04, 0]);
    expect(scalar(shadow.Spread, "UDim2")).toEqual([-0.01, 0, -0.02, 0]);
  });
  it("uses padded content for ordinary list gaps and preserves baseline geometry", () => {
    const p = props("list", "panel/padding");
    expect(scalar(p.PaddingLeft, "UDim")).toEqual([0.1, 0]);
    expect(scalar(p.PaddingTop, "UDim")).toEqual([0.1, 0]);
    const panel = find(styleSizingPackage("list"), "panel");
    const source = previewFlow(panel, 200, 100).boxes;
    const large = previewFlow(panel, 400, 200).boxes;
    expect(source.get("first")).toMatchObject({ x: 20, y: 10 });
    expect(source.get("second")).toMatchObject({ x: 20, y: 38 });
    expect(large.get("first")).toMatchObject({ x: 40, y: 20 });
    expect(large.get("second")).toMatchObject({ x: 40, y: 56 });
  });
  it("keeps Hug spacing independent of the height it computes", () => {
    const pkg = styleSizingPackage("hug");
    expect(find(pkg, "panel/padding").properties.PaddingTop).toEqual({
      type: "UDim",
      value: [0, 10],
    });
    expect(find(pkg, "panel/layout").properties.Padding).toEqual({
      type: "UDim",
      value: [0, 8],
    });
    expect(pkg.issues.some((x) => x.code === "fixed-style-spacing")).toBe(true);
    expect(find(pkg, "panel/padding").properties.PaddingLeft).toEqual({
      type: "UDim",
      value: [0.1, 0],
    });
  });
  it("uses a manual scrolling canvas and its padded content as the reference", () => {
    const p = props("manualScroll", "panel/padding");
    expect(scalar(p.PaddingLeft, "UDim")[0]).toBeCloseTo(20 / 1200);
    expect(scalar(p.PaddingTop, "UDim")[0]).toBeCloseTo(10 / 1200);
    expect(
      scalar(props("manualScroll", "panel/layout").Padding, "UDim")[0],
    ).toBeCloseTo(8 / 1180);
  });
  it.each([
    ["paddedParent", 990, 1120],
    ["removedParentPadding", 1200, 1200],
    ["nestedCanvas", 600, 400],
  ] as const)(
    "calibrates %s against the final parent content and overrides",
    (name, width, height) => {
      const p = props(name, "panel/padding");
      expect(scalar(p.PaddingLeft, "UDim")[0] * width).toBeCloseTo(20, 6);
      expect(scalar(p.PaddingTop, "UDim")[0] * height).toBeCloseTo(10, 6);
      expect(
        scalar(props(name, "panel/layout").Padding, "UDim")[0] * (height - 20),
      ).toBeCloseTo(8, 6);
    },
  );
  it("keeps decorated automatic content spacing fixed after helper isolation", () => {
    const pkg = styleSizingPackage("decoratedAutoY");
    expect(find(pkg, "panel/content").properties.AutomaticSize).toEqual({
      type: "Enum",
      value: ["AutomaticSize", "Y"],
    });
    expect(find(pkg, "panel/layout").properties.Padding).toEqual({
      type: "UDim",
      value: [0, 8],
    });
    expect(find(pkg, "panel").layoutCanvas).toBeUndefined();
  });
  it("previews nested canvas layout using Studio's viewport-based style reference", () => {
    const panel = find(styleSizingPackage("nestedCanvas"), "panel");
    const flow = previewFlow(panel, 200, 100, 580, 380, 200, 100);
    expect(flow.boxes.get("first")).toMatchObject({ x: 20, y: 10 });
    expect(flow.boxes.get("second")).toMatchObject({ x: 20, y: 38 });
  });
  it("rejects malformed or reserved layout runtime metadata", () => {
    for (const value of [false, "true", 1]) {
      const pkg = styleSizingPackage("autoY");
      Object.assign(find(pkg, "panel"), { layoutCanvas: value });
      expect(() => validatePackage(pkg)).toThrow();
    }
    const wrongClass = styleSizingPackage("autoY");
    find(wrongClass, "panel").className = "Frame";
    expect(() => validatePackage(wrongClass)).toThrow();
    const reserved = styleSizingPackage("autoY");
    find(reserved, "first").id = reserved.roots[0].id + "/behavior-runtime";
    expect(() => validatePackage(reserved)).toThrow();
  });
  it.each([
    ["autoY", "PaddingTop", 0.08],
    ["autoX", "PaddingLeft", 0.04],
  ] as const)(
    "uses viewport gaps and fixed padding on %s's growing axis",
    (name, padding, gap) => {
      const pkg = styleSizingPackage(name);
      expect(find(pkg, "panel/padding").properties[padding]).toEqual({
        type: "UDim",
        value: [0, padding === "PaddingTop" ? 10 : 20],
      });
      expect(find(pkg, "panel/layout").properties.Padding).toEqual({
        type: "UDim",
        value: [gap, 0],
      });
      expect(pkg.issues.some((x) => x.code === "fixed-style-spacing")).toBe(
        true,
      );
    },
  );
  it("fits proportional flex cells together with their scaled gaps", () => {
    const panel = find(styleSizingPackage("flexGrid"), "panel");
    for (const factor of [0.5, 1, 2]) {
      const flow = previewFlow(panel, 320 * factor, 160 * factor);
      const a = flow.boxes.get("cell0")!,
        last = flow.boxes.get("cell2")!;
      expect(a.x).toBeCloseTo(10 * factor);
      expect(last.x + last.w).toBeCloseTo(310 * factor);
      expect(flow.boxes.get("cell3")!.y).toBeCloseTo(
        10 * factor + 50 + 10 * factor,
      );
    }
  });
  it("subtracts fixed padding from flex cells on automatic canvas axes", () => {
    const grid = props("autoGrid", "panel/grid");
    const cell = scalar(grid.CellSize, "UDim2");
    const gaps = scalar(grid.CellPadding, "UDim2");
    expect(
      3 * (cell[0] * 320 + cell[1]) + 2 * gaps[0] * 320,
    ).toBeGreaterThanOrEqual(298);
    expect(
      3 * (cell[0] * 320 + cell[1]) + 2 * gaps[0] * 320,
    ).toBeLessThanOrEqual(300);
    expect(props("autoGrid", "panel/padding").PaddingLeft).toEqual({
      type: "UDim",
      value: [0, 10],
    });
  });
  it("lets explicit modifier choices override global style sizing", () => {
    const pkg = styleSizingPackage("appearance", {
      layerOverrides: {
        panel: {
          components: {
            stroke: {
              Thickness: 3,
              StrokeSizingMode: {
                type: "Enum",
                value: ["StrokeSizingMode", "FixedSize"],
              },
            },
            corner: { CornerRadius: { type: "UDim", value: [0, 6] } },
          },
        },
      },
    });
    expect(find(pkg, "panel/stroke").properties.Thickness).toBe(3);
    expect(find(pkg, "panel/stroke").properties.StrokeSizingMode).toEqual({
      type: "Enum",
      value: ["StrokeSizingMode", "FixedSize"],
    });
    expect(find(pkg, "panel/corner").properties).toEqual({
      CornerRadius: { type: "UDim", value: [0, 6] },
    });
  });
  it("keeps subpixel ratios precise and zero-sized metrics finite", () => {
    const small = compile(
      [
        node("Small", {
          id: "small",
          width: 0.25,
          height: 0.5,
          radius: 0.01,
          strokeWeight: 0.01,
          strokes: [{ type: "SOLID" }],
        }),
      ],
      "small",
      { styleSizing: "scale" },
    );
    expect(find(small, "small/stroke").properties.Thickness).toBe(0.04);
    const zero = structuredClone(styleSizingDesigns.appearance);
    zero.children[0].width = 0;
    const out = compile([zero], "zero", { styleSizing: "scale" });
    expect(JSON.stringify(out)).not.toMatch(/null|NaN|Infinity/);
    const wide = structuredClone(styleSizingDesigns.appearance);
    wide.children[0].width = wide.children[0].height = 500000;
    const border = find(
      compile([wide], "wide", { styleSizing: "scale" }),
      "panel/stroke",
    );
    expect(Number(border.properties.Thickness) * 500000).toBe(2);
  });
  it("passes strict transfer validation and writes the native stroke enum to models", () => {
    const pkg = styleSizingPackage("appearance");
    expect(validatePackage(pkg)).toBeUndefined();
    expect(
      validProperty("UIStroke", "StrokeSizingMode", {
        type: "Enum",
        value: ["StrokeSizingMode", "ScaledSize"],
      }),
    ).toBe(true);
    expect(
      validProperty("UIStroke", "StrokeSizingMode", {
        type: "Enum",
        value: ["AutomaticSize", "XY"],
      }),
    ).toBe(false);
    expect(generateModel(pkg)).toContain(
      '<token name="StrokeSizingMode">1</token>',
    );
  });
  it("renders scaled border and text outline widths using their distinct native bases", () => {
    const pkg = styleSizingPackage("appearance");
    const label = find(pkg, "label");
    label.properties.TextScaled = true;
    label.properties.Size = { type: "UDim2", value: [0.6, 0, 0.3, 0] };
    label.children.push({
      id: "label/textLimit",
      name: "Text limit",
      className: "UITextSizeConstraint",
      properties: { MinTextSize: 1, MaxTextSize: 100 },
      children: [],
    });
    const render = (factor: number) =>
      renderToStaticMarkup(
        <RobloxPreview
          result={{ package: pkg, assets: {}, previews: {}, revision: 1 }}
          active="canvas"
          selected=""
          onSelect={() => {}}
          zoom={1}
          viewportChoice={{
            preset: "custom",
            custom: [400 * factor, 300 * factor],
            rotated: false,
          }}
          onViewportChange={() => {}}
        />,
      );
    for (const [factor, nativeHeight] of [
      [1, 24],
      [2, 49],
    ]) {
      const html = render(factor);
      const border = box(html, "panel").match(/0 0 0 ([\d.]+)px/);
      const text = html.match(/-webkit-text-stroke:([\d.]+)px/);
      expect(Number(border?.[1])).toBeCloseTo(2 * factor, 3);
      expect(Number(text?.[1])).toBeCloseTo(nativeHeight / 23, 3);
    }
  });
});

describe("contextual scaled strokes with native text heights", () => {
  function outline(pkg: TransferPackage) {
    const html = renderToStaticMarkup(
      <RobloxPreview
        result={{ package: pkg, assets: {}, previews: {}, revision: 1 }}
        active="canvas"
        selected=""
        onSelect={() => {}}
        zoom={1}
        viewportChoice={{
          preset: "design",
          custom: [400, 300],
          rotated: false,
        }}
        onViewportChange={() => {}}
      />,
    );
    return Number(html.match(/-webkit-text-stroke:([\d.]+)px/)?.[1]);
  }
  it("preserves the source one-pixel outline at the normalized native font size", () => {
    expect(outline(styleSizingPackage("appearance"))).toBeCloseTo(1);
  });
  it("keeps native TextSize overrides proportional to the generated base", () => {
    const pkg = styleSizingPackage("appearance", {
      layerOverrides: { label: { properties: { TextSize: 46 } } },
    });
    expect(find(pkg, "label").properties.TextSize).toBe(46);
    expect(Number(find(pkg, "label/stroke").properties.Thickness)).toBeCloseTo(
      1 / 23,
    );
    expect(outline(pkg)).toBeCloseTo(2);
  });
  it("uses the destination font's generated native height for a FontFace override", () => {
    const pkg = styleSizingPackage("appearance", {
      layerOverrides: {
        label: {
          properties: {
            FontFace: {
              type: "Font",
              family: "rbxasset://fonts/families/Oswald.json",
              weight: "Regular",
              style: "Normal",
            },
          },
        },
      },
    });
    expect(find(pkg, "label").properties.TextSize).toBe(29);
    expect(Number(find(pkg, "label/stroke").properties.Thickness)).toBeCloseTo(
      1 / 29,
    );
    expect(outline(pkg)).toBeCloseTo(1);
  });
  it("retains explicit scaled stroke values in native component units", () => {
    const pkg = styleSizingPackage("appearance", {
      layerOverrides: {
        label: {
          properties: { TextSize: 46 },
          components: {
            stroke: {
              Thickness: 0.125,
              StrokeSizingMode: {
                type: "Enum",
                value: ["StrokeSizingMode", "ScaledSize"],
              },
            },
          },
        },
      },
    });
    expect(find(pkg, "label/stroke").properties.Thickness).toBe(0.125);
    expect(outline(pkg)).toBeCloseTo(5.75);
  });
  it("retains explicit fixed stroke choices after native text normalization", () => {
    const pkg = styleSizingPackage("appearance", {
      layerOverrides: {
        label: {
          properties: { TextSize: 46 },
          components: {
            stroke: {
              Thickness: 3,
              StrokeSizingMode: {
                type: "Enum",
                value: ["StrokeSizingMode", "FixedSize"],
              },
            },
          },
        },
      },
    });
    expect(find(pkg, "label/stroke").properties.Thickness).toBe(3);
    expect(outline(pkg)).toBeCloseTo(3);
  });
  it("uses unchanged unverified font units with the existing conversion notice", () => {
    const pkg = styleSizingPackage("appearance", {
      fontIds: { Roboto: "123" },
    });
    expect(find(pkg, "label").properties.TextSize).toBe(20);
    expect(Number(find(pkg, "label/stroke").properties.Thickness)).toBeCloseTo(
      1 / 20,
    );
    expect(outline(pkg)).toBeCloseTo(1);
    expect(pkg.issues.some((i) => i.code === "font-size-unverified")).toBe(
      true,
    );
  });
});
