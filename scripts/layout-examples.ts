import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compile } from "../packages/core/src/compiler";
import { buildExport } from "../packages/core/src/export";
import { layoutExamples } from "../packages/core/src/layout-examples";
import type { AnalysisResult } from "../packages/core/src/types";
await mkdir("examples/layouts", { recursive: true });
await mkdir(".artifacts/layout-examples", { recursive: true });
const packages = layoutExamples().map((example) => {
  const pkg = compile(
    example.designs,
    `framebridge-example:${example.key}`,
    example.options,
    "2026-10-01T00:00:00Z",
  );
  return { example, pkg };
});
for (const { example, pkg } of packages) {
  const exported = buildExport({
    package: pkg,
    assets: {},
    previews: {},
    revision: 0,
  } as AnalysisResult);
  await writeFile(
    `examples/layouts/${example.key}.framebridge.json`,
    exported.data,
  );
  await writeFile(
    `.artifacts/layout-examples/${example.key}.source.json`,
    JSON.stringify(
      { designs: example.designs, options: example.options },
      null,
      2,
    ),
  );
}
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
const editor = await readFile("plugins/studio/src/Editor.luau", "utf8");
const tests = await readFile("tests/studio-layout-examples.test.luau", "utf8");
await writeFile(
  ".artifacts/layout-examples/studio-tests.luau",
  `local Importer = (function()\n${importer}\nend)()\nlocal Editor = (function()\n${editor}\nend)()\nlocal fixtures = game:GetService("HttpService"):JSONDecode([====[${JSON.stringify(packages.map((p) => ({ key: p.example.key, package: p.pkg })))}]====])\n${tests}`,
);
console.log(
  `Exported ${packages.length} native layout examples and Studio test harness.`,
);
