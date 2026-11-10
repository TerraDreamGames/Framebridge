import { mkdir, readFile, writeFile } from "node:fs/promises";
import { worldDesign, worldPackage } from "../tests/world-space-fixtures";
import { quoteLuau, generateSource } from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import {
  BEHAVIOR_RUNTIME,
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
await mkdir(".artifacts/world-space", { recursive: true });
const fixtures = Object.fromEntries(
  ["surface", "billboard", "prompt"].map((kind) => [
    kind,
    worldPackage(kind as "surface" | "billboard" | "prompt"),
  ]),
);
await writeFile(
  ".artifacts/world-space/preview.json",
  JSON.stringify({
    data: {
      designs: [worldDesign()],
      package: fixtures.prompt,
      assets: {},
      previews: {},
      revision: 1,
    },
    selected: [
      {
        id: "world",
        name: "World interface",
        type: "FRAME",
        width: 280,
        height: 140,
        layers: fixtures.prompt.stats.layers,
      },
    ],
    overrides: { world: { worldUI: fixtures.prompt.roots[0].worldUI } },
  }),
);
for (const [kind, pkg] of Object.entries(fixtures)) {
  await mkdir("examples/world-space", { recursive: true });
  await writeFile(
    "examples/world-space/" + kind + ".framebridge.json",
    JSON.stringify(
      {
        ...pkg,
        sourceId: "framebridge-example:world:" + kind,
        createdAt: "2026-10-03T00:00:00Z",
      },
      null,
      2,
    ),
  );
  await writeFile(
    ".artifacts/world-space/" + kind + ".json",
    JSON.stringify(pkg),
  );
  await writeFile(
    ".artifacts/world-space/" + kind + ".rbxmx",
    generateModel(pkg),
  );
  for (const format of ["react", "fusion", "luau", "tsx"] as const)
    await writeFile(
      ".artifacts/world-space/" +
        kind +
        "." +
        format +
        (format === "tsx" ? ".tsx" : ".luau"),
      generateSource(pkg, format),
    );
}
await writeFile(".artifacts/world-space/client.luau", BEHAVIOR_CLIENT_SOURCE);
const nativeScript =
  'assert(game.PlaceId==0,"Blank QA only")\nlocal Importer=(function()\n' +
  (await readFile("plugins/studio/src/Importer.luau", "utf8")) +
  "\nend)()\nlocal Editor=(function()\n" +
  (await readFile("plugins/studio/src/Editor.luau", "utf8")) +
  "\nend)()\nlocal WorldTools=(function()\n" +
  (await readFile("plugins/studio/src/WorldTools.luau", "utf8")) +
  "\nend)()\nlocal Runtime=(function()\n" +
  BEHAVIOR_RUNTIME +
  "\nend)()\nlocal runtimeSource={version=" +
  quoteLuau(BEHAVIOR_VERSION) +
  ",source=" +
  quoteLuau(BEHAVIOR_CLIENT_SOURCE) +
  '}\nlocal fixtures=game:GetService("HttpService"):JSONDecode(' +
  quoteLuau(JSON.stringify(fixtures)) +
  ")\n" +
  (await readFile("tests/studio-world-space.test.luau", "utf8"));
await writeFile(".artifacts/world-space/native.luau", nativeScript);
await writeFile(
  ".artifacts/world-space/native-job.luau",
  `assert(game.PlaceId==0,"Blank QA only")
local storage=game:GetService("ServerStorage")
assert(not storage:FindFirstChild("FramebridgeWorldUndoQAResult"),"A world QA job already exists; inspect its status first")
local job=Instance.new("Folder")
job.Name="FramebridgeWorldUndoQAResult"
job:SetAttribute("FramebridgeWorldQA",true)
job:SetAttribute("Status","Running")
job.Parent=storage
task.delay(0.5,function()
    local ok,checks=pcall(function()
${nativeScript}
    end)
    if not ok then checks={{name="Native harness",passed=false,error=tostring(checks)}} end
    local passed=0
    for _,check in ipairs(checks) do if check.passed then passed+=1 end end
    job:SetAttribute("Report",game:GetService("HttpService"):JSONEncode(checks))
    job:SetAttribute("Passed",passed)
    job:SetAttribute("Total",#checks)
    job:SetAttribute("Status",ok and passed==#checks and "Completed" or "Failed")
end)
return "Scheduled native world QA after the command recording ends"
`,
);
await writeFile(
  ".artifacts/world-space/play-setup.luau",
  'assert(game.PlaceId==0,"Blank QA only")\nlocal Importer=(function()\n' +
    (await readFile("plugins/studio/src/Importer.luau", "utf8")) +
    "\nend)()\nlocal Editor=(function()\n" +
    (await readFile("plugins/studio/src/Editor.luau", "utf8")) +
    "\nend)()\nlocal runtimeSource={version=" +
    quoteLuau(BEHAVIOR_VERSION) +
    ",source=" +
    quoteLuau(BEHAVIOR_CLIENT_SOURCE) +
    '}\nlocal fixtures=game:GetService("HttpService"):JSONDecode(' +
    quoteLuau(JSON.stringify(fixtures)) +
    ")\n" +
    (await readFile("tests/studio-world-space-play.setup.luau", "utf8")),
);
await writeFile(
  ".artifacts/world-space/play-checks.luau",
  await readFile("tests/studio-world-space-play.checks.luau", "utf8"),
);
