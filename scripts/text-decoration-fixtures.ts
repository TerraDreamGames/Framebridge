import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compile } from "../packages/core/src/compiler";
import { flatten } from "../packages/core/src/types";
import { DEFAULT_THEMES } from "../packages/core/src/theme-tokens";
import { generateModel } from "../packages/core/src/model-export";
import {
  generateSource,
  quoteLuau,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import {
  BEHAVIOR_RUNTIME,
  THEMED_BEHAVIOR_RUNTIME,
  BEHAVIOR_CLIENT_SOURCE,
  THEMED_BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
import { TEXT_DECORATION_RUNTIME } from "../packages/core/src/text-decoration-runtime.mjs";
import { effectDesign } from "../tests/effect-decoration-fixtures";

const output = process.argv.includes("--stroke-color")
  ? ".artifacts/live-text-decoration/final/after-stroke-color"
  : process.argv.includes("--basis-cache")
    ? ".artifacts/live-text-decoration/final/after-basis-cache"
    : process.argv.includes("--after-review")
      ? ".artifacts/live-text-decoration/final/after-review"
      : process.argv.includes("--final")
        ? ".artifacts/live-text-decoration/final"
        : ".artifacts/live-text-decoration";
await mkdir(output, { recursive: true, mode: 0o700 });
const design = effectDesign();
design.children = design.children.slice(0, 1);
const pkg = compile(
  [design],
  "live-text-decoration-qa",
  { layout: "responsive" },
  "fixed",
);
for (const asset of pkg.assets) asset.robloxId = "123";
for (const node of flatten(pkg.roots))
  if (node.assetRef) node.properties.Image = "rbxassetid://123";
const theme = compile(
  [design],
  "live-text-decoration-theme-qa",
  {
    layout: "responsive",
    themes: DEFAULT_THEMES,
    layerOverrides: {
      "effect:text": { theme: { font: "body", shadow: "elevated" } },
    },
  },
  "fixed",
);
for (const asset of theme.assets) asset.robloxId = "123";
for (const node of flatten(theme.roots))
  if (node.assetRef) node.properties.Image = "rbxassetid://123";
const binding = structuredClone(pkg);
flatten(binding.roots).find((node) => node.id === "effect:text")!.behavior = {
  binding: {
    source: "attribute",
    key: "LiveName",
    template: "Player: {value}",
  },
};
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
const prefix = `assert(game.PlaceId==0,"Approved blank QA only")\nlocal Importer=(function()\n${importer}\nend)()\nlocal Runtime=(function()\n${BEHAVIOR_RUNTIME}\nend)()\nlocal ThemedRuntime=(function()\n${THEMED_BEHAVIOR_RUNTIME}\nend)()\nlocal Decoration=(function()\n${TEXT_DECORATION_RUNTIME}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)},themeSource=${quoteLuau(THEMED_BEHAVIOR_CLIENT_SOURCE)}}\nlocal fixture=${quoteLuau(JSON.stringify(pkg))}\nlocal themeFixture=${quoteLuau(JSON.stringify(theme))}\nlocal bindingFixture=${quoteLuau(JSON.stringify(binding))}\n`;
await writeFile(
  `${output}/design.framebridge.json`,
  JSON.stringify(pkg, null, 2),
);
await writeFile(
  `${output}/theme.framebridge.json`,
  JSON.stringify(theme, null, 2),
);
await writeFile(
  `${output}/binding.framebridge.json`,
  JSON.stringify(binding, null, 2),
);
await writeFile(`${output}/runtime.luau`, TEXT_DECORATION_RUNTIME);
await writeFile(`${output}/behavior-runtime.luau`, BEHAVIOR_RUNTIME);
await writeFile(`${output}/theme-runtime.luau`, THEMED_BEHAVIOR_RUNTIME);
await writeFile(`${output}/design.rbxmx`, generateModel(pkg));
for (const format of SOURCE_FORMATS)
  await writeFile(
    `${output}/Design.${format.id}.${format.extension}`,
    generateSource(pkg, format.id),
  );
await writeFile(`${output}/FramebridgeInteractions.luau`, BEHAVIOR_RUNTIME);
await writeFile(
  `${output}/native.luau`,
  prefix + (await readFile("tests/studio-text-decoration.test.luau", "utf8")),
);
await writeFile(
  `${output}/native-geometry-setup.luau`,
  prefix +
    (await readFile("tests/studio-text-decoration-geometry.test.luau", "utf8")),
);
await writeFile(
  `${output}/native-geometry-cleanup.luau`,
  `assert(game.PlaceId==0,"Approved blank QA only")\nlocal qa=_G.FramebridgeLiveTextGeometryQA;local listeners=0;if qa then qa.controller.destroy();listeners=qa.controller.connectionCount();qa.root:Destroy();_G.FramebridgeLiveTextGeometryQA=nil end;return {listeners=listeners,qaAbsent=_G.FramebridgeLiveTextGeometryQA==nil,starterGui=#game:GetService("StarterGui"):GetChildren(),serverStorage=#game:GetService("ServerStorage"):GetChildren(),http=game:GetService("HttpService").HttpEnabled}\n`,
);
await writeFile(
  `${output}/native-visual-setup.luau`,
  prefix +
    `assert(not _G.FramebridgeLiveTextDecorationQA,"Clean existing QA first")\nlocal pkg=Importer.decode(fixture)\nlocal original=pkg.roots[1].children[1].children[1]\nlocal overlap=game:GetService("HttpService"):JSONDecode(game:GetService("HttpService"):JSONEncode(original))\noverlap.id="effect:overlap";overlap.name="Decisive glyph overlap";overlap.children={};overlap.textDecoration.captured=nil;overlap.textDecoration.capturedAlpha=nil;overlap.textDecoration.baseline=nil;overlap.textDecoration.shadows={{color={1,0,1,1},offset={0,0},radius=0,spread=0}}\noverlap.properties.TextTransparency=0;overlap.properties.TextColor3={type="Color3",value={1,1,1}}\ntable.insert(pkg.roots[1].children[1].children,overlap)\nlocal stage=Importer.stage(pkg,{},false,runtimeSource)\nlocal root=stage.roots[1];root.Name="FramebridgeLiveTextDecorationQA";root.Parent=game:GetService("CoreGui")\nstage.byId["effect:root"].instance.Size=UDim2.fromOffset(640,420)\nlocal owner=stage.byId["effect:text"].instance\nowner.Size=UDim2.fromOffset(420,80);owner.TextSize=38;owner.Text="Live glyph sample"\nlocal overlapOwner=stage.byId["effect:overlap"].instance;overlapOwner.Position=UDim2.fromOffset(32,150);overlapOwner.Size=UDim2.fromOffset(420,80);overlapOwner.TextSize=38;overlapOwner.Text="Overlap foreground"\nlocal controller=Runtime.mount(root)\n_G.FramebridgeLiveTextDecorationQA={stage=stage,root=root,owner=owner,overlap=overlapOwner,controller=controller}\ntask.wait(.1)\nreturn {status=owner:GetAttribute("FramebridgeTextDecorationStatus"),text=owner.Text,helpers=#owner:GetChildren(),overlap={text=overlapOwner.Text,foreground={overlapOwner.TextColor3.R,overlapOwner.TextColor3.G,overlapOwner.TextColor3.B},alpha=overlapOwner.TextTransparency,status=overlapOwner:GetAttribute("FramebridgeTextDecorationStatus"),expected="Opaque white hides opaque magenta underlay"},scope="Native glyph contours; mock capture texture does not prove authored PNG fidelity"}\n`,
);
await writeFile(
  `${output}/native-visual-probe.luau`,
  `assert(game.PlaceId==0,"Approved blank QA only")
local qa=assert(_G.FramebridgeLiveTextDecorationQA,"Run setup first")
local Http=game:GetService("HttpService")
qa.owner.RichText=true;qa.owner.Text='<b>Visible</b> <font transparency="1" size="44">HIDDEN</font>';qa.owner.FontFace=Font.new("rbxasset://fonts/families/GothamSSm.json",Enum.FontWeight.Bold,Enum.FontStyle.Italic)
local metadata=Http:JSONDecode(qa.owner:GetAttribute("FramebridgeTextDecoration"));metadata.shadows={{color={0,1,0,1},offset={0,8},radius=12,spread=3}};qa.owner:SetAttribute("FramebridgeTextDecoration",Http:JSONEncode(metadata))
qa.overlap.RichText=true;qa.overlap.Text='<font transparency=".3">Partial rich</font>';qa.overlap.TextTransparency=.5
local partial=Http:JSONDecode(qa.overlap:GetAttribute("FramebridgeTextDecoration"));partial.shadows={{color={1,0,1,1},offset={0,12},radius=0,spread=0}};qa.overlap:SetAttribute("FramebridgeTextDecoration",Http:JSONEncode(partial))
task.wait(.1);task.wait(.1)
local helpers={};for _,folder in ipairs(qa.owner.Parent:GetChildren())do local ref=folder:IsA("Folder") and folder:GetAttribute("FramebridgeTextDecorationHost") and folder:FindFirstChild("Owner");if ref and ref.Value==qa.owner then for _,child in ipairs(folder:FindFirstChildOfClass("Frame"):GetChildren())do if child:IsA("TextLabel")then table.insert(helpers,{text=child.Text,font=child.FontFace.Family,alpha=child.TextTransparency,stroke=child:FindFirstChildOfClass("UIStroke").Thickness,input=child.Active or child.Selectable or child.Interactable})end end end end
return {status=qa.owner:GetAttribute("FramebridgeTextDecorationStatus"),text=qa.owner.Text,helpers=helpers,listeners=qa.controller.connectionCount(),expected="No green HIDDEN contour; one half-alpha magenta fill with retained .3 run transparency"}
`,
);
await writeFile(
  `${output}/native-visual-multiple-probe.luau`,
  `assert(game.PlaceId==0,"Approved blank QA only")
local qa=assert(_G.FramebridgeLiveTextDecorationQA,"Run setup first")
qa.overlap.RichText=false;qa.overlap.Text="First red shadow";qa.overlap.TextTransparency=0
local Http=game:GetService("HttpService");local metadata=Http:JSONDecode(qa.overlap:GetAttribute("FramebridgeTextDecoration"));metadata.shadows={{color={1,0,0,1},offset={0,16},radius=0,spread=0},{color={0,0,1,1},offset={0,16},radius=0,spread=0}};qa.overlap:SetAttribute("FramebridgeTextDecoration",Http:JSONEncode(metadata))
task.wait(.1);task.wait(.1)
local colors={};for _,folder in ipairs(qa.overlap.Parent:GetChildren())do local ref=folder:IsA("Folder") and folder:GetAttribute("FramebridgeTextDecorationHost") and folder:FindFirstChild("Owner");if ref and ref.Value==qa.overlap then for _,glyph in ipairs(folder:FindFirstChildOfClass("Frame"):GetChildren())do if glyph:IsA("TextLabel")then table.insert(colors,{glyph.TextColor3.R,glyph.TextColor3.G,glyph.TextColor3.B,glyph.TextTransparency})end end end end
return {colors=colors,expected="One red hard shadow on top of coincident blue; white native foreground unchanged",scope="Matches first-on-top CSS preview contract; no fresh Figma multi-effect pixel comparison"}
`,
);
await writeFile(
  `${output}/native-cleanup.luau`,
  `assert(game.PlaceId==0,"Approved blank QA only")\nlocal qa=_G.FramebridgeLiveTextDecorationQA\nlocal listeners=0\nif qa then qa.controller.destroy();listeners=qa.controller.connectionCount();for _,root in ipairs(qa.stage.roots)do root:Destroy()end;_G.FramebridgeLiveTextDecorationQA=nil end\nreturn {listeners=listeners,qaAbsent=_G.FramebridgeLiveTextDecorationQA==nil,http=game:GetService("HttpService").HttpEnabled}\n`,
);
console.log(
  "Generated owned text-decoration logical/runtime/native fixtures; no native app or service changes.",
);
