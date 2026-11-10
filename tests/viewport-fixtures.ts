import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import type { ExportOptions } from "../packages/core/src/types";

export function viewportDesign() {
  return [
    node("Inventory", {
      id: "inventory",
      width: 800,
      height: 600,
      children: [
        node("Item preview", {
          id: "viewport",
          width: 320,
          height: 240,
          transform: [
            [1, 0, 200],
            [0, 1, 80],
          ],
          radius: 12,
          fills: [{ type: "SOLID", color: { r: 0.1, g: 0.15, b: 0.2 } }],
          children: [
            node("Item name", {
              id: "item-name",
              type: "TEXT",
              width: 300,
              height: 30,
              transform: [
                [1, 0, 10],
                [0, 1, 200],
              ],
              text: {
                characters: "Explorer backpack",
                align: "CENTER",
                verticalAlign: "CENTER",
                runs: [
                  {
                    text: "Explorer backpack",
                    fontFamily: "Roboto",
                    fontStyle: "Bold",
                    fontSize: 18,
                  },
                ],
              },
            }),
            node("Rarity icon", {
              id: "rarity-icon",
              type: "VECTOR",
              width: 24,
              height: 24,
            }),
          ],
        }),
      ],
    }),
  ];
}
export function viewportPackage(options: Partial<ExportOptions> = {}) {
  return compile(
    viewportDesign(),
    "viewport-fixture",
    {
      layout: "responsive",
      assetIds: { "image:rarity-icon:bleed-v2": "123456789" },
      layerOverrides: {
        viewport: {
          className: "ViewportFrame",
          renderMode: "native",
          properties: {
            Ambient: { type: "Color3", value: [0.2, 0.3, 0.4] },
            LightColor: { type: "Color3", value: [1, 0.7, 0.5] },
            LightDirection: { type: "Vector3", value: [1, -2, -3] },
            ImageColor3: { type: "Color3", value: [0.8, 1, 0.9] },
            ImageTransparency: 0.15,
          },
        },
      },
      ...options,
    },
    "fixed",
  );
}
