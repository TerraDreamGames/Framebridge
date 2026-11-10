import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  validProperty,
  retainLinkedAssets,
  PROPERTY_SCHEMAS,
} from "../packages/core/src/editor";
import {
  propertyChanges,
  applyOverrideChanges,
} from "../packages/core/src/bulk-editor";
import {
  imageScalingIssues,
  nineSlice,
  pngPixelSize,
  sliceProblem,
  tileDimensions,
} from "../packages/core/src/image-scaling";
import {
  generateSource,
  SOURCE_FORMATS,
  sourceValue,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { buildSourceExport } from "../packages/core/src/source-export";
import { propertiesForView } from "../plugins/figma/src/property-presentation";
import { flatten, type Value } from "../packages/core/src/types";
import { imageScalingResult } from "./image-scaling-fixtures";

describe("Image scaling", () => {
  it.each(["ImageLabel", "ImageButton"])(
    "validates %s native dimensions and rejected coordinates",
    (className) => {
      expect(
        validProperty(className, "SliceCenter", {
          type: "Rect",
          value: [12.5, 10, 40, 55],
        }),
      ).toBe(true);
      for (const v of [
        [-1, 0, 12, 12],
        [20, 0, 10, 12],
        [0, 20, 12, 10],
        [0, 0, NaN, 12],
        [0, 0, 12],
      ])
        expect(
          validProperty(className, "SliceCenter", { type: "Rect", value: v }),
        ).toBe(false);
      expect(validProperty(className, "SliceScale", 0)).toBe(true);
      expect(validProperty(className, "SliceScale", -1)).toBe(false);
      for (const v of [
        [0, 0, 0, 24],
        [0, 0.5, 0, 24],
        [-1, 10, 0, 24],
        [0, 20, 0, 0],
      ])
        expect(
          validProperty(className, "TileSize", { type: "UDim2", value: v }),
        ).toBe(false);
      expect(
        validProperty(className, "TileSize", {
          type: "UDim2",
          value: [0.5, 12, 0, 24],
        }),
      ).toBe(true);
      expect(
        validProperty("Frame", "SliceCenter", {
          type: "Rect",
          value: [0, 0, 12, 12],
        }),
      ).toBe(false);
    },
  );
  it("uses actual PNG dimensions, not Figma dimensions or export estimates", () => {
    const result = imageScalingResult(),
      asset = result.package.assets.find((a) => a.nodeId === "sliced")!;
    asset.width = 20;
    asset.height = 20;
    asset.scale = 2;
    expect(pngPixelSize(result.assets[asset.id])).toEqual([64, 64]);
    const next = retainLinkedAssets(result, {
      ...result,
      package: structuredClone(result.package),
    });
    expect(
      next.package.assets.find((a) => a.id === asset.id)?.pixelSize,
    ).toEqual([64, 64]);
    expect(imageScalingIssues(next.package)).toEqual([]);
    const bytes = [...result.assets[asset.id]];
    bytes[0] = 0;
    expect(pngPixelSize(bytes)).toBeUndefined();
  });
  it("keeps corner dimensions constant while the center and edges stretch", () => {
    for (const [w, h] of [
      [240, 120],
      [480, 240],
      [200, 400],
    ]) {
      const patches = nineSlice([64, 64], [16, 16, 48, 48], 0.5, w, h);
      expect(patches).toHaveLength(9);
      expect(patches[0].source).toEqual([0, 0, 16, 16]);
      expect(patches[0].destination).toEqual([0, 0, 8, 8]);
      expect(patches[4].destination).toEqual([8, 8, w - 16, h - 16]);
      expect(patches[8].destination).toEqual([w - 8, h - 8, 8, 8]);
    }
  });
  it("handles asymmetric margins, zero borders and very small destinations without negative patches", () => {
    expect(
      nineSlice([64, 48], [8, 12, 40, 30], 2, 200, 100)[8].destination,
    ).toEqual([152, 64, 48, 36]);
    const small = nineSlice([64, 64], [16, 16, 48, 48], 2, 20, 10);
    expect(
      small.reduce((area, p) => area + p.destination[2] * p.destination[3], 0),
    ).toBe(200);
    expect(
      small.every((p) =>
        p.destination.every((n) => Number.isFinite(n) && n >= 0),
      ),
    ).toBe(true);
    expect(nineSlice([64, 64], [0, 0, 64, 64], 1, 200, 100)).toEqual([
      { source: [0, 0, 64, 64], destination: [0, 0, 200, 100] },
    ]);
    expect(nineSlice([64, 64], [0, 0, 0, 0], 1, 200, 100)).toEqual([]);
  });
  it("checks guide bounds and resolves tile scale against the image element", () => {
    expect(sliceProblem([16, 16, 80, 48], [64, 64])).toContain("beyond");
    expect(
      tileDimensions(
        { type: "UDim2", value: [0.5, 12.9, 0.25, 8.9] },
        240,
        160,
      ),
    ).toEqual([132, 48]);
    expect(tileDimensions(undefined, 240, 160)).toEqual([240, 160]);
  });
  it("preserves bulk-independent guide coordinates and rejects an inverted batch atomically", () => {
    const result = imageScalingResult(),
      node = flatten(result.package.roots).find((n) => n.id === "sliced")!;
    const layers = [
      { node },
      {
        node: {
          ...node,
          id: "second",
          properties: {
            ...node.properties,
            SliceCenter: { type: "Rect", value: [8, 10, 40, 42] } as Value,
          },
        },
      },
    ];
    const overrides = applyOverrideChanges(
      {},
      propertyChanges(layers, {}, "SliceCenter", 20, 2),
    );
    expect(overrides.second.properties?.SliceCenter).toEqual({
      type: "Rect",
      value: [8, 10, 20, 42],
    });
    expect(overrides.sliced.properties?.SliceCenter).toEqual({
      type: "Rect",
      value: [16, 16, 20, 48],
    });
    const before = JSON.stringify(overrides);
    expect(() =>
      propertyChanges(layers, overrides, "SliceCenter", 60, 0),
    ).toThrow("Invalid SliceCenter");
    expect(JSON.stringify(overrides)).toBe(before);
  });
  it("shows only the current image mode's controls in Common, with full search and changed access", () => {
    const schema = PROPERTY_SCHEMAS.ImageLabel;
    const names = (
      mode: string,
      view: "common" | "all" | "changed" = "common",
      query = "",
    ) =>
      propertiesForView(
        schema,
        view,
        query,
        { TileSize: { type: "UDim2", value: [0, 20, 0, 20] } },
        { ScaleType: { type: "Enum", value: ["ScaleType", mode] } },
      ).map(([name]) => name);
    expect(names("Stretch")).not.toContain("SliceCenter");
    expect(names("Slice")).toEqual(
      expect.arrayContaining(["SliceCenter", "SliceScale"]),
    );
    expect(names("Slice")).not.toContain("TileSize");
    expect(names("Tile")).toContain("TileSize");
    expect(names("Stretch", "all")).toContain("SliceCenter");
    expect(names("Stretch", "changed")).toEqual(["TileSize"]);
    expect(names("Stretch", "common", "slice")).toContain("SliceCenter");
  });
  it.each(SOURCE_FORMATS)(
    "exports $label slice/tile values and unchanged PNG artwork",
    ({ id }) => {
      const result = imageScalingResult(),
        before = JSON.stringify(result);
      const source = generateSource(result.package, id);
      expect(source).toContain(
        id === "tsx" ? "new Rect(16, 16, 48, 48)" : "Rect.new(16, 16, 48, 48)",
      );
      expect(source).toContain("TileSize");
      for (const asset of result.package.assets) asset.robloxId = undefined;
      const files = unzipSync(buildSourceExport(result, id).data);
      for (const asset of result.package.assets)
        expect(files[`images/${asset.filename}`]).toEqual(
          new Uint8Array(result.assets[asset.id]),
        );
      for (const asset of result.package.assets)
        asset.robloxId = "rbxassetid://284402752";
      expect(JSON.stringify(result)).toBe(before);
    },
  );
  it("round-trips guide overrides through JSON and model XML", () => {
    const result = imageScalingResult();
    const pkg = JSON.parse(JSON.stringify(result.package));
    expect(generateModel(pkg)).toContain(
      '<Rect2D name="SliceCenter"><min><X>16</X><Y>16</Y></min><max><X>48</X><Y>48</Y></max></Rect2D>',
    );
    expect(sourceValue({ type: "Rect", value: [12.5, 8, 40, 48] })).toBe(
      "Rect.new(12.5, 8, 40, 48)",
    );
  });
  it("blocks oversized guides consistently in model/source export and refreshes the review issue", () => {
    const result = imageScalingResult(),
      node = flatten(result.package.roots).find((n) => n.id === "sliced")!;
    node.properties.SliceCenter = { type: "Rect", value: [16, 16, 80, 48] };
    expect(imageScalingIssues(result.package)[0]).toMatchObject({
      code: "image-slice-bounds",
      severity: "error",
    });
    expect(() => generateModel(result.package)).toThrow("beyond");
    for (const format of SOURCE_FORMATS)
      expect(() => generateSource(result.package, format.id)).toThrow("beyond");
    retainLinkedAssets(undefined, result);
    node.properties.SliceCenter = { type: "Rect", value: [16, 16, 48, 48] };
    expect(
      retainLinkedAssets(result, result).package.issues.some(
        (i) => i.code === "image-slice-bounds",
      ),
    ).toBe(false);
  });
  it("rejects invalid texture metadata before inspecting its slice bounds", () => {
    const pkg = imageScalingResult().package;
    for (const pixelSize of [
      null,
      false,
      0,
      "",
      "64x64",
      [64],
      [64, 0],
      [64, Infinity],
      [64, 4097],
    ]) {
      pkg.assets[0].pixelSize = pixelSize as unknown as [number, number];
      expect(() => generateModel(pkg)).toThrow(
        "Invalid image pixel dimensions",
      );
    }
  });
});
