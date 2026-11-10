import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { flatten } from "../packages/core/src/types";
import { validateExportPackage } from "../packages/core/src/export-package";
import { validatePackage } from "../packages/relay/src/protocol";
import { applyLayerOverrides } from "../packages/core/src/editor";
import { entries as layerEntries } from "../plugins/figma/src/layer-entries";
import { hasBehaviors } from "../packages/core/src/behaviors";
import { imageReferences } from "../packages/core/src/image-bindings";
import { reconcileLayerSelection } from "../plugins/figma/src/layer-selection";
import { imageUseTarget } from "../plugins/figma/src/image-use-target";
import {
  decorationDesign,
  decorationPackage,
  texture,
} from "./decoration-fixtures";

describe("container background separation", () => {
  it("cleans generated artwork by default and lets its source owner opt out without whitening native backgrounds", () => {
    const defaults = decorationPackage();
    expect(
      defaults.assets.every((asset) => asset.processing?.edgeCleanup),
    ).toBe(true);
    const layerOverrides = Object.fromEntries(
      defaults.assets.map((asset) => [
        asset.nodeId,
        {
          imageProcessing: { edgeCleanup: false, whiteMask: true },
        },
      ]),
    );
    const disabled = compile([decorationDesign()], "decor", { layerOverrides });
    for (const asset of disabled.assets.filter((asset) => asset.renderMode)) {
      expect(asset.processing).toBeUndefined();
      expect(asset.id).not.toContain(":bleed-v2");
      expect(asset.id).not.toContain(":mask-v1");
    }
    expect(disabled.assets.filter((asset) => asset.renderMode)).toHaveLength(3);
    expect(() => validateExportPackage(disabled)).not.toThrow();
  });
  it("locates the editable owner of artwork folded out of the explorer", () => {
    const pkg = decorationPackage();
    const before = JSON.stringify(pkg);
    const asset = pkg.assets.find((asset) => asset.renderMode === "fills")!;
    const generated = flatten(pkg.roots).find((node) =>
      imageReferences(node).some(([, id]) => id === asset.id),
    )!;
    expect(generated.decorationRect).toBeDefined();
    const available: string[] = [];
    function collect(rows: ReturnType<typeof layerEntries>) {
      for (const row of rows) {
        available.push(row.node.id);
        collect(row.children);
      }
    }
    const result = {
      package: pkg,
      designs: [decorationDesign()],
      assets: {},
      previews: {},
      revision: 1,
    };
    collect(layerEntries(result));
    expect(available).not.toContain(generated.id);
    const target = imageUseTarget(result, asset)!;
    expect(target).toBe(asset.nodeId);
    expect(target).not.toBe(available[0]);
    expect(
      reconcileLayerSelection(
        {
          primary: target,
          ids: [target],
          anchor: target,
          sourceId: pkg.sourceId,
        },
        pkg.sourceId,
        available,
      ),
    ).toEqual({
      primary: target,
      ids: [target],
      anchor: target,
      sourceId: pkg.sourceId,
    });
    expect(JSON.stringify(pkg)).toBe(before);
  });
  it("selects the Frame owning a hidden background when analyzed alone", () => {
    const design = node("Radial background", {
      id: "129:1286",
      width: 260,
      height: 120,
      fills: [{ type: "GRADIENT_RADIAL" }],
      children: [node("Still a button", { id: "129:1287" })],
    });
    const pkg = compile([design], "radial-qa");
    const result = {
      package: pkg,
      designs: [design],
      assets: {},
      previews: {},
      revision: 1,
    };
    const asset = pkg.assets.find((a) => a.renderMode === "fills")!;
    const nodes = flatten(pkg.roots);
    expect(pkg.roots[0].id).toBe("screen:129:1286");
    expect(nodes.find((n) => n.id === asset.nodeId)?.className).toBe("Frame");
    expect(nodes.find((n) => n.assetRef === asset.id)?.id).toBe(
      "129:1286/decoration",
    );
    const target = imageUseTarget(result, asset);
    expect(target).toBe("129:1286");
    expect(target).not.toBe(pkg.roots[0].id);
  });
  it("keeps visible image uses on their actual image node", () => {
    const result = {
      package: decorationPackage(),
      designs: [decorationDesign()],
      assets: {},
      previews: {},
      revision: 1,
    };
    const asset = result.package.assets.find((a) => a.nodeId === "decor:icon")!;
    expect(imageUseTarget(result, asset)).toBe("decor:icon");
    expect(
      imageUseTarget(result, { ...asset, id: "image:no-longer-used" }),
    ).toBeUndefined();
  });
  it("retains scrolling, layout, cards and vector artwork as distinct native/asset objects", () => {
    const pkg = decorationPackage(),
      nodes = flatten(pkg.roots);
    const scroll = nodes.find((n) => n.id === "decor:scroll")!;
    expect(scroll.className).toBe("ScrollingFrame");
    expect(scroll.assetRef).toBeUndefined();
    expect(
      scroll.children.find((n) => n.id === "decor:scroll/decoration")?.assetRef,
    ).toBe("image:decor:scroll:bleed-v2:fills-v1");
    const content = nodes.find((n) => n.id === "decor:scroll/content")!;
    expect(content.children.filter((n) => n.sourceType)).toHaveLength(4);
    expect(content.children.some((n) => n.className === "UIListLayout")).toBe(
      true,
    );
    expect(content.children.some((n) => n.decorationRect)).toBe(false);
    expect(nodes.find((n) => n.id === "decor:icon")?.className).toBe(
      "ImageLabel",
    );
    expect(
      pkg.assets.find((a) => a.nodeId === "decor:icon")?.renderMode,
    ).toBeUndefined();
    expect(pkg.assets.filter((a) => a.renderMode === "fills")).toHaveLength(3);
    expect(hasBehaviors(pkg)).toBe(true);
    expect(() => validateExportPackage(pkg)).not.toThrow();
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("keeps button input on the native owner and applies group alpha only once", () => {
    const nodes = flatten(decorationPackage().roots);
    const button = nodes.find((n) => n.id === "decor:button")!;
    expect(button.className).toBe("ImageButton");
    expect(button.properties.Active).toBe(true);
    const image = button.children.find((n) => n.decorationRect)!;
    expect(image.properties.Active).toBe(false);
    expect(image.properties.Selectable).toBe(false);
    expect(
      nodes.find((n) => n.id === "decor:panel")?.properties.GroupTransparency,
    ).toBe(0.5);
    expect(
      nodes.find((n) => n.id === "decor:panel/decoration")?.properties
        .ImageTransparency,
    ).toBe(0);
  });
  it("keeps decoration geometry independent of rotation, crop and child transforms", () => {
    const design = decorationDesign();
    const panel = design.children[2];
    panel.decorationBounds = { x: -1, y: -2, width: 164, height: 104 };
    const before = JSON.stringify(design);
    const pkg = compile([design], "decor", { layout: "responsive" });
    const nodes = flatten(pkg.roots);
    expect(
      nodes.find((n) => n.id === panel.id + "/decoration")?.decorationRect,
    ).toEqual([-0.00625, -0.02, 1.025, 1.04]);
    expect(
      nodes.find((n) => n.id === "decor:content")?.properties.Position,
    ).toEqual({ type: "UDim2", value: [0, 20, 0, 20] });
    expect(nodes.find((n) => n.id === panel.id)?.properties.Size).toEqual({
      type: "UDim2",
      value: [0, 160, 0, 100],
    });
    expect(JSON.stringify(design)).toBe(before);
  });
  it("renders radial/hard-stop/stacked fills without flattening children", () => {
    for (const fills of [
      [{ type: "GRADIENT_RADIAL" }],
      [texture, { type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
    ]) {
      const pkg = compile(
        [
          node("Panel", {
            id: "panel",
            fills,
            children: [node("Child", { id: "child" })],
          }),
        ],
        "decor",
      );
      expect(flatten(pkg.roots).some((n) => n.id === "child")).toBe(true);
      expect(pkg.assets[0].renderMode).toBe("fills");
      expect(
        pkg.issues.some((i) => i.code === "appearance-approximation"),
      ).toBe(false);
    }
  });
  it("preserves explicit flattening choices and automatic standalone artwork", () => {
    for (const config of [
      { name: "Panel [raster]" },
      {
        name: "Panel",
        options: {
          layerOverrides: { panel: { renderMode: "image" as const } },
        },
      },
    ]) {
      const pkg = compile(
        [
          node(config.name, {
            id: "panel",
            fills: [texture],
            children: [node("Child", { id: "child" })],
          }),
        ],
        "decor",
        config.options,
      );
      expect(pkg.assets).toHaveLength(1);
      expect(pkg.assets[0].renderMode).toBeUndefined();
      expect(flatten(pkg.roots).some((n) => n.id === "child")).toBe(false);
    }
    expect(
      compile([node("Photo", { fills: [texture] })], "decor").assets[0]
        .renderMode,
    ).toBeUndefined();
  });
  it("does not pretend subtree blur or background-dependent blends are solved", () => {
    for (const properties of [
      { effects: ["LAYER_BLUR"] },
      { blendMode: "MULTIPLY" },
      { fills: [{ ...texture, blendMode: "OVERLAY" }] },
    ]) {
      const pkg = compile(
        [
          node("Panel", {
            id: "panel",
            fills: [texture],
            children: [node("Child", { id: "child" })],
            ...properties,
          }),
        ],
        "decor",
      );
      expect(flatten(pkg.roots).some((n) => n.id === "child")).toBe(true);
      expect(
        pkg.issues.some((i) => i.code === "appearance-approximation"),
      ).toBe(true);
    }
  });
  it("keeps internal backgrounds out of the Figma layer tree and protects their metadata", () => {
    const pkg = decorationPackage();
    const result = {
      package: pkg,
      designs: [decorationDesign()],
      previews: {},
      assets: {},
      revision: 1,
    };
    const ids: string[] = [];
    const walk = (entries: ReturnType<typeof layerEntries>) =>
      entries.forEach((e) => {
        ids.push(e.node.id);
        walk(e.children);
      });
    walk(layerEntries(result));
    expect(ids.some((id) => id.endsWith("/decoration"))).toBe(false);
    applyLayerOverrides(pkg, {
      "decor:scroll/decoration": {
        renderMode: "skip",
        properties: { Active: true },
      },
    });
    expect(
      flatten(pkg.roots).find((n) => n.id === "decor:scroll/decoration")
        ?.properties.Active,
    ).toBe(false);
  });
  it.each(["owner", "interactive", "bounds", "mode"])(
    "rejects tampered %s metadata at source and relay boundaries",
    (kind) => {
      const pkg = decorationPackage(),
        decoration = flatten(pkg.roots).find((n) => n.decorationRect)!;
      if (kind === "owner") decoration.id = "someone-else/decoration";
      if (kind === "interactive") decoration.properties.Active = true;
      if (kind === "bounds") decoration.decorationRect![2] = -1;
      if (kind === "mode") (pkg.assets[0] as any).renderMode = "execute";
      expect(() => validateExportPackage(pkg)).toThrow();
      expect(() => validatePackage(pkg)).toThrow();
    },
  );
});
