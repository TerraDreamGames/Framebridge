import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import { decode } from "fast-png";
import { editorRuntimeFixture, SLICE_COLORS } from "./editor-runtime-fixtures";
import { flatten } from "../packages/core/src/types";
import { validateExportPackage } from "../packages/core/src/export-package";
import { validatePackage } from "../packages/relay/src/protocol";
import { buildExport } from "../packages/core/src/export";
import { generateModel } from "../packages/core/src/model-export";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";

describe("combined editor runtime acceptance fixture", () => {
  it("keeps a stable automatic canvas with native list/grid owners and an independent slice asset", () => {
    const result = editorRuntimeFixture(),
      nodes = flatten(result.package.roots);
    expect(result.package.issues.filter((i) => i.severity === "error")).toEqual(
      [],
    );
    validateExportPackage(result.package);
    const find = (id: string) => nodes.find((n) => n.id === id)!;
    expect(find("vertical").className).toBe("ScrollingFrame");
    expect(find("horizontal").className).toBe("ScrollingFrame");
    expect(
      find("grid").children.filter((n) => n.className === "UIGridLayout"),
    ).toHaveLength(1);
    expect(
      find("vertical").children.some((n) => n.className === "UIListLayout"),
    ).toBe(true);
    expect(
      find("horizontal").children.some((n) => n.className === "UIListLayout"),
    ).toBe(true);
    // Percentages on an automatic scroll axis feed back into canvas calculation.
    for (const [owner, child, axis] of [
      ["vertical", "item-4", 2],
      ["horizontal", "card-3", 0],
      ["grid", "cell-11", 2],
    ] as const) {
      expect(find(owner).properties.AutomaticCanvasSize).toEqual({
        type: "Enum",
        value: ["AutomaticSize", axis === 2 ? "Y" : "X"],
      });
      expect(
        (find(child).properties.Size as { value: number[] }).value[axis],
      ).toBe(0);
    }
    expect(find("vertical-art")).toBeUndefined();
    expect(find("horizontal-art")).toBeUndefined();
    expect(find("slice-art").properties.SliceCenter).toEqual({
      type: "Rect",
      value: [16, 16, 48, 48],
    });
    expect(result.package.assets).toHaveLength(7);
  });
  it("exports exact seven PNGs, real measured dimensions, and deterministic nine-color artwork", () => {
    const result = editorRuntimeFixture(),
      files = unzipSync(buildExport(result).data);
    for (const asset of result.package.assets) {
      expect(files[`images/${asset.filename}`]).toEqual(
        new Uint8Array(result.assets[asset.id]),
      );
      const png = decode(files[`images/${asset.filename}`]);
      expect(asset.pixelSize).toEqual([png.width, png.height]);
      expect(png.width).toBe(asset.nodeId === "slice-art" ? 64 : 8);
    }
    const a = result.package.assets.find((a) => a.nodeId === "slice-art")!,
      png = decode(new Uint8Array(result.assets[a.id]));
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        const x = [4, 32, 60][col],
          y = [4, 32, 60][row];
        expect(
          Array.from(png.data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)),
        ).toEqual([...SLICE_COLORS[row * 3 + col], 255]);
      }
  });
  it("accepts linked transfer metadata and preserves the same controls across every export renderer", () => {
    const raw = editorRuntimeFixture();
    const ids = Object.fromEntries(
      raw.package.assets.map((a, i) => [a.id, String(300000000 + i)]),
    );
    const result = editorRuntimeFixture(ids),
      before = JSON.stringify(result);
    validatePackage(result.package);
    const model = generateModel(result.package);
    expect(model).toContain('<Rect2D name="SliceCenter">');
    expect(model.includes('name="TopImage"')).toBe(true);
    expect(model).toContain('name="CellSize"');
    for (const format of SOURCE_FORMATS) {
      const code = generateSource(result.package, format.id);
      expect(code).toContain("UIGridLayout");
      expect(code).toContain("SliceScale");
      expect(code).toContain("scroll-v1:Y");
    }
    expect(JSON.stringify(result)).toBe(before);
  });
});
