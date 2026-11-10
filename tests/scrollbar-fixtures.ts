import { encode } from "fast-png";
import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import { preparePng } from "../packages/core/src/image-processing";
import { pngPixelSize } from "../packages/core/src/image-scaling";
import type { AnalysisResult, LayerOverride } from "../packages/core/src/types";
export function scrollbarDesign() {
  const fill = [{ type: "SOLID", color: { r: 0.15, g: 0.2, b: 0.3 } }];
  return node("Scrollbar examples", {
    id: "scroll-root",
    width: 600,
    height: 420,
    fills: [{ type: "SOLID", color: { r: 0.05, g: 0.07, b: 0.1 } }],
    children: [
      node("Inventory Scroll", {
        id: "vertical",
        width: 210,
        height: 160,
        clipsContent: true,
        transform: [
          [1, 0, 20],
          [0, 1, 20],
        ],
        children: Array.from({ length: 5 }, (_, i) =>
          node(`Item ${i + 1}`, {
            id: `item-${i}`,
            width: 190,
            height: 48,
            fills: fill,
            transform: [
              [1, 0, 0],
              [0, 1, i * 60],
            ],
          }),
        ),
      }),
      node("Inventory ScrollBar", {
        id: "vertical-art",
        type: "VECTOR",
        width: 8,
        height: 64,
        transform: [
          [1, 0, 222],
          [0, 1, 30],
        ],
        fills: fill,
      }),
      node("Rewards Scroll", {
        id: "horizontal",
        width: 300,
        height: 100,
        clipsContent: true,
        transform: [
          [1, 0, 20],
          [0, 1, 220],
        ],
        children: Array.from({ length: 4 }, (_, i) =>
          node(`Reward ${i + 1}`, {
            id: `reward-${i}`,
            width: 96,
            height: 80,
            fills: fill,
            transform: [
              [1, 0, i * 108],
              [0, 1, 0],
            ],
          }),
        ),
      }),
      node("Rewards ScrollBar", {
        id: "horizontal-art",
        type: "VECTOR",
        width: 64,
        height: 8,
        transform: [
          [1, 0, 30],
          [0, 1, 312],
        ],
        fills: fill,
      }),
    ],
  });
}
export function scrollbarPng(axis: "X" | "Y" = "Y", depth: 8 | 16 = 8) {
  const width = axis === "Y" ? 8 : 64,
    height = axis === "Y" ? 64 : 8;
  const data =
    depth === 16
      ? new Uint16Array(width * height * 4)
      : new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const factor = depth === 16 ? 257 : 1;
      data.set(
        [
          x * 3 * factor,
          y * 3 * factor,
          ((x + y) % 2 ? 240 : 40) * factor,
          ((x * 7 + y * 11) % 256) * factor,
        ],
        (y * width + x) * 4,
      );
    }
  return encode({ width, height, data, depth, channels: 4 });
}
export function scrollbarOverrides(): Record<string, LayerOverride> {
  return {
    vertical: {
      scrollbar: {
        artworkId: "vertical-art",
        axis: "Y",
        startCap: 0.125,
        endCap: 0.125,
        thickness: 8,
      },
    },
    horizontal: {
      scrollbar: {
        artworkId: "horizontal-art",
        axis: "X",
        startCap: 0.125,
        endCap: 0.125,
        thickness: 8,
      },
    },
  };
}
export function scrollbarResult(
  overrides = scrollbarOverrides(),
  linked = false,
): AnalysisResult {
  const designs = [scrollbarDesign()],
    pkg = compile(
      designs,
      "scrollbar-fixture",
      { layerOverrides: overrides, layout: "responsive" },
      "2026-10-03T12:00:00.000Z",
    ),
    assets: Record<string, number[]> = {};
  for (const [i, asset] of pkg.assets.entries()) {
    const axis = asset.nodeId === "horizontal-art" ? "X" : "Y";
    assets[asset.id] = Array.from(
      preparePng(scrollbarPng(axis), asset.processing, asset.scrollbarSlice),
    );
    asset.pixelSize = pngPixelSize(new Uint8Array(assets[asset.id]));
    if (linked) asset.robloxId = String(123456781 + i);
  }
  return { designs, package: pkg, assets, previews: {}, revision: 1 };
}
