import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import {
  flatten,
  type DesignNode,
  type ExportOptions,
} from "../packages/core/src/types";
export const drop = {
  type: "DROP_SHADOW" as const,
  radius: 8,
  spread: 0,
  offset: { x: 0, y: 2 },
  color: { r: 0.2, g: 0.5, b: 1, a: 0.8 },
  blendMode: "NORMAL",
};
const solid = (r: number, g: number, b: number) => [
  { type: "SOLID", color: { r, g, b } },
];
export function effectDesign(): DesignNode {
  const text = node("Editable glowing title", {
    id: "effect:text",
    type: "TEXT",
    width: 180,
    height: 40,
    transform: [
      [1, 0, 32],
      [0, 1, 24],
    ],
    opacity: 0.6,
    fills: solid(1, 1, 1),
    effects: ["DROP_SHADOW"],
    shadows: [drop],
    effectBounds: { x: -12, y: -8, width: 204, height: 60 },
    text: {
      characters: "Editable glow",
      align: "LEFT",
      verticalAlign: "CENTER",
      runs: [
        {
          text: "Editable glow",
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize: 24,
        },
      ],
    },
  });
  return node("Synthetic own effects and blends QA", {
    id: "effect:root",
    width: 640,
    height: 420,
    fills: solid(0.2, 0.4, 0.6),
    children: [
      text,
      node("Image background container", {
        id: "effect:container",
        width: 180,
        height: 140,
        opacity: 0.5,
        transform: [
          [1, 0, 32],
          [0, 1, 110],
        ],
        fills: [{ type: "IMAGE", imageHash: "synthetic-effect-background" }],
        effects: ["DROP_SHADOW"],
        shadows: [drop],
        effectBounds: { x: -12, y: -8, width: 204, height: 160 },
        children: [
          node("Editable card", {
            id: "effect:child",
            width: 80,
            height: 32,
            fills: solid(0.8, 0.4, 0.2),
          }),
        ],
      }),
      node("Known flat backdrop", {
        id: "effect:flat",
        width: 250,
        height: 110,
        transform: [
          [1, 0, 300],
          [0, 1, 180],
        ],
        fills: solid(0.25, 0.5, 0.75),
        children: [
          node("Blend purchase [button]", {
            id: "effect:blend",
            width: 140,
            height: 44,
            transform: [
              [1, 0, 12],
              [0, 1, 12],
            ],
            radius: 8,
            fills: [
              {
                type: "SOLID",
                color: { r: 0.8, g: 0.4, b: 0.2 },
                opacity: 0.7,
                blendMode: "MULTIPLY",
              },
            ],
            children: [
              node("Live content", {
                id: "effect:blend-child",
                width: 30,
                height: 20,
              }),
            ],
          }),
        ],
      }),
      node("Native filled box", {
        id: "effect:box",
        width: 100,
        height: 40,
        transform: [
          [1, 0, 300],
          [0, 1, 30],
        ],
        fills: solid(0.3, 0.5, 0.2),
        effects: ["DROP_SHADOW"],
        shadows: [drop],
      }),
    ],
  });
}
export function effectPackage(
  options: Partial<ExportOptions> = {},
  design = effectDesign(),
) {
  const pkg = compile(
    [design],
    "effect-decoration-qa",
    { layout: "responsive", appearance: "editable", ...options },
    "fixed",
  );
  for (const asset of pkg.assets) asset.robloxId = "123";
  for (const n of flatten(pkg.roots))
    if (n.assetRef) n.properties.Image = "rbxassetid://123";
  return pkg;
}
