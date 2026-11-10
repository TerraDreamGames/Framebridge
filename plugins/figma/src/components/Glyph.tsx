import { forwardRef, type SVGProps } from "react";
import { GLYPH_STYLE } from "../../../../assets/glyphs/catalog";
import {
  INTERFACE_GLYPHS,
  type InterfaceGlyphName,
} from "../../../../assets/glyphs/interface";

export type GlyphProps = SVGProps<SVGSVGElement> & { size?: number | string };

function glyph(name: InterfaceGlyphName) {
  const Icon = forwardRef<SVGSVGElement, GlyphProps>(function FramebridgeGlyph(
    {
      size = 24,
      strokeWidth = GLYPH_STYLE.strokeWidth,
      className,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={GLYPH_STYLE.viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap={GLYPH_STYLE.linecap}
        strokeLinejoin={GLYPH_STYLE.linejoin}
        aria-hidden={
          props["aria-label"] || props["aria-labelledby"] ? undefined : true
        }
        focusable="false"
        {...props}
        className={["framebridge-glyph", className].filter(Boolean).join(" ")}
        data-glyph={name}
      >
        {children}
        {/* Trusted original artwork; never contains user-supplied markup. */}
        <g dangerouslySetInnerHTML={{ __html: INTERFACE_GLYPHS[name] }} />
      </svg>
    );
  });
  Icon.displayName = `Framebridge${name}`;
  return Icon;
}

export const ArrowDownToLine = glyph("ArrowDownToLine");
export const ArrowLeft = glyph("ArrowLeft");
export const ArrowRight = glyph("ArrowRight");
export const Backpack = glyph("Backpack");
export const BookOpen = glyph("BookOpen");
export const Check = glyph("Check");
export const CheckCheck = glyph("CheckCheck");
export const ChevronDown = glyph("ChevronDown");
export const ChevronRight = glyph("ChevronRight");
export const ChevronUp = glyph("ChevronUp");
export const Circle = glyph("Circle");
export const CircleHelp = glyph("CircleHelp");
export const Copy = glyph("Copy");
export const Crosshair = glyph("Crosshair");
export const ExternalLink = glyph("ExternalLink");
export const Eye = glyph("Eye");
export const EyeOff = glyph("EyeOff");
export const FileBox = glyph("FileBox");
export const Focus = glyph("Focus");
export const Frame = glyph("Frame");
export const Grid2X2 = glyph("Grid2X2");
export const Image = glyph("Image");
export const Info = glyph("Info");
export const Layers = glyph("Layers");
export const Lightbulb = glyph("Lightbulb");
export const Link = glyph("Link");
export const LoaderCircle = glyph("LoaderCircle");
export const Maximize2 = glyph("Maximize2");
export const Minus = glyph("Minus");
export const Monitor = glyph("Monitor");
export const Moon = glyph("Moon");
export const MoreHorizontal = glyph("MoreHorizontal");
export const MousePointer2 = glyph("MousePointer2");
export const MoveDiagonal2 = glyph("MoveDiagonal2");
export const Pin = glyph("Pin");
export const PinOff = glyph("PinOff");
export const Play = glyph("Play");
export const Plus = glyph("Plus");
export const Redo2 = glyph("Redo2");
export const RefreshCw = glyph("RefreshCw");
export const RotateCcw = glyph("RotateCcw");
export const RotateCw = glyph("RotateCw");
export const Search = glyph("Search");
export const Settings2 = glyph("Settings2");
export const ShieldCheck = glyph("ShieldCheck");
export const SlidersHorizontal = glyph("SlidersHorizontal");
export const Sparkles = glyph("Sparkles");
export const Square = glyph("Square");
export const Sun = glyph("Sun");
export const TriangleAlert = glyph("TriangleAlert");
export const Undo2 = glyph("Undo2");
export const Upload = glyph("Upload");
export const X = glyph("X");

// Alternate names used by shared controls refer to the exact same custom glyph.
export {
  Check as CheckIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  ChevronUp as ChevronUpIcon,
  Circle as CircleIcon,
  X as XIcon,
};
