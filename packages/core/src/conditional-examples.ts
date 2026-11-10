import { cloneSettings } from "./clone-settings";
import { compile } from "./compiler";
import { node } from "./demo";
import { MOTION_DEFAULTS } from "./motion";
import type { ConditionalRule } from "./conditional-rules";
import type { ExportOptions, LayerOverride } from "./types";
const label = (id: string, name: string, text: string, x: number, y: number) =>
  node(name, {
    id,
    type: "TEXT",
    width: 250,
    height: 32,
    transform: [
      [1, 0, x],
      [0, 1, y],
    ],
    text: {
      characters: text,
      align: "LEFT",
      verticalAlign: "CENTER",
      runs: [
        {
          text,
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize: 18,
          color: { r: 1, g: 1, b: 1 },
        },
      ],
    },
  });
export const conditionalExampleRules: ConditionalRule[] = [
  {
    id: "purchase",
    branches: [
      {
        when: {
          mode: "all",
          predicates: [
            {
              source: "leaderstats",
              key: "Coins",
              operator: "gte",
              value: 100,
            },
            { source: "attribute", key: "Ready", operator: "eq", value: true },
          ],
        },
        then: [
          { target: "buy", property: "Interactable", value: true },
          { target: "status", property: "Text", value: "Buy <b>now</b>" },
          {
            target: "status",
            property: "TextColor3",
            value: { type: "Color3", value: [0.2, 1, 0.4] },
          },
        ],
      },
      {
        when: {
          mode: "all",
          predicates: [
            { source: "leaderstats", key: "Coins", operator: "exists" },
          ],
        },
        then: [
          { target: "buy", property: "Interactable", value: false },
          { target: "status", property: "Text", value: "Earn more coins" },
          {
            target: "status",
            property: "TextColor3",
            value: { type: "Color3", value: [1, 0.8, 0.2] },
          },
        ],
      },
    ],
    else: [
      { target: "buy", property: "Interactable", value: false },
      { target: "status", property: "Text", value: "Awaiting player data" },
      {
        target: "status",
        property: "TextColor3",
        value: { type: "Color3", value: [0.7, 0.7, 0.7] },
      },
    ],
  },
  {
    id: "premium",
    branches: [
      {
        when: {
          mode: "all",
          predicates: [
            { source: "attribute", key: "VIP", operator: "eq", value: true },
          ],
        },
        then: [{ target: "premium", property: "Visible", value: true }],
      },
    ],
    else: [{ target: "premium", property: "Visible", value: false }],
  },
  {
    id: "compact",
    branches: [
      {
        when: {
          mode: "all",
          predicates: [
            { source: "viewport", key: "width", operator: "lt", value: 600 },
          ],
        },
        then: [{ target: "compact", property: "Visible", value: true }],
      },
    ],
    else: [{ target: "compact", property: "Visible", value: false }],
  },
  {
    id: "reward",
    branches: [
      {
        when: {
          mode: "any",
          predicates: [
            { source: "attribute", key: "Ready", operator: "eq", value: true },
            {
              source: "leaderstats",
              key: "Coins",
              operator: "gte",
              value: 200,
            },
          ],
        },
        then: [
          { target: "status", property: "BackgroundTransparency", value: 0.25 },
        ],
      },
    ],
  },
];
export function conditionalExampleDesign() {
  return [
    node("Conditional store", {
      id: "rules-screen",
      width: 720,
      height: 400,
      fills: [{ type: "SOLID", color: { r: 0.04, g: 0.08, b: 0.16 } }],
      children: [
        label("status", "Purchase status", "Design status", 40, 35),
        label("buy", "Buy button", "Buy", 40, 95),
        node("Premium panel", {
          id: "premium",
          width: 260,
          height: 80,
          transform: [
            [1, 0, 40],
            [0, 1, 160],
          ],
          fills: [{ type: "SOLID", color: { r: 0.18, g: 0.3, b: 0.5 } }],
          children: [
            label("premium-label", "Premium message", "VIP offer", 12, 12),
          ],
        }),
        label("compact", "Compact message", "Compact viewport", 40, 270),
      ],
    }),
  ];
}
export function conditionalExampleOverrides(): Record<string, LayerOverride> {
  return {
    "rules-screen": {
      behavior: { rules: cloneSettings(conditionalExampleRules) },
    },
    buy: { className: "TextButton" },
    status: { properties: { RichText: true, BackgroundTransparency: 0.6 } },
    premium: {
      behavior: {
        role: "panel",
        motion: { float: { ...MOTION_DEFAULTS.float, distance: 4 } },
      },
    },
  };
}
export function conditionalExamplePackage(
  options: Partial<ExportOptions> = {},
) {
  return compile(
    conditionalExampleDesign(),
    "conditional-rules-example",
    {
      layout: "responsive",
      ...options,
      layerOverrides: {
        ...conditionalExampleOverrides(),
        ...options.layerOverrides,
      },
    },
    "2026-10-03T00:00:00Z",
  );
}
