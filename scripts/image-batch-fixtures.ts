import { mkdir, readFile, writeFile } from "node:fs/promises";
import { imageBatchFixture } from "../tests/image-batch-fixtures";
import {
  fingerprintPng,
  readCatalog,
} from "../plugins/figma/src/asset-catalog";
import {
  bindImage,
  imageBindingIndex,
} from "../packages/core/src/image-bindings";
import { validatePackage } from "../packages/relay/src/protocol";

const directory = ".artifacts/image-batches";
await mkdir(directory, { recursive: true });
const data = imageBatchFixture(1000);
await writeFile(
  `${directory}/preview.json`,
  JSON.stringify({
    data,
    selected: [
      {
        id: "batch-root",
        name: "Image batch QA",
        type: "FRAME",
        width: 800,
        height: 600,
      },
    ],
  }),
);
const catalog = [];
for (const [index, asset] of data.package.assets.entries()) {
  catalog.push({
    owner: "user:123",
    name: asset.name,
    fingerprint: await fingerprintPng(data.assets[asset.id]),
    assetId: String(100_000_000_000_000 + index),
    width: 8,
    height: 8,
    moderation: "MODERATION_STATE_APPROVED",
    savedAt: index + 1,
    thumbnail:
      "data:image/png;base64," +
      Buffer.from(data.assets[asset.id]).toString("base64"),
  });
}
await writeFile(
  `${directory}/catalog.json`,
  JSON.stringify(readCatalog(catalog)),
);
const native = imageBatchFixture(1000, 3000).package;
const bindings = imageBindingIndex(native);
for (const [index, asset] of native.assets.entries()) {
  asset.robloxId = String(100_000_000_000_000 + (index % 1000));
  bindImage(native, asset.id, `rbxassetid://${asset.robloxId}`, bindings);
}
native.issues = native.issues.filter(
  (issue) => issue.code !== "asset-required",
);
validatePackage(native);
await writeFile(`${directory}/linked.framebridge.json`, JSON.stringify(native));
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
await writeFile(
  `${directory}/native.luau`,
  `local Importer=(function()\n${importer}\nend)()\nlocal fixture=${JSON.stringify(JSON.stringify(native))}\n` +
    (await readFile("tests/studio-image-batches.test.luau", "utf8")),
);
console.log(
  "Generated 1,000 real PNGs, 1,000 saved entries and a 3,000-reference native batch fixture. No Roblox uploads.",
);
