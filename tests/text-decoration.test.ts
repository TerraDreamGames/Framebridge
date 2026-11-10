import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildSourceExport } from "../packages/core/src/source-export";
import { compile } from "../packages/core/src/compiler";
import { flatten, type RbxNode } from "../packages/core/src/types";
import { validateExportPackage } from "../packages/core/src/export-package";
import {
  validateTextDecorations,
  validTextDecoration,
  textDecorationBaseline,
} from "../packages/core/src/text-decoration";
import { validatePackage } from "../packages/relay/src/protocol";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { hasBehaviors } from "../packages/core/src/behaviors";
import { DEFAULT_THEMES } from "../packages/core/src/theme-tokens";
import { previewTextDecoration } from "../plugins/figma/src/text-decoration-preview";
import { effectDesign, effectPackage } from "./effect-decoration-fixtures";

const text = (roots: RbxNode[]) =>
  flatten(roots).find((n) => n.id === "effect:text")!;
const preview = (owner = text(effectPackage().roots)) =>
  previewTextDecoration(owner, owner.properties, [180, 40], true);

describe("editable glyph decoration", () => {
  it("keeps the authored capture while native text state agrees", () => {
    const pkg = effectPackage(),
      owner = text(pkg.roots);
    expect(owner.textDecoration?.baseline).toEqual(
      textDecorationBaseline(owner.properties),
    );
    expect(owner.textDecoration?.captured).toBe("effect:text/effect");
    expect(owner.textDecoration?.capturedAlpha).toBeCloseTo(0.4);
    expect(preview(owner)).toEqual({ captured: true, shadow: undefined });
    expect(hasBehaviors(pkg)).toBe(true);
    expect(() => validateExportPackage(pkg)).not.toThrow();
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it.each([
    { Text: "Current player: Ada" },
    { TextSize: 32 },
    {
      RichText: true,
      Text: '<b>Current</b> <font color="#ff0000" transparency=".3">runs</font>',
    },
    { TextTransparency: 0.75 },
    { BackgroundTransparency: 0.5 },
    { TextColor3: { type: "Color3", value: [0.2, 0.3, 0.4] } },
    {
      FontFace: {
        type: "Font",
        family: "rbxasset://fonts/families/GothamSSm.json",
        weight: "Bold",
        style: "Italic",
      },
    },
    { TextWrapped: false },
    { TextScaled: true },
    { MaxVisibleGraphemes: 2 },
  ])("replaces stale pixels with current glyphs for %j", (changes) => {
    const owner = text(effectPackage().roots);
    const before = { ...owner.properties };
    Object.assign(owner.properties, changes);
    const live = preview(owner);
    expect(live.captured).toBe(false);
    expect(live.shadow).toContain("0px 2px 8px rgba(51,128,255,");
    owner.properties = before;
    expect(preview(owner).captured).toBe(true);
  });
  it("follows responsive bounds and rich-run alpha", () => {
    const owner = text(effectPackage().roots);
    owner.textDecoration!.scaled = true;
    const live = previewTextDecoration(
      owner,
      owner.properties,
      [360, 80],
      true,
      0.5,
    );
    expect(live).toEqual({
      captured: false,
      shadow: "0px 4px 16px rgba(51,128,255,0.24)",
    });
    expect(
      previewTextDecoration(owner, owner.properties, [180, 40], false).captured,
    ).toBe(false);
  });
  it("bounds baseline UTF-8 bytes in Figma's ES-only sandbox", () => {
    const p = text(effectPackage().roots).properties;
    expect(
      textDecorationBaseline({ ...p, Text: "😀".repeat(2048) })?.text,
    ).toHaveLength(4096);
    expect(
      textDecorationBaseline({ ...p, Text: "😀".repeat(2049) }),
    ).toBeUndefined();
    expect(
      textDecorationBaseline({ ...p, Text: "é".repeat(4096) })?.text,
    ).toHaveLength(4096);
    expect(
      textDecorationBaseline({ ...p, Text: "é".repeat(4097) }),
    ).toBeUndefined();
  });
  it("starts with live glyphs when an explicit text override differs from Figma pixels", () => {
    const pkg = compile([effectDesign()], "edited", {
      layerOverrides: {
        "effect:text": { properties: { Text: "Already changed" } },
      },
    });
    const owner = text(pkg.roots);
    expect(owner.properties.Text).toBe("Already changed");
    expect(owner.textDecoration?.baseline).toBeUndefined();
    expect(preview(owner).captured).toBe(false);
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
  it("keeps theme shadow parameters editable and disables the rectangular engine shadow", () => {
    const pkg = compile([effectDesign()], "themes", {
      themes: DEFAULT_THEMES,
      layerOverrides: {
        "effect:text": { theme: { shadow: "elevated", font: "body" } },
      },
    });
    const owner = text(pkg.roots),
      shadow = owner.children.find(
        (n) => n.id === owner.textDecoration?.themeShadow,
      )!;
    expect(shadow.properties.Enabled).toBe(false);
    expect(owner.textDecoration?.baseline).toBeUndefined();
    const before = preview(owner).shadow;
    shadow.properties.Color = { type: "Color3", value: [1, 0, 0] };
    shadow.properties.Transparency = 0.25;
    expect(preview(owner).shadow).not.toBe(before);
    expect(preview(owner).shadow).toContain("rgba(255,0,0,");
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
  it("preserves metadata and trusted refresh runtime across every source format and model export", () => {
    const pkg = effectPackage();
    for (const { id } of SOURCE_FORMATS) {
      const source = generateSource(pkg, id);
      expect(source).toContain("FramebridgeTextDecoration");
      const files = unzipSync(
        buildSourceExport(
          { package: pkg, assets: {}, previews: {}, revision: 1 },
          id,
        ).data,
      );
      const runtime =
        id === "tsx"
          ? strFromU8(files["FramebridgeInteractions.luau"])
          : source;
      expect(runtime).toContain("FramebridgeTextDecorationHelper");
      expect(runtime).toContain("Live glyphs");
    }
    const model = generateModel(pkg);
    expect(model).toContain("FramebridgeTextDecoration");
    expect(model).toContain("Live glyphs");
  });
  it.each(["script", "source", "url", "callback"])(
    "rejects arbitrary %s metadata",
    (key) => {
      const pkg = effectPackage(),
        owner = text(pkg.roots);
      Object.assign(owner.textDecoration!, { [key]: "print('untrusted')" });
      expect(validTextDecoration(owner.textDecoration)).toBe(false);
      expect(() => validateExportPackage(pkg)).toThrow(
        "Invalid live text decoration",
      );
      expect(() => validatePackage(pkg)).toThrow("Invalid UI interaction data");
    },
  );
  it("rejects unrelated captures, unbounded values and malformed baselines", () => {
    for (const edit of [
      (n: RbxNode) => {
        n.textDecoration!.captured = "effect:container/effect";
      },
      (n: RbxNode) => {
        n.textDecoration!.shadows[0].radius = Infinity;
      },
      (n: RbxNode) => {
        n.textDecoration!.baseline!.text = "a".repeat(8193);
      },
      (n: RbxNode) => {
        n.textDecoration!.baseline!.size = 101;
      },
      (n: RbxNode) => {
        n.textDecoration!.capturedAlpha = -1;
      },
    ]) {
      const pkg = effectPackage();
      edit(text(pkg.roots));
      expect(() => validateExportPackage(pkg)).toThrow(
        "Invalid live text decoration",
      );
    }
    expect(
      textDecorationBaseline({
        ...text(effectPackage().roots).properties,
        Text: "a".repeat(8193),
      }),
    ).toBeUndefined();
  });
  it("reserves bounded helper instances before export, including optional text constraints", () => {
    const owner = text(effectPackage().roots);
    const many = Array.from({ length: 1025 }, (_, i) => ({
      ...structuredClone(owner),
      id: `owner-${i}`,
      children: [],
      textDecoration: {
        ...structuredClone(owner.textDecoration!),
        captured: undefined,
        capturedAlpha: undefined,
        baseline: undefined,
      },
    }));
    const underScreen = (children: RbxNode[]) => [
      {
        id: "screen",
        name: "Screen",
        className: "ScreenGui",
        properties: {},
        children,
      },
    ];
    expect(() => validateTextDecorations(underScreen(many))).toThrow(
      "4,096-glyph budget",
    );
    expect(() =>
      validateTextDecorations(underScreen(many.slice(0, 1024))),
    ).toThrow("15,000-instance");
    const manyShadows = many.slice(0, 128).map((n) => ({
      ...n,
      textDecoration: {
        ...n.textDecoration!,
        shadows: Array.from({ length: 8 }, () =>
          structuredClone(n.textDecoration!.shadows[0]),
        ),
      },
    }));
    // 4,096 labels also reserve strokes, text constraints and padding: 16,384 instances already exceeds the global cap.
    expect(() => validateTextDecorations(underScreen(manyShadows))).toThrow(
      "15,000-instance",
    );
    expect(() =>
      validateTextDecorations(underScreen(many.slice(0, 681))),
    ).not.toThrow();
    const nearlyFull = Array.from({ length: 14990 }, (_, i) => ({
      id: `frame-${i}`,
      className: "Frame",
      name: "Frame",
      properties: {},
      children: [],
    })) as RbxNode[];
    expect(() =>
      validateTextDecorations(underScreen([...nearlyFull, many[0]])),
    ).toThrow("15,000-instance");
    // Reserve both scripts, five host instances and four instances per native glyph layer.
    expect(() =>
      validateTextDecorations(
        underScreen([...nearlyFull.slice(0, 14976), many[0]]),
      ),
    ).toThrow("15,000-instance");
    expect(() =>
      validateTextDecorations(
        underScreen([...nearlyFull.slice(0, 14975), many[0]]),
      ),
    ).not.toThrow();
  });
  it("remaps captured helper identity in repeated text instances", () => {
    const design = effectDesign();
    design.children = [
      {
        ...design.children[0],
        id: "repeat",
        type: "TRANSFORM_GROUP",
        text: undefined,
        shadows: undefined,
        effects: undefined,
        children: [design.children[0]],
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
      },
    ];
    const pkg = compile([design], "repeat-shadow");
    const owners = flatten(pkg.roots).filter((n) => n.textDecoration);
    expect(owners).toHaveLength(3);
    for (const owner of owners)
      expect(owner.textDecoration?.captured).toBe(`${owner.id}/effect`);
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
});
