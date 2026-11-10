import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import {
  structureReview,
  reviewChanges,
  type ReviewDecision,
} from "../packages/core/src/structure-review";
import { applyOverrideChanges } from "../packages/core/src/bulk-editor";
import type { LayerOverride } from "../packages/core/src/types";
export function reviewDesign() {
  const fill = (r: number, g: number, b: number) => [
    { type: "SOLID" as const, color: { r, g, b }, opacity: 1 },
  ];
  const label = (id: string, text: string) =>
    node(text, {
      id,
      type: "TEXT",
      width: 140,
      height: 28,
      fills: fill(0.92, 0.94, 0.98),
      text: {
        characters: text,
        align: "CENTER",
        verticalAlign: "CENTER",
        runs: [
          { text, fontFamily: "Roboto", fontStyle: "Regular", fontSize: 16 },
        ],
      },
    });
  return node("Review example", {
    id: "review-root",
    width: 600,
    height: 420,
    fills: fill(0.07, 0.09, 0.13),
    children: [
      node("Frame 17", {
        id: "ambiguous-button",
        width: 180,
        height: 44,
        radius: 8,
        fills: fill(0.16, 0.35, 0.85),
        children: [label("button-label", "Claim")],
      }),
      node("Inventory list", {
        id: "manual-list",
        width: 240,
        height: 150,
        clipsContent: true,
        transform: [
          [1, 0, 0],
          [0, 1, 72],
        ],
        children: [0, 1, 2].map((i) =>
          node(`Card ${i + 1}`, {
            id: `card-${i}`,
            width: 230,
            height: 48,
            fills: fill(0.14, 0.18, 0.26),
            transform: [
              [1, 0, 0],
              [0, 1, i * 60],
            ],
            children: [label(`card-label-${i}`, `Supply ${i + 1}`)],
          }),
        ),
      }),
      node("Quick slots", {
        id: "manual-grid",
        width: 200,
        height: 200,
        transform: [
          [1, 0, 320],
          [0, 1, 72],
        ],
        children: [3, 0, 2, 1].map((i) =>
          node(`Slot ${i + 1}`, {
            id: `slot-${i}`,
            width: 80,
            height: 80,
            fills: fill(0.18, 0.24, 0.34),
            transform: [
              [1, 0, (i % 2) * 92],
              [0, 1, Math.floor(i / 2) * 92],
            ],
          }),
        ),
      }),
      node("Inventory panel", {
        id: "panel",
        width: 240,
        height: 60,
        fills: fill(0.14, 0.18, 0.26),
        transform: [
          [1, 0, 0],
          [0, 1, 258],
        ],
        children: [label("panel-label", "Open inventory")],
      }),
      node("Logo", {
        id: "logo",
        type: "VECTOR",
        width: 24,
        height: 24,
        transform: [
          [1, 0, 320],
          [0, 1, 20],
        ],
      }),
    ],
  });
}
export function reviewPackage(overrides: Record<string, LayerOverride> = {}) {
  return compile(
    [reviewDesign()],
    "structure-review-fixture",
    {
      layout: "exact",
      layerOverrides: overrides,
      assetIds: { "image:logo:bleed-v2": "123456789" },
    },
    "fixed",
  );
}
export function correctedReview() {
  let overrides: Record<string, LayerOverride> = {};
  const decisions: [string, ReviewDecision][] = [
    ["ambiguous-button", { kind: "class", value: "TextButton" }],
    ["manual-list", { kind: "scroll", value: "Y" }],
    ["manual-list", { kind: "layout", value: "list-y" }],
    ["manual-grid", { kind: "layout", value: "grid" }],
    ["panel", { kind: "role", value: "panel" }],
    ["ambiguous-button", { kind: "name", value: "ClaimButton" }],
  ];
  for (const [id, decision] of decisions) {
    const report = structureReview(
      [reviewDesign()],
      reviewPackage(overrides),
      overrides,
    );
    overrides = applyOverrideChanges(
      overrides,
      reviewChanges(
        report.layers.find((l) => l.source.id === id)!,
        decision,
        overrides,
      ),
    );
  }
  return { package: reviewPackage(overrides), overrides };
}
