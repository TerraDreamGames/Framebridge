import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { bundleStudio } from "./studio-bundle.mjs";
const directory = ".artifacts/class-tools";
await mkdir(directory, { recursive: true });
const module = await readFile("plugins/studio/src/ClassTools.luau", "utf8");
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
const fixture = compile(
  [
    node("Class design", {
      id: "class-design",
      children: [
        node("Class target", { id: "class-target", width: 160, height: 48 }),
      ],
    }),
  ],
  "class-tools-qa",
  {},
  "fixed",
);
const tools = `local Tools=(function()\n${module}\nend)()\n`;
await writeFile(
  `${directory}/native.luau`,
  tools +
    `local Http=game:GetService("HttpService")\nlocal Importer=(function()\n${importer}\nend)()\nlocal fixture=${JSON.stringify(JSON.stringify(fixture))}\n` +
    (await readFile("tests/studio-class-tools.test.luau", "utf8")),
);
const undo =
  tools + (await readFile("tests/studio-class-tools-undo.test.luau", "utf8"));
await writeFile(`${directory}/undo.luau`, undo);
await writeFile(
  `${directory}/undo-job.luau`,
  `assert(game.PlaceId==0,"Blank QA only")
local storage=game:GetService("ServerStorage")
assert(not storage:FindFirstChild("FramebridgeClassToolsQAResult"),"Inspect the existing QA job before scheduling another")
local job=Instance.new("Folder");job.Name="FramebridgeClassToolsQAResult";job:SetAttribute("FramebridgeClassQA",true);job:SetAttribute("Status","Running");job.Parent=storage
task.delay(0.5,function()
    assert(game.PlaceId==0,"Blank QA only")
    local ok,report=pcall(function()
${undo}
    end)
    if not ok then report={passed=0,failed=1,failures={tostring(report)}} end
    job:SetAttribute("Report",game:GetService("HttpService"):JSONEncode(report))
    job:SetAttribute("Status",ok and report.failed==0 and "Completed" or "Failed")
end)
return "Scheduled class conversion Undo/Redo QA after the command recording ends"
`,
);
await writeFile(
  `${directory}/syntax.luau`,
  `local fs=require("@lune/fs")\nfor _,path in ipairs({"${directory}/native.luau","${directory}/undo-job.luau"}) do local chunk,why=loadstring(fs.readFile(path));assert(chunk,why) end\nprint("Native class tools test scripts compile.")\n`,
);
const controller = (
  await readFile("plugins/studio/src/Plugin.server.luau", "utf8")
)
  .replace('"__FRAMEBRIDGE_RELAY_URL__"', '""')
  .replace('"__FRAMEBRIDGE_PRIVATE_BETA__"', '"false"');
await writeFile(
  `${directory}/ui.luau`,
  await bundleStudio(
    (await readFile("tests/studio-class-tools-ui.setup.luau", "utf8")) +
      "\n" +
      controller +
      "\n" +
      (await readFile("tests/studio-class-tools-ui.checks.luau", "utf8")),
  ),
);
console.log("Generated class conversion and real Undo/Redo fixtures.");
