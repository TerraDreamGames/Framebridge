import { mkdir, readFile, writeFile } from "node:fs/promises";
import { imageScalingResult } from "../tests/image-scaling-fixtures";
import { quoteLuau } from "../packages/core/src/source-code";
const output = ".artifacts/image-scaling";
await mkdir(output, { recursive: true });
const data = imageScalingResult();
await writeFile(
  `${output}/design.framebridge.json`,
  JSON.stringify(data.package),
);
for (const asset of data.package.assets)
  await writeFile(
    `${output}/${asset.filename}`,
    new Uint8Array(data.assets[asset.id]),
  );
await writeFile(
  ".artifacts/image-scaling-preview.json",
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
  `${output}/native.luau`,
  `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\n` +
    `local Editor=(function()\n${await readFile("plugins/studio/src/Editor.luau", "utf8")}\nend)()\n` +
    `local fixtures=${quoteLuau(JSON.stringify(data.package))}\n` +
    (await readFile("tests/studio-image-scaling.test.luau", "utf8")),
);
console.log(
  "Image scaling PNGs, browser fixture and detached native checks prepared.",
);
