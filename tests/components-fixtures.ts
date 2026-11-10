import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import type { AnalysisResult, DesignNode } from "../packages/core/src/types";

export function componentResult(artwork = false): AnalysisResult {
  const card = (id: string, x: number, text = "Buy") =>
    node("Shop card", {
      id,
      width: 160,
      height: 80,
      transform: [
        [1, 0, x],
        [0, 1, 20],
      ],
      fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.3 } }],
      children: [
        node("Label", {
          id: `${id}/label`,
          type: "TEXT",
          width: 120,
          height: 24,
          transform: [
            [1, 0, 20],
            [0, 1, 20],
          ],
          text: {
            characters: text,
            runs: [
              { text, fontFamily: "Inter", fontStyle: "Regular", fontSize: 16 },
            ],
            align: "LEFT",
            verticalAlign: "CENTER",
          },
        }),
        ...(artwork
          ? [
              node("Icon", {
                id: `${id}/icon`,
                type: "VECTOR",
                width: 16,
                height: 16,
              }),
            ]
          : []),
      ],
    });
  const designs = [
    node("Shop", {
      id: "shop",
      width: 800,
      height: 400,
      children: [
        card("card-a", 20),
        card("card-b", 200),
        card("card-c", 380, "Sell"),
      ],
    }),
  ];
  const pkg = compile(
    designs,
    "component-fixture",
    { detectButtons: false },
    "fixed",
  );
  return {
    designs,
    package: pkg,
    assets: Object.fromEntries(
      pkg.assets.map((a) => [a.id, [137, 80, 78, 71, 1, 2, 3]]),
    ),
    previews: {},
    revision: 1,
  };
}
export function stateComponentResult(selected = false): AnalysisResult {
  const variant = (state: string, x: number, color: number) =>
    node(`State=${state}`, {
      id: `variant-${state}`,
      type: "COMPONENT",
      width: 160,
      height: 48,
      transform: [
        [1, 0, x],
        [0, 1, 0],
      ],
      fills: [{ type: "SOLID", color: { r: color, g: 0.2, b: 0.4 } }],
      children: [
        node("Caption", {
          id: `${state}/label`,
          type: "TEXT",
          width: 120,
          height: 24,
          transform: [
            [1, 0, 20],
            [0, 1, 12],
          ],
          text: {
            characters: "Purchase",
            runs: [
              {
                text: "Purchase",
                fontFamily: "Inter",
                fontStyle: "Regular",
                fontSize: 16,
              },
            ],
            align: "CENTER",
            verticalAlign: "CENTER",
          },
        }),
      ],
    });
  const designs: DesignNode[] = [
    node("Purchase button", {
      id: "button-set",
      type: "COMPONENT_SET",
      width: selected ? 880 : 700,
      height: 48,
      children: [
        variant("Default", 0, 0.2),
        variant("Hover", 180, 0.4),
        variant("Pressed", 360, 0.6),
        variant("Disabled", 540, 0.1),
        ...(selected ? [variant("Selected", 720, 0.8)] : []),
      ],
    }),
  ];
  return {
    designs,
    package: compile(
      designs,
      "component-states",
      { detectButtons: false },
      "fixed",
    ),
    assets: {},
    previews: {},
    revision: 1,
  };
}
