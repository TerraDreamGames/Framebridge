import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node, demoDesign } from "../packages/core/src/demo";
import {
  axisConstraint,
  geometry,
  validAssetId,
} from "../packages/core/src/geometry";
import { flatten, type DesignNode } from "../packages/core/src/types";
const child = (props: Partial<DesignNode> = {}) =>
  node("Child", {
    id: "child",
    width: 80,
    height: 40,
    transform: [
      [1, 0, 20],
      [0, 1, 30],
    ],
    ...props,
  });
const parent = (children: DesignNode[]) =>
  node("Root", { id: "root", width: 400, height: 300, children });
const converted = (n: DesignNode, options = {}) =>
  compile([n], "source", options, "2026-09-27T00:00:00Z");
const find = (n: DesignNode, id: string, options = {}) =>
  flatten(converted(n, options).roots).find((n) => n.id === id)!;
describe("geometry and constraints", () => {
  it("corrects origin-based rotation to Roblox center rotation", () => {
    expect(
      geometry(
        [
          [0, -1, 120],
          [1, 0, 30],
        ],
        80,
        40,
      ),
    ).toEqual({ x: 60, y: 50, rotation: 90, skewed: false });
  });
  it("does not flag pure rotations as skew", () => {
    const c = Math.cos(0.7),
      s = Math.sin(0.7);
    expect(
      geometry(
        [
          [c, -s, 4],
          [s, c, 8],
        ],
        55,
        99,
      ).skewed,
    ).toBe(false);
  });
  it("detects reflections", () =>
    expect(
      geometry(
        [
          [-1, 0, 4],
          [0, 1, 8],
        ],
        55,
        99,
      ).skewed,
    ).toBe(true));
  it.each([
    ["MIN", [0, 20, 0, 80]],
    ["MAX", [1, -380, 0, 80]],
    ["CENTER", [0.5, -180, 0, 80]],
    ["STRETCH", [0, 20, 1, -320]],
    ["SCALE", [0.05, 0, 0.2, 0]],
  ] as const)(
    "maps %s constraints preserving authored geometry",
    (mode, expected) =>
      expect(axisConstraint(mode, 20, 80, 400)).toEqual(expected),
  );
  it("prevents division by zero", () =>
    expect(axisConstraint("SCALE", 20, 80, 0)).toEqual([0, 20, 0, 80]));
  it("preserves child constraint behavior after parent resize", () => {
    const n = child({
      constraints: { horizontal: "MAX", vertical: "STRETCH" },
    });
    const p = find(parent([n]), "child", { layout: "responsive" }).properties;
    expect(p.Position).toEqual({ type: "UDim2", value: [1, -380, 0, 30] });
    expect(p.Size).toEqual({ type: "UDim2", value: [0, 80, 1, -260] });
  });
});
describe("native and raster conversion", () => {
  it("produces deterministic, unique identities", () => {
    const a = compile(demoDesign(), "same", {}, "fixed"),
      b = compile(demoDesign(), "same", {}, "fixed");
    expect(a).toEqual(b);
    expect(new Set(flatten(a.roots).map((n) => n.id)).size).toBe(
      a.stats.instances,
    );
  });
  it("omits hidden and skipped subtrees", () => {
    const pkg = converted(
      parent([
        child({ visible: false }),
        child({
          id: "skip",
          name: "Ignore [skip]",
          children: [child({ id: "nested" })],
        }),
      ]),
    );
    expect(flatten(pkg.roots).map((n) => n.id)).toEqual([
      "screen:root",
      "root",
    ]);
  });
  it("can retain hidden layers without making them visible", () => {
    expect(
      find(parent([child({ visible: false })]), "child", {
        includeHidden: true,
      }).properties.Visible,
    ).toBe(false);
  });
  it("makes explicit buttons without guessing interactions", () => {
    const c = find(parent([child({ name: "Buy [button]" })]), "child");
    expect(c.className).toBe("TextButton");
    expect(c.name).toBe("Buy");
    expect(c.properties.Text).toBe("");
  });
  it("flattens unsupported artwork and does not also export descendants", () => {
    const pkg = converted(
      parent([child({ type: "VECTOR", children: [child({ id: "inside" })] })]),
    );
    expect(pkg.assets).toHaveLength(1);
    expect(flatten(pkg.roots).some((n) => n.id === "inside")).toBe(false);
    expect(pkg.issues.some((i) => i.code === "asset-required")).toBe(true);
  });
  it("does not double-apply opacity or rotation on PNGs", () => {
    const n = child({
      type: "VECTOR",
      opacity: 0.4,
      transform: [
        [0, -1, 80],
        [1, 0, 20],
      ],
      rasterBounds: { x: 35, y: 10, width: 54, height: 105 },
    });
    const c = find(parent([n]), "child");
    expect(c.properties.Rotation).toBe(0);
    expect(c.properties.ImageTransparency).toBe(0);
    expect(c.properties.Size).toEqual({
      type: "UDim2",
      value: [0, 54, 0, 105],
    });
    expect(c.properties.Position).toEqual({
      type: "UDim2",
      value: [0, 35, 0, 10],
    });
  });
  it("emits actionable approximation notices in editable mode", () => {
    const pkg = converted(parent([child({ effects: ["DROP_SHADOW"] })]), {
      appearance: "editable",
    });
    expect(pkg.assets).toHaveLength(0);
    expect(pkg.issues.some((i) => i.code === "appearance-approximation")).toBe(
      true,
    );
  });
  it("uses CanvasGroup for composite parent opacity", () => {
    const n = parent([child()]);
    n.opacity = 0.5;
    const root = find(n, "root");
    expect(root.className).toBe("CanvasGroup");
    expect(root.properties.GroupTransparency).toBe(0.5);
    expect(find(n, "child").properties.BackgroundTransparency).toBe(1);
  });
  it("maps gradients to white base with independent stop transparency", () => {
    const n = child({
      fills: [
        {
          type: "GRADIENT_LINEAR",
          gradientTransform: [
            [1, 0, 0],
            [0, 1, 0],
          ],
          gradientStops: [
            { position: 0.2, color: { r: 1, g: 0, b: 0, a: 0.3 } },
            { position: 0.8, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        },
      ],
    });
    const c = find(parent([n]), "child");
    expect(c.children[0].className).toBe("UIGradient");
    expect(c.children[0].properties.Transparency).toEqual({
      type: "NumberSequence",
      value: [
        [0, 0.7],
        [0.2, 0.7],
        [0.8, 0],
        [1, 0],
      ],
    });
  });
  it("keeps arbitrary gradient transforms in raster fallback", () => {
    const n = child({
      fills: [
        {
          type: "GRADIENT_LINEAR",
          gradientTransform: [
            [0.8, 0.5, 0.2],
            [0, 1, 0],
          ],
        },
      ],
    });
    expect(converted(parent([n])).assets).toHaveLength(1);
  });
  it("validates Roblox IDs without number precision loss", () => {
    expect(validAssetId(" 12345678901234567 ")).toBe(
      "rbxassetid://12345678901234567",
    );
    expect(validAssetId("rbxassetid://42")).toBe("rbxassetid://42");
    for (const v of ["0", "-2", "https://evil.example", "42x", "1e6"])
      expect(validAssetId(v)).toBeUndefined();
  });
});
describe("typography", () => {
  const text = () =>
    child({
      type: "TEXT",
      text: {
        characters: 'Hello <world> & "game"',
        align: "LEFT",
        verticalAlign: "TOP",
        runs: [
          {
            text: "Hello <world>",
            fontFamily: "Roboto",
            fontStyle: "Bold",
            fontSize: 16,
            color: { r: 1, g: 0, b: 0 },
          },
          {
            text: ' & "game"',
            fontFamily: "Roboto",
            fontStyle: "Italic",
            fontSize: 18,
            color: { r: 0, g: 0, b: 1 },
          },
        ],
      },
    });
  it("escapes user text in rich text", () => {
    const p = find(parent([text()]), "child").properties;
    expect(p.RichText).toBe(true);
    expect(p.Text).toContain("&lt;world&gt;");
    expect(p.Text).toContain("&amp; &quot;game&quot;");
    expect(p.Text).toContain('weight="Bold"');
  });
  it("makes font substitution explicit and supports custom font assets", () => {
    const n = text();
    n.text!.runs[0].fontFamily = "Inter";
    expect(
      converted(parent([n])).issues.some((i) => i.code === "font-substitution"),
    ).toBe(true);
    expect(
      converted(parent([n]), { fontIds: { Inter: "123" } }).issues.some(
        (i) => i.code === "font-substitution",
      ),
    ).toBe(false);
  });
  it("avoids text scaling that would change Figma font sizes", () =>
    expect(find(parent([text()]), "child").properties.TextScaled).toBe(false));
  it("preserves native text, its gradient and outline despite a shadow", () => {
    const n = text();
    n.text!.characters = "Materials";
    n.text!.runs = [
      {
        text: "Materials",
        fontFamily: "Roboto",
        fontStyle: "Bold",
        fontSize: 64,
      },
    ];
    n.fills = [
      {
        type: "GRADIENT_LINEAR",
        gradientTransform: [
          [0, 1, 0],
          [-22.2784, 0, 11.6392],
        ],
        gradientStops: [
          { position: 0, color: { r: 0.9375, g: 0.7617, b: 0.7617, a: 1 } },
          { position: 1, color: { r: 0.7837, g: 0.7274, b: 0.6631, a: 1 } },
        ],
      },
    ];
    n.effects = ["DROP_SHADOW"];
    n.strokes = [{ type: "SOLID", color: { r: 0.1779, g: 0, b: 0.003 } }];
    n.strokeWeight = 4;
    const pkg = converted(parent([n]));
    const label = flatten(pkg.roots).find((x) => x.id === "child")!;
    expect(label.className).toBe("TextLabel");
    expect(label.sourceType).toBe("TEXT");
    expect(label.properties.Text).toBe("Materials");
    expect(label.properties.TextColor3).toEqual({
      type: "Color3",
      value: [1, 1, 1],
    });
    expect(
      label.children.find((x) => x.className === "UIGradient")?.properties
        .Rotation,
    ).toBe(90);
    expect(
      label.children.find((x) => x.className === "UIStroke")?.properties
        .Thickness,
    ).toBe(4);
    expect(pkg.assets).toHaveLength(0);
    expect(
      pkg.issues.some(
        (x) =>
          x.nodeId === "child" &&
          x.code === "appearance-approximation" &&
          x.message.includes("drop shadow"),
      ),
    ).toBe(true);
  });
  it("keeps styled text buttons native", () => {
    const n = text();
    n.name = "Buy [button]";
    n.text!.unsupported = ["letter spacing", "complex text paint"];
    expect(find(parent([n]), "child").className).toBe("TextButton");
  });
  it("preserves text beneath an unsupported container while rasterizing artwork", () => {
    const root = parent([text(), child({ id: "art", type: "VECTOR" })]);
    root.effects = ["DROP_SHADOW"];
    const pkg = converted(root);
    expect(flatten(pkg.roots).find((n) => n.id === "root")?.className).toBe(
      "Frame",
    );
    expect(flatten(pkg.roots).find((n) => n.id === "child")?.className).toBe(
      "TextLabel",
    );
    expect(flatten(pkg.roots).find((n) => n.id === "art")?.className).toBe(
      "ImageLabel",
    );
    expect(pkg.assets.map((n) => n.nodeId)).toEqual(["art"]);
  });
  it("allows an explicit text rasterization setting", () => {
    const n = text();
    n.effects = ["DROP_SHADOW"];
    expect(find(parent([n]), "child", { preserveText: false }).className).toBe(
      "ImageLabel",
    );
  });
  it("honors explicit raster tags on text and its parent", () => {
    const n = text();
    n.name = "Heading [raster]";
    expect(find(parent([n]), "child").className).toBe("ImageLabel");
    const root = parent([text()]);
    root.name = "Card [raster]";
    expect(flatten(converted(root).roots).some((n) => n.id === "child")).toBe(
      false,
    );
  });
  it("does not infer text from a layer's name", () => {
    const n = child({ type: "VECTOR", name: "TextLabel" });
    expect(find(parent([n]), "child").className).toBe("ImageLabel");
  });
  it("does not prevent rasterization because of omitted text", () => {
    const hidden = text();
    hidden.visible = false;
    const skipped = text();
    skipped.id = "skipped";
    skipped.name += " [skip]";
    const root = parent([hidden, skipped]);
    root.effects = ["DROP_SHADOW"];
    expect(find(root, "root").className).toBe("ImageLabel");
  });
  it("does not tint a shared text gradient with RichText colors", () => {
    const n = text();
    n.fills = [
      {
        type: "GRADIENT_LINEAR",
        gradientTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        gradientStops: [
          { position: 0, color: { r: 1, g: 0, b: 0 } },
          { position: 1, color: { r: 0, g: 0, b: 1 } },
        ],
      },
    ];
    const label = find(parent([n]), "child");
    expect(label.className).toBe("TextLabel");
    expect(label.properties.Text).toContain('color="rgb(255,255,255)"');
    expect(label.children.some((x) => x.className === "UIGradient")).toBe(true);
  });
});
describe("auto layouts", () => {
  const layout = () => parent([child(), child({ id: "other" })]);
  it("maps simple auto layout and padding in responsive mode", () => {
    const n = layout();
    n.layout = {
      mode: "HORIZONTAL",
      spacing: 12,
      padding: [4, 8, 12, 16],
      primary: "SPACE_BETWEEN",
      counter: "CENTER",
      wrap: false,
    };
    const c = find(n, "root", { layout: "responsive" });
    expect(c.children.some((n) => n.className === "UIListLayout")).toBe(true);
    expect(
      c.children.find((n) => n.className === "UIPadding")!.properties
        .PaddingLeft,
    ).toEqual({ type: "UDim", value: [0, 16] });
  });
  it("converts compatible wrapping into native layout", () => {
    const n = layout();
    n.layout = {
      mode: "HORIZONTAL",
      spacing: 12,
      padding: [0, 0, 0, 0],
      primary: "MIN",
      counter: "MIN",
      wrap: true,
    };
    const pkg = converted(n, { layout: "responsive" });
    expect(flatten(pkg.roots).some((n) => n.className === "UIListLayout")).toBe(
      false,
    );
    expect(flatten(pkg.roots).some((n) => n.className === "UIGridLayout")).toBe(
      true,
    );
    expect(pkg.issues.some((i) => i.code === "layout-frozen")).toBe(false);
  });
});
describe("responsive viewport roots", () => {
  it("fills the viewport while preserving a reference canvas size", () => {
    const n = parent([child()]);
    const pkg = converted(n, { layout: "responsive" });
    expect(pkg.roots[0].referenceSize).toEqual([400, 300]);
    expect(pkg.roots[0].children[0].properties.Size).toEqual({
      type: "UDim2",
      value: [1, 0, 1, 0],
    });
  });
  it("does not apply constraints to children of a frozen auto layout", () => {
    const n = parent([
      child({ constraints: { horizontal: "SCALE", vertical: "SCALE" } }),
    ]);
    n.layout = {
      mode: "GRID",
      spacing: 5,
      padding: [0, 0, 0, 0],
      primary: "MIN",
      counter: "MIN",
      wrap: false,
    };
    expect(
      find(n, "child", { layout: "responsive" }).properties.Position,
    ).toEqual({ type: "UDim2", value: [0, 20, 0, 30] });
  });
  it("preserves native text stroke semantics", () => {
    const n = child({
      type: "TEXT",
      text: {
        characters: "X",
        align: "LEFT",
        verticalAlign: "TOP",
        runs: [
          {
            text: "X",
            fontFamily: "Roboto",
            fontStyle: "Regular",
            fontSize: 16,
          },
        ],
      },
      strokes: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      strokeWeight: 1,
    });
    expect(
      find(parent([n]), "child").children[0].properties.ApplyStrokeMode,
    ).toEqual({ type: "Enum", value: ["ApplyStrokeMode", "Contextual"] });
  });
});

describe("native font-size normalization", () => {
  const text = (family = "Roboto", style = "Regular", size = 24) =>
    child({
      type: "TEXT",
      text: {
        characters: "Editable glowing title",
        align: "LEFT",
        verticalAlign: "CENTER",
        runs: [
          {
            text: "Editable glowing title",
            fontFamily: family,
            fontStyle: style,
            fontSize: size,
          },
        ],
      },
    });
  it.each([
    ["Arial", "Regular", 27],
    ["Arial", "Bold", 27],
    ["Arimo", "Regular", 27],
    ["Arimo", "Bold", 27],
    ["Gotham", "Regular", 29],
    ["Gotham", "Bold", 29],
    ["Gotham SSm", "Regular", 29],
    ["Gotham SSm", "Bold", 29],
    ["Roboto", "Regular", 28],
    ["Roboto", "Bold", 28],
    ["Roboto", "Italic", 28],
    ["Source Sans Pro", "Regular", 30],
    ["Source Sans Pro", "Light", 30],
    ["Source Sans Pro", "Italic", 30],
    ["Source Sans Pro", "SemiBold", 30],
    ["Source Sans Pro", "Bold", 30],
    ["Source Sans 3", "Regular", 30],
    ["Ubuntu", "Regular", 27],
    ["Ubuntu", "Italic", 27],
    ["Montserrat", "Regular", 29],
    ["Montserrat", "Medium", 29],
    ["Montserrat", "Bold", 29],
    ["Montserrat", "Black", 29],
    ["Nunito", "Regular", 32],
    ["Fredoka One", "Regular", 29],
    ["Roboto Mono", "Regular", 31],
    ["Roboto Condensed", "Regular", 28],
    ["Oswald", "Regular", 35],
    ["Oswald", "Bold", 35],
    ["Bangers", "Regular", 25],
  ])(
    "converts %s %s from em size using its bundled metrics",
    (family, style, size) => {
      const pkg = converted(parent([text(family, style)]));
      const layer = flatten(pkg.roots).find((n) => n.id === "child")!;
      expect(layer.properties.TextSize).toBe(size);
      expect(layer.properties.TextScaled).toBe(false);
      expect(pkg.issues.some((i) => i.code === "font-size-unverified")).toBe(
        false,
      );
    },
  );
  it("matches native truncation rather than rounding fractional converted sizes", () => {
    expect(
      find(parent([text("Roboto", "Regular", 16)]), "child").properties
        .TextSize,
    ).toBe(18);
    expect(
      find(parent([text("Roboto", "Regular", 24.5)]), "child").properties
        .TextSize,
    ).toBe(28);
  });
  it.each([0.5, 200])("reports native limits for source em size %s", (size) => {
    const pkg = converted(parent([text("Roboto", "Regular", size)]));
    const p = flatten(pkg.roots).find((n) => n.id === "child")!.properties;
    expect(p.TextSize).toBe(size < 1 ? 1 : 100);
    expect(pkg.issues.some((i) => i.code === "font-size-limit")).toBe(true);
  });
  it("retains an unverified remote face rather than borrowing regular metrics", () => {
    const pkg = converted(parent([text("Roboto", "Light")]));
    expect(
      flatten(pkg.roots).find((n) => n.id === "child")!.properties.TextSize,
    ).toBe(24);
    expect(
      pkg.issues.find((i) => i.code === "font-size-unverified")?.message,
    ).toContain("Light");
  });
  it("retains custom-family size and exposes its unverified metrics", () => {
    const pkg = converted(parent([text()]), { fontIds: { Roboto: "123" } });
    const p = flatten(pkg.roots).find((n) => n.id === "child")!.properties;
    expect(p.FontFace).toMatchObject({ family: "rbxassetid://123" });
    expect(p.TextSize).toBe(24);
    expect(pkg.issues.some((i) => i.code === "font-size-unverified")).toBe(
      true,
    );
  });
  it("converts the actual fallback family and retains the substitution warning", () => {
    const pkg = converted(parent([text("Unknown family")]));
    expect(
      flatten(pkg.roots).find((n) => n.id === "child")!.properties.TextSize,
    ).toBe(30);
    expect(pkg.issues.some((i) => i.code === "font-substitution")).toBe(true);
  });
  it("keeps explicit Roblox size and line-height values in their own units", () => {
    const n = text();
    n.text!.lineHeight = 24;
    const pkg = converted(parent([n]), {
      layerOverrides: {
        child: { properties: { TextSize: 18.75, LineHeight: 2.5 } },
      },
    });
    const p = flatten(pkg.roots).find((n) => n.id === "child")!.properties;
    expect(p.TextSize).toBe(18.75);
    expect(p.LineHeight).toBe(2.5);
    expect(
      pkg.issues.some((i) =>
        ["font-size-limit", "line-height-limit"].includes(i.code),
      ),
    ).toBe(false);
  });
  it("uses the explicit native font face when converting a source size", () => {
    const p = find(parent([text()]), "child", {
      layerOverrides: {
        child: {
          properties: {
            FontFace: {
              type: "Font",
              family: "rbxasset://fonts/families/Oswald.json",
              weight: "Regular",
              style: "Normal",
            },
          },
        },
      },
    }).properties;
    expect(p.TextSize).toBe(35);
    expect(p.FontFace).toMatchObject({
      family: "rbxasset://fonts/families/Oswald.json",
    });
  });
  it.each([
    [36, 1.28571, false],
    [24, 1, true],
    [120, 3, true],
  ] as const)(
    "converts source leading %s against native line height",
    (leading, expected, clamped) => {
      const n = text();
      n.text!.lineHeight = leading;
      const pkg = converted(parent([n]));
      expect(
        flatten(pkg.roots).find((n) => n.id === "child")!.properties.LineHeight,
      ).toBe(expected);
      expect(pkg.issues.some((i) => i.code === "line-height-limit")).toBe(
        clamped,
      );
    },
  );
  it("converts each mixed-font run independently while retaining escaped text", () => {
    const n = text();
    n.text!.characters = "First< & Second";
    n.text!.runs = [
      { text: "First<", fontFamily: "Roboto", fontStyle: "Bold", fontSize: 16 },
      {
        text: " & Second",
        fontFamily: "Source Sans Pro",
        fontStyle: "Italic",
        fontSize: 18,
      },
    ];
    const p = find(parent([n]), "child").properties;
    expect(p.TextSize).toBe(18);
    expect(p.Text).toContain('size="18"');
    expect(p.Text).toContain('size="22"');
    expect(p.Text).toContain("First&lt;");
    expect(p.Text).toContain("&amp; Second");
    expect(p.Text).toContain("<i>");
  });
  it("makes a Roblox size override scale mixed runs without changing its raw property", () => {
    const n = text();
    n.text!.characters = "SmallLarge";
    n.text!.runs[0].text = "Small";
    n.text!.runs.push({ ...n.text!.runs[0], text: "Large", fontSize: 36 });
    const p = find(parent([n]), "child", {
      layerOverrides: { child: { properties: { TextSize: 18.75 } } },
    }).properties;
    expect(p.TextSize).toBe(18.75);
    expect(p.Text).toContain('size="18"');
    expect(p.Text).toContain('size="27"');
  });
  it("scales from unbounded converted em sizes before limiting mixed spans", () => {
    const n = text("Roboto", "Regular", 128);
    n.text!.characters = "TitleCaption";
    n.text!.runs[0].text = "Title";
    n.text!.runs.push({ ...n.text!.runs[0], text: "Caption", fontSize: 16 });
    const pkg = converted(parent([n]), {
      layerOverrides: { child: { properties: { TextSize: 50 } } },
    });
    const p = flatten(pkg.roots).find((n) => n.id === "child")!.properties;
    expect(p.Text).toContain('size="50"');
    expect(p.Text).toContain('size="6"');
    expect(pkg.issues.some((i) => i.code === "font-size-limit")).toBe(false);
  });
  it("retains native font-theme token units", () => {
    const themes = {
      version: 1,
      initial: "Light",
      modes: {
        Light: {
          body: {
            kind: "font",
            values: {
              FontFace: {
                type: "Font",
                family: "rbxasset://fonts/families/SourceSansPro.json",
                weight: "Regular",
                style: "Normal",
              },
              TextSize: 18,
            },
          },
        },
      },
    };
    const pkg = converted(parent([text()]), {
      themes,
      layerOverrides: { child: { theme: { font: "body" } } },
    });
    const label = flatten(pkg.roots).find((n) => n.id === "child")!;
    expect(label.properties.TextSize).toBe(18);
    expect(label.theme?.base.TextSize).toEqual(["body", "TextSize"]);
    expect(pkg.roots[0].themes?.modes.Light.body.TextSize).toBe(18);
  });
});

describe("native legacy font aliases", () => {
  it.each(["Arial", "Gotham", "Gotham SSm"])(
    "explains the %s engine substitute",
    (family) => {
      const n = child({
        type: "TEXT",
        text: {
          characters: "Native alias",
          align: "LEFT",
          verticalAlign: "TOP",
          runs: [
            {
              text: "Native alias",
              fontFamily: family,
              fontStyle: "Regular",
              fontSize: 24,
            },
          ],
        },
      });
      const pkg = converted(parent([n]));
      expect(
        pkg.issues.find((i) => i.code === "font-substitution")?.message,
      ).toContain(family === "Arial" ? "Arimo" : "Montserrat");
      expect(pkg.issues.some((i) => i.code === "font-size-unverified")).toBe(
        false,
      );
    },
  );
});

describe("closed font-metric lookup", () => {
  it("treats prototype-named family paths as unverified data", () => {
    const n = child({
      type: "TEXT",
      text: {
        characters: "Unknown font",
        align: "LEFT",
        verticalAlign: "TOP",
        runs: [
          {
            text: "Unknown font",
            fontFamily: "Roboto",
            fontStyle: "Regular",
            fontSize: 24,
          },
        ],
      },
    });
    const pkg = converted(parent([n]), {
      layerOverrides: {
        child: {
          properties: {
            FontFace: {
              type: "Font",
              family: "rbxasset://fonts/families/constructor.json",
              weight: "Regular",
              style: "Normal",
            },
          },
        },
      },
    });
    expect(
      flatten(pkg.roots).find((n) => n.id === "child")!.properties.TextSize,
    ).toBe(24);
    expect(pkg.issues.some((i) => i.code === "font-size-unverified")).toBe(
      true,
    );
  });
});

describe("native RichText sizes above the TextSize cap", () => {
  function largeText(size = 100) {
    return child({
      type: "TEXT",
      text: {
        characters: "MMMM",
        align: "LEFT",
        verticalAlign: "CENTER",
        lineHeight: 180,
        runs: [
          {
            text: "MMMM",
            fontFamily: "Roboto",
            fontStyle: "Regular",
            fontSize: size,
            underline: true,
          },
        ],
      },
    });
  }
  it("keeps a large underlined single run and uses its tagged height for leading", () => {
    const pkg = converted(parent([largeText()]));
    const p = flatten(pkg.roots).find((n) => n.id === "child")!.properties;
    expect(p.TextSize).toBe(100);
    expect(p.RichText).toBe(true);
    expect(p.Text).toContain('size="117"');
    expect(p.LineHeight).toBe(1.53846);
    expect(pkg.issues.some((i) => i.code === "font-size-limit")).toBe(false);
  });
  it("preserves relative rich sizes beyond100 when a native override sets the first run", () => {
    const n = largeText();
    n.text!.characters = "MMMMLarge";
    n.text!.runs.push({ ...n.text!.runs[0], text: "Large", fontSize: 300 });
    const pkg = converted(parent([n]), {
      layerOverrides: { child: { properties: { TextSize: 50 } } },
    });
    const p = flatten(pkg.roots).find((n) => n.id === "child")!.properties;
    expect(p.TextSize).toBe(50);
    expect(p.Text).toContain('size="50"');
    expect(p.Text).toContain('size="150"');
    expect(pkg.issues.some((i) => i.code === "font-size-limit")).toBe(false);
  });
});

describe("effective mixed-run typography", () => {
  function mixed() {
    return child({
      type: "TEXT",
      text: {
        characters: "Small\nLarge",
        align: "LEFT",
        verticalAlign: "CENTER",
        lineHeight: 72,
        runs: [
          {
            text: "Small\n",
            fontFamily: "Roboto",
            fontStyle: "Regular",
            fontSize: 16,
          },
          {
            text: "Large",
            fontFamily: "Roboto",
            fontStyle: "Regular",
            fontSize: 48,
          },
        ],
      },
    });
  }
  it("discloses variable-line leading rather than deriving one false exact multiplier", () => {
    const pkg = converted(parent([mixed()]));
    const p = flatten(pkg.roots).find((n) => n.id === "child")!.properties;
    expect(p.LineHeight).toBe(3);
    expect(p.Text).toContain('size="18"');
    expect(p.Text).toContain('size="56"');
    expect(pkg.issues.some((i) => i.code === "mixed-line-height")).toBe(true);
  });
  it("lets explicit native leading supersede the source-leading approximation", () => {
    const pkg = converted(parent([mixed()]), {
      layerOverrides: { child: { properties: { LineHeight: 1.25 } } },
    });
    expect(
      flatten(pkg.roots).find((n) => n.id === "child")!.properties.LineHeight,
    ).toBe(1.25);
    expect(
      pkg.issues.some((i) =>
        ["mixed-line-height", "line-height-limit"].includes(i.code),
      ),
    ).toBe(false);
  });
  it("makes a native FontFace override apply to every generated rich run", () => {
    const pkg = converted(parent([mixed()]), {
      layerOverrides: {
        child: {
          properties: {
            FontFace: {
              type: "Font",
              family: "rbxasset://fonts/families/SourceSansPro.json",
              weight: "Bold",
              style: "Normal",
            },
          },
        },
      },
    });
    const p = flatten(pkg.roots).find((n) => n.id === "child")!.properties;
    expect(
      String(p.Text).match(
        /family="rbxasset:\/\/fonts\/families\/SourceSansPro.json"/g,
      ),
    ).toHaveLength(2);
    expect(String(p.Text).match(/weight="Bold"/g)).toHaveLength(2);
    expect(p.Text).toContain('size="20"');
    expect(p.Text).toContain('size="60"');
  });
});

describe("proportional rich-size override precision", () => {
  it("keeps equivalent runs exactly at the native override and corrects only floating-point noise", () => {
    const n = child({
      type: "TEXT",
      text: {
        characters: "ABCD",
        align: "LEFT",
        verticalAlign: "CENTER",
        runs: [8.09, 8.09, 16.18, 16.17999].map((fontSize, index) => ({
          text: "ABCD"[index],
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize,
          color: { r: index / 4, g: 0, b: 0 },
        })),
      },
    });
    const p = find(parent([n]), "child", {
      layerOverrides: { child: { properties: { TextSize: 12 } } },
    }).properties;
    expect(String(p.Text).match(/size="(\d+)"/g)).toEqual([
      'size="12"',
      'size="12"',
      'size="24"',
      'size="23"',
    ]);
    expect(p.TextSize).toBe(12);
  });
  it("describes unknown rich metrics without imposing the TextSize property ceiling", () => {
    const n = child({
      type: "TEXT",
      text: {
        characters: "A",
        align: "LEFT",
        verticalAlign: "CENTER",
        runs: [
          {
            text: "A",
            fontFamily: "Roboto",
            fontStyle: "Light",
            fontSize: 150,
            underline: true,
          },
        ],
      },
    });
    const pkg = converted(parent([n]));
    expect(
      flatten(pkg.roots).find((n) => n.id === "child")!.properties.Text,
    ).toContain('size="150"');
    const message = pkg.issues.find(
      (i) => i.code === "font-size-unverified",
    )!.message;
    expect(message).toContain("positive integer RichText");
    expect(message).not.toContain("1–100");
  });
});
