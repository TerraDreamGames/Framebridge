import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import {
  defaultWorldSettings,
  type WorldSettings,
} from "../packages/core/src/world-space";

export function worldDesign() {
  const text = (id: string, name: string, y: number) =>
    node(name, {
      id,
      width: 240,
      height: 30,
      fills: [{ type: "SOLID", color: { r: 0.94, g: 0.97, b: 1 } }],
      transform: [
        [1, 0, 12],
        [0, 1, y],
      ],
      text: {
        characters: name,
        runs: [
          {
            text: name,
            fontFamily: "Roboto",
            fontStyle: "Regular",
            fontSize: 20,
          },
        ],
        align: "LEFT",
        verticalAlign: "CENTER",
      },
    });
  return node("World interface", {
    id: "world",
    width: 280,
    height: 140,
    fills: [{ type: "SOLID", color: { r: 0.06, g: 0.1, b: 0.16 } }],
    children: [
      text("action", "Action", 12),
      text("object", "Object", 44),
      text("key", "Key", 76),
      node("Hold progress", {
        id: "progress",
        width: 240,
        height: 8,
        transform: [
          [1, 0, 12],
          [0, 1, 112],
        ],
        fills: [{ type: "SOLID", color: { r: 0.2, g: 0.7, b: 0.4 } }],
      }),
    ],
  });
}

export function worldPackage(kind: WorldSettings["kind"]) {
  const settings = defaultWorldSettings(kind);
  if (settings.prompt)
    settings.prompt = {
      ...settings.prompt,
      actionText: "Open chest",
      objectText: "Supply chest",
      holdDuration: 0.5,
      labels: {
        action: "action",
        object: "object",
        input: "key",
        hold: "progress",
      },
    };
  return compile(
    [worldDesign()],
    "world-fixture-" + kind,
    { layout: "responsive", layerOverrides: { world: { worldUI: settings } } },
    "fixed",
  );
}
