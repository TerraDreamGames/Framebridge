import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  bulkDesign,
  bulkLayers,
  bulkPackage,
} from "../tests/bulk-editing-fixtures";
import {
  applyOverrideChanges,
  classChanges,
  propertyChanges,
} from "../packages/core/src/bulk-editor";
import { quoteLuau } from "../packages/core/src/source-code";
import type { AnalysisResult } from "../packages/core/src/types";
import { iconPng } from "../tests/image-tools-fixtures";

const directory = ".artifacts/bulk-editing";
await mkdir(directory, { recursive: true });
const base = bulkPackage(),
  layers = bulkLayers(base);
const panels = layers.filter(
  (layer) => layer.node.id.startsWith("panel-") && layer.source,
);
const titles = layers.filter(
  (layer) => layer.node.id.startsWith("title-") && layer.source,
);
const icons = layers.filter(
  (layer) => layer.node.id.startsWith("icon-") && layer.source,
);
const position = applyOverrideChanges(
  {},
  propertyChanges(panels, {}, "Position", 0.5, 0),
);
const fonts = applyOverrideChanges(
  {},
  propertyChanges(titles, {}, "FontFace", "Bold", "weight"),
);
const scrolling = applyOverrideChanges(
  {},
  classChanges(panels, {}, "ScrollingFrame"),
);
const imageButtons = applyOverrideChanges(
  {},
  classChanges(icons, {}, "ImageButton"),
);
const fixtures = {
  base,
  position: bulkPackage(position),
  fonts: bulkPackage(fonts),
  scrolling: bulkPackage(scrolling),
  imageButtons: bulkPackage(imageButtons),
};
for (const [name, pkg] of Object.entries(fixtures))
  await writeFile(`${directory}/${name}.json`, JSON.stringify(pkg));
const raw: AnalysisResult = {
  package: base,
  designs: bulkDesign(),
  previews: {},
  assets: Object.fromEntries(
    base.assets.map((asset) => [asset.id, Array.from(iconPng())]),
  ),
  revision: 1,
};
await writeFile(
  ".artifacts/materials-preview.json",
  JSON.stringify({
    data: raw,
    selected: [
      {
        id: "bulk-demo",
        name: "Bulk editing",
        type: "FRAME",
        width: 800,
        height: 600,
      },
    ],
  }),
);
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
const editor = await readFile("plugins/studio/src/Editor.luau", "utf8");
const tests = await readFile("tests/studio-bulk-editing.test.luau", "utf8");
await writeFile(
  `${directory}/native.luau`,
  `local fixtures = ${quoteLuau(JSON.stringify(fixtures))}\nlocal Importer = (function()\n${importer}\nend)()\nlocal Editor = (function()\n${editor}\nend)()\n${tests}`,
);
console.log("Prepared bulk editing browser and detached native fixtures.");
