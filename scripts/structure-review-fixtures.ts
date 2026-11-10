import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  reviewDesign,
  reviewPackage,
  correctedReview,
} from "../tests/structure-review-fixtures";
import { iconPng } from "../tests/image-tools-fixtures";
import { quoteLuau } from "../packages/core/src/source-code";
import {
  BEHAVIOR_VERSION,
  BEHAVIOR_CLIENT_SOURCE,
} from "../packages/core/src/behavior-runtime.mjs";
const output = ".artifacts/structure-review";
await mkdir(output, { recursive: true });
const original = reviewPackage(),
  corrected = correctedReview();
const imported = process.argv.includes("--browser")
  ? JSON.parse(await readFile(output + "/browser-export.json", "utf8"))
  : corrected.package;
const logoId = imported.assets.find(
  (a: { nodeId: string }) => a.nodeId === "logo",
)?.robloxId;
const assets = Object.fromEntries(
  original.assets.map((a) => [a.id, Array.from(iconPng())]),
);
await writeFile(
  output + "/preview.json",
  JSON.stringify({
    data: {
      designs: [reviewDesign()],
      package: original,
      assets,
      previews: {},
      revision: 1,
    },
    selected: [
      {
        id: "review-root",
        name: "Review example",
        type: "FRAME",
        width: 600,
        height: 420,
        layers: original.stats.layers,
      },
    ],
  }),
);
await writeFile(
  output + "/corrected.json",
  JSON.stringify(corrected.package, null, 2),
);
const header =
  'assert(game.PlaceId==0,"Blank QA only")\nlocal Importer=(function()\n' +
  (await readFile("plugins/studio/src/Importer.luau", "utf8")) +
  "\nend)()\nlocal Editor=(function()\n" +
  (await readFile("plugins/studio/src/Editor.luau", "utf8")) +
  "\nend)()\nlocal runtimeSource={version=" +
  quoteLuau(BEHAVIOR_VERSION) +
  ",source=" +
  quoteLuau(BEHAVIOR_CLIENT_SOURCE) +
  '}\nlocal fixtures=game:GetService("HttpService"):JSONDecode(' +
  quoteLuau(
    JSON.stringify({
      original,
      corrected: imported,
      logoImage: logoId
        ? String(logoId).startsWith("rbxassetid://")
          ? logoId
          : "rbxassetid://" + logoId
        : "",
    }),
  ) +
  ")\n";
await writeFile(
  output +
    (process.argv.includes("--browser")
      ? "/browser-native.luau"
      : "/native.luau"),
  header + (await readFile("tests/studio-structure-review.test.luau", "utf8")),
);
await writeFile(
  output + "/play-setup.luau",
  header +
    `
assert(game.PlaceId==0,"Blank QA only")
local gui=game:GetService("StarterGui")
assert(not gui:FindFirstChild("FramebridgeStructureReviewQA"),"Owned fixture already exists")
local host=Instance.new("Folder")
host.Name="FramebridgeStructureReviewQA"
local ok,why=pcall(function()
    local prepared=Editor.prepare(fixtures.corrected,{mode="offset",layers={}})
    local stage=Importer.stage(prepared,{},false,runtimeSource)
    Importer.apply(stage,prepared,host,false)
    host.Parent=gui
end)
if not ok then host:Destroy();error(why) end
return {fixture=host.Name,descendants=#host:GetDescendants()}
`,
);
await writeFile(
  output + "/play-checks.luau",
  await readFile("tests/studio-structure-review-play.test.luau", "utf8"),
);
await writeFile(
  output + "/play-cleanup.luau",
  `
assert(game.PlaceId==0,"Blank QA only")
local host=game:GetService("StarterGui"):FindFirstChild("FramebridgeStructureReviewQA")
if host then host:Destroy() end
return {fixtureRemoved=game:GetService("StarterGui"):FindFirstChild("FramebridgeStructureReviewQA")==nil}
`,
);
