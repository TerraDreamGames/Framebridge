import { THEME_RUNTIME } from "../packages/core/src/theme-runtime.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  themeDesign,
  themeOptions,
  themePackage,
} from "../tests/theme-fixtures";
import { generateModel } from "../packages/core/src/model-export";
import {
  generateSource,
  quoteLuau,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import {
  BEHAVIOR_CLIENT_SOURCE,
  THEMED_BEHAVIOR_CLIENT_SOURCE,
  THEMED_BEHAVIOR_RUNTIME,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
const output = ".artifacts/theme-tokens";
await mkdir(output, { recursive: true });
const pkg = themePackage();
await writeFile(
  `${output}/design.framebridge.json`,
  JSON.stringify(pkg, null, 2),
);
await writeFile(`${output}/design.rbxmx`, generateModel(pkg));
await writeFile(`${output}/runtime.luau`, THEMED_BEHAVIOR_RUNTIME);
await writeFile(`${output}/client.luau`, THEMED_BEHAVIOR_CLIENT_SOURCE);
await writeFile(`${output}/theme-mount.luau`, THEME_RUNTIME);
for (const format of SOURCE_FORMATS)
  await writeFile(
    `${output}/design.${format.id}.${format.extension}`,
    generateSource(pkg, format.id),
  );
await writeFile(
  `${output}/native.luau`,
  `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\n` +
    `local Runtime=(function()\n${THEMED_BEHAVIOR_RUNTIME}\nend)()\n` +
    `local runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)},themeSource=${quoteLuau(THEMED_BEHAVIOR_CLIENT_SOURCE)}}\n` +
    `local fixture=${quoteLuau(JSON.stringify(pkg))}\n` +
    (await readFile("tests/studio-themes.test.luau", "utf8")),
);
await writeFile(
  `${output}/play-setup.luau`,
  `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\n` +
    `local fixture=${quoteLuau(JSON.stringify(pkg))}\n` +
    `local runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)},themeSource=${quoteLuau(THEMED_BEHAVIOR_CLIENT_SOURCE)}}\n` +
    (await readFile("tests/studio-themes-play.setup.luau", "utf8")),
);
await writeFile(
  `${output}/play-checks.luau`,
  await readFile("tests/studio-themes-play.checks.luau", "utf8"),
);
await writeFile(
  `${output}/preview.json`,
  JSON.stringify({
    data: {
      package: pkg,
      designs: themeDesign(),
      assets: {},
      previews: {},
      revision: 1,
    },
    overrides: themeOptions().layerOverrides,
    themes: themeOptions().themes,
    selected: themeDesign().map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      width: n.width,
      height: n.height,
      layers: pkg.stats.layers,
    })),
  }),
);
await writeFile(
  `${output}/syntax.luau`,
  `local fs=require("@lune/fs")\nfor _,path in ipairs({"${output}/runtime.luau","${output}/native.luau","${output}/design.luau.luau","${output}/design.react.luau","${output}/design.fusion.luau"}) do local compiled,why=loadstring(fs.readFile(path));assert(compiled,path..": "..tostring(why)) end\nprint("Five theme/runtime/native Luau modules compile")\n`,
);
console.log("Prepared isolated theme/native/source/model/browser QA fixtures");
