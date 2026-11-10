import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { quoteLuau } from "../packages/core/src/source-code";
import { validatePackage } from "../packages/relay/src/protocol";
import type { TransferPackage } from "../packages/core/src/types";

// Generate only after the real runner has linked provider IDs. No stand-in IDs.
const owner = process.argv[2];
if (!/^(user|group):[1-9]\d{0,19}$/.test(owner ?? ""))
  throw new Error("Supply the provider-tested user:<id> or group:<id>.");
const key = owner.replace(":", "-");
const directory = ".artifacts/real-provider-acceptance";
await mkdir(directory, { recursive: true, mode: 0o700 });
const packageText = await readFile(
  `${directory}/${key}-linked.framebridge.json`,
  "utf8",
);
const pkg: TransferPackage = JSON.parse(packageText);
validatePackage(pkg);
if (
  pkg.assets.length !== 1000 ||
  pkg.assets.some((a) => !/^[1-9]\d{0,19}$/.test(a.robloxId ?? ""))
)
  throw new Error("Every real-provider reference must be linked first.");
const result = JSON.parse(
  await readFile(`${directory}/${key}-result.json`, "utf8"),
);
if (
  result.succeeded !== true ||
  result.claims.providerMock !== false ||
  result.packageSha256 !==
    createHash("sha256").update(JSON.stringify(pkg)).digest("hex")
)
  throw new Error(
    "The real-provider result must match this exact linked package.",
  );
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
const name = "__FramebridgeRealProvider_" + key;
const setup = `assert(game.PlaceId==0,"Approved blank QA place only")
local parent=game:GetService("StarterGui")
assert(not parent:FindFirstChild(${quoteLuau(name)}),"Owned provider fixture already exists")
local Importer=(function()\n${importer}\nend)()
local pkg=Importer.decode(${quoteLuau(packageText)})
local staged=Importer.stage(pkg,{},false,nil)
local root=staged.roots[1]
root.Name=${quoteLuau(name)}
root:SetAttribute("FramebridgeRealProviderQA",${quoteLuau(owner)})
root.Parent=parent
return {prepared=true,refs=#pkg.assets,providerIds=${quoteLuau(JSON.stringify([...new Set(pkg.assets.map((a) => a.robloxId))]))},placeId=game.PlaceId,pixelsLoaded=false}
`;
const check = `local player=game:GetService("Players").LocalPlayer
assert(player,"Client Play only")
local root=player.PlayerGui:WaitForChild(${quoteLuau(name)},15)
assert(root and root:GetAttribute("FramebridgeRealProviderQA")==${quoteLuau(owner)},"Exact provider fixture missing")
local content=game:GetService("ContentProvider")
local images,ids={},{}
for _,instance in ipairs(root:GetDescendants()) do
    if instance:IsA("ImageLabel") then table.insert(images,instance);ids[instance.Image]=true end
end
assert(#images==1000,"Expected 1,000 real-provider image references")
local status={}
local ok,why=pcall(function()content:PreloadAsync(images,function(id,state)status[id]=state.Name end)end)
local loaded=0
for _,image in ipairs(images)do if image.IsLoaded then loaded+=1 end end
local distinct=0;for _ in pairs(ids)do distinct+=1 end
return {placeId=game.PlaceId,references=#images,distinctIds=distinct,loaded=loaded,preloadSucceeded=ok,error=not ok and tostring(why) or nil,statuses=status,claims={nativeLoad=ok and loaded==#images,visualPixelsInspected=false,physicalDevice=false,publishedPlace=false}}
`;
const cleanup = `assert(game.PlaceId==0,"Blank QA only")
local root=game:GetService("StarterGui"):FindFirstChild(${quoteLuau(name)})
local removed=0
if root then assert(root:GetAttribute("FramebridgeRealProviderQA")==${quoteLuau(owner)},"QA ownership differs");root:Destroy();removed=1 end
return {removed=removed,httpEnabled=game:GetService("HttpService").HttpEnabled,placeId=game.PlaceId}
`;
const entries = [];
for (const [part, text] of Object.entries({ setup, check, cleanup })) {
  const filename = `${key}-${part}.luau`;
  await writeFile(`${directory}/${filename}`, text, { mode: 0o600 });
  await chmod(`${directory}/${filename}`, 0o600);
  entries.push({
    filename,
    bytes: Buffer.byteLength(text),
    utf16: text.length,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
}
await writeFile(
  `${directory}/${key}-native-manifest.json`,
  JSON.stringify(
    {
      owner,
      generatedAt: new Date().toISOString(),
      sourcePackageSha256: createHash("sha256")
        .update(packageText)
        .digest("hex"),
      files: entries,
      claims: { preparedOnly: true, nativeRun: false },
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({ prepared: true, owner, files: entries, nativeRun: false }),
);
