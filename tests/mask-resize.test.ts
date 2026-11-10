import { describe, expect, it } from "vitest";
import { flatten } from "../packages/core/src/types";
import { validateMaskBases } from "../packages/core/src/native-clipping";
import { validatePackage } from "../packages/relay/src/protocol";
import { generateModel } from "../packages/core/src/model-export";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { maskResizePairs, maskResizePackage } from "./mask-resize-fixtures";
import { maskResizeDesign } from "./mask-resize-fixtures";
import { compile } from "../packages/core/src/compiler";
import { entries } from "../plugins/figma/src/layer-entries";
const find = (pkg: ReturnType<typeof maskResizePackage>, id: string) =>
  flatten(pkg.roots).find((n) => n.id === id)!;
describe("independent responsive mask coordinates", () => {
  it("keeps generated coordinate helpers out of the Figma layer explorer", () => {
    const pkg = maskResizePackage();
    const rows = entries({
      package: pkg,
      designs: [maskResizeDesign()],
      assets: {},
      previews: {},
      revision: 1,
    });
    const ids: string[] = [];
    const walk = (list: typeof rows) =>
      list.forEach((row) => {
        ids.push(row.node.id);
        walk(row.children);
      });
    walk(rows);
    expect(ids).toContain("rounded:content");
    expect(ids).not.toContain("rounded:mask/mask-content");
    expect(ids).not.toContain("rounded:mask/mask-content/mask-scale");
  });
  it("protects the generated coordinate helpers while retaining normal child edits", () => {
    const pkg = compile(
      [maskResizeDesign()],
      "protected",
      {
        layout: "responsive",
        layerOverrides: {
          "rounded:mask/mask-content": {
            renderMode: "skip",
            properties: { BackgroundTransparency: 0 },
            components: { scale: false },
          },
          "rounded:mask/mask-content/mask-scale": { properties: { Scale: 2 } },
          "rounded:content": { properties: { BackgroundTransparency: 0.5 } },
        },
      },
      "fixed",
    );
    expect(find(pkg, "rounded:content").properties.BackgroundTransparency).toBe(
      0.5,
    );
    expect(
      find(pkg, "rounded:mask/mask-content").properties.BackgroundTransparency,
    ).toBe(1);
    expect(() => validateMaskBases(pkg.roots)).not.toThrow();
  });
  it.each(maskResizePairs())(
    "preserves original child constraints for $name",
    ({ masked, original }) => {
      const content = find(masked, "rounded:content"),
        baseline = find(original, "rounded:content");
      expect(content.properties.Position).toEqual(baseline.properties.Position);
      expect(content.properties.Size).toEqual(baseline.properties.Size);
      const basis = find(masked, "rounded:mask/mask-content");
      expect(basis.maskBasis).toBe("rounded:group");
      expect(basis.children).toContain(content);
      expect(
        basis.children.find((n) => n.className === "UIScale")?.properties.Scale,
      ).toBe(1);
      expect(find(masked, "rounded:mask").children).toContain(basis);
      expect(() => validatePackage(masked)).not.toThrow();
    },
  );
  it("includes the trusted coordinate runtime and identity binding in models and every source format", () => {
    const pkg = maskResizePackage();
    const model = generateModel(pkg);
    expect(model).toContain("FramebridgeMaskBasis");
    expect(model).toContain("MaskLayout.mount");
    for (const { id } of SOURCE_FORMATS) {
      const source = generateSource(pkg, id);
      expect(source).toContain("FramebridgeMaskBasis");
    }
  });
  it("uses a noninteractive canvas helper so automatic scroll axes retain separate coordinate bases", () => {
    const pkg = maskResizePackage();
    const basis = find(pkg, "rounded:mask/mask-content");
    expect(basis.className).toBe("ScrollingFrame");
    expect(basis.properties).toMatchObject({
      Active: false,
      Selectable: false,
      ScrollingEnabled: false,
      ScrollBarThickness: 0,
    });
    expect(() => generateModel(pkg)).not.toThrow();
  });
  it("retains legacy Frame helpers for ordinary and manual-canvas packages", () => {
    const pkg = maskResizePackage();
    const basis = find(pkg, "rounded:mask/mask-content");
    basis.className = "Frame";
    for (const key of [
      "CanvasSize",
      "AutomaticCanvasSize",
      "ScrollingDirection",
      "ScrollingEnabled",
      "ScrollBarThickness",
    ])
      delete basis.properties[key];
    expect(() => validateMaskBases(pkg.roots)).not.toThrow();
    expect(() => generateModel(pkg)).not.toThrow();
  });
  it.each([
    "self",
    "missing",
    "outside",
    "wrong-class",
    "paint",
    "modifier",
    "scale",
    "scroll-input",
    "scrollbar",
    "selection",
    "active",
  ])("rejects invalid helper ownership or configuration: %s", (kind) => {
    const pkg = maskResizePackage(),
      basis = find(pkg, "rounded:mask/mask-content");
    if (kind === "self") basis.maskBasis = basis.id;
    if (kind === "missing") basis.maskBasis = "missing";
    if (kind === "outside") basis.maskBasis = "rounded:outside";
    if (kind === "wrong-class") basis.className = "ImageLabel";
    if (kind === "paint") basis.properties.BackgroundTransparency = 0;
    if (kind === "modifier")
      basis.children.push({
        id: "bad",
        name: "Bad",
        className: "UIPadding",
        properties: {},
        children: [],
      });
    if (kind === "scale") basis.children[0].properties.Scale = 2;
    if (kind === "scroll-input") basis.properties.ScrollingEnabled = true;
    if (kind === "scrollbar") basis.properties.ScrollBarThickness = 6;
    if (kind === "selection") basis.properties.Selectable = true;
    if (kind === "active") basis.properties.Active = true;
    expect(() => validateMaskBases(pkg.roots)).toThrow(/mask coordinate/i);
    expect(() => validatePackage(pkg)).toThrow();
    expect(() => generateModel(pkg)).toThrow(
      /mask coordinate|Invalid source property/i,
    );
  });
});
