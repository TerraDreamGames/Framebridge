import type { DesignNode, RbxNode, Value } from "./types";

/** Captured pixels stay authoritative only while this editable glyph state matches. */
export type TextDecorationBaseline = {
  text: string;
  font: [string, string, string];
  size: number;
  rich: boolean;
  scaled: boolean;
  wrapped: boolean;
  lineHeight: number;
  x: string;
  y: string;
  truncate: string;
  graphemes: number;
  alpha: number;
  color: [number, number, number];
};
export type TextDecoration = {
  version: 1;
  reference: [number, number];
  scaled: boolean;
  shadows: {
    color: [number, number, number, number];
    offset: [number, number];
    radius: number;
    spread: number;
  }[];
  baseline?: TextDecorationBaseline;
  captured?: string;
  capturedAlpha?: number;
  themeShadow?: string;
};

// Figma's ES-only sandbox has no global TextEncoder; count UTF-8 without allocation.
const utf8Length = (text: string) => {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
};
const vector = (v: Value | undefined, fallback: number[]) =>
  v && typeof v === "object" && "value" in v ? (v.value as number[]) : fallback;
const enumName = (v: Value | undefined, fallback: string) =>
  v && typeof v === "object" && v.type === "Enum" ? v.value[1] : fallback;
export function textDecorationBaseline(
  p: Record<string, Value>,
): TextDecorationBaseline | undefined {
  const text = String(p.Text ?? ""),
    font = p.FontFace;
  // Keep native attribute data bounded. Long text uses editable glyphs immediately.
  if (
    utf8Length(text) > 8192 ||
    !font ||
    typeof font !== "object" ||
    font.type !== "Font"
  )
    return undefined;
  return {
    text,
    font: [font.family, font.weight, font.style],
    size: Number(p.TextSize ?? 14),
    rich: p.RichText === true,
    scaled: p.TextScaled === true,
    wrapped: p.TextWrapped === true,
    lineHeight: Number(p.LineHeight ?? 1),
    x: enumName(p.TextXAlignment, "Center"),
    y: enumName(p.TextYAlignment, "Center"),
    truncate: enumName(p.TextTruncate, "None"),
    graphemes: Number(p.MaxVisibleGraphemes ?? -1),
    alpha: Number(p.TextTransparency ?? 0),
    color: vector(p.TextColor3, [0, 0, 0]) as [number, number, number],
  };
}
export function textDecoration(
  n: DesignNode,
  owner: RbxNode,
  scaled: boolean,
  allowCapture = true,
): TextDecoration {
  return {
    version: 1,
    reference: [n.width, n.height],
    scaled,
    shadows: (n.shadows ?? []).map((s) => ({
      color: [s.color.r, s.color.g, s.color.b, s.color.a ?? 1],
      offset: [s.offset.x, s.offset.y],
      radius: s.radius,
      spread: s.spread,
    })),
    ...(owner.children.some((child) => child.id === `${owner.id}/effect`)
      ? {
          captured: `${owner.id}/effect`,
          capturedAlpha: Number(
            owner.children.find((child) => child.id === `${owner.id}/effect`)!
              .properties.ImageTransparency ?? 0,
          ),
          ...(allowCapture
            ? { baseline: textDecorationBaseline(owner.properties) }
            : {}),
        }
      : {}),
  };
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const number = (v: unknown, low: number, high: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= low && v <= high;
const tuple = (v: unknown, count: number, low: number, high: number) =>
  Array.isArray(v) &&
  v.length === count &&
  v.every((n) => number(n, low, high));
export function validTextDecoration(v: unknown): v is TextDecoration {
  if (
    !record(v) ||
    !fields(v, [
      "version",
      "reference",
      "scaled",
      "shadows",
      "baseline",
      "captured",
      "capturedAlpha",
      "themeShadow",
    ]) ||
    v.version !== 1 ||
    typeof v.scaled !== "boolean" ||
    !tuple(v.reference, 2, 0.000001, 1e7) ||
    !Array.isArray(v.shadows) ||
    v.shadows.length > 8 ||
    (!v.shadows.length && !v.themeShadow)
  )
    return false;
  if (
    !v.shadows.every(
      (s) =>
        record(s) &&
        fields(s, ["color", "offset", "radius", "spread"]) &&
        tuple(s.color, 4, 0, 1) &&
        tuple(s.offset, 2, -1000, 1000) &&
        number(s.radius, 0, 1000) &&
        number(s.spread, -1000, 1000),
    )
  )
    return false;
  if (
    v.captured !== undefined &&
    (typeof v.captured !== "string" || v.captured.length > 256)
  )
    return false;
  if (
    v.capturedAlpha !== undefined &&
    (!v.captured || !number(v.capturedAlpha, 0, 1))
  )
    return false;
  if (
    v.themeShadow !== undefined &&
    (typeof v.themeShadow !== "string" || v.themeShadow.length > 256)
  )
    return false;
  const b = v.baseline;
  if (
    b !== undefined &&
    (!record(b) ||
      !fields(b, [
        "text",
        "font",
        "size",
        "rich",
        "scaled",
        "wrapped",
        "lineHeight",
        "x",
        "y",
        "truncate",
        "graphemes",
        "alpha",
        "color",
      ]) ||
      typeof b.text !== "string" ||
      utf8Length(b.text) > 8192 ||
      !Array.isArray(b.font) ||
      b.font.length !== 3 ||
      typeof b.font[0] !== "string" ||
      b.font[0].length > 512 ||
      ![
        "Thin",
        "ExtraLight",
        "Light",
        "Regular",
        "Medium",
        "SemiBold",
        "Bold",
        "ExtraBold",
        "Heavy",
      ].includes(b.font[1]) ||
      !["Normal", "Italic"].includes(b.font[2]) ||
      !number(b.size, 1, 100) ||
      typeof b.rich !== "boolean" ||
      typeof b.scaled !== "boolean" ||
      typeof b.wrapped !== "boolean" ||
      !number(b.lineHeight, 1, 3) ||
      !["Left", "Center", "Right"].includes(String(b.x)) ||
      !["Top", "Center", "Bottom"].includes(String(b.y)) ||
      !["None", "AtEnd", "SplitWord"].includes(String(b.truncate)) ||
      !number(b.graphemes, -1, 1e9) ||
      !Number.isInteger(b.graphemes) ||
      !number(b.alpha, 0, 1) ||
      !tuple(b.color, 3, 0, 1))
  )
    return false;
  return utf8Length(JSON.stringify(v)) <= 65536;
}
export function validateTextDecorations(roots: RbxNode[]) {
  let nodes = 0,
    glyphs = 0,
    runtimeNodes = 0,
    owners = 0;
  const visit = (n: RbxNode) => {
    nodes++;
    if (n.textDecoration !== undefined) {
      const d = n.textDecoration;
      owners++;
      glyphs += (d.themeShadow ? 1 : d.shadows.length) * 4;
      if (
        !["TextLabel", "TextButton", "TextBox"].includes(n.className) ||
        !validTextDecoration(d) ||
        n.decorationRect ||
        n.maskBasis ||
        (d.captured !== undefined &&
          !n.children.some(
            (c) =>
              c.id === d.captured &&
              c.id === `${n.id}/effect` &&
              c.decorationRect &&
              c.assetRef &&
              c.className === "ImageLabel",
          )) ||
        (d.themeShadow !== undefined &&
          !n.children.some(
            (c) =>
              c.id === d.themeShadow &&
              c.className === "UIShadow" &&
              c.properties.Enabled === false,
          ))
      )
        throw new Error("Invalid live text decoration.");
    }
    n.children.forEach(visit);
  };
  for (const root of roots) {
    const before = glyphs;
    visit(root);
    if (glyphs > before) runtimeNodes += 2 + (root.worldUI ? 3 : 0);
  }
  if (glyphs > 4096 || nodes + glyphs * 4 + owners * 5 + runtimeNodes > 15000)
    throw new Error(
      "Live text shadow helpers exceed the 15,000-instance or 4,096-glyph budget. Export a smaller selection or reduce text shadows.",
    );
}
