import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import {
  flatten,
  type LayerOverride,
  type DesignNode,
} from "../packages/core/src/types";
import type { EditableLayer } from "../packages/core/src/bulk-editor";

export function bulkDesign() {
  return [
    node("Bulk editing", {
      id: "bulk-demo",
      width: 800,
      height: 600,
      children: [
        ...[0, 1].map((i) =>
          node(`Panel ${i ? "B" : "A"}`, {
            id: `panel-${i}`,
            width: 200 + i * 80,
            height: 100 + i * 40,
            radius: 4 + i * 8,
            transform: [
              [1, 0, 20 + i * 260],
              [0, 1, 50 + i * 100],
            ],
            fills: [
              { type: "SOLID", color: { r: 0.12, g: 0.2 + i * 0.1, b: 0.35 } },
            ],
          }),
        ),
        ...[0, 1].map((i) =>
          node(`Title ${i ? "B" : "A"}`, {
            id: `title-${i}`,
            type: "TEXT",
            width: 240,
            height: 35,
            transform: [
              [1, 0, 20 + i * 260],
              [0, 1, 320],
            ],
            text: {
              characters: `Title ${i ? "B" : "A"}`,
              align: "LEFT",
              verticalAlign: "TOP",
              runs: [
                {
                  text: `Title ${i ? "B" : "A"}`,
                  fontFamily: i ? "Arial" : "Roboto",
                  fontStyle: i ? "Italic" : "Regular",
                  fontSize: 18 + i * 8,
                  color: { r: 0.9, g: 0.95, b: 1 },
                },
              ],
            },
          }),
        ),
        ...[0, 1].map((i) =>
          node(`Icon ${i ? "B" : "A"}`, {
            id: `icon-${i}`,
            type: "VECTOR",
            width: 24,
            height: 24,
            transform: [
              [1, 0, 20 + i * 260],
              [0, 1, 410],
            ],
          }),
        ),
      ],
    }),
  ];
}
export function bulkPackage(overrides: Record<string, LayerOverride> = {}) {
  const pkg = compile(bulkDesign(), "bulk-source", {
    layerOverrides: overrides,
    detectButtons: false,
  });
  pkg.assets.forEach((asset, i) => (asset.robloxId = String(123456789 + i)));
  return pkg;
}
export function bulkLayers(pkg = bulkPackage()): EditableLayer[] {
  const sources = new Map<string, DesignNode>();
  function walk(nodes: DesignNode[]) {
    for (const source of nodes) {
      sources.set(source.id, source);
      walk(source.children);
    }
  }
  walk(bulkDesign());
  return flatten(pkg.roots).map((node) => ({
    node,
    source: sources.get(node.id),
  }));
}
