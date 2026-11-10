# Framebridge glyphs

80 original glyphs: 24 Roblox UI classes, two export-status icons (`In-image` and `Skipped`), an `Unknown` fallback, and 53 interface glyphs for navigation, editing, connection, themes and notifications. All individual files have a transparent background and a 24 × 24 viewBox.

The shared style uses 1.8 px strokes, rounded line ends and corners, open geometric shapes and subtle 8% class fills. Disclosure, play and stop glyphs use outlines, so the family stays clear and balanced at small interface sizes.

- `dark/` — brighter colored glyphs for dark surfaces.
- `light/` — darker colored glyphs for light surfaces.
- `monochrome/` — black glyphs that can be recolored.
- `interface/dark/`, `interface/light/`, `interface/monochrome/` — the 53 interface glyphs, with neutral colors that match each theme.
- `sheets/` — class and interface vector sheets for each variant.
- `catalog.ts` — shared geometry and palettes used by the plugin and the SVG exporter.
- `interface.ts` — original interface geometry shared by the Figma controls and SVG exporter. Frame, image and grid actions reuse the existing class artwork.

Drag individual SVG files into Figma to get editable vectors, or import a sheet to bring in the whole set. Use the files as images in websites, or copy their SVG markup into code. They are vector images, rather than text characters or an icon font.

Run `npm run assets:glyphs` from the repository root after changing either catalog. Run `npm run assets:glyphs:check` to verify that the exported files match the catalogs. The plugin uses the same catalogs, so its glyphs and these files share their geometry.

Figma UI code imports named glyphs from `plugins/figma/src/components/Glyph.tsx`. Use that component for new controls, including shared dropdowns and notifications. It supports SVG props, size, color, accessibility labels and forwarded refs. The semantic BookOpen, Pin, PinOff and Backpack glyphs cover guidance, inspector pinning and inventory actions. Studio's disclosure controls use native UI shapes, avoiding uploaded icon textures.

The glyphs are covered by the project's [MIT license](../LICENSE). Every SVG also retains the copyright and license notice.
