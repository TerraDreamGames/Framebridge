import { compile } from "./compiler";
import {
  DEFAULT_OPTIONS,
  type AnalysisResult,
  type DesignNode,
  type ExportOptions,
} from "./types";
const rgb = (hex: string) => ({
  r: parseInt(hex.slice(0, 2), 16) / 255,
  g: parseInt(hex.slice(2, 4), 16) / 255,
  b: parseInt(hex.slice(4, 6), 16) / 255,
});
/** Optional bundled PNG resources; native shape artwork remains the fallback. */
export type DemoArtwork = Record<string, string>;
export const DEMO_INTERFACE_RESOURCES = [
  "window-skin",
  "inset-panel",
  "slot-idle",
  "slot-selected",
  "close-button",
  "category-idle",
  "category-active",
  "primary-button",
  "capacity-pill",
] as const;
const interfaceResources = new Set<string>(DEMO_INTERFACE_RESOURCES);
let serial = 0;
export function node(
  name: string,
  props: Partial<DesignNode> = {},
): DesignNode {
  return {
    id: `demo:${++serial}`,
    name,
    type: "FRAME",
    width: 100,
    height: 100,
    transform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    visible: true,
    opacity: 1,
    fills: [],
    strokes: [],
    strokeWeight: 0,
    radius: 0,
    children: [],
    ...props,
  };
}
const rect = (
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  radius = 0,
  children: DesignNode[] = [],
) =>
  node(name, {
    width: w,
    height: h,
    transform: [
      [1, 0, x],
      [0, 1, y],
    ],
    fills: [{ type: "SOLID", color: rgb(fill) }],
    radius,
    children,
  });
const text = (
  name: string,
  value: string,
  x: number,
  y: number,
  w: number,
  size: number,
  fill: string,
  bold = false,
) =>
  node(name, {
    type: "TEXT",
    width: w,
    height: size * 1.4,
    transform: [
      [1, 0, x],
      [0, 1, y],
    ],
    text: {
      characters: value,
      align: "LEFT",
      verticalAlign: "TOP",
      autoResize: "WIDTH_AND_HEIGHT",
      runs: [
        {
          text: value,
          fontFamily: "Roboto",
          fontStyle: bold ? "Bold" : "Regular",
          fontSize: size,
          color: rgb(fill),
        },
      ],
    },
  });
export function demoDesign(artwork: DemoArtwork = {}): DesignNode[] {
  serial = 0;
  const ink = "F1F5FF",
    muted = "97A8C0",
    blue = "73B5FF";
  const artworkSerial: Record<string, number> = {};
  // Core fixtures stay native. Browser demos may replace just the item artwork
  // with bundled PNGs; the window, controls and native grid stay editable.
  const art = (
    kind: string,
    accent: string,
    x: number,
    y: number,
    size = 64,
  ) => {
    const k = size / 64;
    const shape = (
      name: string,
      sx: number,
      sy: number,
      w: number,
      h: number,
      fill: string,
      radius = 0,
    ) => rect(name, sx * k, sy * k, w * k, h * k, fill, radius * k);
    const pieces =
      kind === "sword"
        ? [
            shape("Steel blade", 27, 3, 11, 36, "B9D8EE", 4),
            shape("Blade edge", 28, 5, 3, 30, "ECF8FF", 1),
            shape("Crossguard", 17, 36, 31, 7, "D5B876", 3),
            shape("Leather grip", 28, 43, 9, 13, "86684E", 3),
            shape("Pommel", 25, 55, 15, 6, "D5B876", 3),
          ]
        : kind === "potion"
          ? [
              shape("Glass neck", 24, 14, 16, 17, "A8BFD6", 4),
              shape("Cork", 24, 9, 16, 7, "D8B78E", 2),
              shape("Potion", 18, 26, 28, 29, accent, 12),
              shape("Glass highlight", 23, 31, 4, 15, "EAF5FF", 2),
            ]
          : kind === "shield"
            ? [
                shape("Shield rim", 14, 10, 36, 45, "B8C9DA", 16),
                shape("Shield face", 18, 14, 28, 36, accent, 12),
                shape("Shield crest", 29, 21, 6, 22, "D8C396", 2),
              ]
            : kind === "wood"
              ? [
                  shape("Timber", 14, 16, 37, 33, "AD805B", 9),
                  shape("Wood grain", 21, 20, 4, 25, "D0A982", 2),
                  shape("Wood grain", 39, 20, 3, 25, "79563D", 2),
                ]
              : kind === "coins"
                ? [
                    shape("Gold coin", 13, 18, 34, 34, "E8BC58", 17),
                    shape("Coin face", 18, 23, 24, 24, "FFD980", 12),
                    shape("Coin mark", 28, 28, 4, 14, "C99038", 2),
                  ]
                : [
                    shape("Gemstone", 19, 17, 29, 29, accent, 5),
                    shape("Gem facet", 22, 20, 10, 23, "D9ECFF", 3),
                  ];
    const group = node(`${kind[0].toUpperCase()}${kind.slice(1)} artwork`, {
      id: `demo:art-${kind}-${accent}-${(artworkSerial[kind] = (artworkSerial[kind] ?? 0) + 1)}`,
      width: size,
      height: size,
      transform: [
        [1, 0, x],
        [0, 1, y],
      ],
      children: pieces,
    });
    if (kind === "sword" || kind === "gem") {
      const angle = ((kind === "sword" ? 35 : 45) * Math.PI) / 180;
      const c = Math.cos(angle),
        s = Math.sin(angle),
        center = size / 2;
      group.transform = [
        [c, -s, x + center - c * center + s * center],
        [s, c, y + center - s * center - c * center],
      ];
    }
    const baseResource = {
      sword: "wayfinder-sword",
      shield: "iron-shield",
      potion: "health-potion",
      gem: "azure-crystal",
      wood: "oak-wood",
      coins: "gold-coins",
    }[kind];
    const variant =
      kind === "sword" && artworkSerial[kind] === 2
        ? "trail-dagger"
        : kind === "potion"
          ? { "9DCA87": "energy-potion", "75AEE5": "mana-potion" }[accent]
          : kind === "gem"
            ? {
                B594EA: "amethyst-crystal",
                E998A4: "ruby-crystal",
                "8BC8A7": "emerald-crystal",
              }[accent]
            : undefined;
    const resource = variant && artwork[variant] ? variant : baseResource;
    if (resource && artwork[resource]) {
      const [[a, c, tx], [b, d, ty]] = group.transform;
      const cx = (a * group.width) / 2 + (c * group.height) / 2 + tx;
      const cy = (b * group.width) / 2 + (d * group.height) / 2 + ty;
      group.type = "RECTANGLE";
      group.fills = [{ type: "IMAGE", imageHash: resource }];
      group.children = [];
      // Generated artwork already has its intended orientation. Keep the
      // fallback's center without rotating the finished PNG a second time.
      group.transform = [
        [1, 0, cx - group.width / 2],
        [0, 1, cy - group.height / 2],
      ];
    }
    return group;
  };
  const items = [
    ["Wayfinder", "sword", "73B5FF", ""],
    ["Health", "potion", "ED8393", "5"],
    ["Azure", "gem", "70AEF1", "12"],
    ["Iron shield", "shield", "718BA9", ""],
    ["Energy", "potion", "9DCA87", "3"],
    ["Amethyst", "gem", "B594EA", "8"],
    ["Dagger", "sword", "73B5FF", ""],
    ["Ruby", "gem", "E998A4", "6"],
    ["Oak", "wood", "C79A75", "24"],
    ["Mana", "potion", "75AEE5", "4"],
    ["Emerald", "gem", "8BC8A7", "9"],
    ["Gold", "coins", "E8BC58", "240"],
  ];
  const cells = items.map(([name, kind, accent, count], index) => {
    const selected = index === 0;
    const cell = rect(
      `${name} [button]`,
      (index % 4) * 100,
      Math.floor(index / 4) * 120,
      92,
      112,
      selected ? "294361" : "263348",
      12,
      [
        art(kind, accent, 14, 11),
        text(
          "Item name",
          name,
          10,
          84,
          76,
          11,
          selected ? "DAEDFF" : "C5D0E1",
          true,
        ),
        ...(count ? [text("Quantity", count, 62, 9, 24, 10, muted)] : []),
      ],
    );
    cell.id = `demo:item-${String(index + 1).padStart(2, "0")}`;
    cell.gridCell = {
      row: Math.floor(index / 4),
      column: index % 4,
      rowSpan: 1,
      columnSpan: 1,
    };
    if (selected) {
      cell.strokes = [{ type: "SOLID", color: rgb(blue) }];
      cell.strokeWeight = 2;
      cell.strokeAlign = "INSIDE";
    }
    return cell;
  });
  const grid = node("ItemGrid", {
    id: "demo:item-grid",
    width: 392,
    height: 352,
    transform: [
      [1, 0, 168],
      [0, 1, 100],
    ],
    layout: {
      mode: "GRID",
      spacing: 8,
      padding: [0, 0, 0, 0],
      primary: "MIN",
      counter: "MIN",
      wrap: false,
      grid: {
        rows: 3,
        columns: 4,
        rowGap: 8,
        columnGap: 8,
        rowSizes: Array.from({ length: 3 }, () => ({
          type: "FIXED",
          value: 112,
        })),
        columnSizes: Array.from({ length: 4 }, () => ({
          type: "FIXED",
          value: 92,
        })),
      },
    },
    children: cells,
  });
  const categoryNames = ["All items", "Equipment", "Consumables", "Materials"];
  const categories = node("Categories", {
    id: "demo:categories",
    width: 126,
    height: 176,
    transform: [
      [1, 0, 24],
      [0, 1, 100],
    ],
    layout: {
      mode: "VERTICAL",
      spacing: 8,
      padding: [0, 0, 0, 0],
      primary: "MIN",
      counter: "MIN",
      wrap: false,
    },
    children: categoryNames.map((name, index) =>
      rect(
        `${name} [button]`,
        0,
        index * 46,
        126,
        38,
        index === 0 ? "2D4769" : "1D293B",
        9,
        [
          text(
            "Category name",
            name,
            12,
            10,
            108,
            12,
            index === 0 ? "D8EBFF" : muted,
            index === 0,
          ),
        ],
      ),
    ),
  });
  const equipLabel = text(
    "Equip label",
    "Equip",
    0,
    8,
    180,
    12,
    "14243B",
    true,
  );
  equipLabel.text!.align = "CENTER";
  const details = rect("Item details", 580, 100, 216, 352, "222F43", 14, [
    rect("Artwork backdrop", 62, 20, 92, 92, "2C415C", 46),
    art("sword", blue, 62, 16, 92),
    text("Selected item", "Wayfinder", 18, 132, 180, 21, ink, true),
    rect("Rarity", 18, 168, 55, 22, "2C4B65", 6, [
      text("Rarity label", "Rare", 12, 4, 37, 10, "9ED4F7", true),
    ]),
    text("Item description", "A trusty travel blade.", 18, 207, 180, 12, muted),
    text("Power label", "Power", 18, 248, 120, 12, muted),
    text("Power value", "+24", 156, 248, 42, 13, ink, true),
    text("Speed label", "Speed", 18, 273, 120, 12, muted),
    text("Speed value", "+8", 156, 273, 42, 13, ink, true),
    rect("Equip [button]", 18, 304, 180, 32, blue, 8, [equipLabel]),
  ]);
  details.id = "demo:item-details";
  const root = rect("InventoryUI", 0, 0, 820, 532, "1B2638", 20, [
    rect("Backpack icon", 26, 29, 23, 26, "73B5FF", 6, [
      rect("Bag handle", 6, -5, 11, 8, "73B5FF", 4),
      rect("Front pocket", 5, 12, 13, 9, "315379", 3),
    ]),
    text("Title", "Inventory", 64, 24, 300, 27, ink, true),
    rect("Capacity", 610, 29, 124, 28, "27364B", 14, [
      text("Capacity label", "12 / 36 slots", 21, 6, 100, 11, "C4D2E7"),
    ]),
    rect("Close [button]", 758, 24, 38, 38, "2A394F", 10, [
      text("Close icon", "×", 12, 5, 20, 23, "B7C9E2"),
    ]),
    rect("Header divider", 24, 78, 772, 1, "2D3B50"),
    categories,
    grid,
    details,
    rect("Footer divider", 24, 478, 772, 1, "2D3B50"),
    text("Storage", "Backpack", 24, 495, 96, 12, "C5D1E4", true),
    text("Storage usage", "12 items", 121, 495, 96, 12, muted),
    rect("Sort [button]", 666, 490, 130, 26, "29394F", 8, [
      text("Sort label", "Sort by rarity", 22, 6, 106, 11, "C5D1E4"),
    ]),
  ]);
  root.id = "demo:inventory";
  const backpack = root.children.find(
    (child) => child.name === "Backpack icon",
  );
  if (backpack && artwork["inventory-backpack"]) {
    backpack.type = "RECTANGLE";
    backpack.width = 28;
    backpack.height = 32;
    backpack.transform = [
      [1, 0, 24],
      [0, 1, 26],
    ];
    backpack.fills = [{ type: "IMAGE", imageHash: "inventory-backpack" }];
    backpack.children = [];
    backpack.radius = 0;
  }
  // Skins are decorative children, never flattened screenshots of the UI.
  // Text, buttons and native list/grid layouts remain independently editable.
  const skin = (parent: DesignNode, resource: string, name: string) => {
    if (!artwork[resource]) return;
    parent.fills = [];
    parent.strokes = [];
    parent.strokeWeight = 0;
    parent.radius = 0;
    parent.children.unshift(
      node(name, {
        id: `${parent.id}/surface`,
        type: "RECTANGLE",
        width: parent.width,
        height: parent.height,
        fills: [{ type: "IMAGE", imageHash: resource }],
        absolute: true,
        constraints: { horizontal: "STRETCH", vertical: "STRETCH" },
      }),
    );
  };
  if (artwork["window-skin"])
    root.children = root.children.filter(
      (child) => !["Header divider", "Footer divider"].includes(child.name),
    );
  skin(root, "window-skin", "Window background");
  skin(details, "inset-panel", "Details panel artwork");
  cells.forEach((cell, index) =>
    skin(cell, index === 0 ? "slot-selected" : "slot-idle", "Slot artwork"),
  );
  categories.children.forEach((category, index) =>
    skin(
      category,
      index === 0 ? "category-active" : "category-idle",
      "Category button artwork",
    ),
  );
  const capacity = root.children.find((child) => child.name === "Capacity");
  if (capacity) skin(capacity, "capacity-pill", "Capacity pill artwork");
  const close = root.children.find((child) => child.name === "Close [button]");
  if (close && artwork["close-button"]) {
    close.children = [];
    skin(close, "close-button", "Close button artwork");
  }
  const equip = details.children.find(
    (child) => child.name === "Equip [button]",
  );
  if (equip) skin(equip, "primary-button", "Action button artwork");
  const sort = root.children.find((child) => child.name === "Sort [button]");
  if (sort) skin(sort, "category-idle", "Sort button artwork");
  const rarity = details.children.find((child) => child.name === "Rarity");
  if (rarity) skin(rarity, "category-active", "Rarity badge artwork");
  return [root];
}
export function demoSvg(
  nodes: DesignNode[],
  artwork: DemoArtwork = {},
): string {
  const xml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  const color = (c: { r: number; g: number; b: number }) =>
    `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
  const render = (n: DesignNode): string => {
    if (!n.visible) return "";
    const [[a, c, x], [b, d, y]] = n.transform;
    const run = n.text?.runs[0];
    const align =
      n.text?.align === "CENTER"
        ? "middle"
        : n.text?.align === "RIGHT"
          ? "end"
          : "start";
    const stroke = n.strokes[0]?.color;
    const inset = n.strokeAlign === "INSIDE" ? n.strokeWeight / 2 : 0;
    const image = n.fills.find(
      (paint) => paint.type === "IMAGE" && paint.imageHash,
    );
    const imageUrl = image?.imageHash && artwork[image.imageHash];
    const body = imageUrl
      ? `<image width="${n.width}" height="${n.height}" href="${xml(imageUrl)}" preserveAspectRatio="${interfaceResources.has(image!.imageHash!) ? "none" : "xMidYMid meet"}"/>`
      : run
        ? `<text x="${align === "middle" ? n.width / 2 : align === "end" ? n.width : 0}" y="${run.fontSize}" text-anchor="${align}" font-family="Arial,sans-serif" font-size="${run.fontSize}" font-weight="${run.fontStyle === "Bold" ? 700 : 400}" fill="${color(run.color!)}">${xml(n.text!.characters)}</text>`
        : n.fills[0]?.color
          ? `<rect width="${n.width}" height="${n.height}" rx="${n.radius}" fill="${color(n.fills[0].color)}"/>${stroke ? `<rect x="${inset}" y="${inset}" width="${n.width - inset * 2}" height="${n.height - inset * 2}" rx="${Math.max(0, n.radius - inset)}" fill="none" stroke="${color(stroke)}" stroke-width="${n.strokeWeight}"/>` : ""}`
          : "";
    return `<g transform="matrix(${a} ${b} ${c} ${d} ${x} ${y})" opacity="${n.opacity}">${body}${n.children.map(render).join("")}</g>`;
  };
  const root = nodes[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${root.width}" height="${root.height}" viewBox="0 0 ${root.width} ${root.height}">${nodes.map(render).join("")}</svg>`;
}
export function demoResult(
  options: ExportOptions = DEFAULT_OPTIONS,
  artwork: DemoArtwork = {},
): AnalysisResult {
  const nodes = demoDesign(artwork);
  const pkg = compile(nodes, "demo-document", options);
  return {
    package: pkg,
    designs: nodes,
    previews: {
      [nodes[0].id]:
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoSvg(nodes, artwork))}`,
    },
    assets: {},
    revision: 0,
  };
}
