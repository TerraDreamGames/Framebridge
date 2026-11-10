import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { defaultProperties, validProperty } from "../packages/core/src/editor";
import { flatten } from "../packages/core/src/types";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { validatePackage } from "../packages/relay/src/protocol";
import {
  propertyDescription,
  propertyMatches,
} from "../plugins/figma/src/property-presentation";
import { PROPERTY_SCHEMAS } from "../packages/core/src/editor";
import { viewportDesign, viewportPackage } from "./viewport-fixtures";

describe("ViewportFrame workflow", () => {
  it("keeps an explicitly assigned viewport and its text editable while baking child artwork", () => {
    const design = viewportDesign();
    const before = JSON.stringify(design);
    const pkg = compile(design, "source", {
      appearance: "faithful",
      layerOverrides: { viewport: { className: "ViewportFrame" } },
    });
    const nodes = flatten(pkg.roots);
    expect(nodes.find((n) => n.id === "viewport")?.className).toBe(
      "ViewportFrame",
    );
    expect(nodes.find((n) => n.id === "item-name")?.className).toBe(
      "TextLabel",
    );
    expect(nodes.find((n) => n.id === "rarity-icon")?.className).toBe(
      "ImageLabel",
    );
    expect(pkg.assets.map((a) => a.nodeId)).toEqual(["rarity-icon"]);
    expect(JSON.stringify(design)).toBe(before);
  });
  it("accepts configured lighting through a JSON transfer without camera references", () => {
    const pkg = viewportPackage();
    expect(() =>
      validatePackage(JSON.parse(JSON.stringify(pkg))),
    ).not.toThrow();
    expect(
      flatten(pkg.roots).find((n) => n.id === "viewport")?.properties
        .LightDirection,
    ).toEqual({ type: "Vector3", value: [1, -2, -3] });
    expect(defaultProperties("ViewportFrame")).not.toHaveProperty(
      "CurrentCamera",
    );
    expect(defaultProperties("ViewportFrame")).not.toHaveProperty("Image");
  });
  it("does not infer a viewport from names or vector artwork", () => {
    const design = viewportDesign();
    design[0].children[0].name = "ViewportFrame item preview";
    const pkg = compile(design, "source");
    expect(flatten(pkg.roots).find((n) => n.id === "viewport")?.className).toBe(
      "Frame",
    );
    expect(
      flatten(pkg.roots).find((n) => n.id === "rarity-icon")?.className,
    ).toBe("ImageLabel");
  });
  it.each([
    null,
    1,
    { type: "Vector2", value: [1, 2] },
    { type: "Vector3", value: [1, 2] },
    { type: "Vector3", value: [1, 2, 3, 4] },
    { type: "Vector3", value: [1, NaN, 3] },
    { type: "Vector3", value: [1, Infinity, 3] },
    { type: "Vector3", value: [1, "2", 3] },
    { type: "Vector3", value: [1, 1e7, 3] },
  ])("rejects malformed light direction %j", (value) => {
    expect(validProperty("ViewportFrame", "LightDirection", value)).toBe(false);
  });
  it("uses Studio defaults and accepts negative light direction components", () => {
    const defaults = defaultProperties("ViewportFrame");
    expect(defaults.LightDirection).toEqual({
      type: "Vector3",
      value: [-1, -1, -1],
    });
    expect(defaults.Ambient).toEqual({
      type: "Color3",
      value: [200 / 255, 200 / 255, 200 / 255],
    });
    for (const [name, value] of Object.entries(defaults))
      expect(validProperty("ViewportFrame", name, value)).toBe(true);
  });
  it("makes lighting properties discoverable in Common and search", () => {
    expect(PROPERTY_SCHEMAS.ViewportFrame.LightDirection.kind).toBe("Vector3");
    expect(
      propertyMatches(
        "Ambient",
        PROPERTY_SCHEMAS.ViewportFrame.Ambient,
        "illumination",
      ),
    ).toBe(true);
    expect(propertyDescription("LightDirection")).toContain("X, Y and Z");
  });
  it.each(SOURCE_FORMATS)(
    "exports lighting and children as $label",
    ({ id }) => {
      const code = generateSource(viewportPackage(), id);
      expect(code).toContain(id === "tsx" ? "<viewportframe" : "ViewportFrame");
      expect(code).toContain("LightDirection");
      expect(code).toContain(
        id === "tsx" ? "new Vector3(1, -2, -3)" : "Vector3.new(1, -2, -3)",
      );
      expect(code).toContain("Explorer backpack");
      expect(code).not.toContain("CurrentCamera");
    },
  );
});
