import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import type { DesignNode, TransferPackage } from "../packages/core/src/types";

export type MaskCase =
  "rounded" | "circle" | "alpha" | "vector" | "multiple" | "scroll" | "image";
export function maskDesign(kind: MaskCase = "rounded"): DesignNode {
  const id = (suffix: string) => `${kind}:${suffix}`;
  const shape = node("Mask", {
    id: id("mask"),
    type: kind === "circle" ? "ELLIPSE" : "RECTANGLE",
    width: kind === "circle" ? 100 : 160,
    height: 100,
    transform: [
      [1, 0, 20],
      [0, 1, 20],
    ],
    radius: kind === "circle" ? 0 : 24,
    isMask: true,
    maskType: kind === "circle" || kind === "vector" ? "VECTOR" : "ALPHA",
    opacity: kind === "alpha" ? 0.5 : 1,
    fills: [
      {
        type: "SOLID",
        opacity: kind === "vector" || kind === "alpha" ? 0.5 : 1,
        color: { r: 1, g: 1, b: 1 },
      },
    ],
  });
  const label = node("Quest", {
    id: id("label"),
    type: "TEXT",
    width: 100,
    height: 24,
    transform: [
      [1, 0, 24],
      [0, 1, 30],
    ],
    text: {
      characters: "Find shelter",
      runs: [
        {
          text: "Find shelter",
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize: 14,
          color: { r: 1, g: 1, b: 1 },
        },
      ],
      align: "LEFT",
      verticalAlign: "CENTER",
      autoResize: "NONE",
    },
  });
  const content = node("Content", {
    id: id("content"),
    width: 240,
    height: 160,
    fills: [{ type: "SOLID", color: { r: 0.9, g: 0.35, b: 0.1 } }],
    children: [label],
  });
  const children = [
    node("Outside mask", {
      id: id("outside"),
      type: "RECTANGLE",
      width: 12,
      height: 12,
      fills: [{ type: "SOLID", color: { r: 0, g: 1, b: 0 } }],
    }),
    shape,
    content,
  ];
  if (kind === "image")
    content.children.push(
      node("Icon", {
        id: id("icon"),
        type: "VECTOR",
        width: 28,
        height: 28,
        transform: [
          [1, 0, 80],
          [0, 1, 30],
        ],
        rasterBounds: { x: 78, y: 28, width: 32, height: 32 },
      }),
    );
  if (kind === "multiple")
    children.push(
      {
        ...structuredClone(shape),
        id: id("second-mask"),
        name: "Second mask",
        transform: [
          [1, 0, 190],
          [0, 1, 20],
        ],
        width: 40,
        height: 60,
        radius: 8,
      },
      node("Second content", {
        id: id("second-content"),
        type: "RECTANGLE",
        width: 80,
        height: 100,
        transform: [
          [1, 0, 180],
          [0, 1, 0],
        ],
        fills: [{ type: "SOLID", color: { r: 0.1, g: 0.5, b: 0.9 } }],
      }),
    );
  if (kind === "scroll") {
    // An ordinary group keeps the scrolling viewport inside the mask scope.
    // A direct clipped sibling would end that scope according to Figma's docs.
    const rows = Array.from({ length: 12 }, (_, index) =>
      node(`Quest ${index + 1}`, {
        id: id(`row-${index}`),
        width: 184,
        height: 28,
        layoutSizing: { horizontal: "FILL", vertical: "FIXED" },
        fills: [{ type: "SOLID", color: { r: 0.15, g: 0.3, b: 0.55 } }],
        radius: 4,
        children: [
          {
            ...structuredClone(label),
            id: id(`label-${index}`),
            name: `Quest ${index + 1}`,
            width: 170,
            height: 24,
            transform: [
              [1, 0, 8],
              [0, 1, 2],
            ],
            text: {
              ...structuredClone(label.text!),
              characters: `Quest ${index + 1}`,
              runs: [{ ...label.text!.runs[0], text: `Quest ${index + 1}` }],
            },
          },
        ],
      }),
    );
    shape.width = 200;
    shape.height = 140;
    shape.transform = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    content.type = "GROUP";
    content.width = 200;
    content.height = 140;
    content.fills = [];
    content.children = [
      node("Quest viewport [scroll]", {
        id: id("viewport"),
        width: 200,
        height: 140,
        clipsContent: true,
        scrolling: "VERTICAL",
        children: [
          node("Items", {
            id: id("items"),
            width: 200,
            height: 440,
            layoutSizing: { horizontal: "FILL", vertical: "HUG" },
            layout: {
              mode: "VERTICAL",
              spacing: 8,
              padding: [8, 8, 8, 8],
              primary: "MIN",
              counter: "MIN",
              wrap: false,
              sizingX: "FIXED",
              sizingY: "AUTO",
            },
            children: rows,
          }),
        ],
      }),
    ];
  }
  return node(`Mask QA · ${kind} example`, {
    id: id("root"),
    width: 320,
    height: 240,
    fills: [{ type: "SOLID", color: { r: 0.08, g: 0.1, b: 0.14 } }],
    children: [
      node("Masked content", {
        id: id("group"),
        type: "GROUP",
        width: 240,
        height: 160,
        transform: [
          [1, 0, 30],
          [0, 1, 40],
        ],
        children,
      }),
    ],
  });
}
export function maskPackages(): Record<string, TransferPackage> {
  return Object.fromEntries(
    (
      [
        "rounded",
        "circle",
        "alpha",
        "vector",
        "multiple",
        "scroll",
        "image",
      ] as MaskCase[]
    ).map((kind) => [
      `mask${kind[0].toUpperCase() + kind.slice(1)}`,
      compile(
        [maskDesign(kind)],
        `mask-qa-${kind}`,
        {
          layout: kind === "scroll" ? "responsive" : "exact",
          assetIds: { "image:image:icon:bleed-v2": "rbxassetid://123" },
        },
        "fixed",
      ),
    ]),
  );
}
