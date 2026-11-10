import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { flatten, type DesignNode } from "../packages/core/src/types";

export const texture = { type: "IMAGE", imageHash: "background-fixture" };
export function decorationDesign(): DesignNode {
  return node("Background separation QA", {
    id: "decor:root",
    width: 480,
    height: 360,
    children: [
      node("Inventory_scroll", {
        id: "decor:scroll",
        width: 180,
        height: 140,
        transform: [
          [1, 0, 20],
          [0, 1, 20],
        ],
        fills: [texture],
        scrolling: "VERTICAL",
        clipsContent: true,
        layout: {
          mode: "VERTICAL",
          spacing: 8,
          padding: [8, 8, 8, 8],
          primary: "MIN",
          counter: "MIN",
          wrap: false,
        },
        children: Array.from({ length: 4 }, (_, i) =>
          node(`Card ${i}`, {
            id: `decor:card:${i}`,
            width: 160,
            height: 60,
            fills: [
              {
                type: "SOLID",
                color: { r: 0.12, g: 0.23 + i * 0.04, b: 0.38 },
              },
            ],
            radius: 6,
            transform: [
              [1, 0, 8],
              [0, 1, 8 + i * 68],
            ],
          }),
        ),
      }),
      node("Purchase_button", {
        id: "decor:button",
        width: 140,
        height: 50,
        transform: [
          [1, 0, 240],
          [0, 1, 20],
        ],
        fills: [texture],
        children: [
          node("Icon", {
            id: "decor:icon",
            type: "VECTOR",
            width: 24,
            height: 24,
          }),
        ],
      }),
      node("Card", {
        id: "decor:panel",
        width: 160,
        height: 100,
        opacity: 0.5,
        transform: [
          [1, 0, 240],
          [0, 1, 120],
        ],
        fills: [texture],
        children: [
          node("Editable content", {
            id: "decor:content",
            width: 60,
            height: 30,
            fills: [{ type: "SOLID", color: { r: 0.1, g: 0.7, b: 0.6 } }],
            transform: [
              [1, 0, 20],
              [0, 1, 20],
            ],
          }),
        ],
      }),
    ],
  });
}
export function decorationPackage() {
  const pkg = compile(
    [decorationDesign()],
    "decoration-qa",
    { layout: "responsive" },
    "fixed",
  );
  for (const asset of pkg.assets) asset.robloxId = "123";
  for (const n of flatten(pkg.roots))
    if (n.assetRef) n.properties.Image = "rbxassetid://123";
  return pkg;
}
