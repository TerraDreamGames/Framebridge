import { mkdir, readFile, writeFile } from "node:fs/promises";
import { imageToolsResult } from "../tests/image-tools-fixtures";
import { quoteLuau } from "../packages/core/src/source-code";
import { flatten } from "../packages/core/src/types";

const directory = ".artifacts/image-tools";
await mkdir(directory, { recursive: true });
const fixtures = [
  undefined,
  { whiteMask: true },
  { edgeCleanup: true },
  { whiteMask: true, edgeCleanup: true },
].map((settings, i) => {
  const result = imageToolsResult(settings);
  const asset = result.package.assets[0];
  asset.robloxId = String(123456789 + i);
  flatten(result.package.roots).find(
    (node) => node.id === "icon",
  )!.properties.Image = `rbxassetid://${asset.robloxId}`;
  return result.package;
});
for (let i = 0; i < fixtures.length; i++)
  await writeFile(
    `${directory}/variant-${i}.framebridge.json`,
    JSON.stringify(fixtures[i]),
  );
const raw = imageToolsResult();
await writeFile(
  ".artifacts/materials-preview.json",
  JSON.stringify({
    data: raw,
    selected: [
      {
        id: "image-tools",
        name: "Image tools",
        type: "FRAME",
        width: 360,
        height: 240,
      },
    ],
  }),
);
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
const editor = await readFile("plugins/studio/src/Editor.luau", "utf8");
const tests = await readFile("tests/studio-image-tools.test.luau", "utf8");
await writeFile(
  `${directory}/native.luau`,
  `local fixtures = ${quoteLuau(JSON.stringify(fixtures))}\nlocal Importer = (function()\n${importer}\nend)()\nlocal Editor = (function()\n${editor}\nend)()\n${tests}`,
);
console.log(
  "Generated PNG preparation preview and detached native import/update checks.",
);
