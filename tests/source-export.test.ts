import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import ts from "typescript";
import { compile } from "../packages/core/src/compiler";
import { node, demoDesign } from "../packages/core/src/demo";
import {
  generateSource,
  quoteLuau,
  sourceValue,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { buildSourceExport } from "../packages/core/src/source-export";
import type {
  AnalysisResult,
  TransferPackage,
  Value,
} from "../packages/core/src/types";

function artwork(linked = false): AnalysisResult {
  const pkg = compile(
    [
      node("Images", {
        id: "images",
        children: [node("Icon", { id: "icon", type: "VECTOR" })],
      }),
    ],
    "art",
    { assetIds: linked ? { "image:icon:bleed-v2": "123456789" } : {} },
    "fixed",
  );
  return {
    package: pkg,
    assets: { "image:icon:bleed-v2": [137, 80, 78, 71] },
    previews: {},
    revision: 1,
  };
}
describe("source exports", () => {
  it.each(SOURCE_FORMATS)(
    "exports an independent $label module, manifest, and unresolved PNGs",
    ({ id, extension }) => {
      const result = artwork();
      const file = buildSourceExport(result, id);
      const zip = unzipSync(file.data);
      expect(strFromU8(zip[`Design.${extension}`])).toBe(
        generateSource(result.package, id),
      );
      expect(
        JSON.parse(strFromU8(zip["asset-manifest.json"])).assets[0],
      ).toMatchObject({ id: "image:icon:bleed-v2", robloxId: null });
      const image = result.package.assets[0];
      expect(zip[`images/${image.filename}`]).toEqual(
        new Uint8Array(result.assets[image.id]),
      );
      expect(strFromU8(zip["READ_ME.txt"])).toContain("conversion settings");
      expect(zip["conversion-report.json"]).toBeDefined();
    },
  );
  it.each(SOURCE_FORMATS)(
    "links uploaded assets in $label without needing PNG bytes",
    ({ id }) => {
      const result = artwork(true);
      result.assets = {};
      const file = buildSourceExport(result, id);
      const zip = unzipSync(file.data);
      expect(Object.keys(zip).some((path) => path.startsWith("images/"))).toBe(
        false,
      );
      expect(generateSource(result.package, id)).toContain(
        "rbxassetid://123456789",
      );
      expect(generateSource(result.package, id)).toContain(
        "Link the Roblox image",
      );
    },
  );
  it("preserves original package identities and values during every export", () => {
    const pkg = compile(
      demoDesign(),
      "source",
      { layout: "responsive" },
      "fixed",
    );
    const before = JSON.stringify(pkg);
    for (const format of SOURCE_FORMATS) generateSource(pkg, format.id);
    expect(JSON.stringify(pkg)).toBe(before);
  });
  it("uses safe string literals for Lua controls, quotes, Unicode, and adjacent digits", () => {
    expect(quoteLuau('"\\\n\u00001☃')).toBe('"\\"\\\\\\010\\0001☃"');
    const pkg = artwork(true).package;
    pkg.roots[0].name = '"; error("injected") --\n☃';
    for (const format of SOURCE_FORMATS) {
      const src = generateSource(pkg, format.id);
      expect(src).toContain(
        format.id === "tsx"
          ? JSON.stringify(pkg.roots[0].name)
          : quoteLuau(pkg.roots[0].name),
      );
    }
  });
  it("serializes every supported Roblox datatype in both languages", () => {
    const values: Value[] = [
      { type: "Color3", value: [1, 0.5, 0] },
      { type: "Vector2", value: [0.5, 1] },
      { type: "Vector3", value: [-1, -2, 3] },
      { type: "UDim", value: [0.5, 2] },
      { type: "UDim2", value: [1, 0, 0, 32] },
      {
        type: "Font",
        family: "rbxasset://fonts/families/Roboto.json",
        weight: "Bold",
        style: "Italic",
      },
      {
        type: "ColorSequence",
        value: [
          [0, 1, 0, 0],
          [1, 0, 0, 1],
        ],
      },
      {
        type: "NumberSequence",
        value: [
          [0, 0.5],
          [1, 0],
        ],
      },
      { type: "Enum", value: ["AutomaticSize", "XY"] },
    ];
    expect(values.map((value) => sourceValue(value)).join("\n")).toContain(
      "ColorSequenceKeypoint.new(0, Color3.new(1, 0, 0))",
    );
    expect(
      values.map((value) => sourceValue(value, true)).join("\n"),
    ).toContain("new NumberSequence([new NumberSequenceKeypoint(0, 0.5)");
    expect(
      sourceValue(
        values.find(
          (value) => typeof value === "object" && value.type === "Font",
        )!,
      ),
    ).toContain("Enum.FontWeight.Bold");
    expect(() => sourceValue(NaN)).toThrow("finite");
    expect(sourceValue("\u00001", true)).toBe('utf8.char(0) + "1"');
  });
  it("normalizes individual corners without an unordered aggregate setter", () => {
    const pkg = artwork(true).package;
    pkg.roots[0].children[0].children.push({
      id: "corners",
      name: "Corner",
      className: "UICorner",
      properties: {
        CornerRadius: { type: "UDim", value: [0, 8] },
        TopLeftRadius: { type: "UDim", value: [0, 24] },
      },
      children: [],
    });
    for (const { id } of SOURCE_FORMATS) {
      const src = generateSource(pkg, id);
      expect(src).toContain("BottomRightRadius");
      expect(src).toContain("TopLeftRadius");
      expect(src).not.toContain("CornerRadius =");
      expect(src).not.toContain("CornerRadius={");
    }
  });
  it("produces valid TypeScript JSX syntax for a real converted screen", () => {
    const source = generateSource(
      compile(demoDesign(), "jsx", { layout: "responsive" }),
      "tsx",
    );
    const result = ts.transpileModule(source, {
      fileName: "Design.tsx",
      reportDiagnostics: true,
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        jsxFactory: "React.createElement",
        jsxFragmentFactory: "React.Fragment",
        target: ts.ScriptTarget.ES2020,
      },
    });
    expect(
      result.diagnostics?.filter(
        (d) => d.category === ts.DiagnosticCategory.Error,
      ),
    ).toEqual([]);
    expect(result.outputText).toContain("React.createElement");
  });
  it("requires all unresolved bytes and refuses duplicate or unsafe PNG paths", () => {
    const result = artwork();
    result.assets = {};
    expect(() => buildSourceExport(result, "react")).toThrow("missing");
    result.assets["image:icon:bleed-v2"] = [1];
    result.package.assets[0].filename = "../private.png";
    expect(() => buildSourceExport(result, "luau")).toThrow("filename");
    result.package.assets[0].filename = "same.png";
    result.package.assets.push({ ...result.package.assets[0], id: "second" });
    result.assets.second = [1];
    expect(() => buildSourceExport(result, "luau")).toThrow(
      "Duplicate source image filename",
    );
  });
  it("rejects invalid classes, executable properties, enum injection, and non-finite values", () => {
    const bad: ((pkg: TransferPackage) => void)[] = [
      (pkg) => {
        pkg.roots[0].children[0].className = "LocalScript";
      },
      (pkg) => {
        pkg.roots[0].properties.Source = "error('injected')";
      },
      (pkg) => {
        pkg.roots[0].properties.ZIndexBehavior = {
          type: "Enum",
          value: ["ZIndexBehavior", "Sibling);error('injected')"],
        };
      },
      (pkg) => {
        pkg.roots[0].properties.DisplayOrder = Infinity;
      },
      (pkg) => {
        pkg.roots[0].id = pkg.roots[0].children[0].id;
      },
    ];
    for (const mutate of bad) {
      const pkg = artwork(true).package;
      mutate(pkg);
      expect(() => generateSource(pkg, "luau")).toThrow();
    }
  });
  it("rejects malformed sequence keypoints and blocking diagnostics", () => {
    const pkg = artwork(true).package;
    pkg.roots[0].children[0].children.push({
      id: "gradient",
      className: "UIGradient",
      name: "Gradient",
      properties: {
        Color: {
          type: "ColorSequence",
          value: [
            [0, 1, 0, 0],
            [0.2, 0, 0, 1],
          ],
        },
      },
      children: [],
    });
    expect(() => generateSource(pkg, "react")).toThrow(
      "Invalid source property",
    );
    pkg.roots[0].children[0].children[0].properties.Color = {
      type: "ColorSequence",
      value: [null, [1, 1, 1, 1]],
    } as any;
    expect(() => generateSource(pkg, "react")).toThrow(
      "Invalid source property",
    );
    pkg.issues.push({
      nodeId: "images",
      nodeName: "Images",
      severity: "error",
      code: "test",
      message: "Cannot export",
    });
    expect(() => generateSource(pkg, "react")).toThrow("blocking");
  });
  it("refuses empty screens and unsupported source formats", () => {
    const pkg = artwork(true).package;
    pkg.roots = [];
    expect(() => generateSource(pkg, "fusion")).toThrow("screens");
    expect(() => generateSource(pkg, "unsafe" as any)).toThrow("supported");
  });
});
