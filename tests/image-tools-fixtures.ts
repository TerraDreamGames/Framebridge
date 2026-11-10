import { createRequire } from "node:module";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { preparePng } from "../packages/core/src/image-processing";
import type {
  AnalysisResult,
  ImageProcessing,
} from "../packages/core/src/types";

// Independent PNG codec in tests only; never ships in either plugin.
export const { PNG } = createRequire(import.meta.url)("pngjs") as {
  PNG: {
    sync: {
      write(
        image: {
          width: number;
          height: number;
          data: Uint8Array | Uint16Array;
        },
        options?: Record<string, unknown>,
      ): Buffer;
      read(
        bytes: Buffer,
        options?: Record<string, unknown>,
      ): { width: number; height: number; data: Uint8Array | Uint16Array };
    };
  };
};
export function iconPng(filterType = 0) {
  const data = new Uint8Array(7 * 5 * 4);
  for (let y = 1; y < 4; y++)
    for (let x = 2; x < 5; x++) {
      const i = (y * 7 + x) * 4;
      data.set([40 + x * 20, 90 + y * 10, 180, [1, 128, 255][x - 2]], i);
    }
  return new Uint8Array(
    PNG.sync.write({ width: 7, height: 5, data }, { filterType }),
  );
}
export function imageToolsResult(processing?: ImageProcessing): AnalysisResult {
  const designs = [
    node("Image tools", {
      id: "image-tools",
      width: 360,
      height: 240,
      children: [
        node("Tintable icon", {
          id: "icon",
          type: "VECTOR",
          width: 140,
          height: 100,
        }),
      ],
    }),
  ];
  const pkg = compile(
    designs,
    "image-tools-source",
    {
      layerOverrides: {
        icon: {
          imageProcessing: processing,
          properties: { ImageColor3: { type: "Color3", value: [0.2, 0.7, 1] } },
        },
      },
    },
    "fixed",
  );
  return {
    package: pkg,
    designs,
    previews: {},
    assets: {
      [pkg.assets[0].id]: Array.from(
        preparePng(iconPng(), pkg.assets[0].processing),
      ),
    },
    revision: 1,
  };
}
