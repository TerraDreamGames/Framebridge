import type { Transform } from "../packages/core/src/types";

/** Model Figma's container-relative coordinates, rather than Roblox parenting. */
export function groupedSettingsScene(
  x = 48000,
  y = -32000,
  kind: "FRAME" | "GROUP" = "GROUP",
): SceneNode {
  const transform = (x: number, y: number): Transform => [
    [1, 0, x],
    [0, 1, y],
  ];
  const make = (
    id: string,
    type: string,
    width: number,
    height: number,
    localX: number,
    localY: number,
    worldX: number,
    worldY: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    name: id,
    type,
    width,
    height,
    relativeTransform: transform(localX, localY),
    absoluteTransform: transform(worldX, worldY),
    visible: true,
    opacity: 1,
    fills: [],
    strokes: [],
    effects: [],
    strokeWeight: 0,
    cornerRadius: 0,
    blendMode: "PASS_THROUGH",
    children: [],
    ...extra,
  });
  const cx = kind === "GROUP" ? x : 0;
  const cy = kind === "GROUP" ? y : 0;
  const label = make(
    "31:4",
    "TEXT",
    180,
    32,
    cx + 100,
    cy + 100,
    x + 100,
    y + 100,
    {
      name: "Settings title",
      characters: "Settings",
      textAlignHorizontal: "LEFT",
      textAlignVertical: "TOP",
      getStyledTextSegments: () => [
        {
          characters: "Settings",
          fontName: { family: "Roboto", style: "Regular" },
          fontSize: 24,
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
          textDecoration: "NONE",
          letterSpacing: { value: 0 },
          textCase: "ORIGINAL",
          paragraphSpacing: 0,
          paragraphIndent: 0,
          listOptions: { type: "NONE" },
        },
      ],
    },
  );
  const image = make(
    "31:5",
    "VECTOR",
    32,
    32,
    cx + 320,
    cy + 110,
    x + 320,
    y + 110,
    {
      name: "Settings icon",
      fills: [{ type: "SOLID", color: { r: 0, g: 0.5, b: 1 } }],
    },
  );
  // Frames DO create a new Figma coordinate space: this child remains 12, 8.
  const framedChild = make(
    "31:7",
    "RECTANGLE",
    80,
    24,
    12,
    8,
    x + 122,
    y + 218,
  );
  const nestedFrame = make(
    "31:6",
    "FRAME",
    200,
    60,
    cx + 110,
    cy + 210,
    x + 110,
    y + 210,
    {
      children: [framedChild],
    },
  );
  const nested = make(
    "31:3",
    "GROUP",
    320,
    240,
    cx + 80,
    cy + 90,
    x + 80,
    y + 90,
    {
      name: "Settings content",
      children: [label, image, nestedFrame],
    },
  );
  const outer = make(
    "31:2",
    "GROUP",
    400,
    300,
    cx + 60,
    cy + 60,
    x + 60,
    y + 60,
    {
      children: [nested],
    },
  );
  return make("31:1", kind, 800, 600, x, y, x, y, {
    name: "Settings",
    children: [outer],
  }) as unknown as SceneNode;
}
