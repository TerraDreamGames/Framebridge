import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RobloxPreview } from "../plugins/figma/src/RobloxPreview";
import {
  DEFAULT_PREVIEW_VIEWPORT,
  parsePreviewDimension,
  previewFitScale,
  previewViewportSize,
  previewArtworkFrame,
  previewCamera,
  type PreviewViewport,
} from "../plugins/figma/src/preview-viewport";
import { devicePreviewPackage } from "./device-preview-fixture";
import { flatten, type AnalysisResult } from "../packages/core/src/types";
import { worldPackage } from "./world-space-fixtures";
import { maskPackages } from "./mask-fixtures";
import { maskResizePackage } from "./mask-resize-fixtures";

const result = (): AnalysisResult => ({
  package: devicePreviewPackage(),
  assets: {},
  previews: {},
  revision: 1,
});
function render(choice: PreviewViewport, data = result()) {
  return renderToStaticMarkup(
    <RobloxPreview
      result={data}
      active="device-inventory"
      selected=""
      onSelect={() => {}}
      zoom={1}
      viewportChoice={choice}
      onViewportChange={() => {}}
    />,
  );
}
const preset = (name: PreviewViewport["preset"]): PreviewViewport => ({
  ...DEFAULT_PREVIEW_VIEWPORT,
  preset: name,
});
function box(html: string, id: string) {
  const tag = html.match(
    new RegExp(`<div[^>]*data-preview-layer="${id}"[^>]*>`),
  )?.[0];
  if (!tag) throw new Error(`Missing rendered layer ${id}`);
  const style = tag.match(/style="([^"]*)"/)![1];
  return Object.fromEntries(
    style
      .split(";")
      .filter(Boolean)
      .map((entry) => entry.split(":")),
  );
}

describe("device viewports", () => {
  it("fits an isolated design rather than shrinking it to fit its empty screen margins", () => {
    const frame = previewArtworkFrame(
      [{ x: 560, y: 240, w: 800, h: 600 }],
      [1920, 1080],
    );
    expect(frame).toEqual({ x: 560, y: 240, w: 800, h: 600 });
    expect(previewCamera([1000, 800], frame, 1).scale).toBe(1);
    expect(previewCamera([424, 324], frame, 1).scale).toBe(0.5);
  });
  it("frames multiple roots together and handles invisible or invalid content without an invalid camera", () => {
    expect(
      previewArtworkFrame(
        [
          { x: 100, y: 50, w: 200, h: 100 },
          { x: 500, y: 200, w: 200, h: 100 },
        ],
        [1920, 1080],
      ),
    ).toEqual({ x: 100, y: 50, w: 600, h: 250 });
    for (const boxes of [
      [],
      [{ x: NaN, y: 0, w: 2, h: 2 }],
      [{ x: 2000, y: 0, w: 100, h: 100 }],
    ])
      expect(previewArtworkFrame(boxes, [1920, 1080])).toEqual({
        x: 0,
        y: 0,
        w: 1920,
        h: 1080,
      });
  });
  it("clips the focused camera to the visible native screen without changing the authored boxes", () => {
    const boxes = [{ x: -40, y: 50, w: 200, h: 400 }];
    expect(previewArtworkFrame(boxes, [320, 240])).toEqual({
      x: 0,
      y: 50,
      w: 160,
      h: 190,
    });
    expect(boxes).toEqual([{ x: -40, y: 50, w: 200, h: 400 }]);
  });
  it("keeps the original canvas distinct from device presets and rotates without changing it", () => {
    const source = [540, 358] as const;
    expect(previewViewportSize(preset("design"), source)).toEqual([540, 358]);
    expect(previewViewportSize(preset("phone"), source)).toEqual([390, 844]);
    expect(previewViewportSize(preset("tablet"), source)).toEqual([1024, 768]);
    expect(previewViewportSize(preset("desktop"), source)).toEqual([
      1920, 1080,
    ]);
    expect(
      previewViewportSize({ ...preset("phone"), rotated: true }, source),
    ).toEqual([844, 390]);
    expect(source).toEqual([540, 358]);
  });
  it("keeps custom dimensions independent of the selected design", () => {
    const choice = { ...preset("custom"), custom: [720, 480] as const };
    expect(previewViewportSize(choice, [1920, 1080])).toEqual([720, 480]);
    expect(
      previewViewportSize({ ...choice, rotated: true }, [320, 200]),
    ).toEqual([480, 720]);
  });
  it("rejects blank, fractional, unbounded and non-numeric dimensions before they affect layout", () => {
    for (const raw of [
      "",
      " ",
      "0",
      "63",
      "8193",
      "-64",
      "NaN",
      "Infinity",
      "390.5",
      "1e3",
      "9999999999999999999",
    ])
      expect(parsePreviewDimension(raw), raw).toBeUndefined();
    expect(parsePreviewDimension("64")).toBe(64);
    expect(parsePreviewDimension(" 390 ")).toBe(390);
    expect(parsePreviewDimension("8192")).toBe(8192);
  });
  it("fits the logical canvas without inflating its layout measurements", () => {
    expect(previewFitScale([414, 868], [390, 844], 1)).toBe(1);
    expect(previewFitScale([804, 564], [1920, 1080], 1)).toBeCloseTo(
      780 / 1920,
    );
    expect(previewFitScale([414, 868], [390, 844], 2)).toBe(2);
    expect(Number.isFinite(previewFitScale([0, 0], [390, 844], 1))).toBe(true);
  });
});

describe("responsive canvas rendering", () => {
  it("reflows actual exported inventory geometry into two phone columns", () => {
    const html = render(preset("phone"));
    expect(html).toContain('data-preview-canvas="390x844"');
    expect(box(html, "device-inventory").width).toBe("390px");
    expect(box(html, "inventory")).toMatchObject({
      left: "24px",
      top: "96px",
      width: "342px",
      height: "724px",
      "overflow-x": "hidden",
      "overflow-y": "auto",
    });
    expect(box(html, "card-0")).toMatchObject({
      left: "12px",
      top: "12px",
      width: "132px",
    });
    expect(box(html, "card-1")).toMatchObject({ left: "156px", top: "12px" });
    expect(box(html, "card-2")).toMatchObject({ left: "12px", top: "140px" });
    expect(box(html, "card-11")).toMatchObject({ left: "156px", top: "652px" });
    expect(html).toContain('data-preview-scroll-canvas="342x780"');
  });
  it("renders tablet and desktop columns at their actual available widths", () => {
    const tablet = render(preset("tablet")),
      desktop = render(preset("desktop"));
    expect(box(tablet, "card-5").top).toBe("12px");
    expect(box(tablet, "card-6").top).toBe("140px");
    expect(box(desktop, "inventory").width).toBe("1872px");
    expect(box(desktop, "card-11")).toMatchObject({
      top: "12px",
      left: "1596px",
    });
    expect(tablet).toContain('data-preview-scroll-canvas="976x648"');
    expect(desktop).toContain('data-preview-scroll-canvas="1872x960"');
  });
  it("recalculates landscape and narrow custom layouts rather than zooming the authored arrangement", () => {
    const landscape = render({ ...preset("phone"), rotated: true });
    const narrow = render({ ...preset("custom"), custom: [240, 400] });
    expect(box(landscape, "inventory")).toMatchObject({
      width: "796px",
      height: "270px",
    });
    expect(box(landscape, "card-5")).toMatchObject({
      left: "12px",
      top: "140px",
    });
    expect(box(narrow, "card-1")).toMatchObject({ left: "12px", top: "140px" });
    expect(landscape).toContain('data-preview-scroll-canvas="796x396"');
    expect(narrow).toContain('data-preview-scroll-canvas="192x1548"');
  });
  it("keeps exact geometry fixed and explains why it may clip on a phone", () => {
    const data = result();
    data.package.options.layout = "exact";
    const root = data.package.roots[0].children[0];
    root.properties.Size = { type: "UDim2", value: [0, 1024, 0, 768] };
    const html = render(preset("phone"), data);
    expect(box(html, "device-inventory").width).toBe("1024px");
    expect(html).toContain("Preserved geometry keeps pixel sizes.");
  });
  it("preserves aspect constraints on children whose parent does not own their layout", () => {
    const data = result();
    const heading = flatten(data.package.roots).find(
      (node) => node.id === "heading",
    )!;
    heading.properties.Size = { type: "UDim2", value: [0, 100, 0, 100] };
    heading.children.push({
      id: "heading/aspect",
      name: "Aspect",
      className: "UIAspectRatioConstraint",
      properties: { AspectRatio: 2 },
      children: [],
    });
    expect(box(render(preset("phone"), data), "heading")).toMatchObject({
      width: "100px",
      height: "50px",
    });
  });
  it("never changes source data, export dimensions, identities or behavior when previewing devices", () => {
    const data = result(),
      before = JSON.stringify(data);
    for (const name of ["design", "phone", "tablet", "desktop"] as const)
      render(preset(name), data);
    render({ ...preset("custom"), custom: [720, 480] }, data);
    expect(JSON.stringify(data)).toBe(before);
    expect(data.package.roots[0].referenceSize).toEqual([1024, 768]);
    expect(
      flatten(data.package.roots).find((node) => node.id === "details-0")!
        .behavior!.action,
    ).toEqual({ kind: "open", target: "details-panel" });
  });
  it("keeps surfaces, billboards and prompts on their authored canvas despite a saved device choice", () => {
    for (const kind of ["surface", "billboard", "prompt"] as const) {
      const data: AnalysisResult = {
        package: worldPackage(kind),
        assets: {},
        previews: {},
        revision: 1,
      };
      const before = JSON.stringify(data);
      const original = render(preset("design"), data);
      for (const choice of [
        preset("phone"),
        { ...preset("tablet"), rotated: true },
        { ...preset("custom"), custom: [720, 480] as const },
      ]) {
        const html = render(choice, data);
        expect(html).toBe(original);
        expect(html).toContain('data-preview-canvas="280x140"');
        expect(html).not.toContain('aria-label="Preview device"');
        expect(box(html, "action")).toMatchObject({
          left: "12px",
          top: "12px",
          width: "240px",
          height: "30px",
        });
      }
      expect(JSON.stringify(data)).toBe(before);
    }
  });
});

describe("native mask previews", () => {
  it("keeps content at its original responsive coordinates when a right-anchored mask moves", () => {
    const masked = maskResizePackage(),
      original = maskResizePackage("MAX", "SCALE", false);
    const renderPackage = (pkg: typeof masked) =>
      render(
        { ...preset("custom"), custom: [640, 360] },
        { package: pkg, assets: {}, previews: {}, revision: 1 },
      );
    const html = renderPackage(masked),
      baseline = renderPackage(original);
    const content = box(html, "rounded:content"),
      reference = box(baseline, "rounded:content"),
      helper = box(html, "rounded:mask/mask-content"),
      clip = box(html, "rounded:mask");
    for (const key of ["left", "top", "width", "height"])
      expect(content[key]).toBe(reference[key]);
    expect(parseFloat(helper.left) + parseFloat(clip.left)).toBeCloseTo(0);
    expect(parseFloat(helper.top) + parseFloat(clip.top)).toBeCloseTo(0);
    expect(parseFloat(helper.width)).toBeCloseTo(480);
  });
  it("compensates clip scale without scaling child offset properties", () => {
    const pkg = maskResizePackage();
    flatten(pkg.roots)
      .find((n) => n.id === "rounded:mask")!
      .children.unshift({
        id: "clip-scale",
        name: "Clip scale",
        className: "UIScale",
        properties: { Scale: 2 },
        children: [],
      });
    const html = render(
      { ...preset("custom"), custom: [640, 360] },
      { package: pkg, assets: {}, previews: {}, revision: 1 },
    );
    const content = box(html, "rounded:mask/mask-content");
    // Center-origin rotation must retain the old anchor-origin scale position.
    expect(content.transform).toContain("scale(0.5) rotate(0deg)");
    expect(content.transform).toContain("translate(-120px,");
    expect(content["transform-origin"]).toBe("50% 50%");
    expect(
      parseFloat(box(html, "rounded:mask/mask-content").width),
    ).toBeCloseTo(480);
  });
  it("clips overflowing editable descendants to a rounded CanvasGroup", () => {
    const data: AnalysisResult = {
      package: maskPackages().maskRounded,
      assets: {},
      previews: {},
      revision: 1,
    };
    const html = render(preset("design"), data);
    expect(box(html, "rounded:mask")).toMatchObject({
      overflow: "hidden",
      width: "160px",
      height: "100px",
      "border-radius": "24px 24px 24px 24px",
    });
    expect(box(html, "rounded:content")).toMatchObject({
      left: "-20px",
      top: "-20px",
      width: "240px",
      height: "160px",
    });
    expect(box(html, "rounded:mask")["overflow-x"]).toBeUndefined();
    expect(box(html, "rounded:mask")["overflow-y"]).toBeUndefined();
  });
  it("previews circle shape and uniform alpha without tinting the content", () => {
    const cases = maskPackages();
    const circle = render(preset("design"), {
      package: cases.maskCircle,
      assets: {},
      previews: {},
      revision: 1,
    });
    const alpha = render(preset("design"), {
      package: cases.maskAlpha,
      assets: {},
      previews: {},
      revision: 1,
    });
    expect(box(circle, "circle:mask")).toMatchObject({
      overflow: "hidden",
      "border-radius": "50px 50px 50px 50px",
    });
    expect(box(alpha, "alpha:mask")).toMatchObject({
      opacity: "0.25",
      overflow: "hidden",
    });
  });
  it("allows native scroll overflow inside its outer rounded mask", () => {
    const html = render(preset("design"), {
      package: maskPackages().maskScroll,
      assets: {},
      previews: {},
      revision: 1,
    });
    expect(box(html, "scroll:mask").overflow).toBe("hidden");
    expect(box(html, "scroll:viewport")).toMatchObject({
      "overflow-x": "hidden",
      "overflow-y": "auto",
    });
    expect(html).toContain("Quest 12");
  });
});

describe("native text units in the browser preview", () => {
  function textStyle(html: string, id = "heading") {
    const tag = html.match(
      new RegExp(`<div[^>]*data-preview-text="${id}"[^>]*>`),
    )?.[0];
    if (!tag) throw new Error(`Missing text preview ${id}`);
    const style = tag.match(/style="([^"]*)"/)![1];
    return Object.fromEntries(
      style
        .split(";")
        .filter(Boolean)
        .map((entry) => entry.split(":")),
    );
  }
  function heading(data: AnalysisResult) {
    return flatten(data.package.roots).find((node) => node.id === "heading")!;
  }
  it("renders corrected source em sizes without enlarging the CSS font", () => {
    const data = result(),
      text = heading(data);
    expect(text.properties.TextSize).toBe(28);
    const style = textStyle(render(preset("design"), data));
    expect(parseFloat(style["font-size"])).toBeCloseTo(28 / (2400 / 2048));
    expect(parseFloat(style["font-size"])).toBeLessThan(24);
    expect(style["line-height"]).toBe("28px");
  });
  it("previews the engine's truncated raw native override and explicit line height", () => {
    const data = result(),
      text = heading(data);
    text.properties.TextSize = 28.75;
    text.properties.LineHeight = 1.5;
    const style = textStyle(render(preset("design"), data));
    expect(parseFloat(style["font-size"])).toBeCloseTo(28 / (2400 / 2048));
    expect(style["line-height"]).toBe("42px");
    expect(text.properties.TextSize).toBe(28.75);
  });
  it.each([
    { dimensions: [200, 200], minimum: 30, maximum: 40, effective: 40 },
    { dimensions: [20, 20], minimum: 30, maximum: 40, effective: 30 },
    { dimensions: [1000, 400], minimum: 1, maximum: 100, effective: 100 },
  ])(
    "applies TextScaled limits to native height before CSS conversion: $effective",
    ({ dimensions, minimum, maximum, effective }) => {
      const data = result(),
        text = heading(data);
      text.properties.TextScaled = true;
      text.properties.Text = "MMMM";
      text.properties.Size = {
        type: "UDim2",
        value: [0, dimensions[0], 0, dimensions[1]],
      };
      text.children.push({
        id: "heading/text-limits",
        name: "Text limits",
        className: "UITextSizeConstraint",
        properties: { MinTextSize: minimum, MaxTextSize: maximum },
        children: [],
      });
      const style = textStyle(render(preset("design"), data));
      expect(parseFloat(style["font-size"])).toBeCloseTo(
        effective / (2400 / 2048),
      );
      expect(style["line-height"]).toBe(`${effective}px`);
    },
  );
  it("keeps unknown face previews approximate without applying a guessed metric", () => {
    const data = result(),
      text = heading(data);
    text.properties.FontFace = {
      type: "Font",
      family: "rbxassetid://123456",
      weight: "Regular",
      style: "Normal",
    };
    text.properties.TextSize = 28;
    text.properties.LineHeight = 1.5;
    const style = textStyle(render(preset("design"), data));
    expect(style["font-size"]).toBe("28px");
    expect(Number(style["line-height"])).toBeCloseTo(1.8);
  });
  it("uses the engine alias's verified metric for legacy Arial", () => {
    const data = result(),
      text = heading(data);
    text.properties.FontFace = {
      type: "Font",
      family: "rbxasset://fonts/families/Arial.json",
      weight: "Bold",
      style: "Normal",
    };
    text.properties.TextSize = 27;
    const style = textStyle(render(preset("design"), data));
    expect(parseFloat(style["font-size"])).toBeCloseTo(27 / (2355 / 2048));
    expect(style["line-height"]).toBe("27px");
  });
});
