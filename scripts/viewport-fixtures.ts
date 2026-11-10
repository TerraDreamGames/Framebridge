import { mkdir, readFile, writeFile } from "node:fs/promises";
import { viewportPackage } from "../tests/viewport-fixtures";
import { quoteLuau } from "../packages/core/src/source-code";

const directory = ".artifacts/viewport";
await mkdir(directory, { recursive: true });
const fixture = JSON.stringify(viewportPackage());
await writeFile(`${directory}/design.framebridge.json`, fixture);
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
const editor = await readFile("plugins/studio/src/Editor.luau", "utf8");
const tests = await readFile("tests/studio-viewport.test.luau", "utf8");
await writeFile(
  `${directory}/native.luau`,
  `local fixture = ${quoteLuau(fixture)}\nlocal Importer = (function()\n${importer}\nend)()\nlocal Editor = (function()\n${editor}\nend)()\n${tests}`,
);
console.log("Generated detached ViewportFrame import/update checks.");
