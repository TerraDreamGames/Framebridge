import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { advancedControlPackage } from "../packages/core/src/advanced-control-examples";
import { devicePreviewPackage } from "../tests/device-preview-fixture";
import { quoteLuau } from "../packages/core/src/source-code";
import { validatePackage } from "../packages/relay/src/protocol";
import {
  BEHAVIOR_VERSION,
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_BOOTSTRAP_SOURCE,
  behaviorModuleSource,
} from "../packages/core/src/behavior-runtime.mjs";

// This observer never supplies an InputObject or calls a runtime controller.
// Actual engine input and resulting properties remain the acceptance evidence.
const directory = ".artifacts/provider-device-acceptance";
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
const packages = {
  controls: advancedControlPackage(),
  inventory: devicePreviewPackage(),
};
for (const pkg of Object.values(packages))
  pkg.createdAt = "2026-10-04T00:00:00Z";
for (const pkg of Object.values(packages)) validatePackage(pkg);
const source = await readFile("plugins/studio/src/Importer.luau", "utf8");
const setup = `assert(game.PlaceId==0,"Run only in the approved blank QA place")
assert(not _G.FramebridgeDeviceAcceptanceQA,"QA already present")
local Importer=(function()\n${source}\nend)()
local Http=game:GetService("HttpService")
local packages=Http:JSONDecode(${quoteLuau(JSON.stringify(packages))})
local runtime={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}
local starter=game:GetService("StarterGui")
local qa={roots={},originalSelection=game:GetService("Selection"):Get()}
local ok,why=pcall(function()
    for _,name in ipairs({"controls","inventory"}) do
        local rootName="__FramebridgeDeviceAcceptance_"..name
        assert(not starter:FindFirstChild(rootName),"Owned QA name is already occupied")
        local pkg=Importer.decode(Http:JSONEncode(packages[name]))
        local staged=Importer.stage(pkg,{},false,runtime)
        local root=staged.roots[1]
        table.insert(qa.roots,root)
        root.Name=rootName
        root:SetAttribute("FramebridgeDeviceAcceptanceQA",true)
        root:SetAttribute("FramebridgeDeviceAcceptanceVersion","1")
        local bootstrap,module
        for _,item in ipairs(root:GetDescendants()) do
            if item:IsA("LocalScript") and item:GetAttribute("FramebridgeRuntime")==runtime.version then bootstrap=item end
            if item:IsA("ModuleScript") and item:GetAttribute("FramebridgeRuntime")==runtime.version then module=item end
        end
        assert(bootstrap and bootstrap.Source==${quoteLuau(BEHAVIOR_BOOTSTRAP_SOURCE)},"Generated bootstrap differs")
        assert(module and module.Source==${quoteLuau(behaviorModuleSource(BEHAVIOR_CLIENT_SOURCE))},"Generated runtime differs")
        root.Enabled=name=="controls"
        root.Parent=starter
    end
end)
if not ok then for _,root in ipairs(qa.roots) do root:Destroy() end;error(why) end
_G.FramebridgeDeviceAcceptanceQA=qa
return {prepared=true,roots=#qa.roots,sourceVersion=runtime.version,assets=0,claims={input=false,physicalDevice=false,publishedPlace=false}}
`;
const observer = await readFile(
  "scripts/provider-device-observer.luau",
  "utf8",
);
const check = `local qa=_G.FramebridgeDeviceInputQA
assert(qa,"Run the input observer in Client first")
return qa.snapshot()
`;
const cleanupClient = `local qa=_G.FramebridgeDeviceInputQA
if not qa then return {removed=0} end
local result=qa.snapshot()
qa.destroy()
_G.FramebridgeDeviceInputQA=nil
result.observerConnectionsAfter=qa.connectionCount()
return result
`;
const cleanupEdit = `assert(game.PlaceId==0,"Blank QA only")
local qa=_G.FramebridgeDeviceAcceptanceQA
local removed=0
if qa then
    for _,root in ipairs(qa.roots) do
        if root.Parent and root:GetAttribute("FramebridgeDeviceAcceptanceQA")==true then root:Destroy();removed+=1 end
    end
    _G.FramebridgeDeviceAcceptanceQA=nil
end
return {removed=removed,starterGuiChildren=#game:GetService("StarterGui"):GetChildren(),httpEnabled=game:GetService("HttpService").HttpEnabled,placeId=game.PlaceId}
`;
const switchView = (
  view: string,
) => `local pg=game:GetService("Players").LocalPlayer.PlayerGui
for _,name in ipairs({"controls","inventory"}) do
    local root=pg:FindFirstChild("__FramebridgeDeviceAcceptance_"..name)
    assert(root and root:GetAttribute("FramebridgeDeviceAcceptanceQA")==true,"Owned device fixture missing")
    root.Enabled=name==${quoteLuau(view)}
end
return {view=${quoteLuau(view)},inputAcceptance=false}
`;
const files: Record<string, string> = {
  "play-setup.luau": setup,
  "client-observer.luau": observer,
  "client-check.luau": check,
  "client-cleanup.luau": cleanupClient,
  "edit-cleanup.luau": cleanupEdit,
  "client-show-controls.luau": switchView("controls"),
  "client-show-inventory.luau": switchView("inventory"),
  "controls.framebridge.json": JSON.stringify(packages.controls),
  "inventory.framebridge.json": JSON.stringify(packages.inventory),
};
const manifest = [];
for (const [name, contents] of Object.entries(files)) {
  await writeFile(`${directory}/${name}`, contents, { mode: 0o600 });
  await chmod(`${directory}/${name}`, 0o600);
  manifest.push({
    name,
    bytes: Buffer.byteLength(contents),
    utf16: contents.length,
    sha256: createHash("sha256").update(contents).digest("hex"),
  });
}
await writeFile(
  `${directory}/manifest.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      files: manifest,
      claims: {
        preparedOnly: true,
        nativeRun: false,
        physicalDevice: false,
        publishedPlace: false,
      },
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(JSON.stringify({ prepared: true, directory, files: manifest }));
