import { readFile, writeFile, mkdir } from "node:fs/promises";
import { styleSizingPackages } from "../tests/style-sizing-fixtures";
import { quoteLuau } from "../packages/core/src/source-code";
import {
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_VERSION,
  BEHAVIOR_RUNTIME,
} from "../packages/core/src/behavior-runtime.mjs";

const output = ".artifacts/style-sizing";
await mkdir(output, { recursive: true });
const cases = styleSizingPackages();
for (const [name, pkg] of Object.entries(cases))
  await writeFile(output + "/" + name + ".json", JSON.stringify(pkg));
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
const editor = await readFile("plugins/studio/src/Editor.luau", "utf8");
const tests = await readFile("tests/studio-style-sizing.test.luau", "utf8");
const source =
  "local Importer=(function()\n" +
  importer +
  "\nend)()\n" +
  "local Editor=(function()\n" +
  editor +
  "\nend)()\n" +
  "local Runtime=(function()\n" +
  BEHAVIOR_RUNTIME +
  "\nend)()\n" +
  "local BehaviorSource={version=" +
  quoteLuau(BEHAVIOR_VERSION) +
  ",source=" +
  quoteLuau(BEHAVIOR_CLIENT_SOURCE) +
  "}\n" +
  "local cases=game:GetService('HttpService'):JSONDecode(" +
  quoteLuau(JSON.stringify(cases)) +
  ")\n" +
  tests;
await writeFile(output + "/native.luau", source);
console.log(
  "Prepared " + Object.keys(cases).length + " scale-aware styling fixtures.",
);
