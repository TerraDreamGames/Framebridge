import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  particlePackage,
  particleOptions,
  particleDesign,
} from "../tests/particle-fixtures";
import { generateModel } from "../packages/core/src/model-export";
import {
  generateSource,
  SOURCE_FORMATS,
  quoteLuau,
} from "../packages/core/src/source-code";
import { PARTICLES_RUNTIME } from "../packages/core/src/particles-runtime.mjs";
import {
  BEHAVIOR_VERSION,
  BEHAVIOR_CLIENT_SOURCE,
  THEMED_BEHAVIOR_CLIENT_SOURCE,
  PARTICLE_BEHAVIOR_CLIENT_SOURCE,
  THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE,
  THEMED_PARTICLE_BEHAVIOR_RUNTIME,
} from "../packages/core/src/behavior-runtime.mjs";
const out = ".artifacts/ui-particles";
await mkdir(out, { recursive: true });
const pkg = particlePackage();
await writeFile(`${out}/design.framebridge.json`, JSON.stringify(pkg, null, 2));
await writeFile(`${out}/design.rbxmx`, generateModel(pkg));
await writeFile(`${out}/runtime.luau`, THEMED_PARTICLE_BEHAVIOR_RUNTIME);
await writeFile(`${out}/client.luau`, THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE);
await writeFile(`${out}/particles.luau`, PARTICLES_RUNTIME);
for (const format of SOURCE_FORMATS)
  await writeFile(
    `${out}/design.${format.id}.${format.extension}`,
    generateSource(pkg, format.id),
  );
const prefix = `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Runtime=(function()\n${THEMED_PARTICLE_BEHAVIOR_RUNTIME}\nend)()\nlocal fixture=${quoteLuau(JSON.stringify(pkg))}\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)},themeSource=${quoteLuau(THEMED_BEHAVIOR_CLIENT_SOURCE)},particleSource=${quoteLuau(PARTICLE_BEHAVIOR_CLIENT_SOURCE)},themeParticleSource=${quoteLuau(THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE)}}\n`;
await writeFile(
  `${out}/native.luau`,
  prefix + (await readFile("tests/studio-particles.test.luau", "utf8")),
);
await writeFile(
  `${out}/play-setup.luau`,
  prefix + (await readFile("tests/studio-particles-play.setup.luau", "utf8")),
);
await writeFile(
  `${out}/play-checks.luau`,
  await readFile("tests/studio-particles-play.checks.luau", "utf8"),
);
await writeFile(
  `${out}/syntax.luau`,
  `local fs=require("@lune/fs")\nfor _,path in ipairs({"runtime.luau","native.luau","particles.luau","design.luau.luau","design.react.luau","design.fusion.luau","play-setup.luau","play-checks.luau"})do local code,why=loadstring(fs.readFile("${out}/"..path));assert(code,path..": "..tostring(why))end\nprint("Eight particle/runtime/native Luau modules compile")`,
);
await writeFile(
  `${out}/preview.json`,
  JSON.stringify({
    data: {
      package: pkg,
      designs: particleDesign(),
      assets: {},
      previews: {},
      revision: 1,
    },
    overrides: particleOptions().layerOverrides,
    themes: particleOptions().themes,
    selected: particleDesign().map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      width: n.width,
      height: n.height,
      layers: pkg.stats.layers,
    })),
  }),
);
console.log("Prepared isolated particle/native/model/source/browser fixtures");
