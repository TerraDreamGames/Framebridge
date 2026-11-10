// Original Framebridge SVG artwork, covered by the project MIT license.
// Shared geometry keeps the explorer glyphs and exported SVG assets identical.
export type GlyphFamily =
  "frame" | "text" | "button" | "image" | "screen" | "modifier";
export type GlyphVariant = "dark" | "light" | "monochrome";
// A moderately weighted, rounded family drawn on a shared 24 px grid.
export const GLYPH_STYLE = {
  viewBox: "0 0 24 24",
  strokeWidth: 1.8,
  linecap: "round",
  linejoin: "round",
} as const;
export const CLASS_GLYPH_NAMES = [
  "ScreenGui",
  "SurfaceGui",
  "BillboardGui",
  "Frame",
  "CanvasGroup",
  "ScrollingFrame",
  "ViewportFrame",
  "TextLabel",
  "TextButton",
  "TextBox",
  "ImageLabel",
  "ImageButton",
  "UICorner",
  "UIStroke",
  "UIGradient",
  "UIListLayout",
  "UIGridLayout",
  "UIPadding",
  "UIAspectRatioConstraint",
  "UISizeConstraint",
  "UITextSizeConstraint",
  "UIScale",
  "UIFlexItem",
  "UIShadow",
] as const;
export const CLASS_GLYPHS: Record<
  string,
  { family: GlyphFamily; body: string }
> = {
  ScreenGui: {
    family: "screen",
    body: '<rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" fill-opacity=".08"/><path d="M3 8h18"/>',
  },
  SurfaceGui: {
    family: "screen",
    body: '<path d="m4 7 13-4 3 14-13 4Z" fill="currentColor" fill-opacity=".08"/><path d="m5.5 11 12.4-3.8M10 5.2l3 14" opacity=".6"/>',
  },
  BillboardGui: {
    family: "screen",
    body: '<rect x="4" y="4" width="16" height="12" rx="2" fill="currentColor" fill-opacity=".08"/><path d="M12 16v5M8 21h8"/>',
  },
  Frame: {
    family: "frame",
    body: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fill-opacity=".08"/>',
  },
  CanvasGroup: {
    family: "frame",
    body: '<path d="M3 9v10a2 2 0 0 0 2 2h12" opacity=".55"/><rect x="7" y="3" width="14" height="14" rx="2" fill="currentColor" fill-opacity=".08"/>',
  },
  ScrollingFrame: {
    family: "frame",
    body: '<rect x="3.5" y="4" width="17" height="16" rx="2" fill="currentColor" fill-opacity=".08"/><path d="M6.5 9H12M6.5 13H11M17 8v8"/>',
  },
  ViewportFrame: {
    family: "frame",
    body: '<rect x="3" y="3" width="18" height="18" rx="2.5" fill="currentColor" fill-opacity=".08"/><path d="m12 7 5 3v5l-5 3-5-3v-5Zm-5 3 5 3 5-3M12 13v5"/>',
  },
  TextLabel: {
    family: "text",
    body: '<path d="M6 5h12M12 5v14M9 19h6"/>',
  },
  TextButton: {
    family: "button",
    body: '<rect x="3.5" y="4" width="17" height="16" rx="4" fill="currentColor" fill-opacity=".08"/><path d="M8 8h8M12 8v8M10 16h4"/>',
  },
  TextBox: {
    family: "text",
    body: '<rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" fill-opacity=".08"/><path d="M6.5 10H10M6.5 14H9M15 8v8M13 8h4M13 16h4"/>',
  },
  ImageLabel: {
    family: "image",
    body: '<rect x="3.5" y="4" width="17" height="16" rx="2" fill="currentColor" fill-opacity=".08"/><circle cx="16.3" cy="8.2" r="1.2" fill="currentColor" stroke="none"/><path d="m6 16 4.5-5 3.5 4 2-2 2 3"/>',
  },
  ImageButton: {
    family: "button",
    body: '<rect x="3.5" y="4" width="17" height="16" rx="4" fill="currentColor" fill-opacity=".08"/><circle cx="16.3" cy="8.2" r="1.2" fill="currentColor" stroke="none"/><path d="m6 16 4.5-5 3.5 4 2-2 2 3"/>',
  },
  UICorner: {
    family: "modifier",
    body: '<path d="M4 20v-9a7 7 0 0 1 7-7h9"/><path d="M11 20v-4a5 5 0 0 1 5-5h4M4 4v2M4 4h2" opacity=".35"/>',
  },
  UIStroke: {
    family: "modifier",
    body: '<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="8" y="8" width="8" height="8" rx="1.2" opacity=".4"/>',
  },
  UIGradient: {
    family: "modifier",
    body: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 8v8" opacity=".2"/><path d="M10.2 8v8" opacity=".4"/><path d="M13.8 8v8" opacity=".65"/><path d="M17.5 8v8"/>',
  },
  UIListLayout: {
    family: "modifier",
    body: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".85" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r=".85" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r=".85" fill="currentColor" stroke="none"/>',
  },
  UIGridLayout: {
    family: "modifier",
    body: '<rect x="4" y="4" width="6" height="6" rx="1.25"/><rect x="14" y="4" width="6" height="6" rx="1.25"/><rect x="4" y="14" width="6" height="6" rx="1.25"/><rect x="14" y="14" width="6" height="6" rx="1.25"/>',
  },
  UIPadding: {
    family: "modifier",
    body: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="2 3" opacity=".5"/><rect x="8" y="8" width="8" height="8" rx="1.5" fill="currentColor" fill-opacity=".08"/>',
  },
  UIAspectRatioConstraint: {
    family: "modifier",
    body: '<rect x="3" y="6" width="18" height="12" rx="2" fill="currentColor" fill-opacity=".08"/><path d="m8 15 8-6M8 12v3h3M13 9h3v3"/>',
  },
  UISizeConstraint: {
    family: "modifier",
    body: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1.5" fill="currentColor" fill-opacity=".08"/>',
  },
  UITextSizeConstraint: {
    family: "modifier",
    body: '<path d="M3 8V3h5M16 21h5v-5M8 8h8M12 8v11M10 19h4"/>',
  },
  UIScale: {
    family: "modifier",
    body: '<rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" fill-opacity=".08"/><path d="m10 14 11-11M15 3h6v6M3 8V3h5"/>',
  },
  UIFlexItem: {
    family: "modifier",
    body: '<rect x="8" y="5" width="8" height="14" rx="2" fill="currentColor" fill-opacity=".08"/><path d="M2.5 12H5m-2.5 0 2-2m-2 2 2 2M19 12h2.5m0 0-2-2m2 2-2 2"/>',
  },
  UIShadow: {
    family: "modifier",
    body: '<path d="M21 9v10a2 2 0 0 1-2 2H9" opacity=".4"/><rect x="3" y="3" width="14" height="14" rx="2.5" fill="currentColor" fill-opacity=".08"/>',
  },
  "In image": {
    family: "modifier",
    body: '<path d="M3 9v11h13" opacity=".55"/><rect x="6" y="3" width="15" height="14" rx="2"/><path d="m9 13 3-4 3 3 2-2 1 2"/>',
  },
  Skipped: {
    family: "modifier",
    body: '<circle cx="12" cy="12" r="8.5"/><path d="m6 18 12-12"/>',
  },
};
export const GLYPH_COLORS = {
  dark: {
    frame: "#f39a59",
    text: "#61bafa",
    button: "#70cf88",
    image: "#c396f2",
    screen: "#6caaff",
    modifier: "#b9bec8",
  },
  light: {
    frame: "#a65218",
    text: "#0873b8",
    button: "#247d3c",
    image: "#7543a7",
    screen: "#2369b7",
    modifier: "#5a6270",
  },
};
export const GLYPH_SELECTION_COLORS: Record<GlyphFamily, string> = {
  frame: "#ffd0a8",
  text: "#c4e9ff",
  button: "#c4f3d1",
  image: "#ead5ff",
  screen: "#d1e4ff",
  modifier: "#e1e5ec",
};
const unknown = {
  family: "modifier" as const,
  body: '<path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9Zm-8.5 4.5L12 12l8.5-4.5M12 12v9"/>',
};
export function classGlyph(className: string) {
  return Object.prototype.hasOwnProperty.call(CLASS_GLYPHS, className)
    ? CLASS_GLYPHS[className]
    : unknown;
}
export function classGlyphSvg(className: string, variant: GlyphVariant) {
  const glyph = classGlyph(className);
  const color =
    variant === "monochrome" ? "#111111" : GLYPH_COLORS[variant][glyph.family];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${GLYPH_STYLE.viewBox}" fill="none" stroke="${color}" stroke-width="${GLYPH_STYLE.strokeWidth}" stroke-linecap="${GLYPH_STYLE.linecap}" stroke-linejoin="${GLYPH_STYLE.linejoin}">${glyph.body.replace(/currentColor/g, color)}</svg>`;
}
