# Functional layout examples

Four editable interfaces, exported through Framebridge's production compiler and JSON exporter. No image uploads, external assets or game scripts are required for scrolling and layout.

| Package | Native behavior |
| --- | --- |
| `quest-list.framebridge.json` | Ten quest rows in a vertical ScrollingFrame with UIListLayout, UIPadding and UISizeConstraint row limits. |
| `horizontal-carousel.framebridge.json` | Eight reward cards in a horizontal ScrollingFrame with AutomaticCanvasSize X and a horizontal UIListLayout. |
| `inventory-grid.framebridge.json` | Eighteen cells in a scrolling UIGridLayout; Source mode keeps 136×96 cells and changes column count with available width. |
| `nested-panels.framebridge.json` | A horizontal UIListLayout contains two independent vertical scrolling lists; entry labels use UITextSizeConstraint. |

## Create and export in Figma

Open Framebridge → **More options → Create layout examples**. This adds a separate page with four real source frames and the corresponding Properties overrides. On a Starter file already at its page limit, it adds a new section on the current page instead. Existing content and overrides are retained. The examples use **Responsive layout** and retain your appearance preference. Click **Analyze**, inspect a scrolling container or its layout modifier in Properties, then **Download package** or send it to a connected Studio.

For your own interface:

1. Select the container in Properties. Expand **Export setup** and set **Instance type** to `ScrollingFrame`.
2. Search `canvas` and set **Automatic canvas size** to Y for a vertical list, X for a horizontal carousel, or XY for both. Keep CanvasSize zero on automatic axes.
3. Search `scroll` and set the matching **Scrolling direction**.
4. Expand **Constraints & modifiers** and add **List layout** or **Grid layout**. Edit the modifier's direction, padding, cell size and order. Add **Inner padding** to leave room around the content.
5. Analyze and export. Roblox's layout owns its direct children; grid layouts also own cell sizes. Scripts for buying items, completing quests, navigation and data binding are added in Studio.

Responsive layout converts supported Figma list, wrap/grid and hug/fill arrangements into native Roblox layouts and constraints. Use explicit List layout or Grid layout modifiers when you want to choose the exported behavior. Unsupported combinations produce review notes; check the intended viewport sizes in Studio.

## Import in Studio

Open Framebridge → **Open package** and choose any JSON in this directory. Choose **Source** to keep the example's mixed scale/pixel settings, **Scale** for proportional container sizing, or **Pixels** for fixed dimensions, then import. Edit the resulting instances in Roblox Explorer and Properties.

Scale mode retains stable pixel content extents along AutomaticCanvasSize axes. For example, a vertical list scales its width but retains row height in pixels; a horizontal carousel retains card width. This avoids clipping the final entry when the automatic canvas and percentage-sized content disagree. Explicit Studio property overrides still take precedence. Source mode preserves the authored settings without conversion.

## Play the demonstration

The JSON packages contain no scripts. The viewer's script only demonstrates navigation and adding entries; native ScrollingFrame, UIListLayout and UIGridLayout provide scrolling and layout.
