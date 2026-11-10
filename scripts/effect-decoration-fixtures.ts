import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  effectDesign,
  effectPackage,
} from "../tests/effect-decoration-fixtures";
import { MASK_LAYOUT_RUNTIME } from "../packages/core/src/mask-layout-runtime.mjs";
import {
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
import { quoteLuau } from "../packages/core/src/source-code";
import { PNG } from "../tests/image-tools-fixtures";
await mkdir(".artifacts/effects", { recursive: true });
const pkg = effectPackage();
const opacityFixtures: Record<string, string> = {};
for (const kind of ["Frame", "button", "scroll"]) {
  const design = effectDesign();
  if (kind === "button")
    design.children[1].name = "Partial image purchase [button]";
  opacityFixtures[kind] = JSON.stringify(
    effectPackage(
      {
        layerOverrides:
          kind === "button"
            ? {}
            : {
                "effect:container": {
                  className: kind === "Frame" ? "Frame" : "ScrollingFrame",
                },
              },
      },
      design,
    ),
  );
}
await writeFile(
  ".artifacts/effects/native.luau",
  `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Editor=(function()\n${await readFile("plugins/studio/src/Editor.luau", "utf8")}\nend)()\nlocal MaskLayout=(function()\n${MASK_LAYOUT_RUNTIME}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\nlocal fixture=${quoteLuau(JSON.stringify(pkg))}\nlocal opacityFixtures=game:GetService("HttpService"):JSONDecode(${quoteLuau(JSON.stringify(opacityFixtures))})\n${await readFile("tests/studio-effect-decoration.test.luau", "utf8")}`,
);
const data = Uint8Array.from([
  40, 100, 220, 100, 40, 100, 220, 100, 0, 0, 0, 0, 40, 100, 220, 100,
]);
const shadow = Array.from(PNG.sync.write({ width: 2, height: 2, data }));
const backdrop = Array.from(
  PNG.sync.write({
    width: 1,
    height: 1,
    data: Uint8Array.from([50, 75, 110, 255]),
  }),
);
const design = effectDesign();
await writeFile(
  ".artifacts/effects/preview.json",
  JSON.stringify({
    data: {
      package: pkg,
      designs: [design],
      revision: 1,
      previews: {},
      assets: Object.fromEntries(
        pkg.assets.map((a) => [
          a.id,
          a.renderMode === "shadow" ? shadow : backdrop,
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
console.log(
  "Prepared bounded synthetic effect/blend native and preview fixtures; no uploads or Studio changes.",
);
