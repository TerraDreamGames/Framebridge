import { describe, it, expect } from "vitest";
import { PNG } from "./image-tools-fixtures";
import { decode } from "fast-png";
import { compile } from "../packages/core/src/compiler";
import { DEFAULT_OPTIONS, flatten } from "../packages/core/src/types";
import { preparePng } from "../packages/core/src/image-processing";
import {
  prepareScrollbars,
  scrollbarCandidates,
} from "../packages/core/src/scrollbar";
import { validateExportPackage } from "../packages/core/src/export-package";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { linkArtwork } from "../plugins/figma/src/asset-catalog";
import { retainLinkedAssets } from "../packages/core/src/editor";
import { validatePackage } from "../packages/relay/src/protocol";
import { node } from "../packages/core/src/demo";
import {
  scrollbarDesign,
  scrollbarOverrides,
  scrollbarResult,
  scrollbarPng,
} from "./scrollbar-fixtures";
const read = (b: Uint8Array) => PNG.sync.read(Buffer.from(b));
describe("reviewed native scrollbar artwork", () => {
  it("ignores document scrollbar overrides belonging to unselected screens", () => {
    const unrelated = node("Another selected screen", {
      id: "another-screen",
      children: [node("Content")],
    });
    expect(
      compile(
        [unrelated],
        "fixture",
        { layerOverrides: scrollbarOverrides() },
        "fixed",
      ),
    ).toEqual(compile([unrelated], "fixture", {}, "fixed"));
  });
  it("suggests thin named artwork without modifying source, class choices or exports", () => {
    const source = scrollbarDesign(),
      before = JSON.stringify(source),
      pkg = compile([source], "fixture", {}, "fixed");
    expect(scrollbarCandidates([source], "vertical")[0].source.id).toBe(
      "vertical-art",
    );
    expect(scrollbarCandidates([source], "horizontal")[0].source.id).toBe(
      "horizontal-art",
    );
    expect(JSON.stringify(source)).toBe(before);
    expect(
      compile(
        [source],
        "fixture",
        { layerOverrides: { vertical: { scrollbar: false } } },
        "fixed",
      ),
    ).toEqual(pkg);
    expect(
      flatten(pkg.roots).find((n) => n.id === "vertical-art")?.className,
    ).toBe("ImageLabel");
  });
  it("consumes confirmed artwork, preserves source and unrelated settings, and binds three native images per viewport", () => {
    const result = scrollbarResult(),
      nodes = flatten(result.package.roots),
      before = scrollbarDesign();
    expect(result.designs).toEqual([before]);
    expect(nodes.some((n) => n.id.endsWith("-art"))).toBe(false);
    for (const id of ["vertical", "horizontal"]) {
      const viewport = nodes.find((n) => n.id === id)!;
      expect(viewport.className).toBe("ScrollingFrame");
      expect(Object.keys(viewport.assetBindings!)).toEqual([
        "TopImage",
        "MidImage",
        "BottomImage",
      ]);
      expect(viewport.properties.ScrollBarThickness).toBe(8);
      expect(viewport.properties.ClipsDescendants).toBe(true);
    }
    expect(result.package.assets).toHaveLength(6);
    validateExportPackage(result.package);
  });
  it.each(["X", "Y"] as const)(
    "slices %s without lost or duplicated pixels and undoes horizontal native rotation",
    (axis) => {
      const raw = scrollbarPng(axis),
        original = read(raw),
        parts = [
          [0, 0.125],
          [0.125, 0.875],
          [0.875, 1],
        ];
      const rows: number[][] = [];
      for (const [start, end] of parts) {
        const sliced = read(preparePng(raw, undefined, { axis, start, end }));
        expect(sliced.width).toBe(8);
        expect(sliced.height).toBe((end - start) * 64);
        for (let y = 0; y < sliced.height; y++) {
          const row = [];
          for (let x = 0; x < 8; x++) {
            const sx = axis === "X" ? start * 64 + y : x,
              sy = axis === "X" ? 7 - x : start * 64 + y;
            const expected = Array.from(
              original.data.slice(
                (sy * original.width + sx) * 4,
                (sy * original.width + sx) * 4 + 4,
              ),
            );
            expect(
              Array.from(
                sliced.data.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4),
              ),
            ).toEqual(expected);
            row.push(...expected);
          }
          rows.push(row);
        }
      }
      expect(rows).toHaveLength(64);
      expect(raw).toEqual(scrollbarPng(axis));
    },
  );
  it("keeps 16-bit samples and alpha while slicing and preparing a white mask", () => {
    const raw = scrollbarPng("Y", 16),
      original = decode(raw);
    const image = decode(
      preparePng(
        raw,
        { whiteMask: true },
        { axis: "Y", start: 0.125, end: 0.875 },
      ),
    );
    expect(image.depth).toBe(16);
    for (let i = 0; i < image.data.length; i += 4) {
      expect(Array.from(image.data.slice(i, i + 3))).toEqual([
        65535, 65535, 65535,
      ]);
      expect(image.data[i + 3]).toBe(original.data[i + 8 * 8 * 4 + 3]);
    }
  });
  it("keeps missing and moderation notices until their own piece is linked", () => {
    const result = scrollbarResult(),
      pkg = result.package,
      assets = pkg.assets.filter((a) => a.nodeId === "vertical-art"),
      viewport = flatten(pkg.roots).find((n) => n.id === "vertical")!;
    linkArtwork(pkg, assets[0], "111", "MODERATION_STATE_REVIEWING");
    expect(viewport.properties.TopImage).toBe("rbxassetid://111");
    expect(
      pkg.issues.some(
        (i) => i.code === "asset-required" && i.nodeId === "vertical-art",
      ),
    ).toBe(true);
    linkArtwork(pkg, assets[1], "222", "MODERATION_STATE_APPROVED");
    expect(
      pkg.issues.some(
        (i) => i.code === "asset-moderation" && i.nodeName === assets[0].name,
      ),
    ).toBe(true);
    linkArtwork(pkg, assets[2], "333", "MODERATION_STATE_APPROVED");
    expect(
      pkg.issues.some(
        (i) => i.code === "asset-required" && i.nodeId === "vertical-art",
      ),
    ).toBe(false);
    expect(viewport.properties.BottomImage).toBe("rbxassetid://333");
  });
  it("retains unchanged linked slices across reanalysis and respects manual viewport bindings", () => {
    const previous = scrollbarResult();
    for (const [i, a] of previous.package.assets.entries())
      linkArtwork(
        previous.package,
        a,
        String(100 + i),
        "MODERATION_STATE_APPROVED",
      );
    const next = retainLinkedAssets(previous, scrollbarResult());
    expect(next.package.assets.every((a) => a.robloxId)).toBe(true);
    expect(
      flatten(next.package.roots).find((n) => n.id === "vertical")?.properties
        .TopImage,
    ).toBe("rbxassetid://100");
    const overrides = scrollbarOverrides();
    overrides.vertical.properties = { TopImage: "777" };
    const manual = retainLinkedAssets(
      previous,
      scrollbarResult(overrides),
      overrides,
    );
    expect(
      flatten(manual.package.roots).find((n) => n.id === "vertical")?.properties
        .TopImage,
    ).toBe("rbxassetid://777");
    const changed = scrollbarOverrides();
    changed.vertical.scrollbar && (changed.vertical.scrollbar.startCap = 0.25);
    const revised = retainLinkedAssets(previous, scrollbarResult(changed));
    expect(
      revised.package.assets.find((a) => a.nodeId === "vertical-art")?.robloxId,
    ).toBeUndefined();
  });
  it("emits real bound properties in every source format and ContentId fields in models", () => {
    const { package: pkg } = scrollbarResult(undefined, true);
    for (const format of SOURCE_FORMATS) {
      const code = generateSource(pkg, format.id);
      for (const key of ["TopImage", "MidImage", "BottomImage"])
        expect(code).toMatch(new RegExp(key + ".*image\\("));
    }
    const model = generateModel(pkg);
    for (const key of ["TopImage", "MidImage", "BottomImage"])
      expect(model).toContain(`<ContentId name="${key}"><url>rbxassetid://`);
    validatePackage(pkg);
  });
  it("moves a confirmed external content holder only in the export and preserves its global geometry", () => {
    const root = scrollbarDesign();
    root.children.push(
      node("Separate content", {
        id: "content",
        width: 200,
        height: 300,
        transform: [
          [1, 0, 20],
          [0, 1, 20],
        ],
        children: [node("Row", { id: "content-row" })],
      }),
    );
    const before = JSON.stringify(root),
      overrides = scrollbarOverrides();
    overrides.vertical.scrollbar &&
      (overrides.vertical.scrollbar.contentId = "content");
    const pkg = compile([root], "fixture", { layerOverrides: overrides });
    const viewport = flatten(pkg.roots).find((n) => n.id === "vertical")!;
    expect(
      viewport.children.find((n) => n.id === "content")?.properties.Position,
    ).toEqual({ type: "UDim2", value: [0, 0, 0, 0] });
    expect(flatten(pkg.roots).filter((n) => n.id === "content")).toHaveLength(
      1,
    );
    expect(JSON.stringify(root)).toBe(before);
  });
  it("rejects missing, overlapping, interactive or rasterized sources and malformed bindings before transfer", () => {
    const source = scrollbarDesign(),
      overrides = scrollbarOverrides();
    for (const change of [
      { artworkId: "missing" },
      { startCap: 0.9, endCap: 0.2 },
      { thickness: 0 },
      { artworkId: "scroll-root" },
      { axis: "XY" },
    ]) {
      const bad = structuredClone(overrides);
      Object.assign(bad.vertical.scrollbar!, change);
      expect(() =>
        prepareScrollbars([source], {
          ...DEFAULT_OPTIONS,
          layerOverrides: bad,
        }),
      ).toThrow();
    }
    const bad = structuredClone(overrides);
    bad["scroll-root"] = { renderMode: "image" };
    expect(() => compile([source], "fixture", { layerOverrides: bad })).toThrow(
      /editable/,
    );
    const pkg = scrollbarResult(undefined, true).package,
      viewport = flatten(pkg.roots).find((n) => n.id === "vertical")!;
    (viewport.assetBindings as Record<string, string>).Source = "arbitrary";
    expect(() => validatePackage(pkg)).toThrow();
    expect(() => validateExportPackage(pkg)).toThrow();
    expect(() =>
      preparePng(scrollbarPng(), undefined, {
        axis: "Y",
        start: 0,
        end: 0.001,
      }),
    ).toThrow(/pixel/);
  });
  it("accepts an empty viewport with external content without editing the source", () => {
    const source = scrollbarDesign(),
      overrides = scrollbarOverrides();
    const viewport = source.children.find((n) => n.id === "vertical")!;
    const content = node("Inventory content", {
      id: "content",
      width: 210,
      height: 300,
      children: viewport.children,
      transform: viewport.transform,
    });
    viewport.children = [];
    source.children.push(content);
    overrides.vertical.scrollbar &&
      (overrides.vertical.scrollbar.contentId = "content");
    const before = JSON.stringify(source);
    const options = { ...DEFAULT_OPTIONS, layerOverrides: overrides };
    expect(prepareScrollbars([source], options, true).designs[0]).toBe(source);
    const pkg = compile([source], "fixture", options);
    expect(
      flatten(pkg.roots)
        .find((n) => n.id === "vertical")
        ?.children.some((n) => n.id === "content"),
    ).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("rejects cycles and shared content owners before changing any hierarchy", () => {
    const source = scrollbarDesign(),
      cyclic = scrollbarOverrides();
    cyclic.vertical.scrollbar &&
      (cyclic.vertical.scrollbar.contentId = "horizontal");
    cyclic.horizontal.scrollbar &&
      (cyclic.horizontal.scrollbar.contentId = "vertical");
    const before = JSON.stringify(source);
    expect(() =>
      prepareScrollbars(
        [source],
        { ...DEFAULT_OPTIONS, layerOverrides: cyclic },
        true,
      ),
    ).toThrow(/cycle/);
    const shared = scrollbarOverrides();
    source.children.push(
      node("Shared content", { id: "shared", children: [node("Row")] }),
    );
    for (const override of Object.values(shared))
      if (override.scrollbar) override.scrollbar.contentId = "shared";
    expect(() =>
      compile([source], "fixture", { layerOverrides: shared }),
    ).toThrow(/only one/);
    source.children.pop();
    expect(JSON.stringify(source)).toBe(before);
  });
  it("allows manual non-thin artwork and rejects malformed slice metadata", () => {
    const source = scrollbarDesign();
    source.children.push(
      node("Round thumb", { id: "round", width: 16, height: 16 }),
    );
    expect(
      scrollbarCandidates([source], "vertical").some(
        (c) => c.source.id === "round",
      ),
    ).toBe(false);
    expect(
      scrollbarCandidates([source], "vertical", true).some(
        (c) => c.source.id === "round",
      ),
    ).toBe(true);
    for (const value of [
      null,
      { axis: "Y", start: 0, end: 1, unknown: true },
      { axis: "Y", start: 1, end: 0 },
    ]) {
      const pkg = scrollbarResult(undefined, true).package;
      (pkg.assets[0] as any).scrollbarSlice = value;
      expect(() => validateExportPackage(pkg)).toThrow();
      expect(() => validatePackage(pkg)).toThrow();
    }
  });
});
