import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import { DEFAULT_THEMES } from "../packages/core/src/theme-tokens";
import {
  DEFAULT_OPTIONS,
  type ExportOptions,
} from "../packages/core/src/types";
export function themeDesign() {
  const label = (id: string, name: string) =>
    node(name, {
      id,
      type: "TEXT",
      width: 180,
      height: 40,
      text: {
        characters: name,
        align: "CENTER",
        verticalAlign: "CENTER",
        runs: [
          {
            text: name,
            fontFamily: "Source Sans Pro",
            fontStyle: "Regular",
            fontSize: 18,
            color: { r: 1, g: 1, b: 1 },
          },
        ],
      },
    });
  return [
    node("Themes QA", {
      id: "theme-screen",
      width: 420,
      height: 240,
      children: [
        node("Buy button", {
          id: "buy",
          transform: [
            [1, 0, 0],
            [0, 1, 80],
          ],
          width: 180,
          height: 50,
          children: [label("buy-label", "Buy")],
        }),
        node("Sell button", {
          id: "sell",
          width: 180,
          height: 50,
          transform: [
            [1, 0, 220],
            [0, 1, 80],
          ],
          children: [label("sell-label", "Sell")],
        }),
        label("heading", "Theme tokens"),
      ],
    }),
  ];
}
export function themeOptions(
  patch: Partial<ExportOptions> = {},
): ExportOptions {
  return {
    ...DEFAULT_OPTIONS,
    themes: structuredClone(DEFAULT_THEMES),
    layerOverrides: {
      buy: {
        theme: {
          background: "surface",
          shadow: "elevated",
          hover: "interactive",
        },
      },
      sell: {
        theme: {
          background: "surface",
          shadow: "elevated",
          hover: "interactive",
        },
      },
      "buy-label": { theme: { font: "body", color: "accent" } },
      "sell-label": { theme: { font: "body", color: "accent" } },
      heading: { theme: { font: "body", color: "accent" } },
    },
    ...patch,
  };
}
export const themePackage = (patch: Partial<ExportOptions> = {}) =>
  compile(
    themeDesign(),
    "theme-qa",
    themeOptions(patch),
    "2026-10-03T00:00:00Z",
  );
