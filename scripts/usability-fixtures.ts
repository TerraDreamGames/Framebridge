import { mkdir, readFile, writeFile } from "node:fs/promises";
import { usabilityResult } from "../tests/usability-fixtures";
import { checkUsability } from "../plugins/figma/src/usability";
await mkdir(".artifacts/usability", { recursive: true });
const data = usabilityResult(),
  good = usabilityResult(true),
  before = JSON.stringify(data.package),
  report = checkUsability(data);
if (JSON.stringify(data.package) !== before)
  throw new Error("Usability scan changed exported data.");
await writeFile(
  ".artifacts/usability-preview.json",
  JSON.stringify({
    data,
    selected: data.designs!.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      width: n.width,
      height: n.height,
      layers: data.package.stats.layers,
    })),
  }),
);
await writeFile(
  ".artifacts/usability/report.json",
  JSON.stringify(report, null, 2),
);
await writeFile(
  ".artifacts/usability/corrected-report.json",
  JSON.stringify(checkUsability(good), null, 2),
);
await writeFile(".artifacts/usability/before.framebridge.json", before);
await writeFile(
  ".artifacts/usability/after.framebridge.json",
  JSON.stringify(data.package),
);
await writeFile(
  ".artifacts/usability/native.luau",
  `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal fixtures=[====[${JSON.stringify([data.package, good.package])}]====]\n${await readFile("tests/studio-usability.test.luau", "utf8")}`,
);
console.log(
  "Usability preview, unchanged transfer packages and native checks prepared.",
);
