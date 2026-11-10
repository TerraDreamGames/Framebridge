import { describe, expect, it, vi } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { flatten, type DesignNode } from "../packages/core/src/types";
import { snapshot } from "../plugins/figma/src/snapshot";
import { defaultProperties, validProperty } from "../packages/core/src/editor";

const gradient = {
  type: "GRADIENT_LINEAR",
  gradientTransform: [
    [1, 0, 0],
    [0, 1, 0],
  ] as [[number, number, number], [number, number, number]],
  gradientStops: [
    { position: 0, color: { r: 1, g: 0, b: 0 } },
    { position: 1, color: { r: 0, g: 0, b: 1 } },
  ],
};
const shadow = {
  type: "DROP_SHADOW" as const,
  radius: 12,
  spread: 2,
  offset: { x: 3, y: 4 },
  color: { r: 0, g: 0, b: 0, a: 0.25 },
  blendMode: "NORMAL",
};
const exportNode = (props: Partial<DesignNode>) =>
  compile([node("Panel", { id: "panel", ...props })], "visuals", {}, "fixed");

describe("native editable appearance", () => {
  it("keeps independent corners and a filled-box shadow native without images", () => {
    const pkg = exportNode({
      corners: [0, 12, 24, 6],
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      effects: ["DROP_SHADOW"],
      shadows: [shadow],
    });
    expect(pkg.assets).toHaveLength(0);
    const nodes = flatten(pkg.roots);
    expect(nodes.find((n) => n.className === "UICorner")!.properties).toEqual({
      TopLeftRadius: { type: "UDim", value: [0, 0] },
      TopRightRadius: { type: "UDim", value: [0, 12] },
      BottomRightRadius: { type: "UDim", value: [0, 24] },
      BottomLeftRadius: { type: "UDim", value: [0, 6] },
    });
    const p = nodes.find((n) => n.className === "UIShadow")!.properties;
    expect(p.Offset).toEqual({ type: "UDim2", value: [0, 3, 0, 4] });
    expect(p.Spread).toEqual({ type: "UDim2", value: [0, 2, 0, 2] });
    expect(p.Transparency).toBe(0.75);
    expect(pkg.issues.some((i) => i.code === "appearance-approximation")).toBe(
      false,
    );
  });
  it("leaves inner shadows and content-shaped glows in fallback", () => {
    const inner = exportNode({
      effects: ["INNER_SHADOW"],
      shadows: [{ ...shadow, type: "INNER_SHADOW" }],
    });
    expect(inner.assets).toHaveLength(1);
    const glow = exportNode({
      fills: [],
      effects: ["DROP_SHADOW"],
      shadows: [shadow],
    });
    expect(glow.assets).toHaveLength(1);
    expect(flatten(glow.roots).some((n) => n.className === "UIShadow")).toBe(
      false,
    );
  });
  it("layers native paints and gradient borders without swallowing source children", () => {
    const pkg = exportNode({
      fills: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.25 },
        gradient,
      ],
      strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, gradient],
      strokeWeight: 2,
      children: [node("Card", { id: "card" })],
      layout: {
        mode: "VERTICAL",
        spacing: 8,
        padding: [4, 4, 4, 4],
        primary: "MIN",
        counter: "MIN",
        wrap: false,
      },
    });
    const responsive = compile(
      [
        node("Panel", {
          id: "panel",
          fills: [gradient, { type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
          children: [node("Card", { id: "card" })],
          layout: {
            mode: "VERTICAL",
            spacing: 8,
            padding: [4, 4, 4, 4],
            primary: "MIN",
            counter: "MIN",
            wrap: false,
          },
        }),
      ],
      "visuals",
      { layout: "responsive" },
    );
    expect(pkg.assets).toHaveLength(0);
    expect(
      flatten(pkg.roots).filter((n) => n.className === "UIStroke"),
    ).toHaveLength(2);
    expect(flatten(pkg.roots).some((n) => n.id === "card")).toBe(true);
    const holder = flatten(responsive.roots).find(
      (n) => n.id === "panel/content",
    )!;
    expect(holder.children.some((n) => n.className === "UIListLayout")).toBe(
      true,
    );
    expect(holder.children.some((n) => n.id === "card")).toBe(true);
    expect(holder.children.some((n) => n.id.startsWith("panel/fill:"))).toBe(
      false,
    );
    const ids = flatten(responsive.roots).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("allows shadow configuration and avoids ambiguous corner defaults", () => {
    expect(defaultProperties("UICorner")).toEqual({
      CornerRadius: { type: "UDim", value: [0, 8] },
    });
    expect(
      validProperty("UICorner", "TopLeftRadius", {
        type: "UDim",
        value: [0, 0],
      }),
    ).toBe(true);
    expect(
      validProperty("UIShadow", "BlurRadius", { type: "UDim", value: [0, -1] }),
    ).toBe(false);
    expect(
      validProperty("UIShadow", "Spread", {
        type: "UDim2",
        value: [0, -2, 0, -2],
      }),
    ).toBe(true);
  });
  it("captures full Figma shadow data and ignores invisible effects", () => {
    vi.stubGlobal("figma", { mixed: Symbol("mixed") });
    try {
      const source = {
        id: "p",
        name: "Panel",
        type: "FRAME",
        width: 100,
        height: 50,
        relativeTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        visible: true,
        opacity: 1,
        fills: [],
        strokes: [],
        children: [],
        effects: [
          { ...shadow, visible: true },
          { ...shadow, visible: false },
        ],
      };
      expect(snapshot(source as unknown as SceneNode).shadows).toEqual([
        shadow,
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
