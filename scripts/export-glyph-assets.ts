import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  CLASS_GLYPH_NAMES,
  classGlyphSvg,
  type GlyphVariant,
} from "../assets/glyphs/catalog";
import {
  INTERFACE_GLYPH_NAMES,
  interfaceGlyphSvg,
} from "../assets/glyphs/interface";

const check = process.argv.includes("--check");
const license = (await readFile("LICENSE", "utf8")).trim();
const notice = `<!--\n${license}\n-->`;
const filename = (name: string) => name.replace(/ /g, "-");
const outputs = new Map<string, string>();
function exportSet<Name extends string>(
  names: readonly Name[],
  render: (name: Name, variant: GlyphVariant) => string,
  directory: string,
  sheetPrefix: string,
  columns: number,
) {
  for (const variant of ["dark", "light", "monochrome"] as GlyphVariant[]) {
    const sheet: string[] = [];
    for (const [index, name] of names.entries()) {
      const svg = render(name, variant);
      const end = svg.indexOf(">");
      const titled =
        svg.slice(0, end + 1) + `<title>${name}</title>` + svg.slice(end + 1);
      outputs.set(
        `${directory}/${variant}/${filename(name)}.svg`,
        `<?xml version="1.0" encoding="UTF-8"?>\n${notice}\n${titled}\n`,
      );
      const attributes = svg
        .slice(4, end)
        .replace(/\s(?:xmlns|width|height|viewBox)="[^"]*"/g, "");
      const body = svg.slice(end + 1, svg.lastIndexOf("</svg>"));
      sheet.push(
        `<g id="${filename(name)}" transform="translate(${16 + (index % columns) * 40},${16 + Math.floor(index / columns) * 40})"${attributes}><title>${name}</title>${body}</g>`,
      );
    }
    outputs.set(
      `assets/glyphs/sheets/${sheetPrefix}${variant}.svg`,
      `<?xml version="1.0" encoding="UTF-8"?>\n${notice}\n<svg xmlns="http://www.w3.org/2000/svg" width="${48 + (columns - 1) * 40}" height="${48 + Math.floor((names.length - 1) / columns) * 40}" viewBox="0 0 ${48 + (columns - 1) * 40} ${48 + Math.floor((names.length - 1) / columns) * 40}"><title>Framebridge ${sheetPrefix}${variant} glyphs</title>${sheet.join("")}</svg>\n`,
    );
  }
}
exportSet(
  [...CLASS_GLYPH_NAMES, "In image", "Skipped", "Unknown"],
  classGlyphSvg,
  "assets/glyphs",
  "",
  6,
);
exportSet(
  INTERFACE_GLYPH_NAMES,
  interfaceGlyphSvg,
  "assets/glyphs/interface",
  "interface-",
  7,
);
for (const [destination, output] of outputs) {
  if (check) {
    let actual: string;
    try {
      actual = await readFile(destination, "utf8");
    } catch {
      throw new Error(
        `Missing glyph resource: ${destination}. Run npm run assets:glyphs.`,
      );
    }
    if (actual !== output)
      throw new Error(
        `Outdated glyph resource: ${destination}. Run npm run assets:glyphs.`,
      );
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, output);
  }
}
console.log(
  `${check ? "Verified" : "Exported"} ${outputs.size} SVG resources in assets/glyphs.`,
);
