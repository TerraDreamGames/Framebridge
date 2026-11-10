import { mkdir, readFile, writeFile } from "node:fs/promises";
import { behaviorPackage, behaviorDesign } from "../tests/behavior-fixtures";
import {
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_RUNTIME,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
import { quoteLuau } from "../packages/core/src/source-code";
await mkdir("examples/interactions", { recursive: true });
const output = ".artifacts/ui-behaviors";
await mkdir(output, { recursive: true });
const pkg = behaviorPackage();
const example = structuredClone(pkg);
example.sourceId = "framebridge-example:interactions";
example.createdAt = "2026-10-02T00:00:00Z";
await writeFile(
  "examples/interactions/panels-tabs-states.framebridge.json",
  JSON.stringify(example, null, 2),
);
await writeFile(
  `${output}/design.framebridge.json`,
  JSON.stringify(pkg, null, 2),
);
await writeFile(
  `${output}/native.luau`,
  `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\n` +
    `local Runtime=(function()\n${BEHAVIOR_RUNTIME}\nend)()\n` +
    `local runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\n` +
    `local fixture=${quoteLuau(JSON.stringify(pkg))}\n` +
    (await readFile("tests/studio-behaviors.test.luau", "utf8")),
);
await writeFile(
  `${output}/play-setup.luau`,
  `assert(game.PlaceId==0,"Blank QA only")\n` +
    `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\n` +
    `local pkg=Importer.decode(${quoteLuau(JSON.stringify(pkg))})\n` +
    `local existing=game:GetService("StarterGui"):FindFirstChild("FramebridgeInteractionQA")\nassert(not existing,"QA fixture already installed")\n` +
    `local stage=Importer.stage(pkg,{},false,{version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}})\n` +
    `local roots=Importer.apply(stage,pkg,game:GetService("StarterGui"),false)\nroots[1].Name="FramebridgeInteractionQA"\nroots[1]:SetAttribute("FramebridgeQA",true)\nreturn {created=roots[1].Name,source=pkg.sourceId}\n`,
);
await writeFile(
  `${output}/preview.json`,
  JSON.stringify({
    data: {
      designs: behaviorDesign(),
      package: pkg,
      assets: {},
      previews: {},
      revision: 1,
    },
    selected: behaviorDesign().map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      width: n.width,
      height: n.height,
      layers: pkg.stats.layers,
    })),
  }),
);
console.log(
  "Interaction compiler fixture, detached native checks and blank-place Play setup prepared.",
);
