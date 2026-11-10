import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import type { AnalysisResult } from "../packages/core/src/types";
import { PNG } from "./image-tools-fixtures";

/** Real independently encoded PNGs, with repeatable distinct pixel colors. */
export function batchPng(index: number) {
  const data = new Uint8Array(8 * 8 * 4);
  for (let offset = 0; offset < data.length; offset += 4)
    data.set(
      [index & 255, (index >>> 8) & 255, (index * 13) & 255, 255],
      offset,
    );
  return new Uint8Array(PNG.sync.write({ width: 8, height: 8, data }));
}
export function imageBatchFixture(
  unique = 1000,
  references = unique,
): AnalysisResult {
  const designs = [
    node("Image batch QA", {
      id: "batch-root",
      width: 800,
      height: 600,
      children: Array.from({ length: references }, (_, index) =>
        node(`Artwork ${index}`, {
          id: `batch-${index}`,
          type: "VECTOR",
          width: 8,
          height: 8,
          transform: [
            [1, 0, (index % 100) * 8],
            [0, 1, Math.floor(index / 100) * 8],
          ],
        }),
      ),
    }),
  ];
  const pkg = compile(designs, "local-image-batch-qa", {}, "fixed");
  const bytes = Array.from({ length: unique }, (_, index) =>
    Array.from(batchPng(index)),
  );
  return {
    package: pkg,
    designs,
    revision: 1,
    previews: {},
    assets: Object.fromEntries(
      pkg.assets.map((asset, index) => [asset.id, bytes[index % unique]]),
    ),
  };
}
