import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RobloxPreview } from "../plugins/figma/src/RobloxPreview";
import { DEFAULT_PREVIEW_VIEWPORT } from "../plugins/figma/src/preview-viewport";
import { effectPackage } from "./effect-decoration-fixtures";
import type { AnalysisResult } from "../packages/core/src/types";
it("renders an ABOVE text helper after its owner font phase while retaining native clipping and input protection", () => {
  const pkg = effectPackage();
  const result: AnalysisResult = {
    package: pkg,
    assets: {},
    previews: {},
    revision: 1,
  };
  const html = renderToStaticMarkup(
    <RobloxPreview
      result={result}
      active={pkg.roots[0].id}
      selected=""
      onSelect={() => {}}
      zoom={1}
      viewportChoice={DEFAULT_PREVIEW_VIEWPORT}
      onViewportChange={() => {}}
    />,
  );
  const font = html.match(
    /<div[^>]*data-preview-text="effect:text"[^>]*>/,
  )?.[0];
  const helper = html.match(
    /<div[^>]*data-preview-layer="effect:text\/effect"[^>]*>/,
  )?.[0];
  const group = html.match(
    /<div[^>]*data-preview-layer="effect:container"[^>]*>/,
  )?.[0];
  expect(font).toContain("position:relative");
  expect(font).toContain("z-index:-2");
  expect(helper).toContain("z-index:-1");
  expect(helper).toContain("pointer-events:none");
  expect(group).toContain("overflow:hidden");
  expect(group).toContain("opacity:0.5");
});
