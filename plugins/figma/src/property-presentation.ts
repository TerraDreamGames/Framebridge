import type { PropertySpec } from "../../../packages/core/src/editor";
import type { Value } from "../../../packages/core/src/types";

export type PropertyView = "common" | "all" | "changed";

const LABELS: Record<string, string> = {
  Ambient: "Ambient light",
  LightColor: "Light color",
  LightDirection: "Light direction",
  AnchorPoint: "Anchor point",
  ZIndex: "Stack order",
  LayoutOrder: "Layout order",
  AutomaticSize: "Auto size",
  BackgroundColor3: "Background color",
  BackgroundTransparency: "Transparency",
  ImageTransparency: "Transparency",
  TextTransparency: "Transparency",
  BorderSizePixel: "Border width",
  ClipsDescendants: "Clip children",
  Image: "Image asset",
  ImageColor3: "Image tint",
  ScaleType: "Image fit",
  SliceCenter: "Slice guides",
  SliceScale: "Border scale",
  TileSize: "Tile size",
  FontFace: "Font",
  TextColor3: "Text color",
  TextWrapped: "Wrap text",
  TextScaled: "Scale to fit",
  TextXAlignment: "Horizontal align",
  TextYAlignment: "Vertical align",
  AutoLocalize: "Auto translate",
  TextEditable: "Allow editing",
  ClearTextOnFocus: "Clear on focus",
  MultiLine: "Multiple lines",
  PlaceholderColor3: "Placeholder color",
  IgnoreGuiInset: "Ignore top inset",
  ResetOnSpawn: "Reset on respawn",
  ZIndexBehavior: "Stacking behavior",
  ScrollBarImageColor3: "Scrollbar color",
  ScrollBarImageTransparency: "Scrollbar transparency",
  ScrollBarThickness: "Scrollbar width",
  MinSize: "Minimum size",
  MaxSize: "Maximum size",
  MinTextSize: "Minimum text size",
  MaxTextSize: "Maximum text size",
  Color: "Color",
  StrokeSizingMode: "Border sizing",
  PaddingTop: "Top padding",
  PaddingBottom: "Bottom padding",
  PaddingLeft: "Left padding",
  PaddingRight: "Right padding",
};
const DESCRIPTIONS: Record<string, string> = {
  StrokeSizingMode:
    "FixedSize measures thickness in pixels. ScaledSize uses a fraction of the shorter edge, or the font size for a text outline.",
  Thickness:
    "Border width in pixels, or a relative fraction when Border sizing is ScaledSize (0.02 is 2%).",
  Ambient:
    "Base illumination for the 3D scene. A brighter color makes unlit areas easier to see.",
  LightColor: "Color of the directional light illuminating the 3D scene.",
  LightDirection:
    "Direction the 3D light travels, using X, Y and Z axes. The default is -1, -1, -1.",
  Wraps: "Moves items onto another row or column when they no longer fit.",
  FlexMode: "Controls whether this item grows or shrinks within a list layout.",
  GrowRatio:
    "Relative share of remaining space. A ratio of 2 gets twice the space of 1.",
  ShrinkRatio:
    "Relative amount this item can shrink when the row is too small.",
  ItemLineAlignment:
    "Places this item within its row or column; Stretch fills the available cross-axis.",
  CanvasSize:
    "Minimum scrollable content size. Keep automatically sized axes at zero so content determines their extent.",
  AutomaticCanvasSize:
    "Grows the scrolling canvas as entries are added: X for horizontal, Y for vertical, or XY for both.",
  ScrollingDirection:
    "Allows scrolling horizontally, vertically or both. Match this to the automatic canvas axes.",
  ScrollingEnabled: "Enables built-in scrolling input in Roblox.",
  CellSize:
    "A grid controls the size of its direct children with these cell dimensions.",
  CellPadding:
    "Space between grid cells. Inner padding controls the space around the whole grid.",
  FillDirection:
    "Arranges entries horizontally or vertically. The layout controls child positions.",
  FillDirectionMaxCells:
    "Maximum cells per row or column. 0 lets available space determine the count.",
  SortOrder:
    "Use LayoutOrder to arrange entries by each child's layout order value.",
  Position:
    "Places the element relative to its parent. Scale follows the parent's dimensions; offset adds pixels.",
  Size: "Sets width and height. Scale follows the parent's dimensions; offset adds pixels.",
  AnchorPoint:
    "The point on this element placed at its Position: 0, 0 is top-left; 0.5, 0.5 is center.",
  Rotation: "Rotates the element in degrees.",
  ZIndex:
    "Higher values draw in front of siblings, subject to the screen's stacking behavior.",
  LayoutOrder: "Controls order when the parent's layout sorts by LayoutOrder.",
  AutomaticSize:
    "Lets content determine width, height or both, subject to size constraints.",
  BackgroundTransparency: "0 is opaque; 1 is fully transparent.",
  ImageTransparency: "0 is opaque; 1 is fully transparent.",
  TextTransparency: "0 is opaque; 1 is fully transparent.",
  Transparency: "0 is opaque; 1 is fully transparent.",
  GroupTransparency:
    "Fades this CanvasGroup and its descendants. 0 is opaque; 1 is transparent.",
  Image:
    "A Roblox asset ID or asset URI. Upload and link Figma artwork in Images.",
  ScaleType:
    "Stretch fills the bounds; Fit keeps the whole image visible; Crop trims edges; Tile repeats the texture; Slice preserves its borders and corners.",
  SliceCenter:
    "Left, top, right and bottom coordinates of the stretchable center, in source texture pixels. Right and bottom are coordinates, not border widths.",
  SliceScale:
    "Multiplies the thickness of nine-slice borders and corners. 1 keeps their source texture size; 0.5 halves it.",
  TileSize:
    "Size of each repeated image. Scale follows this element's dimensions; offset adds pixels. Both axes must have a positive size.",
  ImageColor3:
    "Multiplies the image's colors. White preserves the original colors.",
  ClipsDescendants:
    "Hides the portions of children that extend outside this element.",
  TextScaled:
    "Fits text to the element. Add text size limits to bound the result.",
  TextWrapped: "Allows text to continue onto another line.",
  TextSize: "Text size in pixels. TextScaled takes precedence when enabled.",
  FontFace:
    "Choose the Roblox font family, weight and style for editable text.",
  Enabled: "Shows or hides this entire screen.",
  Visible: "Shows or hides this element and its children.",
  IgnoreGuiInset:
    "Allows this screen to extend into the area reserved for Roblox's top bar.",
  ResetOnSpawn: "Recreates this screen when the player's character respawns.",
  Active:
    "Controls input handling; gameplay behavior still requires scripts in Studio.",
  Selectable: "Allows gamepad navigation to select this element.",
  Scale: "1 is the original size; 0.5 is half size; 2 is double size.",
  CornerRadius:
    "Sets all four corner radii together. Use the individual corner fields to change just one corner.",
  BlurRadius:
    "Softness of this shadow, using relative scale plus a pixel offset.",
  Offset:
    "Moves the shadow horizontally and vertically relative to its element.",
  Spread: "Expands or contracts the shadow around its element.",
  AspectRatio:
    "Width divided by height. 1 keeps a square; 1.778 is approximately 16:9.",
  MinSize: "The smallest allowed width and height in pixels.",
  MaxSize: "The largest allowed width and height in pixels.",
  MinTextSize: "The smallest allowed size for scaled text, in pixels.",
  MaxTextSize: "The largest allowed size for scaled text, in pixels.",
};
const COMMON = new Set([
  "Name",
  "Ambient",
  "LightColor",
  "LightDirection",
  "Wraps",
  "FlexMode",
  "GrowRatio",
  "ShrinkRatio",
  "ItemLineAlignment",
  "Position",
  "Size",
  "AnchorPoint",
  "Rotation",
  "Visible",
  "BackgroundColor3",
  "BackgroundTransparency",
  "GroupTransparency",
  "Text",
  "TextSize",
  "TextColor3",
  "TextWrapped",
  "TextScaled",
  "TextXAlignment",
  "TextYAlignment",
  "FontFace",
  "Image",
  "ImageColor3",
  "ImageTransparency",
  "ScaleType",
  "SliceCenter",
  "SliceScale",
  "TileSize",
  "Enabled",
  "IgnoreGuiInset",
  "DisplayOrder",
  "CanvasSize",
  "AutomaticCanvasSize",
  "ScrollingDirection",
  "ScrollingEnabled",
  "ScrollBarThickness",
  "PlaceholderText",
  "MultiLine",
  "TextEditable",
]);
export const MODIFIER_LABELS: Record<string, string> = {
  UIShadow: "Drop shadow",
  UICorner: "Rounded corners",
  UIStroke: "Outline",
  UIAspectRatioConstraint: "Aspect ratio",
  UISizeConstraint: "Size limits",
  UITextSizeConstraint: "Text size limits",
  UIScale: "Overall scale",
  UIPadding: "Inner padding",
  UIListLayout: "List layout",
  UIGridLayout: "Grid layout",
  UIFlexItem: "Flexible sizing",
};
export function propertyLabel(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return LABELS[name] ?? spaced[0] + spaced.slice(1).toLowerCase();
}
export function propertyDescription(name: string): string | undefined {
  return DESCRIPTIONS[name];
}
export type InspectorSection = "layout" | "style" | "behavior";
export function inspectorSection(group: string): InspectorSection {
  if (
    /layout|padding|aspect|flex|scale|limits|scrolling|world ui|screen/i.test(
      group,
    )
  )
    return "layout";
  if (["Interaction", "Input", "Behavior", "Data"].includes(group))
    return "behavior";
  return "style";
}
export function propertyValueSummary(value: Value): string {
  if (typeof value !== "object") return String(value);
  if (value.type === "Font")
    return [
      value.family.split("/").pop()?.replace(".json", ""),
      value.weight,
      value.style === "Normal" ? undefined : value.style,
    ]
      .filter(Boolean)
      .join(" · ");
  // Keep compound rows readable without rounding the actual editable values.
  const numbers = value.value.map((number) =>
    typeof number !== "number" || Number.isInteger(number)
      ? String(number)
      : Math.abs(number) < 0.0001
        ? number.toExponential(2)
        : String(Number(number.toFixed(4))),
  );
  if (value.type === "UDim2")
    return `{${numbers[0]}, ${numbers[1]}}, {${numbers[2]}, ${numbers[3]}}`;
  if (value.type === "UDim") return `{${numbers.join(", ")}}`;
  return numbers.join(", ");
}
// Studio puts GuiObject values in Data and input controls in Behavior.
// Keep the export schema unchanged; this grouping is only for the inspector.
export function studioPropertySchema(
  schema: Record<string, PropertySpec>,
): Record<string, PropertySpec> {
  const gui = !!schema.Position || !!schema.Enabled;
  return Object.fromEntries(
    Object.entries(schema)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, spec]) => [
        name,
        {
          ...spec,
          group:
            gui && ["Layout", "Appearance", "Screen"].includes(spec.group)
              ? "Data"
              : spec.group === "Interaction"
                ? "Behavior"
                : spec.group,
        },
      ]),
  );
}
export function propertyUnit(name: string): string | undefined {
  if (name === "Rotation") return "°";
  if (
    [
      "TextSize",
      "BorderSizePixel",
      "ScrollBarThickness",
      "MinTextSize",
      "MaxTextSize",
    ].includes(name)
  )
    return "px";
}
export function propertyMatches(
  name: string,
  spec: PropertySpec,
  query: string,
): boolean {
  const text = [
    name,
    propertyLabel(name),
    spec.group,
    propertyDescription(name),
  ]
    .join(" ")
    .toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
export function propertiesForView(
  schema: Record<string, PropertySpec>,
  view: PropertyView,
  query: string,
  overrides: Record<string, Value> = {},
  effective?: Record<string, Value>,
): [string, PropertySpec][] {
  const modifier = !schema.Position && !schema.Enabled;
  const scaleType = effective?.ScaleType;
  const mode =
    scaleType && typeof scaleType === "object" && scaleType.type === "Enum"
      ? scaleType.value[1]
      : effective
        ? "Stretch"
        : undefined;
  return Object.entries(schema).filter(([name, spec]) =>
    query.trim()
      ? propertyMatches(name, spec, query)
      : view === "all" ||
        (view === "changed"
          ? Object.prototype.hasOwnProperty.call(overrides, name)
          : (modifier || COMMON.has(name)) &&
            (mode === undefined ||
              !["SliceCenter", "SliceScale", "TileSize"].includes(name) ||
              (name === "TileSize" ? mode === "Tile" : mode === "Slice"))),
  );
}
