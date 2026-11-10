import { mkdir, readFile, writeFile } from "node:fs/promises";
import { quoteLuau } from "../packages/core/src/source-code";
import { MASK_LAYOUT_RUNTIME } from "../packages/core/src/mask-layout-runtime.mjs";
import { BEHAVIOR_VERSION } from "../packages/core/src/behavior-runtime.mjs";
import {
  decorationDesign,
  decorationPackage,
} from "../tests/decoration-fixtures";
import { PNG, iconPng } from "../tests/image-tools-fixtures";
await mkdir(".artifacts/decoration", { recursive: true });
await writeFile(
  ".artifacts/decoration/native.luau",
  `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Editor=(function()\n${await readFile("plugins/studio/src/Editor.luau", "utf8")}\nend)()\nlocal MaskLayout=(function()\n${MASK_LAYOUT_RUNTIME}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source="-- Native geometry regression; production runtime tested separately"}\nlocal fixture=${quoteLuau(JSON.stringify(decorationPackage()))}\n${await readFile("tests/studio-decoration.test.luau", "utf8")}`,
);
console.log("Prepared native decoration regression.");
for (const browserMode of ["browser", "browser-exact"]) {
  if (!process.argv.includes(`--${browserMode}`)) continue;
  const original = await readFile(".artifacts/decoration/native.luau", "utf8");
  const downloaded = await readFile(
    `.artifacts/decoration/${browserMode}-export.json`,
    "utf8",
  );
  const fixtureMarker = `local fixture=${quoteLuau(JSON.stringify(decorationPackage()))}`;
  if (!original.includes(fixtureMarker))
    throw new Error(
      "Could not replace the native fixture with the actual UI download.",
    );
  await writeFile(
    `.artifacts/decoration/${browserMode}-native.luau`,
    original.replace(fixtureMarker, `local fixture=${quoteLuau(downloaded)}`),
  );
}
const size = 64,
  pixels = new Uint8Array(size * size * 4);
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const stripe = Math.floor((x + y) / 12) % 2;
    pixels.set(
      [
        28 + stripe * 12,
        42 + stripe * 12,
        68 + Math.round((y / size) * 22),
        255,
      ],
      (y * size + x) * 4,
    );
  }
const background = Array.from(
  PNG.sync.write({ width: size, height: size, data: pixels }),
);
const pkg = decorationPackage(),
  design = decorationDesign();
await writeFile(
  ".artifacts/decoration/preview.json",
  JSON.stringify({
    data: {
      package: pkg,
      designs: [design],
      revision: 1,
      previews: {},
      assets: Object.fromEntries(
        pkg.assets.map((asset) => [
          asset.id,
          asset.renderMode ? background : Array.from(iconPng()),
        ]),
      ),
    },
    selected: [
      {
        id: design.id,
        name: design.name,
        type: design.type,
        width: design.width,
        height: design.height,
      },
    ],
  }),
);
