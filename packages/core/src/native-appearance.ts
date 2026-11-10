import type { DesignNode, Paint, RbxNode, Value } from "./types";
import { round } from "./geometry";
import { styleUDim } from "./style-sizing";

const typed = (
  type: "UDim" | "UDim2" | "Color3",
  ...value: number[]
): Value => ({ type, value: value.map(round) });
const en = (family: string, name: string): Value => ({
  type: "Enum",
  value: [family, name],
});
export const visiblePaints = (paints: Paint[]) =>
  paints.filter((p) => p.visible !== false);

export function nativePaint(p: Paint): boolean {
  if (p.blendMode && p.blendMode !== "NORMAL") return false;
  if (p.type === "SOLID") return true;
  const t = p.gradientTransform,
    stops = p.gradientStops;
  return (
    p.type === "GRADIENT_LINEAR" &&
    !!t &&
    !!stops &&
    stops.length >= 2 &&
    stops.length <= 20 &&
    new Set(stops.map((s) => s.position)).size === stops.length &&
    ((Math.abs(t[0][0] - 1) < 0.0001 &&
      Math.abs(t[0][1]) < 0.0001 &&
      Math.abs(t[0][2]) < 0.0001) ||
      (Math.abs(t[0][0]) < 0.0001 &&
        Math.abs(t[0][1] - 1) < 0.0001 &&
        Math.abs(t[0][2]) < 0.0001))
  );
}

export function nativeShadows(n: DesignNode) {
  // UIShadow draws the filled box, not the silhouette of text or transparent artwork.
  const box =
    !n.text &&
    visiblePaints(n.fills).some((p) => nativePaint(p) && (p.opacity ?? 1) > 0);
  return (n.shadows ?? []).filter(
    (s) =>
      box &&
      s.type === "DROP_SHADOW" &&
      (!s.blendMode || s.blendMode === "NORMAL") &&
      s.radius >= 0 &&
      s.radius <= 1000,
  );
}

export function cornerProperties(
  n: DesignNode,
  scaled = false,
): Record<string, Value> | undefined {
  const radius = (pixels: number) =>
    scaled
      ? styleUDim(pixels, Math.min(n.width, n.height), true)
      : typed("UDim", 0, pixels);
  if (n.type === "ELLIPSE" && n.width === n.height)
    return { CornerRadius: typed("UDim", 0.5, 0) };
  if (n.corners?.length === 4 && new Set(n.corners).size > 1)
    return Object.fromEntries(
      [
        "TopLeftRadius",
        "TopRightRadius",
        "BottomRightRadius",
        "BottomLeftRadius",
      ].map((key, index) => [key, radius(n.corners![index])]),
    );
  return n.radius ? { CornerRadius: radius(n.radius) } : undefined;
}

function child(
  owner: RbxNode,
  suffix: string,
  className: string,
  properties: Record<string, Value>,
): RbxNode {
  const result = {
    id: `${owner.id}/${suffix}`,
    name: className,
    className,
    properties,
    children: [],
  };
  owner.children.push(result);
  return result;
}
function gradient(owner: RbxNode, p: Paint) {
  const stops = [...(p.gradientStops ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  if (stops[0].position > 0) stops.unshift({ ...stops[0], position: 0 });
  if (stops[stops.length - 1].position < 1)
    stops.push({ ...stops[stops.length - 1], position: 1 });
  child(owner, "gradient", "UIGradient", {
    Rotation: Math.abs(p.gradientTransform![0][1]) > 0.5 ? 90 : 0,
    Color: {
      type: "ColorSequence",
      value: stops.map((s) => [s.position, s.color.r, s.color.g, s.color.b]),
    },
    Transparency: {
      type: "NumberSequence",
      value: stops.map((s) => [s.position, 1 - (s.color.a ?? 1)]),
    },
  });
}
function paintBox(owner: RbxNode, p: Paint, opacity: number) {
  const c =
    p.type === "SOLID"
      ? (p.color ?? { r: 1, g: 1, b: 1 })
      : { r: 1, g: 1, b: 1 };
  owner.properties.BackgroundColor3 = typed("Color3", c.r, c.g, c.b);
  owner.properties.BackgroundTransparency = round(
    1 - (p.opacity ?? 1) * opacity,
  );
  if (p.type === "GRADIENT_LINEAR") gradient(owner, p);
}

/** Native decoration stays separate from the source children and never joins their layout. */
export function decorate(
  n: DesignNode,
  result: RbxNode,
  opacity: number,
  scaled = false,
) {
  const corners = cornerProperties(n, scaled);
  if (corners) child(result, "corner", "UICorner", corners);
  const strokes = visiblePaints(n.strokes);
  for (const [index, p] of strokes.entries()) {
    if (!nativePaint(p) || n.strokeWeight <= 0 || (n.text && index > 0))
      continue;
    const c =
      p.type === "SOLID"
        ? (p.color ?? { r: 1, g: 1, b: 1 })
        : { r: 1, g: 1, b: 1 };
    // Text is compiled before decoration. TextSize is the generated native
    // line height; source fontSize is an em size and would fatten this stroke.
    // User size/component overrides apply later and retain proportional control.
    const strokeReference = n.text
      ? typeof result.properties.TextSize === "number" &&
        result.properties.TextSize > 0
        ? result.properties.TextSize
        : (n.text.runs[0]?.fontSize ?? 16)
      : Math.min(n.width, n.height);
    const scaleStroke = scaled && strokeReference > 0;
    const stroke = child(
      result,
      index === 0 ? "stroke" : `stroke:${index}`,
      "UIStroke",
      {
        Color: typed("Color3", c.r, c.g, c.b),
        Thickness: scaleStroke
          ? n.strokeWeight / strokeReference
          : n.strokeWeight,
        ...(scaleStroke
          ? { StrokeSizingMode: en("StrokeSizingMode", "ScaledSize") }
          : {}),
        Transparency: round(1 - (p.opacity ?? 1) * opacity),
        ApplyStrokeMode: en(
          "ApplyStrokeMode",
          n.text ? "Contextual" : "Border",
        ),
        BorderStrokePosition: en(
          "BorderStrokePosition",
          n.strokeAlign === "OUTSIDE"
            ? "Outer"
            : n.strokeAlign === "CENTER"
              ? "Center"
              : "Inner",
        ),
        LineJoinMode: en(
          "LineJoinMode",
          n.radius || corners ? "Round" : "Miter",
        ),
      },
    );
    if (p.type === "GRADIENT_LINEAR") gradient(stroke, p);
  }
  for (const [index, s] of nativeShadows(n).entries())
    child(result, index === 0 ? "shadow" : `shadow:${index}`, "UIShadow", {
      Enabled: true,
      BlurRadius: scaled
        ? styleUDim(s.radius, Math.min(n.width, n.height), true)
        : typed("UDim", 0, s.radius),
      Offset: scaled
        ? {
            type: "UDim2",
            value: [
              ...styleUDim(s.offset.x, n.width, true).value,
              ...styleUDim(s.offset.y, n.height, true).value,
            ],
          }
        : typed("UDim2", 0, s.offset.x, 0, s.offset.y),
      Spread: scaled
        ? {
            type: "UDim2",
            value: [
              ...styleUDim(s.spread, n.width, true).value,
              ...styleUDim(s.spread, n.height, true).value,
            ],
          }
        : typed("UDim2", 0, s.spread, 0, s.spread),
      Color: typed("Color3", s.color.r, s.color.g, s.color.b),
      Transparency: round(1 - (s.color.a ?? 1) * opacity),
      ZIndex: -1 - index,
    });
  const fills = visiblePaints(n.fills);
  if (n.text || fills.length < 2 || !fills.every(nativePaint)) return;
  // Figma's first fill is on top. Background is the bottom fill; the other fills
  // are ordered from bottom to top, below every source child (ZIndex >= 1).
  result.children = result.children.filter(
    (c) => c.id !== `${result.id}/gradient`,
  );
  paintBox(result, fills[fills.length - 1], opacity);
  for (let index = fills.length - 2; index >= 0; index--) {
    const layer = child(result, `fill:${index}`, "Frame", {
      Size: typed("UDim2", 1, 0, 1, 0),
      Position: typed("UDim2", 0, 0, 0, 0),
      BorderSizePixel: 0,
      ZIndex: 0,
      Active: false,
    });
    layer.name = `Fill ${fills.length - index}`;
    // Decoration follows the box in every import mode; a pixel-sized backdrop
    // would otherwise become an unintended minimum for a Hug container.
    layer.layoutSizing = ["FILL", "FILL"];
    paintBox(layer, fills[index], opacity);
    if (corners)
      child(layer, "corner", "UICorner", JSON.parse(JSON.stringify(corners)));
  }
}

export function isolateDecoratedLayout(
  n: Pick<DesignNode, "id">,
  result: RbxNode,
) {
  if (
    !result.children.some(
      (c) => c.id.startsWith(`${n.id}/fill:`) || !!c.decorationRect,
    ) ||
    !result.children.some((c) =>
      ["UIListLayout", "UIGridLayout"].includes(c.className),
    )
  )
    return;
  const content = result.children.filter(
    (c) =>
      !!c.sourceType ||
      (!c.className.startsWith("UI") &&
        !c.id.startsWith(`${n.id}/fill:`) &&
        !c.decorationRect) ||
      ["UIListLayout", "UIGridLayout", "UIPadding"].includes(c.className),
  );
  result.children = result.children.filter((c) => !content.includes(c));
  const holder = child(result, "content", "Frame", {
    Size: typed("UDim2", 1, 0, 1, 0),
    Position: typed("UDim2", 0, 0, 0, 0),
    BackgroundTransparency: 1,
    BorderSizePixel: 0,
    ZIndex: 1,
  });
  holder.name = "Content";
  holder.referenceSize = result.referenceSize;
  holder.layoutSizing = result.layoutSizing;
  const enumAxis = (value: Value | undefined) =>
    value && typeof value === "object" && value.type === "Enum"
      ? value.value[1]
      : "None";
  const automatic = enumAxis(result.properties.AutomaticSize);
  const canvas =
    result.className === "ScrollingFrame"
      ? enumAxis(result.properties.AutomaticCanvasSize)
      : "None";
  const x = [automatic, canvas].some((axis) => axis === "X" || axis === "XY");
  const y = [automatic, canvas].some((axis) => axis === "Y" || axis === "XY");
  holder.layoutSizing = [x ? "HUG" : "FILL", y ? "HUG" : "FILL"];
  if (x || y) {
    holder.properties.AutomaticSize = {
      type: "Enum",
      value: ["AutomaticSize", x && y ? "XY" : x ? "X" : "Y"],
    };
    if (x)
      (holder.properties.Size as { value: number[] }).value.splice(0, 2, 0, 0);
    if (y)
      (holder.properties.Size as { value: number[] }).value.splice(2, 2, 0, 0);
  }
  holder.children = content;
}
