import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { imageScalingIssues } from "../packages/core/src/image-scaling";
import { preparePng } from "../packages/core/src/image-processing";
import { flatten, type AnalysisResult } from "../packages/core/src/types";
import { ImageScalingEditor } from "../plugins/figma/src/ImageScalingEditor";
import { ImagePreparation } from "../plugins/figma/src/ImagePreparation";
import { ScrollbarEditor } from "../plugins/figma/src/ScrollbarEditor";
import { imageScalingResult } from "./image-scaling-fixtures";
import {
  scrollbarOverrides,
  scrollbarPng,
  scrollbarResult,
} from "./scrollbar-fixtures";

const capError = "smaller than one rendered pixel";
function scrollbarForm(
  id: "vertical" | "horizontal",
  startCap: number,
  endCap = 0.15,
  result: AnalysisResult = scrollbarResult(),
  imageScale?: number,
) {
  const overrides = scrollbarOverrides();
  Object.assign(overrides[id].scrollbar!, { startCap, endCap });
  return renderToStaticMarkup(
    <ScrollbarEditor
      id={id}
      result={result}
      overrides={overrides}
      imageScale={imageScale}
      onChange={() => {}}
    />,
  );
}
function confirmButton(html: string) {
  const button = html.match(/<button\b[^>]*>Confirm scrollbar<\/button>/)?.[0];
  expect(button).toBeDefined();
  return button!;
}

describe("image editor validation", () => {
  it("shows default cleanup On and preserves a saved Off choice independently of white masks", () => {
    const render = (value?: { edgeCleanup?: boolean; whiteMask?: boolean }) =>
      renderToStaticMarkup(
        <ImagePreparation value={value} onChange={() => {}} />,
      );
    const control = (html: string) =>
      html.match(/<button[^>]*aria-label="Clean transparent edges"[^>]*>/)?.[0];
    expect(control(render())).toContain('aria-checked="true"');
    expect(control(render({ whiteMask: false }))).toContain(
      'aria-checked="true"',
    );
    expect(control(render({ edgeCleanup: false, whiteMask: true }))).toContain(
      'aria-checked="false"',
    );
    expect(render()).toContain("on by default");
  });
  it("exposes edge cleanup without a destructive white mask for generated background/effect artwork", () => {
    const html = renderToStaticMarkup(
      <ImagePreparation allowWhiteMask={false} onChange={() => {}} />,
    );
    expect(html).toContain("Clean transparent edges");
    expect(html).not.toContain("Tintable white mask");
  });
  it.each([
    ["vertical", "Y"],
    ["horizontal", "X"],
  ] as const)("rejects zero-pixel %s caps before confirmation", (id, axis) => {
    const result = scrollbarResult();
    result.package.options.imageScale = 1;
    const invalid = scrollbarForm(id, 0.001, 0.15, result);
    expect(confirmButton(invalid)).toContain("disabled=");
    expect(invalid).toContain(capError);
    expect(() =>
      preparePng(scrollbarPng(axis), undefined, { axis, start: 0, end: 0.001 }),
    ).toThrow(capError);

    const corrected = scrollbarForm(id, 0.02, 0.15, result);
    expect(confirmButton(corrected)).not.toContain("disabled=");
    expect(corrected).not.toContain(capError);
    expect(() =>
      preparePng(scrollbarPng(axis), undefined, { axis, start: 0, end: 0.02 }),
    ).not.toThrow();
  });

  it("rejects a middle segment that rounds to zero pixels", () => {
    const result = scrollbarResult();
    result.package.options.imageScale = 1;
    const html = scrollbarForm("vertical", 0.499, 0.499, result);
    expect(confirmButton(html)).toContain("disabled=");
    expect(() =>
      preparePng(scrollbarPng(), undefined, {
        axis: "Y",
        start: 0.499,
        end: 0.501,
      }),
    ).toThrow(capError);
  });

  it("uses measured PNG dimensions ahead of source geometry or stale metadata", () => {
    const result = scrollbarResult();
    result.package.options.imageScale = 1;
    const source = result.designs![0].children.find(
      (n) => n.id === "vertical-art",
    )!;
    source.height = 200;
    const asset = {
      ...result.package.assets[0],
      id: "original-thumb",
      scrollbarSlice: undefined,
      pixelSize: [8, 200] as [number, number],
    };
    result.package.assets.push(asset);
    result.assets[asset.id] = Array.from(scrollbarPng());
    const html = scrollbarForm("vertical", 0.004, 0.15, result);
    expect(confirmButton(html)).toContain("disabled=");
    expect(html).toContain(capError);
  });

  it("uses known render bounds and the selected resolution before the first PNG", () => {
    const result = scrollbarResult();
    result.package.options.imageScale = 1;
    expect(
      confirmButton(scrollbarForm("vertical", 0.004, 0.15, result, 1)),
    ).toContain("disabled=");
    expect(
      confirmButton(scrollbarForm("vertical", 0.004, 0.15, result, 2)),
    ).not.toContain("disabled=");
    const source = result.designs![0].children.find(
      (n) => n.id === "vertical-art",
    )!;
    source.rasterBounds = { x: 0, y: 0, width: 8, height: 200 };
    expect(
      confirmButton(scrollbarForm("vertical", 0.004, 0.15, result, 1)),
    ).not.toContain("disabled=");
  });

  it("keeps saved guides while hiding irrelevant Slice errors in Tile mode", () => {
    const result = imageScalingResult();
    const node = flatten(result.package.roots).find((n) => n.id === "sliced")!;
    const asset = result.package.assets.find((a) => a.id === node.assetRef)!;
    node.properties.SliceCenter = { type: "Rect", value: [16, 16, 80, 48] };
    const guides = JSON.stringify(node.properties.SliceCenter);
    node.properties.ScaleType = { type: "Enum", value: ["ScaleType", "Tile"] };
    const render = () =>
      renderToStaticMarkup(
        <ImageScalingEditor
          node={node}
          asset={asset}
          bytes={result.assets[asset.id]}
          onChange={() => {}}
        />,
      );
    expect(render()).not.toContain("Slice guides extend beyond");
    expect(imageScalingIssues(result.package)).toEqual([]);
    expect(JSON.stringify(node.properties.SliceCenter)).toBe(guides);

    node.properties.ScaleType = { type: "Enum", value: ["ScaleType", "Slice"] };
    expect(render()).toContain("Slice guides extend beyond");
    expect(imageScalingIssues(result.package)[0].code).toBe(
      "image-slice-bounds",
    );
    expect(JSON.stringify(node.properties.SliceCenter)).toBe(guides);
  });
});
