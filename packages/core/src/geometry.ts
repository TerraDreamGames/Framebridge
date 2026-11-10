import type { Transform } from "./types";
export const round = (n: number) => Math.round(n * 100000) / 100000;
/** Express a world transform in another node's coordinate system. */
export function relativeTo(parent: Transform, child: Transform): Transform {
  const [[a, c, x], [b, d, y]] = parent;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10)
    throw new Error(
      "A repeat group has a singular transform. Export it as artwork.",
    );
  const [[e, g, u], [f, h, v]] = child;
  return [
    [
      (d * e - c * f) / determinant,
      (d * g - c * h) / determinant,
      (d * (u - x) - c * (v - y)) / determinant,
    ],
    [
      (-b * e + a * f) / determinant,
      (-b * g + a * h) / determinant,
      (-b * (u - x) + a * (v - y)) / determinant,
    ],
  ];
}
/** Figma transforms around its origin; Roblox rotates around the object's center. */
export function geometry(t: Transform, w: number, h: number) {
  const [[a, c, x], [b, d, y]] = t;
  return {
    x: round(x + (a * w) / 2 + (c * h) / 2 - w / 2),
    y: round(y + (b * w) / 2 + (d * h) / 2 - h / 2),
    rotation: round((Math.atan2(b, a) * 180) / Math.PI),
    skewed:
      Math.abs(a * c + b * d) > 0.0001 || Math.abs(a * d - b * c - 1) > 0.0001,
  };
}
/** Returns [position scale, position offset, size scale, size offset]. */
export function axisConstraint(
  mode: string,
  pos: number,
  size: number,
  parentSize: number,
): [number, number, number, number] {
  if (parentSize <= 0) return [0, pos, 0, size];
  switch (mode) {
    case "MAX":
      return [1, pos - parentSize, 0, size];
    case "CENTER":
      return [0.5, pos - parentSize / 2, 0, size];
    case "STRETCH":
      return [0, pos, 1, size - parentSize];
    case "SCALE":
      return [round(pos / parentSize), 0, round(size / parentSize), 0];
    default:
      return [0, pos, 0, size];
  }
}
export function validAssetId(input: string | undefined): string | undefined {
  const match = input?.trim().match(/^(?:rbxassetid:\/\/)?([1-9]\d{0,19})$/);
  return match ? `rbxassetid://${match[1]}` : undefined;
}
export const escapeRichText = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
