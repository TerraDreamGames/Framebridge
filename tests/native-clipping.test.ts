import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { nativeMaskPlan } from "../packages/core/src/native-clipping";
import {
  flatten,
  type DesignNode,
  type ExportOptions,
  type RbxNode,
} from "../packages/core/src/types";
import { validatePackage } from "../packages/relay/src/protocol";
import { maskDesign, maskPackages } from "./mask-fixtures";
const find = (pkg: ReturnType<typeof compile>, id: string) =>
  flatten(pkg.roots).find((n) => n.id === id)!;
const values = (n: RbxNode, p: string) =>
  (n.properties[p] as { value: number[] }).value;
const shape = (design: DesignNode) => design.children[0].children[1];
const exported = (design: DesignNode, options: Partial<ExportOptions> = {}) =>
  compile([design], "mask-test", options, "fixed");

describe("editable mask geometry", () => {
  it("keeps earlier siblings outside the clip and masked text editable", () => {
    const pkg = exported(maskDesign());
    const clip = find(pkg, "rounded:mask");
    expect(clip.className).toBe("CanvasGroup");
    expect(clip.children.map((n) => n.id)).toEqual([
      "rounded:mask/corner",
      "rounded:content",
    ]);
    expect(find(pkg, "rounded:outside").className).toBe("Frame");
    expect(find(pkg, "rounded:group").children.map((n) => n.id)).toEqual([
      "rounded:outside",
      "rounded:mask",
    ]);
    expect(find(pkg, "rounded:label").className).toBe("TextLabel");
    expect(values(clip, "Position")).toEqual([0, 20, 0, 20]);
    expect(values(find(pkg, "rounded:content"), "Position")).toEqual([
      0, -20, 0, -20,
    ]);
    expect(values(find(pkg, "rounded:mask/corner"), "CornerRadius")).toEqual([
      0, 24,
    ]);
    expect(clip.properties).toMatchObject({
      BackgroundTransparency: 1,
      GroupTransparency: 0,
      ClipsDescendants: true,
    });
    expect(pkg.assets).toHaveLength(0);
    expect(pkg.issues.some((i) => i.code === "native-mask")).toBe(true);
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("makes a circular clip rather than drawing the mask fill", () => {
    const pkg = exported(maskDesign("circle"));
    expect(values(find(pkg, "circle:mask/corner"), "CornerRadius")).toEqual([
      0.5, 0,
    ]);
    expect(find(pkg, "circle:mask").properties.BackgroundTransparency).toBe(1);
  });
  it("retains separate mask runs and drawing order", () => {
    const pkg = exported(maskDesign("multiple"));
    const parent = find(pkg, "multiple:group");
    expect(parent.children.map((n) => n.id)).toEqual([
      "multiple:outside",
      "multiple:mask",
      "multiple:second-mask",
    ]);
    expect(
      find(pkg, "multiple:mask").children.some(
        (n) => n.id === "multiple:second-content",
      ),
    ).toBe(false);
    expect(
      find(pkg, "multiple:second-mask").children.some(
        (n) => n.id === "multiple:second-content",
      ),
    ).toBe(true);
    expect(values(find(pkg, "multiple:second-content"), "Position")).toEqual([
      0, -10, 0, -20,
    ]);
    expect(parent.children.map((n) => n.properties.ZIndex)).toEqual([1, 2, 3]);
  });
  it("ends a scope at a direct clipped sibling and keeps later siblings outside", () => {
    const design = maskDesign();
    const g = design.children[0];
    g.children.push(
      node("Clipped sibling", { id: "boundary", clipsContent: true }),
      node("Later", { id: "later" }),
    );
    const pkg = exported(design);
    expect(find(pkg, "rounded:group").children.map((n) => n.id)).toEqual([
      "rounded:outside",
      "rounded:mask",
      "boundary",
      "later",
    ]);
  });
  it("starts an independent scope for a separate nested mask object", () => {
    const design = maskDesign();
    const nested = maskDesign("circle").children[0];
    design.children[0].children.push(nested, node("Later", { id: "later" }));
    const pkg = exported(design);
    expect(find(pkg, "rounded:group").children.map((n) => n.id)).toEqual([
      "rounded:outside",
      "rounded:mask",
      "circle:group",
      "later",
    ]);
    expect(find(pkg, "circle:mask").className).toBe("CanvasGroup");
  });
  it("moves the source mask independently without mutating source or global content coordinates", () => {
    const design = maskDesign();
    shape(design).transform = [
      [1, 0, 50],
      [0, 1, 60],
    ];
    shape(design).width = 110;
    const saved = JSON.stringify(design),
      pkg = exported(design),
      clip = find(pkg, "rounded:mask"),
      content = find(pkg, "rounded:content");
    expect(values(clip, "Position")).toEqual([0, 50, 0, 60]);
    expect(values(content, "Position")).toEqual([0, -50, 0, -60]);
    expect(values(clip, "Size")).toEqual([0, 110, 0, 100]);
    expect(JSON.stringify(design)).toBe(saved);
  });
  it("keeps vector art as its own linked image, with its bounds rebased only once", () => {
    const design = maskDesign("image");
    const content = design.children[0].children[2];
    // Direct masked artwork uses the parent's source coordinate space.
    design.children[0].children.push(content.children.pop()!);
    const pkg = exported(design, {
      assetIds: { "image:image:icon:bleed-v2": "rbxassetid://123" },
    });
    const image = find(pkg, "image:icon");
    expect(image.className).toBe("ImageLabel");
    expect(image.assetRef).toBe("image:image:icon:bleed-v2");
    expect(image.properties.Image).toBe("rbxassetid://123");
    expect(values(image, "Position")).toEqual([0, 58, 0, 8]);
    expect(values(image, "Size")).toEqual([0, 32, 0, 32]);
    expect(pkg.assets.map((a) => a.nodeId)).toEqual(["image:icon"]);
  });
  it("retains scroll viewport, native list and automatic canvas underneath the clip", () => {
    const pkg = maskPackages().maskScroll;
    expect(find(pkg, "scroll:mask").className).toBe("CanvasGroup");
    expect(find(pkg, "scroll:root").className).toBe("Frame");
    const viewport = find(pkg, "scroll:viewport"),
      items = find(pkg, "scroll:items");
    expect(viewport.className).toBe("ScrollingFrame");
    expect(viewport.properties.AutomaticCanvasSize).toEqual({
      type: "Enum",
      value: ["AutomaticSize", "Y"],
    });
    expect(items.children.some((n) => n.className === "UIListLayout")).toBe(
      true,
    );
    expect(items.properties.AutomaticSize).toEqual({
      type: "Enum",
      value: ["AutomaticSize", "Y"],
    });
    expect(
      flatten(items.children).filter((n) => n.className === "TextLabel"),
    ).toHaveLength(12);
    expect(pkg.assets).toHaveLength(0);
  });
});

describe("mask alpha semantics", () => {
  it("multiplies uniform alpha by layer opacity", () => {
    expect(
      find(exported(maskDesign("alpha")), "alpha:mask").properties
        .GroupTransparency,
    ).toBe(0.75);
  });
  it.each([0, 0.1, 1])(
    "uses full vector outline only when opacity is positive (%s)",
    (opacity) => {
      const design = maskDesign("vector");
      shape(design).opacity = opacity;
      expect(
        find(exported(design), "vector:mask").properties.GroupTransparency,
      ).toBe(opacity > 0 ? 0 : 1);
    },
  );
  it.each(["ALPHA", "VECTOR"] as const)(
    "an empty %s mask reveals no contents",
    (kind) => {
      const design = maskDesign();
      shape(design).maskType = kind;
      shape(design).fills = [];
      expect(
        find(exported(design), "rounded:mask").properties.GroupTransparency,
      ).toBe(1);
    },
  );
  it("composites multiple uniform fills before applying alpha mask opacity", () => {
    const design = maskDesign();
    const mask = shape(design);
    mask.opacity = 0.5;
    mask.fills = [
      { type: "SOLID", opacity: 0.4 },
      { type: "SOLID", opacity: 0.1 },
    ];
    expect(
      find(exported(design), "rounded:mask").properties.GroupTransparency,
    ).toBeCloseTo(0.77);
  });
  it("supports uniform gradient alpha without importing its RGB colors", () => {
    const design = maskDesign();
    shape(design).fills = [
      {
        type: "GRADIENT_RADIAL",
        gradientStops: [
          { position: 0, color: { r: 1, g: 0, b: 0, a: 0.4 } },
          { position: 1, color: { r: 0, g: 0, b: 1, a: 0.4 } },
        ],
      },
    ];
    expect(
      find(exported(design), "rounded:mask").properties.GroupTransparency,
    ).toBeCloseTo(0.6);
  });
  it("ignores hidden paint and zero-width stroke decoration", () => {
    const design = maskDesign();
    const mask = shape(design);
    mask.fills.push({ type: "IMAGE", visible: false });
    mask.strokes = [{ type: "SOLID" }];
    mask.strokeWeight = 0;
    expect(find(exported(design), "rounded:mask").className).toBe(
      "CanvasGroup",
    );
  });
});

describe("explicit fallback and overrides", () => {
  const invalid: [string, (mask: DesignNode, design: DesignNode) => void][] = [
    ["luminance", (m) => (m.maskType = "LUMINANCE")],
    [
      "stroked",
      (m) => {
        m.strokes = [{ type: "SOLID" }];
        m.strokeWeight = 3;
      },
    ],
    [
      "non-uniform alpha",
      (m) =>
        (m.fills = [
          {
            type: "GRADIENT_LINEAR",
            gradientStops: [
              { position: 0, color: { r: 1, g: 1, b: 1, a: 0 } },
              { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
            ],
          },
        ]),
    ],
    [
      "image alpha",
      (m) => (m.fills = [{ type: "IMAGE", imageHash: "unknown" }]),
    ],
    ["unequal corners", (m) => (m.corners = [1, 2, 3, 4])],
    [
      "oval",
      (m) => {
        m.type = "ELLIPSE";
        m.width = 90;
      },
    ],
    [
      "scaled matrix",
      (m) =>
        (m.transform = [
          [2, 0, 20],
          [0, 0.5, 20],
        ]),
    ],
    [
      "rotated",
      (m) =>
        (m.transform = [
          [0, -1, 20],
          [1, 0, 20],
        ]),
    ],
    [
      "ancestor rotation",
      (_m, d) =>
        (d.transform = [
          [0, -1, 0],
          [1, 0, 0],
        ]),
    ],
    ["unknown shape", (m) => (m.type = "VECTOR")],
    ["blur", (m) => (m.effects = ["LAYER_BLUR"])],
    [
      "auto layout",
      (_m, d) =>
        (d.children[0].layout = {
          mode: "HORIZONTAL",
          spacing: 0,
          padding: [0, 0, 0, 0],
          primary: "MIN",
          counter: "MIN",
          wrap: false,
        }),
    ],
  ];
  it.each(invalid)(
    "%s uses a whole-container image and blocks an explicit native request",
    (_name, change) => {
      const design = maskDesign();
      change(shape(design), design);
      const pkg = exported(design),
        parent = find(pkg, "rounded:group");
      expect(parent.className).toBe("ImageLabel");
      expect(parent.children).toHaveLength(0);
      expect(pkg.issues.some((i) => i.code === "mask-fallback")).toBe(true);
      const explicit = exported(design, {
        layerOverrides: { "rounded:group": { renderMode: "native" } },
      });
      expect(
        explicit.issues.some(
          (i) => i.code === "mask-fallback" && i.severity === "error",
        ),
      ).toBe(true);
    },
  );
  it("an intentional parent image stays one image", () => {
    const pkg = exported(maskDesign(), {
      layerOverrides: { "rounded:group": { renderMode: "image" } },
    });
    expect(find(pkg, "rounded:group").className).toBe("ImageLabel");
    expect(pkg.assets.map((a) => a.nodeId)).toEqual(["rounded:group"]);
    expect(pkg.issues.some((i) => i.code === "native-mask")).toBe(false);
  });
  it("keeps configured child properties and runtime action identities", () => {
    const design = maskDesign();
    const group = design.children[0];
    group.children.push(
      node("Open [button]", { id: "open", width: 30, height: 20 }),
    );
    const pkg = exported(design, {
      layerOverrides: {
        "rounded:label": { properties: { Text: "Changed" } },
        "rounded:content": {
          behavior: { role: "panel", initialVisible: false },
        },
        open: {
          behavior: { action: { kind: "open", target: "rounded:content" } },
        },
      },
    });
    expect(find(pkg, "rounded:label").properties.Text).toBe("Changed");
    expect(find(pkg, "open").behavior?.action?.target).toBe("rounded:content");
    expect(find(pkg, "rounded:content").properties.Visible).toBe(false);
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it.each(["Frame", "ImageLabel"])(
    "a mask's incompatible class override (%s) is explained",
    (className) => {
      const pkg = exported(maskDesign(), {
        layerOverrides: { "rounded:mask": { className } },
      });
      expect(
        pkg.issues.some(
          (i) =>
            i.code === "mask-fallback" &&
            i.message.includes("CanvasGroup") &&
            i.severity === "error",
        ),
      ).toBe(true);
    },
  );
  it("reports native transform limits without trusting determinant-only checks", () => {
    const design = maskDesign();
    shape(design).transform = [
      [2, 0, 20],
      [0, 0.5, 20],
    ];
    expect(nativeMaskPlan(design.children[0])?.reason).toContain("transformed");
  });
});
