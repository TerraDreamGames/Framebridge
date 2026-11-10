import { useContext, type CSSProperties } from "react";
import { PluginThemeContext } from "../usePluginTheme";
import {
  classGlyph,
  GLYPH_COLORS,
  GLYPH_SELECTION_COLORS,
  GLYPH_STYLE,
} from "../../../../assets/glyphs/catalog";

export function RobloxClassIcon({ className }: { className: string }) {
  const theme = useContext(PluginThemeContext);
  const glyph = classGlyph(className);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="roblox-class-icon"
      data-instance-class={className}
      width="16"
      height="16"
      viewBox={GLYPH_STYLE.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={GLYPH_STYLE.strokeWidth}
      strokeLinecap={GLYPH_STYLE.linecap}
      strokeLinejoin={GLYPH_STYLE.linejoin}
      style={
        {
          "--glyph-color": GLYPH_COLORS[theme][glyph.family],
          "--glyph-on-selection": GLYPH_SELECTION_COLORS[glyph.family],
        } as CSSProperties
      }
      aria-hidden="true"
      focusable="false"
      // This markup comes only from the static, locally authored glyph catalog.
      dangerouslySetInnerHTML={{ __html: glyph.body }}
    />
  );
}
