import { readFile, mkdir, writeFile } from "node:fs/promises";
import { bundleStudio } from "./studio-bundle.mjs";
const directory = ".artifacts/studio-commands";
await mkdir(directory, { recursive: true });
const modules = `local Tools=(function()\n${await readFile("plugins/studio/src/SelectionTools.luau", "utf8")}\nend)()\nlocal Commands=(function()\n${await readFile("plugins/studio/src/CommandTools.luau", "utf8")}\nend)()\n`;
await writeFile(
  `${directory}/native.luau`,
  modules + (await readFile("tests/studio-commands.test.luau", "utf8")),
);
await writeFile(
  `${directory}/undo-job.luau`,
  modules +
    `
assert(game.PlaceId==0,"Blank QA only")
local storage=game:GetService("ServerStorage")
assert(not storage:FindFirstChild("__FramebridgeCommandsUndoQA"),"Inspect existing QA first")
local job=Instance.new("Folder");job.Name="__FramebridgeCommandsUndoQA";job.Parent=storage;job:SetAttribute("Status","Running")
task.delay(.5,function()
    local root=Instance.new("ScreenGui");root.Name="__FramebridgeCommandsUndoQA";root.Parent=game:GetService("StarterGui")
    local Selection=game:GetService("Selection");local before=Selection:Get();local history=game:GetService("ChangeHistoryService")
    local ok,why=pcall(function()
        Selection:Set({root})
        local deps={selection=Selection,history=history,starterGui=game:GetService("StarterGui"),tools=Tools,running=function() return false end,busy=function() return false end}
        local result=Commands.run("create:TextLabel",deps);local label=result.instance
        assert(label.Parent==root and label.Size.X.Offset==0)
        assert(history:GetCanUndo());history:Undo();task.wait();assert(label.Parent==nil)
        history:Redo();task.wait();assert(label.Parent==root and label.Size.X.Scale==.25)
        Selection:Set({label});Commands.run("tool:text",deps)
        assert(label.TextScaled and label:FindFirstChildWhichIsA("UITextSizeConstraint"))
        history:Undo();task.wait();assert(not label.TextScaled and not label:FindFirstChildWhichIsA("UITextSizeConstraint"))
        history:Redo();task.wait();assert(label.TextScaled and label:FindFirstChildWhichIsA("UITextSizeConstraint"))
    end)
    local restore={};for _,item in ipairs(before) do if item.Parent then table.insert(restore,item) end end;Selection:Set(restore)
    root:Destroy();job:SetAttribute("Status",ok and "Completed" or "Failed");job:SetAttribute("Report",ok and "Native creation and text utility Undo/Redo passed" or tostring(why))
end)
return "Scheduled native command creation and utility Undo/Redo"
`,
);
await writeFile(
  `${directory}/ui.luau`,
  await bundleStudio(
    await readFile("tests/studio-commands-ui.setup.luau", "utf8"),
  ),
);
await writeFile(
  `${directory}/resize.luau`,
  await bundleStudio(
    `local regression = (function()\n${await readFile("tests/studio-commands-resize.test.luau", "utf8")}\nend)()\nreturn game:GetService("HttpService"):JSONEncode(regression(require(script.CommandPalette), require(script.SelectionTools)))`,
  ),
);
await writeFile(
  `${directory}/syntax.luau`,
  `local fs=require("@lune/fs")\nfor _,path in ipairs({"${directory}/native.luau","${directory}/undo-job.luau","${directory}/ui.luau","${directory}/resize.luau"}) do local chunk,why=loadstring(fs.readFile(path));assert(chunk,path..": "..tostring(why)) end\nassert(loadstring(fs.readFile("scripts/test-studio-package.luau")))()\nprint("Command modules, native fixtures and modular React plugin compile.")\n`,
);
console.log("Generated command palette native/Undo/UI fixtures.");
