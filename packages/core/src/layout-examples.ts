import {
  DEFAULT_OPTIONS,
  type DesignNode,
  type ExportOptions,
  type Value,
} from "./types";

export type LayoutExample = {
  key: string;
  title: string;
  description: string;
  designs: DesignNode[];
  options: ExportOptions;
};
const exampleColor = (hex: string) => ({
  r: parseInt(hex.slice(0, 2), 16) / 255,
  g: parseInt(hex.slice(2, 4), 16) / 255,
  b: parseInt(hex.slice(4, 6), 16) / 255,
});
const exampleUDim2 = (...value: number[]): Value => ({ type: "UDim2", value });
const exampleEnum = (kind: string, name: string): Value => ({
  type: "Enum",
  value: [kind, name],
});

/** Reproducible Figma source geometry plus the same inspector overrides a user edits. */
export function layoutExamples(): LayoutExample[] {
  const result: LayoutExample[] = [];
  for (const key of [
    "quest-list",
    "horizontal-carousel",
    "inventory-grid",
    "nested-panels",
  ]) {
    const options: ExportOptions = {
      ...DEFAULT_OPTIONS,
      layout: "responsive",
      appearance: "editable",
      layerOverrides: {},
      assetIds: {},
      fontIds: {},
    };
    const make = (
      id: string,
      name: string,
      width: number,
      height: number,
      x = 0,
      y = 0,
      fill = "172235",
    ): DesignNode => ({
      id: `${key}:${id}`,
      name,
      type: "FRAME",
      width,
      height,
      transform: [
        [1, 0, x],
        [0, 1, y],
      ],
      visible: true,
      opacity: 1,
      fills: [{ type: "SOLID", color: exampleColor(fill) }],
      strokes: [],
      strokeWeight: 0,
      radius: 8,
      children: [],
    });
    const label = (
      id: string,
      value: string,
      width: number,
      height: number,
      x = 0,
      y = 0,
      size = 16,
    ): DesignNode => ({
      ...make(id, id, width, height, x, y),
      type: "TEXT",
      radius: 0,
      fills: [{ type: "SOLID", color: exampleColor("e6eefc") }],
      text: {
        characters: value,
        align: "LEFT",
        verticalAlign: "CENTER",
        runs: [
          {
            text: value,
            fontFamily: "Roboto",
            fontStyle: "Regular",
            fontSize: size,
            color: exampleColor("e6eefc"),
          },
        ],
      },
    });
    const auto = (n: DesignNode, horizontal = false, gap = 8, padding = 12) => {
      n.layout = {
        mode: horizontal ? "HORIZONTAL" : "VERTICAL",
        spacing: gap,
        padding: [padding, padding, padding, padding],
        primary: "MIN",
        counter: "MIN",
        wrap: false,
        sizingX: "FIXED",
        sizingY: "FIXED",
      };
      return n;
    };
    const scroll = (n: DesignNode, horizontal = false) => {
      n.clipsContent = true;
      options.layerOverrides[n.id] = {
        renderMode: "native",
        className: "ScrollingFrame",
        properties: {
          CanvasSize: exampleUDim2(0, 0, 0, 0),
          AutomaticCanvasSize: exampleEnum(
            "AutomaticSize",
            horizontal ? "X" : "Y",
          ),
          Size: exampleUDim2(1, -48, 1, -128),
          ScrollingDirection: exampleEnum(
            "ScrollingDirection",
            horizontal ? "X" : "Y",
          ),
          ScrollBarImageColor3: { type: "Color3", value: [0.36, 0.64, 1] },
        },
      };
      return n;
    };
    const root = make("root", key, 640, 480, 0, 0, "0c1422");
    root.radius = 0;
    let title: string, description: string;
    if (key === "quest-list") {
      title = "Quest list";
      description =
        "Vertical scrolling with a native list, inner padding and editable quest rows.";
      const list = scroll(auto(make("scroll", "Quests", 592, 352, 24, 104)));
      for (let i = 1; i <= 10; i++) {
        const row = make(
          `row-${i}`,
          `Quest ${String(i).padStart(2, "0")}`,
          568,
          64,
          12,
          12 + (i - 1) * 72,
          i % 2 ? "22334b" : "1c2b40",
        );
        row.children.push(
          label(
            `quest-title-${i}`,
            `${String(i).padStart(2, "0")}  ${["Explore the forest", "Collect supplies", "Return to camp", "Build a shelter", "Find the beacon"][(i - 1) % 5]}`,
            536,
            40,
            16,
            12,
          ),
        );
        options.layerOverrides[row.id] = {
          properties: { Size: exampleUDim2(1, 0, 0, 64) },
          components: {
            size: {
              MinSize: { type: "Vector2", value: [0, 48] },
              MaxSize: { type: "Vector2", value: [100000, 96] },
            },
          },
        };
        list.children.push(row);
      }
      root.children.push(list);
    } else if (key === "horizontal-carousel") {
      title = "Reward carousel";
      description =
        "Horizontal scrolling with X canvas growth, fixed card widths and a horizontal list.";
      const list = scroll(
        auto(make("scroll", "Rewards", 592, 352, 24, 104), true, 12),
        true,
      );
      for (let i = 1; i <= 8; i++) {
        const card = make(
          `card-${i}`,
          `Reward ${String(i).padStart(2, "0")}`,
          156,
          312,
          12 + (i - 1) * 168,
          12,
          "22334b",
        );
        card.children.push(
          label(`reward-${i}`, `REWARD ${i}`, 124, 44, 16, 16, 18),
          label(`quantity-${i}`, `${i * 100}\ncoins`, 124, 140, 16, 92, 24),
        );
        options.layerOverrides[card.id] = {
          properties: { Size: exampleUDim2(0, 156, 1, -16) },
        };
        list.children.push(card);
      }
      root.children.push(list);
    } else if (key === "inventory-grid") {
      title = "Inventory grid";
      description =
        "A scrolling native grid that wraps cells as the viewport changes, with no positioning scripts.";
      const grid = scroll(make("scroll", "Inventory", 592, 352, 24, 104));
      options.layerOverrides[grid.id].components = {
        grid: {
          CellSize: exampleUDim2(0, 136, 0, 96),
          CellPadding: exampleUDim2(0, 8, 0, 8),
          FillDirectionMaxCells: 4,
        },
        padding: {
          PaddingTop: { type: "UDim", value: [0, 12] },
          PaddingBottom: { type: "UDim", value: [0, 12] },
          PaddingLeft: { type: "UDim", value: [0, 12] },
          PaddingRight: { type: "UDim", value: [0, 12] },
        },
      };
      for (let i = 1; i <= 18; i++) {
        const cell = make(
          `item-${i}`,
          `Item ${String(i).padStart(2, "0")}`,
          136,
          96,
          12 + ((i - 1) % 4) * 144,
          12 + Math.floor((i - 1) / 4) * 104,
          i % 3 ? "22334b" : "294b53",
        );
        cell.children.push(
          label(
            `item-name-${i}`,
            `${["Supplies", "Equipment", "Materials"][(i - 1) % 3]}\n${String(i).padStart(2, "0")}`,
            112,
            64,
            12,
            16,
          ),
        );
        grid.children.push(cell);
      }
      root.children.push(grid);
    } else {
      title = "Nested panels";
      description =
        "A horizontal list containing two independently scrolling vertical lists; nested padding and text size limits.";
      const panels = auto(
        make("panels", "Two columns", 592, 352, 24, 104),
        true,
        16,
        0,
      );
      options.layerOverrides[panels.id] = {
        properties: { Size: exampleUDim2(1, -48, 1, -128) },
      };
      for (let col = 1; col <= 2; col++) {
        const list = scroll(
          auto(
            make(
              `scroll-${col}`,
              col === 1 ? "Objectives" : "Activity",
              288,
              352,
            ),
          ),
        );
        options.layerOverrides[list.id].properties!.Size = exampleUDim2(
          0.5,
          -8,
          1,
          0,
        );
        for (let i = 1; i <= 8; i++) {
          const row = make(
            `row-${col}-${i}`,
            `Entry ${col}.${i}`,
            264,
            64,
            12,
            12 + (i - 1) * 72,
            "22334b",
          );
          const text = label(
            `entry-${col}-${i}`,
            `${col === 1 ? "Objective" : "Activity"} ${i}`,
            240,
            40,
            12,
            12,
          );
          options.layerOverrides[text.id] = {
            properties: { TextScaled: true },
            components: { textSize: { MinTextSize: 12, MaxTextSize: 18 } },
          };
          options.layerOverrides[row.id] = {
            properties: { Size: exampleUDim2(1, 0, 0, 64) },
          };
          row.children.push(text);
          list.children.push(row);
        }
        panels.children.push(list);
      }
      root.children.push(panels);
    }
    root.name = title;
    root.children.unshift(
      label("title", title, 592, 36, 24, 20, 26),
      label("hint", description, 592, 36, 24, 60, 13),
    );
    result.push({ key, title, description, designs: [root], options });
  }
  return result;
}
