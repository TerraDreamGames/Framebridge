import { readFileSync } from "node:fs";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { MOTION_DEFAULTS } from "../packages/core/src/motion";
import type { DesignNode, TransferPackage } from "../packages/core/src/types";

export const realRepeatDesigns = JSON.parse(
  readFileSync(
    new URL("./fixtures/native-repeats.figma.json", import.meta.url),
    "utf8",
  ),
) as DesignNode[];
export function repeatPackages(): Record<string, TransferPackage> {
  const cases = Object.fromEntries(
    realRepeatDesigns.map((design, index) => [
      [
        "repeatPixels",
        "repeatRelative",
        "repeatPair",
        "repeatMultiChild",
        "repeatStacked",
      ][index],
      compile([design], `real-figma-repeat-${index}`, {}, "fixed"),
    ]),
  );
  const group = node("Interactive repeats", {
    id: "repeat",
    type: "TRANSFORM_GROUP",
    width: 620,
    height: 160,
    transformModifiers: [
      {
        type: "REPEAT",
        repeatType: "LINEAR",
        count: 3,
        unitType: "PIXELS",
        offset: 220,
        axis: "HORIZONTAL",
      },
    ],
    children: [
      node("Card", {
        id: "card",
        width: 180,
        height: 160,
        children: [
          node("Details [panel]", {
            id: "details",
            width: 180,
            height: 80,
            transform: [
              [1, 0, 0],
              [0, 1, 60],
            ],
            fills: [{ type: "SOLID", color: { r: 0.1, g: 0.4, b: 0.7 } }],
          }),
          node("Show [button]", {
            id: "show",
            width: 180,
            height: 40,
            children: [
              node("Hover [state:hover]", {
                id: "hover",
                width: 180,
                height: 40,
                fills: [{ type: "SOLID", color: { r: 0.2, g: 0.8, b: 0.5 } }],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  cases.repeatInteractive = compile(
    [
      node("Repeating cards", {
        id: "repeat-root",
        width: 660,
        height: 180,
        children: [group],
      }),
    ],
    "repeat-interactions",
    {
      layerOverrides: {
        details: { behavior: { role: "panel", initialVisible: false } },
        show: {
          properties: { Text: "Show details" },
          behavior: {
            action: { kind: "open", target: "details" },
            motion: { hover: structuredClone(MOTION_DEFAULTS.hover) },
          },
        },
      },
    },
    "fixed",
  );
  return cases;
}
