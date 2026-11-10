import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as Glyphs from "../plugins/figma/src/components/Glyph";
import { CLASS_GLYPHS } from "../assets/glyphs/catalog";
import {
  INTERFACE_GLYPH_NAMES,
  INTERFACE_GLYPHS,
  interfaceGlyphSvg,
} from "../assets/glyphs/interface";

describe("Framebridge glyph integration", () => {
  it("renders every catalog glyph through the UI's named component", () => {
    for (const name of INTERFACE_GLYPH_NAMES) {
      const Icon = Glyphs[name];
      const html = renderToStaticMarkup(<Icon size={16} />);
      expect(html).toContain(`data-glyph="${name}"`);
      expect(html).toContain(INTERFACE_GLYPHS[name]);
      expect(html).toContain('viewBox="0 0 24 24"');
    }
  });

  it("preserves shared control styling and accessibility", () => {
    const decorative = renderToStaticMarkup(
      <Glyphs.Check className="size-4 fill-current" data-state="checked" />,
    );
    expect(decorative).toContain(
      'class="framebridge-glyph size-4 fill-current"',
    );
    expect(decorative).toContain('data-state="checked"');
    expect(decorative).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(
      <Glyphs.Link
        role="img"
        aria-label="Connected"
        size={18}
        strokeWidth={2}
      />,
    );
    expect(labelled).toContain('aria-label="Connected"');
    expect(labelled).not.toContain('aria-hidden="true"');
    expect(labelled).toContain('width="18"');
    expect(labelled).toContain('stroke-width="2"');
  });

  it("uses the same glyphs for shared component aliases and class actions", () => {
    expect(Glyphs.CheckIcon).toBe(Glyphs.Check);
    expect(Glyphs.ChevronDownIcon).toBe(Glyphs.ChevronDown);
    expect(Glyphs.CircleIcon).toBe(Glyphs.Circle);
    expect(Glyphs.XIcon).toBe(Glyphs.X);
    expect(INTERFACE_GLYPHS.Frame).toBe(CLASS_GLYPHS.Frame.body);
    expect(INTERFACE_GLYPHS.Image).toBe(CLASS_GLYPHS.ImageLabel.body);
    expect(INTERFACE_GLYPHS.Grid2X2).toBe(CLASS_GLYPHS.UIGridLayout.body);
  });

  it("exports self-contained artwork with resolved colors in every theme", () => {
    for (const variant of ["dark", "light", "monochrome"] as const) {
      for (const name of INTERFACE_GLYPH_NAMES) {
        const svg = interfaceGlyphSvg(name, variant);
        expect(svg).not.toContain("currentColor");
        expect(svg).not.toMatch(/(?:href=|<script|<image|url\()/);
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain(
          variant === "dark"
            ? "#fcfcfc"
            : variant === "light"
              ? "#0d0d0d"
              : "#111111",
        );
      }
    }
  });
});
