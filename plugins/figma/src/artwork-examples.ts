import { node } from "../../../packages/core/src/demo";
import type {
  DesignNode,
  ExportOptions,
  Paint,
} from "../../../packages/core/src/types";

// A tiny owned RGB gradient; no network, external artwork or upload is needed to create examples.
export const ARTWORK_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQklEQVR4AaXBAQ2AABADsZK8gfNvA38gYu3D+4UQQgghhBBCCOFkcjI5mZxMTiYnk5PJyeRkcjI5mZxMTiYnk5PJD1LmA++bfdv6AAAAAElFTkSuQmCC";
export const ARTWORK_VECTOR_PATH =
  "M32 0 L40 22 L64 24 L46 40 L52 64 L32 51 L12 64 L18 40 L0 24 L24 22 Z";
const solid = (r: number, g: number, b: number): Paint[] => [
  { type: "SOLID", color: { r, g, b } },
];
const at = (x: number, y: number): DesignNode["transform"] => [
  [1, 0, x],
  [0, 1, y],
];
const text = (
  id: string,
  title: string,
  x: number,
  y: number,
  width = 560,
  size = 18,
) =>
  node(title, {
    id,
    type: "TEXT",
    width,
    height: size + 12,
    transform: at(x, y),
    fills: solid(1, 1, 1),
    text: {
      characters: title,
      align: "LEFT",
      verticalAlign: "CENTER",
      runs: [
        {
          text: title,
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize: size,
          color: { r: 1, g: 1, b: 1 },
        },
      ],
    },
  });
const shadow = {
  type: "DROP_SHADOW" as const,
  radius: 8,
  spread: 0,
  offset: { x: 0, y: 2 },
  color: { r: 0.2, g: 0.5, b: 1, a: 0.8 },
  blendMode: "NORMAL",
};
const radial: Paint[] = [
  {
    type: "GRADIENT_RADIAL",
    gradientTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    gradientStops: [
      { position: 0, color: { r: 0.2, g: 0.7, b: 1, a: 1 } },
      { position: 1, color: { r: 0.1, g: 0.15, b: 0.3, a: 1 } },
    ],
  },
];
const button = (id: string, x: number, y: number, label: string) =>
  node(`${label} [button]`, {
    id,
    width: 156,
    height: 44,
    transform: at(x, y),
    radius: 8,
    fills: solid(0.2, 0.5, 0.8),
    children: [
      { ...text(`${id}:label`, label, 12, 8, 132, 16), name: "Label" },
    ],
  });
const root = (id: string, name: string, children: DesignNode[]) =>
  node(name, {
    id,
    width: 640,
    height: 420,
    fills: solid(0.12, 0.17, 0.25),
    children,
  });
const icon = (id: string, name: string, x: number) =>
  node(name, {
    id,
    type: "VECTOR",
    width: 72,
    height: 72,
    transform: at(x, 96),
    fills: solid(1, 0.55, 0.15),
    strokes: solid(0.9, 0.2, 0.1),
    strokeWeight: 2,
  });

export function artworkExamples(imageHash: string, current: ExportOptions) {
  const glow = text("art:glow", "Editable glowing title", 32, 60, 250, 24);
  glow.opacity = 0.75;
  glow.effects = ["DROP_SHADOW"];
  glow.shadows = [shadow];
  const blend = button("art:blend", 20, 20, "Editable multiply");
  blend.fills = [
    {
      type: "SOLID",
      color: { r: 0.8, g: 0.4, b: 0.2 },
      opacity: 0.7,
      blendMode: "MULTIPLY",
    },
  ];
  const effects = root("art:effects", "Editable effects and backgrounds", [
    text(
      "art:effects-title",
      "Keep content editable; bake only its decoration",
      32,
      16,
    ),
    glow,
    node("Image background", {
      id: "art:image-background",
      width: 240,
      height: 140,
      transform: at(32, 140),
      fills: [{ type: "IMAGE", imageHash }],
      effects: ["DROP_SHADOW"],
      shadows: [shadow],
      children: [button("art:image-child", 20, 44, "Editable child")],
    }),
    node("Radial background", {
      id: "art:radial",
      width: 260,
      height: 120,
      transform: at(320, 60),
      fills: radial,
      children: [button("art:radial-child", 20, 44, "Still a button")],
    }),
    node("Known flat backdrop", {
      id: "art:backdrop",
      width: 260,
      height: 100,
      transform: at(320, 200),
      fills: solid(0.25, 0.5, 0.75),
      children: [blend],
    }),
    node("Native corners, stroke and shadow", {
      id: "art:native-box",
      width: 240,
      height: 60,
      transform: at(32, 316),
      fills: solid(0.3, 0.5, 0.2),
      corners: [4, 16, 24, 8],
      strokes: solid(0.7, 0.9, 0.4),
      strokeWeight: 2,
      effects: ["DROP_SHADOW"],
      shadows: [shadow],
      children: [text("art:native-label", "Native styling", 12, 14, 200, 16)],
    }),
  ]);
  const masks = root("art:masks", "Editable rectangle and circle masks", [
    text(
      "art:masks-title",
      "Masks clip native content and retain image identity",
      32,
      16,
    ),
    node("Rounded mask scope", {
      id: "art:rounded-scope",
      width: 260,
      height: 180,
      transform: at(32, 96),
      children: [
        node("Rounded rectangle mask", {
          id: "art:rounded-mask",
          type: "RECTANGLE",
          width: 200,
          height: 120,
          transform: at(20, 20),
          radius: 20,
          isMask: true,
          maskType: "VECTOR",
          fills: solid(1, 1, 1),
        }),
        node("Editable masked content", {
          id: "art:rounded-content",
          width: 260,
          height: 180,
          fills: radial,
          children: [
            button("art:masked-button", 40, 50, "Masked button"),
            {
              ...icon("art:masked-icon", "Masked vector icon", 180),
              transform: at(180, 100),
            },
          ],
        }),
      ],
    }),
    node("Circle mask scope", {
      id: "art:circle-scope",
      width: 180,
      height: 180,
      transform: at(360, 96),
      children: [
        node("Circle mask", {
          id: "art:circle-mask",
          type: "ELLIPSE",
          width: 140,
          height: 140,
          transform: at(20, 20),
          isMask: true,
          maskType: "VECTOR",
          fills: solid(1, 1, 1),
        }),
        node("Editable circle content", {
          id: "art:circle-content",
          width: 180,
          height: 180,
          fills: [{ type: "IMAGE", imageHash }],
          children: [text("art:circle-label", "Editable", 40, 70, 110, 18)],
        }),
      ],
    }),
    text(
      "art:masks-help",
      "Resize the imported mask and edit its children in Studio.",
      32,
      320,
      570,
      16,
    ),
  ]);
  const images = root("art:images", "Vector images and tint preparation", [
    text("art:images-title", "Vectors become images automatically", 32, 16),
    icon("art:raw-icon", "Original vector icon", 48),
    icon("art:tint-icon", "Tintable vector icon", 208),
    icon("art:clean-icon", "Clean edge vector icon", 368),
    text("art:raw-label", "Original", 40, 192, 140, 16),
    text("art:tint-label", "White mask", 196, 192, 140, 16),
    text("art:clean-label", "Mask + edge cleanup", 356, 192, 220, 16),
    node("Image fill stays an image", {
      id: "art:standalone-image",
      type: "RECTANGLE",
      width: 96,
      height: 96,
      transform: at(48, 264),
      fills: [{ type: "IMAGE", imageHash }],
    }),
    text(
      "art:images-help",
      "Link uploaded IDs after export; tint white masks in Studio.",
      180,
      280,
      410,
      16,
    ),
  ]);
  const options: ExportOptions = {
    ...current,
    layerOverrides: {
      "art:tint-icon": { imageProcessing: { whiteMask: true } },
      "art:clean-icon": {
        imageProcessing: { whiteMask: true, edgeCleanup: true },
      },
    },
  };
  return [effects, masks, images].map((design) => ({
    designs: [design],
    options,
  }));
}
