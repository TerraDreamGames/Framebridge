import { describe, it, expect } from "vitest";
import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import {
  DEFAULT_THEMES,
  resolveThemes,
  validateThemes,
  themeProperties,
} from "../packages/core/src/theme-tokens";
import {
  flatten,
  DEFAULT_OPTIONS,
  type RbxNode,
} from "../packages/core/src/types";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { buildSourceExport } from "../packages/core/src/source-export";
import { validateExportPackage } from "../packages/core/src/export-package";
import { validatePackage } from "../packages/relay/src/protocol";
import {
  THEMED_BEHAVIOR_RUNTIME,
  BEHAVIOR_RUNTIME,
} from "../packages/core/src/behavior-runtime.mjs";
import { extractComponent } from "../packages/core/src/reusable-components";
import { MOTION_DEFAULTS } from "../packages/core/src/motion";
import { unzipSync, strFromU8 } from "fflate";
import { themeDesign, themeOptions, themePackage } from "./theme-fixtures";
const get = (pkg: ReturnType<typeof themePackage>, id: string) =>
  flatten(pkg.roots).find((n) => n.id === id)!;
const result = () => ({
  package: themePackage(),
  designs: themeDesign(),
  assets: {},
  previews: {},
  revision: 1,
});
describe("optional reusable theme tokens", () => {
  it("resolves per-mode aliases and never mutates author settings", () => {
    const settings = structuredClone(DEFAULT_THEMES);
    for (const mode of Object.values(settings.modes))
      mode.brand = { ref: "accent" };
    const before = JSON.stringify(settings),
      resolved = resolveThemes(settings).resolved;
    expect(resolved.Dark.brand).toEqual(resolved.Dark.accent);
    expect(resolved.Dark.brand).not.toEqual(resolved.Light.brand);
    expect(JSON.stringify(settings)).toBe(before);
  });
  it.each([
    "cycle",
    "missing",
    "schema",
    "version",
    "kind",
    "fields",
    "empty",
    "huge",
  ])("rejects %s library migration/configuration", (kind) => {
    const v: any = structuredClone(DEFAULT_THEMES);
    if (kind === "cycle") {
      v.modes.Light.accent = { ref: "surface" };
      v.modes.Light.surface = { ref: "accent" };
    }
    if (kind === "missing") v.modes.Light.accent = { ref: "missing" };
    if (kind === "schema") v.source = "print('bad')";
    if (kind === "version") v.version = 2;
    if (kind === "kind") v.modes.Dark.accent = v.modes.Dark.surface;
    if (kind === "fields")
      delete v.modes.Dark.interactive.values.BackgroundTransparency;
    if (kind === "empty") v.modes = {};
    if (kind === "huge") v.modes.Light.accent.values.Color.value[0] = Infinity;
    expect(() => resolveThemes(v)).toThrow();
  });
  it("shares five typed token kinds across components with initial editable native values", () => {
    const pkg = themePackage(),
      root = pkg.roots[0];
    expect(get(pkg, "buy").className).toBe("TextButton");
    expect(get(pkg, "buy").theme).toEqual(
      get(pkg, "sell").theme && { ...get(pkg, "sell").theme!, owner: "buy" },
    );
    expect(get(pkg, "buy").properties.BackgroundColor3).toEqual(
      root.themes!.modes.Light.surface.Color,
    );
    expect(get(pkg, "heading").properties.FontFace).toEqual(
      root.themes!.modes.Light.body.FontFace,
    );
    expect(get(pkg, "buy/theme-shadow").className).toBe("UIShadow");
    expect(
      themeProperties(get(pkg, "buy"), root.themes!, "Dark").BackgroundColor3,
    ).toEqual(root.themes!.modes.Dark.surface.Color);
    expect(
      themeProperties(get(pkg, "buy"), root.themes!, "Dark", true)
        .BackgroundColor3,
    ).toEqual(root.themes!.modes.Dark.interactive.BackgroundColor3);
    expect(() => validateExportPackage(pkg)).not.toThrow();
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("turns themed export off without discarding its library or bindings", () => {
    const options = themeOptions({ themeEnabled: false });
    const before = JSON.stringify(options),
      pkg = themePackage(options);
    expect(pkg.roots[0].themes).toBeUndefined();
    expect(flatten(pkg.roots).some((n) => n.theme)).toBe(false);
    expect(generateSource(pkg, "luau")).not.toContain("mountTheme");
    expect(JSON.stringify(options)).toBe(before);
    expect(
      themePackage({ ...options, themeEnabled: true }).roots[0].themes,
    ).toBeDefined();
  });
  it("prunes unused tokens and emits no runtime or metadata when themes are unused", () => {
    const options = themeOptions({ layerOverrides: {} }),
      pkg = compile(themeDesign(), "qa", options);
    expect(pkg.roots[0].themes).toBeUndefined();
    expect(generateSource(pkg, "luau")).not.toContain("mountTheme");
    expect(generateModel(pkg)).not.toContain('class="LocalScript"');
    const only = themePackage({
      layerOverrides: { heading: { theme: { color: "accent" } } },
    });
    expect(Object.keys(only.roots[0].themes!.modes.Light)).toEqual(["accent"]);
  });
  it("keeps explicit property and component overrides authoritative in every theme", () => {
    const options = themeOptions();
    options.layerOverrides.buy.properties = {
      BackgroundColor3: { type: "Color3", value: [1, 0, 0] },
    };
    options.layerOverrides.buy.components = {
      shadow: { BlurRadius: { type: "UDim", value: [0, 2] } },
    };
    options.layerOverrides.sell.components = { shadow: false };
    const pkg = themePackage(options),
      root = pkg.roots[0],
      buy = get(pkg, "buy");
    expect(buy.theme!.base.BackgroundColor3).toBeUndefined();
    expect(buy.theme!.hover!.BackgroundColor3).toBeUndefined();
    expect(buy.properties.BackgroundColor3).toEqual({
      type: "Color3",
      value: [1, 0, 0],
    });
    expect(get(pkg, "buy/shadow").theme!.base.BlurRadius).toBeUndefined();
    expect(get(pkg, "buy/shadow").properties.BlurRadius).toEqual({
      type: "UDim",
      value: [0, 2],
    });
    expect(get(pkg, "sell/theme-shadow")).toBeUndefined();
    expect(
      themeProperties(buy, root.themes!, "Dark").BackgroundColor3,
    ).toBeUndefined();
  });
  it("preserves token-bearing native children rather than baking them into ancestor artwork", () => {
    const design = themeDesign();
    design[0].fills = [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }];
    design[0].effects = ["LAYER_BLUR"];
    const pkg = compile(design, "qa", themeOptions());
    expect(get(pkg, "buy-label").theme).toBeDefined();
  });
  it("requires a valid library, token kind and usable hover input", () => {
    expect(() => themePackage({ themes: undefined })).toThrow(
      "Define theme tokens",
    );
    expect(() =>
      themePackage({
        layerOverrides: { heading: { theme: { font: "surface" } } },
      }),
    ).toThrow("font token");
    expect(() =>
      themePackage({
        layerOverrides: {
          heading: { className: "TextLabel", theme: { hover: "interactive" } },
        },
      }),
    ).toThrow("ancestor to be a button");
  });
  it("blocks theme/motion tint contention before source emission", () => {
    const options = themeOptions();
    options.layerOverrides.heading.behavior = {
      motion: {
        hover: {
          scale: 1,
          rotation: 0,
          lift: 0,
          duration: 0.1,
          tint: [1, 1, 1],
        },
      },
    };
    expect(() => themePackage(options)).toThrow("same property");
  });
  it.each(["blink", "enter"] as const)(
    "blocks descendant color and shadow alpha ownership during %s motion",
    (effect) => {
      const options = themeOptions();
      options.layerOverrides.buy.behavior = {
        motion: { [effect]: MOTION_DEFAULTS[effect] },
      };
      expect(() => themePackage(options)).toThrow("fade/blink motion");
      const pkg = themePackage();
      get(pkg, "buy").behavior = {
        motion: { [effect]: MOTION_DEFAULTS[effect] },
      };
      expect(() => validateExportPackage(pkg)).toThrow("fade/blink motion");
      expect(() => validatePackage(pkg)).toThrow();
    },
  );
  it("allows theme colors with motion alpha when an explicit transparency edit owns alpha", () => {
    const pkg = themePackage({
      layerOverrides: {
        heading: {
          theme: { color: "accent" },
          properties: { TextTransparency: 0 },
          behavior: { motion: { blink: MOTION_DEFAULTS.blink } },
        },
      },
    });
    expect(get(pkg, "heading").theme!.base.TextColor3).toBeDefined();
    expect(get(pkg, "heading").theme!.base.TextTransparency).toBeUndefined();
  });
  it("keeps descendant theme transparency independent inside an ancestor CanvasGroup fade", () => {
    const design = themeDesign();
    design[0].children = [
      node("Fade group", { id: "group", children: design[0].children }),
    ];
    const options = themeOptions();
    options.layerOverrides.group = {
      className: "CanvasGroup",
      behavior: { motion: { enter: MOTION_DEFAULTS.enter } },
    };
    expect(() => compile(design, "qa", options)).not.toThrow();
  });
  it("binds a selected native shadow and preserves parent modifier edits", () => {
    const pkg = themePackage({
      layerOverrides: {
        buy: {
          components: {
            shadow: { BlurRadius: { type: "UDim", value: [0, 2] } },
          },
        },
        "buy/shadow": { theme: { shadow: "elevated" } },
      },
    });
    const shadow = get(pkg, "buy/shadow");
    expect(shadow.theme!.base.Color).toEqual(["elevated", "Color"]);
    expect(shadow.theme!.base.BlurRadius).toBeUndefined();
    expect(shadow.properties.BlurRadius).toEqual({
      type: "UDim",
      value: [0, 2],
    });
  });
  it("blocks texture drift ownership of themed image transparency at transfer boundaries", () => {
    const pkg = themePackage();
    const buy = get(pkg, "buy");
    buy.properties.ScaleType = { type: "Enum", value: ["ScaleType", "Tile"] };
    buy.theme!.base.ImageTransparency = ["surface", "Transparency"];
    buy.properties.ImageTransparency = 0;
    buy.behavior = { motion: { drift: MOTION_DEFAULTS.drift } };
    expect(() => validateThemes(pkg.roots)).toThrow("texture drift");
    expect(() => validateExportPackage(pkg)).toThrow();
    expect(() => validatePackage(pkg)).toThrow();
  });
  it.each([
    "orphan",
    "value",
    "extra",
    "mode",
    "owner",
    "nested",
    "binding",
    "unused",
    "false",
  ])(
    "rejects forged %s transfer data at export and relay boundaries",
    (kind) => {
      const pkg: any = themePackage(),
        root = pkg.roots[0],
        buy: any = get(pkg, "buy");
      if (kind === "orphan") delete root.themes;
      if (kind === "value")
        root.themes.modes.Dark.surface.Color = {
          type: "Color3",
          value: [9, 0, 0],
        };
      if (kind === "extra")
        root.themes.modes.Dark.surface.Source = "print('bad')";
      if (kind === "mode") delete root.themes.modes.Dark.accent;
      if (kind === "owner") buy.theme.owner = "heading";
      if (kind === "nested") buy.themes = root.themes;
      if (kind === "binding") buy.theme.base.Source = ["surface", "Color"];
      if (kind === "unused")
        for (const tokens of Object.values(root.themes.modes) as any[])
          tokens.unused = { Color: { type: "Color3", value: [0, 0, 0] } };
      if (kind === "false") buy.theme = false;
      expect(() => validateThemes(pkg.roots)).toThrow();
      expect(() => validatePackage(pkg)).toThrow();
      expect(() => validateExportPackage(pkg)).toThrow();
    },
  );
  it.each(SOURCE_FORMATS)(
    "exports theme bindings and only used runtime in $label",
    (format) => {
      const r = result(),
        files = unzipSync(buildSourceExport(r, format.id).data),
        source = strFromU8(files[`Design.${format.extension}`]);
      expect(source).toContain("FramebridgeThemes");
      expect(source).toContain("FramebridgeThemeBinding");
      if (format.id === "tsx")
        expect(strFromU8(files["FramebridgeInteractions.luau"])).toBe(
          THEMED_BEHAVIOR_RUNTIME + "\n",
        );
      else expect(source).toContain("mountTheme");
      expect(THEMED_BEHAVIOR_RUNTIME).toContain("function controller.setTheme");
      expect(BEHAVIOR_RUNTIME).not.toContain("mountTheme");
      expect(generateModel(r.package)).toContain("local mountTheme");
    },
  );
  it("extracts self-contained token definitions for reusable widget copies", () => {
    const r = result();
    const extracted = extractComponent(r, "layer:buy", "Themed button");
    expect(extracted.package.roots[0].themes).toBeDefined();
    expect(() => validateExportPackage(extracted.package)).not.toThrow();
    expect(
      generateSource(extracted.package, "luau", { component: true }),
    ).toContain("FramebridgeThemes");
  });
  it("remaps hover ownership for each native repeated component copy", () => {
    const design = themeDesign();
    design[0].children = [
      node("Repeating buttons", {
        id: "repeat",
        type: "TRANSFORM_GROUP",
        width: 620,
        height: 80,
        transformModifiers: [
          {
            type: "REPEAT",
            repeatType: "LINEAR",
            count: 3,
            unitType: "PIXELS",
            offset: 220,
            axis: "HORIZONTAL",
          },
        ],
        children: [design[0].children[0]],
      }),
    ];
    const pkg = compile(design, "qa", themeOptions());
    const buttons = flatten(pkg.roots).filter(
      (n) => n.className === "TextButton",
    );
    expect(buttons).toHaveLength(3);
    for (const button of buttons) expect(button.theme!.owner).toBe(button.id);
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
  it("leaves optional disabled bindings and unrelated settings intact", () => {
    const options = themeOptions({ layerOverrides: { buy: { theme: false } } });
    const pkg = themePackage(options);
    expect(get(pkg, "buy").theme).toBeUndefined();
    expect(DEFAULT_OPTIONS.themes).toBeUndefined();
  });
});
