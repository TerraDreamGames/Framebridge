import { textDecorationBaseline } from "../../../packages/core/src/text-decoration";
import type { RbxNode, Value } from "../../../packages/core/src/types";
const vector = (v: Value | undefined) =>
  v && typeof v === "object" && "value" in v ? (v.value as number[]) : [];
/** CSS follows the current glyph flow; its blur is an approximation of native contours. */
export function previewTextDecoration(
  owner: RbxNode,
  properties: Record<string, Value>,
  size: readonly number[],
  captureAvailable: boolean,
  runAlpha = 1,
) {
  const d = owner.textDecoration;
  if (!d) return { captured: false, shadow: undefined as string | undefined };
  const captured =
    Number(properties.BackgroundTransparency ?? 0) === 1 &&
    (!properties.TextDirection ||
      (typeof properties.TextDirection === "object" &&
        properties.TextDirection.type === "Enum" &&
        properties.TextDirection.value[1] === "Auto")) &&
    !owner.children.some(
      (n) =>
        n.className === "UIPadding" ||
        n.className === "UITextSizeConstraint" ||
        n.className === "UIGradient" ||
        n.className === "UIStroke",
    ) &&
    !!d.captured &&
    captureAvailable &&
    !d.themeShadow &&
    !!d.baseline &&
    JSON.stringify(textDecorationBaseline(properties)) ===
      JSON.stringify(d.baseline) &&
    size.every((n, i) => Math.abs(n - d.reference[i]) <= 0.5);
  const x = d.scaled ? size[0] / d.reference[0] : 1,
    y = d.scaled ? size[1] / d.reference[1] : 1;
  let shadows = d.shadows.map((s) => ({
    color: s.color,
    offset: [s.offset[0] * x, s.offset[1] * y],
    radius: s.radius * Math.min(x, y),
  }));
  const theme = owner.children.find((child) => child.id === d.themeShadow);
  if (theme) {
    const p = theme.properties,
      color = vector(p.Color),
      offset = vector(p.Offset),
      blur = vector(p.BlurRadius);
    shadows = [
      {
        color: [...color, 1 - Number(p.Transparency ?? 0)] as [
          number,
          number,
          number,
          number,
        ],
        offset: [
          (offset[0] ?? 0) * size[0] + (offset[1] ?? 0),
          (offset[2] ?? 0) * size[1] + (offset[3] ?? 0),
        ],
        radius: (blur[0] ?? 0) * Math.min(...size) + (blur[1] ?? 0),
      },
    ];
  }
  const alpha = 1 - Number(properties.TextTransparency ?? 0);
  return {
    captured,
    shadow: captured
      ? undefined
      : shadows
          .map(
            (s) =>
              `${s.offset[0]}px ${s.offset[1]}px ${s.radius}px rgba(${s.color
                .slice(0, 3)
                .map((c) => Math.round(c * 255))
                .join(",")},${s.color[3] * alpha * runAlpha})`,
          )
          .join(", ") || undefined,
  };
}
