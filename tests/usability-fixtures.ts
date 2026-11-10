import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import type {
  AnalysisResult,
  DesignNode,
  LayerOverride,
} from "../packages/core/src/types";
const solid = (r: number, g = r, b = r) => [
  { type: "SOLID", color: { r, g, b } },
];
const text = (
  id: string,
  name: string,
  value: string,
  x: number,
  y: number,
  color = 0.2,
  height = 35,
  size = 20,
) =>
  node(name, {
    id,
    type: "TEXT",
    width: 240,
    height,
    transform: [
      [1, 0, x],
      [0, 1, y],
    ],
    text: {
      characters: value,
      runs: [
        {
          text: value,
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize: size,
          color: { r: color, g: color, b: color },
        },
      ],
      align: "LEFT",
      verticalAlign: "TOP",
      autoResize: "WIDTH_AND_HEIGHT",
    },
  });
export function usabilityDesign(): DesignNode[] {
  return [
    node("Usability review", {
      id: "review-root",
      width: 600,
      height: 430,
      fills: solid(1),
      children: [
        text("weak-label", "Account label", "Low contrast text", 24, 20, 0.8),
        node("Frame 1", {
          id: "panel-a",
          width: 100,
          height: 50,
          transform: [
            [1, 0, 24],
            [0, 1, 80],
          ],
          fills: solid(0.9),
        }),
        node("Frame 1", {
          id: "panel-b",
          width: 100,
          height: 50,
          transform: [
            [1, 0, 144],
            [0, 1, 80],
          ],
          fills: solid(0.9),
        }),
        node("Close button", {
          id: "small-control",
          width: 20,
          height: 20,
          transform: [
            [1, 0, 530],
            [0, 1, 20],
          ],
          fills: solid(0.1),
          radius: 4,
          children: [],
        }),
        text("short-text", "Multiline label", "Hello\nWorld", 24, 170, 0.1, 25),
        ...["error", "success"].map((state, i) =>
          node(`Status ${state}`, {
            id: `state-${state}`,
            width: 160,
            height: 60,
            transform: [
              [1, 0, 24 + i * 180],
              [0, 1, 280],
            ],
            fills: state === "error" ? solid(0.8, 0, 0) : solid(0, 0.6, 0),
            children: [
              {
                ...text(
                  `state-text-${state}`,
                  "Status label",
                  "Ready",
                  12,
                  12,
                  1,
                ),
                width: 136,
              },
            ],
          }),
        ),
      ],
    }),
  ];
}
export function usabilityResult(corrected = false): AnalysisResult {
  const designs = usabilityDesign(),
    layerOverrides: Record<string, LayerOverride> = corrected
      ? {
          "weak-label": {
            properties: {
              TextColor3: { type: "Color3", value: [0.1, 0.1, 0.1] },
            },
          },
          "panel-a": { name: "LeftCard" },
          "panel-b": { name: "RightCard" },
          "small-control": {
            properties: { Size: { type: "UDim2", value: [0, 48, 0, 48] } },
          },
          "short-text": {
            properties: { Size: { type: "UDim2", value: [0, 240, 0, 60] } },
          },
          "state-text-success": {
            properties: {
              Text: "Success",
              TextColor3: { type: "Color3", value: [0.1, 0.1, 0.1] },
            },
          },
        }
      : {};
  return {
    designs,
    package: compile(designs, "usability-fixture", { layerOverrides }),
    assets: {},
    previews: {},
    revision: 1,
  };
}
