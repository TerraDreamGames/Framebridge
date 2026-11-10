import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import {
  flatten,
  type DesignNode,
  type ExportOptions,
} from "../packages/core/src/types";
const text = () =>
  node("Label", {
    id: "label",
    type: "TEXT",
    text: {
      characters: "Buy",
      align: "LEFT",
      verticalAlign: "CENTER",
      runs: [
        {
          text: "Buy",
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize: 16,
        },
      ],
    },
  });
function exported(source: DesignNode, options: Partial<ExportOptions> = {}) {
  return compile(
    [node("Screen", { id: "root", children: [source] })],
    "artwork-test",
    options,
    "fixed",
  );
}
function target(pkg: ReturnType<typeof exported>, id = "art") {
  return flatten(pkg.roots).find((n) => n.id === id)!;
}
describe.each(["faithful", "editable"] as const)(
  "automatic artwork under %s appearance",
  (appearance) => {
    it.each(["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "LINE", "ARC"])(
      "exports %s as an image without an override",
      (type) => {
        const pkg = exported(node("Art", { id: "art", type }), { appearance });
        expect(target(pkg).className).toBe("ImageLabel");
        expect(pkg.assets.map((a) => a.nodeId)).toEqual(["art"]);
      },
    );
    it.each(["RECTANGLE", "FRAME"])("recognizes an image-filled %s", (type) => {
      const pkg = exported(
        node("Photo", {
          id: "art",
          type,
          fills: [{ type: "IMAGE", imageHash: "photo" }],
        }),
        { appearance },
      );
      expect(target(pkg).className).toBe("ImageLabel");
      expect(pkg.assets).toHaveLength(1);
    });
    it("preserves ellipses and arcs as artwork", () => {
      for (const props of [
        { width: 80, height: 40 },
        { width: 80, height: 80, unsupported: ["ellipse arc"] },
      ]) {
        expect(
          target(
            exported(node("Arc", { id: "art", type: "ELLIPSE", ...props }), {
              appearance,
            }),
          ).className,
        ).toBe("ImageLabel");
      }
    });
    it("bakes a composite vector group once", () => {
      const group = node("Icon", {
        id: "art",
        type: "GROUP",
        children: [
          node("Path", { id: "path", type: "VECTOR" }),
          node("Dot", { id: "dot", type: "ELLIPSE" }),
        ],
      });
      const pkg = exported(group, { appearance });
      expect(target(pkg).className).toBe("ImageLabel");
      expect(pkg.assets.map((a) => a.nodeId)).toEqual(["art"]);
      expect(flatten(pkg.roots).some((n) => n.id === "path")).toBe(false);
    });
    it("keeps mixed text and artwork editable independently", () => {
      const group = node("Control", {
        id: "art",
        type: "GROUP",
        children: [text(), node("Icon", { id: "icon", type: "VECTOR" })],
      });
      const pkg = exported(group, { appearance });
      expect(target(pkg).className).toBe("Frame");
      expect(target(pkg, "label").className).toBe("TextLabel");
      expect(target(pkg, "icon").className).toBe("ImageLabel");
    });
    it("keeps supported shapes native", () => {
      for (const type of ["FRAME", "RECTANGLE", "ELLIPSE"]) {
        const pkg = exported(
          node("Box", { id: "art", type, width: 80, height: 80 }),
          { appearance },
        );
        expect(target(pkg).className).toBe("Frame");
        expect(pkg.assets).toHaveLength(0);
      }
    });
  },
);
it("honors intentional native/image overrides and image-button semantics", () => {
  const art = node("Icon [button]", { id: "art", type: "VECTOR" });
  expect(target(exported(art, { appearance: "editable" })).className).toBe(
    "ImageButton",
  );
  expect(
    target(
      exported(art, {
        appearance: "editable",
        layerOverrides: { art: { renderMode: "native", className: "Frame" } },
      }),
    ).className,
  ).toBe("Frame");
  const icon = node("Icon", {
    id: "art",
    type: "GROUP",
    children: [node("Path", { id: "path", type: "VECTOR" })],
  });
  const pkg = exported(icon, {
    appearance: "editable",
    layerOverrides: {
      path: { properties: { Size: { type: "UDim2", value: [0, 48, 0, 48] } } },
    },
  });
  expect(target(pkg).className).toBe("Frame");
  expect(target(pkg, "path").className).toBe("ImageLabel");
});
