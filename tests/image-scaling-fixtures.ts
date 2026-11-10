import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { retainLinkedAssets } from "../packages/core/src/editor";
import { PNG } from "./image-tools-fixtures";
import type { AnalysisResult } from "../packages/core/src/types";

export function scalingPng(tile = false) {
  const width = tile ? 8 : 64,
    height = width,
    data = new Uint8Array(width * height * 4);
  const colors = [
    [236, 86, 102],
    [244, 167, 72],
    [245, 213, 78],
    [74, 189, 146],
    [67, 115, 219],
    [180, 102, 213],
    [64, 191, 207],
    [122, 142, 158],
    [219, 117, 174],
  ];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const zone = tile
        ? (Math.floor(x / 4) + Math.floor(y / 4)) % 2
          ? 0
          : 4
        : (y < 16 ? 0 : y >= 48 ? 2 : 1) * 3 + (x < 16 ? 0 : x >= 48 ? 2 : 1);
      data.set([...colors[zone], 255], (y * width + x) * 4);
    }
  return Array.from(PNG.sync.write({ width, height, data }));
}
export function imageScalingResult(): AnalysisResult {
  const designs = [
    node("Image scaling", {
      id: "image-scaling",
      width: 460,
      height: 340,
      children: [
        node("Sliced panel", {
          id: "sliced",
          type: "VECTOR",
          width: 64,
          height: 64,
          transform: [
            [1, 0, 24],
            [0, 1, 24],
          ],
        }),
        node("Tiled pattern", {
          id: "tiled",
          type: "VECTOR",
          width: 8,
          height: 8,
          transform: [
            [1, 0, 24],
            [0, 1, 185],
          ],
        }),
      ],
    }),
  ];
  const pkg = compile(
    designs,
    "image-scaling-fixture",
    {
      imageScale: 1,
      assetIds: {
        "image:sliced:bleed-v2": "284402752",
        "image:tiled:bleed-v2": "284402752",
      },
      layerOverrides: {
        sliced: {
          className: "ImageButton",
          properties: {
            ScaleType: { type: "Enum", value: ["ScaleType", "Slice"] },
            SliceCenter: { type: "Rect", value: [16, 16, 48, 48] },
            SliceScale: 1,
            Size: { type: "UDim2", value: [0, 240, 0, 120] },
          },
        },
        tiled: {
          properties: {
            ScaleType: { type: "Enum", value: ["ScaleType", "Tile"] },
            TileSize: { type: "UDim2", value: [0, 24, 0, 24] },
            Size: { type: "UDim2", value: [0, 300, 0, 100] },
          },
        },
      },
    },
    "fixed",
  );
  return retainLinkedAssets(undefined, {
    designs,
    package: pkg,
    assets: {
      "image:sliced:bleed-v2": scalingPng(),
      "image:tiled:bleed-v2": scalingPng(true),
    },
    previews: {},
    revision: 1,
  });
}
