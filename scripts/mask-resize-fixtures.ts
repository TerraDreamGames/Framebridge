import { mkdir, readFile, writeFile } from "node:fs/promises";
import { flatten } from "../packages/core/src/types";
import { quoteLuau } from "../packages/core/src/source-code";
import { MASK_LAYOUT_RUNTIME } from "../packages/core/src/mask-layout-runtime.mjs";
import { BEHAVIOR_VERSION } from "../packages/core/src/behavior-runtime.mjs";
import { compile } from "../packages/core/src/compiler";
import {
  maskResizeDesign,
  maskResizePackage,
  maskResizePairs,
} from "../tests/mask-resize-fixtures";
const base = maskResizePackage(),
  original = maskResizePackage("MAX", "SCALE", false);
const updatedDesign = maskResizeDesign();
Object.assign(updatedDesign.children[0].children[1], {
  width: 110,
  height: 100,
  transform: [
    [1, 0, 50],
    [0, 1, 60],
  ],
});
const updated = compile(
  [updatedDesign],
  base.sourceId,
  { layout: "responsive" },
  "updated",
);
const cases = maskResizePairs().map(({ name, masked }) => {
  const nodes = flatten(masked.roots),
    mask = nodes.find((n) => n.id === "rounded:mask")!,
    content = nodes.find((n) => n.id === "rounded:content")!;
  return {
    name,
    mask: { Position: mask.properties.Position, Size: mask.properties.Size },
    content: {
      Position: content.properties.Position,
      Size: content.properties.Size,
    },
  };
});
await mkdir(".artifacts/mask-resize", { recursive: true });
await writeFile(
  ".artifacts/mask-resize/native.luau",
  `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Editor=(function()\n${await readFile("plugins/studio/src/Editor.luau", "utf8")}\nend)()\nlocal MaskLayout=(function()\n${MASK_LAYOUT_RUNTIME}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source="-- Detached coordinate QA; real production runtime tested separately."}\nlocal fixture=${quoteLuau(JSON.stringify(base))}\nlocal originalFixture=${quoteLuau(JSON.stringify(original))}\nlocal updatedFixture=${quoteLuau(JSON.stringify(updated))}\nlocal cases=game:GetService("HttpService"):JSONDecode(${quoteLuau(JSON.stringify(cases))})\n${await readFile("tests/studio-mask-resize.test.luau", "utf8")}`,
);
console.log(`Prepared ${cases.length} independent constraint pairs.`);
