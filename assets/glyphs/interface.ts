// Original Framebridge interface artwork, covered by the project MIT license.
// Shared 24 px geometry, moderate weight and rounded edges.
import { CLASS_GLYPHS, GLYPH_STYLE, type GlyphVariant } from "./catalog";

export const INTERFACE_GLYPHS = {
  ArrowDownToLine: '<path d="M12 3v12m-4-4 4 4 4-4M5 19v2h14v-2"/>',
  ArrowLeft: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  ArrowRight: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  Backpack:
    '<rect x="5" y="6" width="14" height="15" rx="4"/><path d="M9 6V5a3 3 0 0 1 6 0v1M3 11v6M21 11v6M8 12h8"/><rect x="8" y="14" width="8" height="4" rx="1.2"/>',
  BookOpen:
    '<path d="M12 5.5C9.2 3.8 6.4 3.6 3 4.5V19c3.4-.9 6.2-.7 9 1 2.8-1.7 5.6-1.9 9-1V4.5c-3.4-.9-6.2-.7-9 1ZM12 5.5V20"/>',
  Check: '<path d="m5 12 4.5 4.5L19 7"/>',
  CheckCheck: '<path d="m2.5 12 4.5 4.5L16.5 7m-3 8 1.5 1.5L22 9.5"/>',
  ChevronDown: '<path d="m7 9 5 5 5-5"/>',
  ChevronRight: '<path d="m9 7 5 5-5 5"/>',
  ChevronUp: '<path d="m7 15 5-5 5 5"/>',
  Circle: '<circle cx="12" cy="12" r="7.5"/>',
  CircleHelp:
    '<circle cx="12" cy="12" r="9"/><path d="M9.3 8.5a2.8 2.8 0 0 1 5.4 1c0 2-2.7 2.2-2.7 4.3"/><circle cx="12" cy="17" r=".85" fill="currentColor" stroke="none"/>',
  Copy: '<path d="M8 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/><rect x="8" y="8" width="13" height="13" rx="2"/>',
  Crosshair:
    '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>',
  ExternalLink:
    '<path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6M14 3h7v7M10 14 21 3"/>',
  Eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  EyeOff:
    '<path d="M9 6.5a11 11 0 0 1 3-.5c6 0 9.5 6 9.5 6a18 18 0 0 1-3 3.5M14.5 17.6a11 11 0 0 1-2.5.4c-6 0-9.5-6-9.5-6a18 18 0 0 1 3-3.5M4 4l16 16"/>',
  FileBox:
    '<rect x="4" y="8" width="16" height="13" rx="2"/><path d="M3 4h18v4H3ZM9 12h6"/>',
  Focus:
    '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1.5"/>',
  Frame: CLASS_GLYPHS.Frame.body,
  Grid2X2: CLASS_GLYPHS.UIGridLayout.body,
  Image: CLASS_GLYPHS.ImageLabel.body,
  Info: '<circle cx="12" cy="12" r="9"/><path d="M11 11h1v6M10 17h4"/><circle cx="12" cy="7.5" r=".85" fill="currentColor" stroke="none"/>',
  Layers:
    '<path d="m3 8 9-4.5L21 8l-9 4.5Zm0 4 9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>',
  Lightbulb:
    '<path d="M8.5 16c0-2-3-3.5-3-6.5a6.5 6.5 0 0 1 13 0c0 3-3 4.5-3 6.5ZM9 20h6M12 16v-5m-2-1 2 2 2-2"/>',
  Link: '<path d="m9 7 2-2a5 5 0 0 1 7 7l-2 2M8 10l-2 2a5 5 0 0 0 7 7l2-2M8 16l8-8"/>',
  LoaderCircle: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/>',
  Maximize2: '<path d="M14 3h7v7M10 21H3v-7M21 3l-7 7M3 21l7-7"/>',
  Minus: '<path d="M5 12h14"/>',
  Monitor:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4M8 21h8"/>',
  Moon: '<path d="M10 3.5A9 9 0 1 0 20.5 14 8 8 0 0 1 10 3.5Z"/>',
  MoreHorizontal:
    '<circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.25" fill="currentColor" stroke="none"/>',
  MousePointer2: '<path d="m5 3 15 9-7 1.5L10.5 21Zm8 11 3 5"/>',
  MoveDiagonal2: '<path d="M6 21 21 6M12 21l9-9M18 21l3-3"/>',
  Pin: '<path d="M8 3h8M9 3v6l-3 4v2h12v-2l-3-4V3M12 15v6"/>',
  PinOff: '<path d="M8 3h8M15 3v6l3 4v2h-3M9 7v2l-3 4v2h5M12 17v4M3 3l18 18"/>',
  Play: '<path d="m7 4 13 8-13 8Z"/>',
  Plus: '<path d="M5 12h14M12 5v14"/>',
  Redo2: '<path d="M4 19v-5a6 6 0 0 1 6-6h10M15 3l5 5-5 5"/>',
  RefreshCw:
    '<path d="M20 9a8.5 8.5 0 0 0-15.5-3M4 15a8.5 8.5 0 0 0 15.5 3M20 3.5V9h-5.5M4 20.5V15h5.5"/>',
  RotateCcw: '<path d="M4 9a8.5 8.5 0 1 1-.5 5M4 3.5V9h5.5"/>',
  RotateCw: '<path d="M20 9a8.5 8.5 0 1 0 .5 5M20 3.5V9h-5.5"/>',
  Search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  Settings2:
    '<path d="m10 3-.5 2-2 .9-1.9-.6-2 3.4L5 10.1v2.2l-1.4 1.4 2 3.4 1.9-.6 2 .9.5 2h4l.5-2 2-.9 1.9.6 2-3.4-1.4-1.4v-2.2l1.4-1.4-2-3.4-1.9.6-2-.9L14 3Z"/><circle cx="12" cy="11.2" r="3"/>',
  ShieldCheck:
    '<path d="m12 3 8 3.5V13c0 4-8 8-8 8s-8-4-8-8V6.5Z"/><path d="m8.5 11.5 2.5 2.5 4.5-5"/>',
  SlidersHorizontal:
    '<path d="M3 6h4M11 6h10M3 12h11M18 12h3M3 18h6M13 18h8"/><rect x="7" y="3.5" width="4" height="5" rx="1.2"/><rect x="14" y="9.5" width="4" height="5" rx="1.2"/><rect x="9" y="15.5" width="4" height="5" rx="1.2"/>',
  Sparkles:
    '<path d="m9 4 2.2 5.8L17 12l-5.8 2.2L9 20l-2.2-5.8L1 12l5.8-2.2ZM19 2v5M16.5 4.5h5M20 17v4M18 19h4"/>',
  Square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  Sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  TriangleAlert:
    '<path d="m12 3 9 17H3Z"/><path d="M12 8v5"/><circle cx="12" cy="16.5" r=".85" fill="currentColor" stroke="none"/>',
  Undo2: '<path d="M20 19v-5a6 6 0 0 0-6-6H4M9 3 4 8l5 5"/>',
  Upload: '<path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  X: '<path d="m6 6 12 12M18 6 6 18"/>',
} as const;

export type InterfaceGlyphName = keyof typeof INTERFACE_GLYPHS;
export const INTERFACE_GLYPH_NAMES = Object.keys(
  INTERFACE_GLYPHS,
) as InterfaceGlyphName[];

export function interfaceGlyphSvg(
  name: InterfaceGlyphName,
  variant: GlyphVariant,
) {
  const color =
    variant === "dark"
      ? "#fcfcfc"
      : variant === "light"
        ? "#0d0d0d"
        : "#111111";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${GLYPH_STYLE.viewBox}" fill="none" stroke="${color}" stroke-width="${GLYPH_STYLE.strokeWidth}" stroke-linecap="${GLYPH_STYLE.linecap}" stroke-linejoin="${GLYPH_STYLE.linejoin}">${INTERFACE_GLYPHS[name].replace(/currentColor/g, color)}</svg>`;
}
