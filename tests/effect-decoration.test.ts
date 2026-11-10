import { describe, expect, it } from "vitest";
import { PNG } from "./image-tools-fixtures";
import {
  drop,
  effectDesign,
  effectPackage,
} from "./effect-decoration-fixtures";
import {
  EFFECT_ERROR,
  extractShadowPng,
} from "../packages/core/src/effect-pixels";
import {
  needsShadowDecoration,
  paintBlendBackdrop,
} from "../packages/core/src/decoration";
import { compile } from "../packages/core/src/compiler";
import { flatten, type LayerOverride } from "../packages/core/src/types";
import { validateExportPackage } from "../packages/core/src/export-package";
import { validatePackage } from "../packages/relay/src/protocol";
import {
  generateSource,
  SOURCE_FORMATS,
  sourceAssetManifest,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { applyLayerOverrides } from "../packages/core/src/editor";
import { node } from "../packages/core/src/demo";
import { DEFAULT_THEMES } from "../packages/core/src/theme-tokens";
const png = (samples: number[], width = samples.length / 4, height = 1) =>
  PNG.sync.write({ width, height, data: Uint8Array.from(samples) });
describe("bounded normal drop effect extraction", () => {
  it("reconstructs an under-composited color/alpha effect while omitting opaque hidden pixels", async () => {
    const base = [0, 0, 0, 0, 200, 80, 20, 128, 20, 80, 200, 255],
      shadow = [40, 100, 220, 128];
    const full: number[] = [];
    for (let i = 0; i < base.length; i += 4) {
      const a = base[i + 3] / 255,
        e = shadow[3] / 255,
        fa = a + e * (1 - a);
      full.push(
        ...[0, 1, 2].map((c) =>
          Math.round(
            (((base[i + c] / 255) * a + (shadow[c] / 255) * e * (1 - a)) / fa) *
              255,
          ),
        ),
        Math.round(fa * 255),
      );
    }
    const extracted = await extractShadowPng(png(full), png(base));
    expect(extracted.maxError).toBeLessThanOrEqual(EFFECT_ERROR);
    expect(extracted.opaquePixels).toBe(1);
    const output = PNG.sync.read(Buffer.from(extracted.bytes));
    expect(Array.from(output.data.slice(0, 4))).toEqual(shadow);
    expect(Array.from(output.data.slice(8, 12))).toEqual([0, 0, 0, 0]);
  });
  it("rejects mismatched geometry, changed opaque source, invalid PNG and oversized pixels before decoding", async () => {
    await expect(
      extractShadowPng(png([0, 0, 0, 0]), png([0, 0, 0, 0, 0, 0, 0, 0])),
    ).rejects.toThrow(/identical pixel/);
    await expect(
      extractShadowPng(png([255, 0, 0, 255]), png([0, 0, 0, 255])),
    ).rejects.toThrow(/reconstruction limit/);
    await expect(
      extractShadowPng(new Uint8Array(10), png([0, 0, 0, 0])),
    ).rejects.toThrow(/valid PNG/);
    const big = Buffer.from(png([0, 0, 0, 0]));
    big.writeUInt32BE(4096, 16);
    big.writeUInt32BE(4096, 20);
    await expect(extractShadowPng(big, big)).rejects.toThrow(/4 million/);
  });
  it("yields to cancellation before encoding output", async () => {
    let checks = 0;
    await expect(
      extractShadowPng(png([0, 0, 0, 128]), png([0, 0, 0, 0]), () => {
        if (++checks === 2) throw Error("cancelled");
      }),
    ).rejects.toThrow("cancelled");
  });
  it.each([0, 0.25, 0.6, 1])(
    "reconstructs text OVER-order at source opacity %s without doubling layer alpha",
    async (opacity) => {
      const base = [0, 0, 0, 0, 200, 80, 20, 128, 20, 80, 200, 255],
        effect = [40, 100, 220, 128];
      const full: number[] = [];
      for (let i = 0; i < base.length; i += 4) {
        const b = base[i + 3] / 255,
          e = effect[3] / 255,
          f = b + e * (1 - b);
        full.push(
          ...[0, 1, 2].map((c) =>
            Math.round(
              (((base[i + c] / 255) * b + (effect[c] / 255) * e * (1 - b)) /
                f) *
                255,
            ),
          ),
          Math.round(f * 255),
        );
      }
      const result = await extractShadowPng(png(full), png(base), () => {}, {
        order: "above",
        opacity,
      });
      const out = PNG.sync.read(Buffer.from(result.bytes)).data;
      expect(Array.from(out.slice(8, 12))).toEqual([0, 0, 0, 0]);
      for (let i = 0; i < base.length; i += 4) {
        const b = (base[i + 3] / 255) * opacity,
          e = (out[i + 3] / 255) * opacity,
          f = (full[i + 3] / 255) * opacity;
        expect(Math.abs(e + (1 - e) * b - f)).toBeLessThanOrEqual(EFFECT_ERROR);
        for (let c = 0; c < 3; c++) {
          const composed =
            (out[i + c] / 255) * e + (((1 - e) * base[i + c]) / 255) * b;
          expect(
            Math.abs(composed - (full[i + c] / 255) * f),
          ).toBeLessThanOrEqual(EFFECT_ERROR);
        }
      }
    },
  );
});
describe("editable effect and frozen paint topology", () => {
  it.each(["Frame", "button", "scroll"])(
    "declines partial %s effect layers while retaining native children and allows full opacity",
    (kind) => {
      for (const opacity of [0.5, 1]) {
        const design = effectDesign();
        design.children[1].opacity = opacity;
        if (kind === "button")
          design.children[1].name = "Partial image purchase [button]";
        const pkg = effectPackage(
          {
            layerOverrides:
              kind === "button"
                ? {}
                : {
                    "effect:container": {
                      className: kind === "Frame" ? "Frame" : "ScrollingFrame",
                    },
                  },
          },
          design,
        );
        const owner = flatten(pkg.roots).find(
          (n) => n.id === "effect:container",
        )!;
        expect(owner.className).toBe(
          kind === "Frame"
            ? "Frame"
            : kind === "button"
              ? "ImageButton"
              : "ScrollingFrame",
        );
        expect(owner.children.some((n) => n.id === "effect:child")).toBe(true);
        expect(
          owner.children.some((n) => n.id === "effect:container/effect"),
        ).toBe(opacity === 1);
        expect(
          pkg.issues.some(
            (i) =>
              i.nodeId === owner.id && i.code === "effect-opacity-fallback",
          ),
        ).toBe(opacity < 1);
        expect(() => validateExportPackage(pkg)).not.toThrow();
      }
    },
  );
  it("warns for combined own paint blends/drops and declines text replaced with a non-text class", () => {
    const design = effectDesign(),
      blend = design.children[2].children[0];
    blend.shadows = [drop];
    blend.effects = ["DROP_SHADOW"];
    const pkg = effectPackage(
      { layerOverrides: { "effect:text": { className: "Frame" } } },
      design,
    );
    expect(
      pkg.assets.some(
        (a) => a.nodeId === "effect:text" && a.renderMode === "shadow",
      ),
    ).toBe(false);
    expect(
      pkg.assets.some(
        (a) => a.nodeId === blend.id && a.renderMode === "shadow",
      ),
    ).toBe(false);
    expect(
      pkg.issues.some(
        (i) => i.nodeId === blend.id && i.code === "blend-drop-fallback",
      ),
    ).toBe(true);
  });
  it("honors disabled shadows and uses live glyph contours for text shadow themes", () => {
    for (const binding of [false, "elevated"] as const) {
      const pkg = compile([effectDesign()], "themes", {
        themes: DEFAULT_THEMES,
        layerOverrides: {
          "effect:text": binding
            ? { theme: { shadow: binding } }
            : { components: { shadow: false } },
        },
      });
      expect(
        pkg.assets.some(
          (a) => a.nodeId === "effect:text" && a.renderMode === "shadow",
        ),
      ).toBe(false);
      const owner = flatten(pkg.roots).find((n) => n.id === "effect:text")!;
      expect(owner.children.some((n) => n.id === "effect:text/effect")).toBe(
        false,
      );
      if (binding) {
        expect(
          owner.children.some((n) => n.className === "UIShadow" && n.theme),
        ).toBe(true);
        expect(owner.textDecoration?.themeShadow).toBeDefined();
        expect(owner.textDecoration?.baseline).toBeUndefined();
        expect(
          owner.children.find((n) => n.className === "UIShadow")?.properties
            .Enabled,
        ).toBe(false);
      }
      expect(() => validateExportPackage(pkg)).not.toThrow();
    }
  });
  it("declines theme-owned and manually overridden parent backdrops", () => {
    const edits: LayerOverride[] = [
      { theme: { background: "surface" } },
      { properties: { BackgroundTransparency: 0.2 } },
      {
        properties: {
          BackgroundColor3: {
            type: "Color3" as const,
            value: [0.2, 0.3, 0.4] as [number, number, number],
          },
        },
      },
    ];
    for (const edit of edits) {
      const pkg = compile([effectDesign()], "themes", {
        themes: DEFAULT_THEMES,
        layerOverrides: { "effect:flat": edit },
      });
      expect(pkg.assets.some((a) => a.renderMode === "blend")).toBe(false);
      expect(
        flatten(pkg.roots).some((n) => n.id === "effect:blend-child"),
      ).toBe(true);
    }
  });
  it("rejects rule-owned background colors while preserving live editable descendants", () => {
    const pkg = compile([effectDesign()], "rules", {
      layerOverrides: {
        "effect:root": {
          behavior: {
            rules: [
              {
                id: "backdrop",
                branches: [
                  {
                    when: {
                      mode: "all",
                      predicates: [
                        {
                          source: "attribute",
                          key: "Alternate",
                          operator: "eq",
                          value: true,
                        },
                      ],
                    },
                    then: [
                      {
                        target: "effect:flat",
                        property: "BackgroundColor3",
                        value: { type: "Color3", value: [0.1, 0.2, 0.3] },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    });
    expect(pkg.assets.some((a) => a.renderMode === "blend")).toBe(false);
    expect(flatten(pkg.roots).some((n) => n.id === "effect:blend-child")).toBe(
      true,
    );
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
  it("explains frozen content, CanvasGroup clipping and standalone external-backdrop limits", () => {
    const pkg = effectPackage();
    expect(
      pkg.issues.some(
        (i) =>
          i.nodeId === "effect:container" && i.code === "clipped-drop-effect",
      ),
    ).toBe(true);
    expect(
      pkg.issues.some(
        (i) =>
          i.nodeId === "effect:text" &&
          i.code === "live-text-decoration" &&
          i.message.includes("Live edits, bindings"),
      ),
    ).toBe(true);
    const design = effectDesign();
    const vector = design.children[2].children[0];
    vector.type = "VECTOR";
    vector.children = [];
    const standalone = compile([design], "standalone");
    expect(
      standalone.assets.find((a) => a.nodeId === vector.id)?.renderMode,
    ).toBeUndefined();
    expect(
      standalone.issues.some(
        (i) => i.nodeId === vector.id && i.code === "blend-backdrop-fallback",
      ),
    ).toBe(true);
  });
  it("expands effects in linear repeats with canonical owner/helper IDs and shared artwork", () => {
    const item = effectDesign().children[0];
    item.transform = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    const group = node("Repeated effects", {
      id: "effect:repeat",
      type: "TRANSFORM_GROUP",
      width: 600,
      height: 50,
      transformModifiers: [
        {
          type: "REPEAT",
          repeatType: "LINEAR",
          count: 3,
          unitType: "PIXELS",
          offset: 200,
          axis: "HORIZONTAL",
        },
      ],
      children: [item],
    });
    const pkg = compile([group], "repeat");
    pkg.assets.forEach((asset) => {
      asset.robloxId = "123";
    });
    const helpers = flatten(pkg.roots).filter((n) => n.decorationRect);
    expect(helpers).toHaveLength(3);
    expect(new Set(helpers.map((n) => n.assetRef)).size).toBe(1);
    expect(() => validateExportPackage(pkg)).not.toThrow();
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("keeps text, container child, input, alpha and native box shadows with distinct trusted effect assets", () => {
    const pkg = effectPackage(),
      all = flatten(pkg.roots),
      text = all.find((n) => n.id === "effect:text")!,
      container = all.find((n) => n.id === "effect:container")!;
    expect(text.className).toBe("TextLabel");
    expect(text.properties.Text).toBe("Editable glow");
    expect(
      all.find((n) => n.id === "effect:text/effect")?.decorationRect,
    ).toEqual([-0.06667, -0.2, 1.13333, 1.5]);
    expect(text.children.some((n) => n.className === "UIShadow")).toBe(false);
    expect(container.className).toBe("CanvasGroup");
    expect(container.properties.GroupTransparency).toBe(0.5);
    expect(
      all.find((n) => n.id === "effect:container/effect")?.properties
        .ImageTransparency,
    ).toBe(0);
    expect(all.find((n) => n.id === "effect:child")).toBeDefined();
    expect(all.find((n) => n.id === "effect:blend")?.properties.Active).toBe(
      true,
    );
    expect(pkg.assets.filter((a) => a.renderMode === "shadow")).toHaveLength(2);
    expect(pkg.assets.find((a) => a.renderMode === "blend")?.backdrop).toEqual([
      0.25, 0.5, 0.75,
    ]);
    expect(all.find((n) => n.id === "effect:box/shadow")?.className).toBe(
      "UIShadow",
    );
    expect(() => validateExportPackage(pkg)).not.toThrow();
    expect(() => validatePackage(pkg)).not.toThrow();
    expect(sourceAssetManifest(pkg).assets.some((a) => "backdrop" in a)).toBe(
      true,
    );
    for (const f of SOURCE_FORMATS)
      expect(generateSource(pkg, f.id)).toContain("FramebridgeDecorationRect");
    const attributes = [
      ...generateModel(pkg).matchAll(
        /<BinaryString name="AttributesSerialize">([^<]+)<\/BinaryString>/g,
      ),
    ].map((match) => Buffer.from(match[1], "base64").toString("utf8"));
    expect(
      attributes.some((value) => value.includes("effect:text/effect")),
    ).toBe(true);
    applyLayerOverrides(pkg, {
      "effect:text/effect": {
        properties: { Active: true },
        renderMode: "skip",
      },
      "effect:text": { properties: { Text: "Changed live" } },
    });
    expect(
      all.find((n) => n.id === "effect:text/effect")?.properties.Active,
    ).toBe(false);
    expect(
      flatten(pkg.roots).find((n) => n.id === "effect:text")?.properties.Text,
    ).toBe("Changed live");
  });
  it.each([
    "inner",
    "blur",
    "effect-blend",
    "layer-blend",
    "pixels",
    "native-stroke",
    "text-stroke",
    "display-p3",
  ])("keeps unsupported %s explicit", (kind) => {
    const design = effectDesign(),
      text = design.children[0];
    if (kind === "inner") {
      text.effects = ["INNER_SHADOW"];
      text.shadows = [{ ...drop, type: "INNER_SHADOW" }];
    }
    if (kind === "blur") text.effects!.push("LAYER_BLUR");
    if (kind === "effect-blend")
      text.shadows![0] = { ...drop, blendMode: "MULTIPLY" };
    if (kind === "layer-blend") text.blendMode = "MULTIPLY";
    if (kind === "text-stroke")
      text.strokes = [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }];
    if (kind === "display-p3") text.colorProfile = "DISPLAY_P3";
    if (kind === "pixels") {
      text.width = 4096;
      text.height = 4096;
    }
    if (kind === "native-stroke") {
      text.text = undefined;
      text.type = "FRAME";
      text.fills = [];
      text.strokes = [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }];
      text.strokeWeight = 2;
      text.children = [
        node("Native child", { id: "stroked-child", width: 10, height: 10 }),
      ];
    }
    expect(needsShadowDecoration(text)).toBe(false);
    const pkg = compile([design], "effect");
    expect(
      pkg.assets.some((a) => a.nodeId === text.id && a.renderMode === "shadow"),
    ).toBe(false);
    expect(
      pkg.issues.some(
        (i) => i.nodeId === text.id && i.code === "appearance-approximation",
      ),
    ).toBe(true);
  });
  it.each([
    "gradient",
    "opacity",
    "overlap",
    "round",
    "out-of-bounds",
    "layer",
    "display-p3",
  ])("rejects unknown %s backdrop", (kind) => {
    const design = effectDesign(),
      parent = design.children[2],
      blend = parent.children[0];
    if (kind === "gradient") parent.fills = [{ type: "GRADIENT_RADIAL" }];
    if (kind === "opacity") parent.opacity = 0.5;
    if (kind === "overlap")
      parent.children.push(
        node("Overlap", { id: "overlap", width: 50, height: 50 }),
      );
    if (kind === "round") parent.radius = 16;
    if (kind === "out-of-bounds") blend.transform[0][2] = -10;
    if (kind === "layer") parent.blendMode = "MULTIPLY";
    if (kind === "display-p3") parent.colorProfile = "DISPLAY_P3";
    expect(paintBlendBackdrop(blend, parent)).toBeUndefined();
    const pkg = compile([design], "effect");
    expect(
      pkg.assets.some((a) => a.nodeId === blend.id && a.renderMode === "blend"),
    ).toBe(false);
    expect(flatten(pkg.roots).some((n) => n.id === "effect:blend-child")).toBe(
      true,
    );
  });
  it.each(["identity", "input", "mode", "backdrop", "prepare"])(
    "rejects tampered %s at source/relay",
    (kind) => {
      const pkg = effectPackage(),
        helper = flatten(pkg.roots).find((n) => n.id === "effect:text/effect")!,
        asset = pkg.assets.find((a) => a.id === helper.assetRef)!;
      if (kind === "identity") helper.id = "other/effect";
      if (kind === "input") helper.properties.Active = true;
      if (kind === "mode") asset.renderMode = "fills";
      if (kind === "backdrop")
        pkg.assets.find((a) => a.renderMode === "blend")!.backdrop![0] =
          Infinity;
      if (kind === "prepare") asset.processing = { whiteMask: true };
      expect(() => validateExportPackage(pkg)).toThrow();
      expect(() => validatePackage(pkg)).toThrow();
    },
  );
});
