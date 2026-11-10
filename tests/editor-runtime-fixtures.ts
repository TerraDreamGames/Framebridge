import { encode } from "fast-png";
import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import { preparePng } from "../packages/core/src/image-processing";
import { pngPixelSize } from "../packages/core/src/image-scaling";
import type {
  AnalysisResult,
  DesignNode,
  LayerOverride,
} from "../packages/core/src/types";

export const EDITOR_QA_SOURCE = "Framebridge-editor-runtime-QA-20261005";
export const SLICE_COLORS = [
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
const at = (x: number, y: number): DesignNode["transform"] => [
  [1, 0, x],
  [0, 1, y],
];
const box = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  children: DesignNode[] = [],
) =>
  node(id, {
    id,
    width: w,
    height: h,
    transform: at(x, y),
    fills: [{ type: "SOLID", color: { r: 0.14, g: 0.2, b: 0.3 } }],
    children,
  });
const list = (mode: string) => ({
  mode,
  spacing: 12,
  padding: [0, 0, 0, 0] as [number, number, number, number],
  primary: "MIN",
  counter: "MIN",
  wrap: false,
});

/** Synthetic artwork has a fixed pixel oracle; no unrelated provider ID is substituted. */
export function editorQaPng(id: string) {
  const slice = id === "slice-art",
    horizontal = id === "horizontal-art";
  const width = slice || horizontal ? 64 : 8,
    height = slice || !horizontal ? 64 : 8;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const along = horizontal ? x : y;
      const color = slice
        ? SLICE_COLORS[
            (y < 16 ? 0 : y >= 48 ? 2 : 1) * 3 + (x < 16 ? 0 : x >= 48 ? 2 : 1)
          ]
        : along < 8
          ? [236, 86, 102]
          : along >= 56
            ? [67, 115, 219]
            : [74, 189, 146];
      data.set([...color, 255], (y * width + x) * 4);
    }
  return encode({ width, height, data, depth: 8, channels: 4 });
}

export function editorRuntimeFixture(
  assetIds: Record<string, string> = {},
): AnalysisResult {
  const vertical = box(
    "vertical",
    20,
    20,
    180,
    140,
    Array.from({ length: 5 }, (_, i) => box(`item-${i}`, 0, i * 60, 160, 48)),
  );
  vertical.clipsContent = true;
  vertical.layout = list("VERTICAL");
  const horizontal = box(
    "horizontal",
    230,
    20,
    350,
    100,
    Array.from({ length: 4 }, (_, i) => box(`card-${i}`, i * 108, 0, 96, 80)),
  );
  horizontal.clipsContent = true;
  horizontal.layout = list("HORIZONTAL");
  const grid = box(
    "grid",
    20,
    200,
    180,
    170,
    Array.from({ length: 12 }, (_, i) =>
      box(`cell-${i}`, (i % 2) * 80, Math.floor(i / 2) * 44, 72, 36),
    ),
  );
  grid.clipsContent = true;
  grid.scrolling = "VERTICAL";
  const slice = box("slice-art", 230, 150, 64, 64);
  slice.type = "VECTOR";
  const thumb = box("slider-thumb", 0, 0, 16, 28);
  const fill = box("slider-fill", 0, 0, 240, 28);
  const slider = box("slider", 230, 280, 240, 28, [fill, thumb]);
  const handle = box("window-handle", 0, 0, 140, 20);
  const window = box("window", 380, 370, 140, 80, [handle]);
  const verticalArt = box("vertical-art", 205, 25, 8, 64);
  verticalArt.type = "VECTOR";
  const horizontalArt = box("horizontal-art", 240, 125, 64, 8);
  horizontalArt.type = "VECTOR";
  const designs = [
    box("editor-runtime", 0, 0, 640, 520, [
      vertical,
      horizontal,
      verticalArt,
      horizontalArt,
      grid,
      slice,
      slider,
      window,
    ]),
  ];
  const overrides: Record<string, LayerOverride> = {
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
    "slice-art": {
      properties: {
        ScaleType: { type: "Enum", value: ["ScaleType", "Slice"] },
        SliceCenter: { type: "Rect", value: [16, 16, 48, 48] },
        SliceScale: 0.5,
        Size: { type: "UDim2", value: [0, 300, 0, 96] },
      },
    },
    slider: {
      className: "TextButton",
      properties: { Text: "" },
      behavior: {
        control: {
          kind: "slider",
          min: -0.3,
          max: 0.3,
          value: 0,
          step: 0.1,
          axis: "X",
          fill: "slider-fill",
          thumb: "slider-thumb",
        },
      },
    },
    "slider-thumb": {
      properties: { AnchorPoint: { type: "Vector2", value: [0.5, 0] } },
    },
    window: {
      behavior: {
        control: { kind: "window", handle: "window-handle", constrain: true },
      },
    },
  };
  const pkg = compile(
    designs,
    EDITOR_QA_SOURCE,
    {
      layout: "responsive",
      styleSizing: "pixels",
      imageScale: 1,
      layerOverrides: overrides,
    },
    "2026-10-05T00:00:00.000Z",
  );
  const assets: Record<string, number[]> = {};
  for (const asset of pkg.assets) {
    const png = preparePng(
      editorQaPng(asset.nodeId),
      asset.processing,
      asset.scrollbarSlice,
    );
    assets[asset.id] = Array.from(png);
    asset.pixelSize = pngPixelSize(png);
    asset.robloxId = assetIds[asset.id];
  }
  return { designs, package: pkg, assets, previews: {}, revision: 1 };
}
