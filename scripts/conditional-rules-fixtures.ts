import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  conditionalExampleDesign,
  conditionalExampleOverrides,
  conditionalExamplePackage,
} from "../packages/core/src/conditional-examples";
import { generateModel } from "../packages/core/src/model-export";
import {
  generateSource,
  SOURCE_FORMATS,
  quoteLuau,
} from "../packages/core/src/source-code";
import {
  BEHAVIOR_RUNTIME,
  BEHAVIOR_VERSION,
  BEHAVIOR_CLIENT_SOURCE,
} from "../packages/core/src/behavior-runtime.mjs";
import { CONDITIONAL_VALIDATOR } from "../packages/core/src/conditional-runtime.mjs";
const output = ".artifacts/conditional-rules";
await mkdir(output + "/sources", { recursive: true });
await mkdir("examples/conditional-rules", { recursive: true });
const pkg = conditionalExamplePackage();
if (pkg.issues.some((i) => i.severity === "error"))
  throw new Error(JSON.stringify(pkg.issues));
const changed = conditionalExamplePackage({
  layerOverrides: {
    "rules-screen": { behavior: false },
    status: { properties: { RichText: true, BackgroundTransparency: 0.25 } },
  },
});
await writeFile(
  output + "/design.framebridge.json",
  JSON.stringify(pkg, null, 2),
);
await writeFile(
  "examples/conditional-rules/store.framebridge.json",
  JSON.stringify(pkg, null, 2) + "\n",
);
await writeFile(output + "/store.rbxmx", generateModel(pkg));
await writeFile(
  output + "/preview.json",
  JSON.stringify({
    data: {
      designs: conditionalExampleDesign(),
      package: pkg,
      assets: {},
      previews: {},
      revision: 1,
    },
    selected: conditionalExampleDesign().map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      width: n.width,
      height: n.height,
      layers: pkg.stats.layers,
    })),
    overrides: conditionalExampleOverrides(),
  }),
);
for (const f of SOURCE_FORMATS)
  await writeFile(
    `${output}/sources/store.${f.id}.${f.extension}`,
    generateSource(pkg, f.id),
  );
await writeFile(output + "/runtime.luau", BEHAVIOR_RUNTIME);
await writeFile(
  output + "/native.luau",
  `assert(game.PlaceId==0,"Blank Place1 QA only")\nlocal Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Runtime=(function()\n${BEHAVIOR_RUNTIME}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\nlocal fixture=${quoteLuau(JSON.stringify(pkg))}\nlocal changedFixture=${quoteLuau(JSON.stringify(changed))}\n${await readFile("tests/studio-conditional-rules.test.luau", "utf8")}`,
);
await writeFile(
  output + "/play.setup.luau",
  `assert(game.PlaceId==0,"Blank Place1 only")\nlocal starter=game:GetService("StarterGui")\nassert(not starter:FindFirstChild("__FramebridgeConditionalQA"),"Conditional QA already present")\nlocal Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal pkg=Importer.decode(${quoteLuau(JSON.stringify(pkg))})\nlocal stage=Importer.stage(pkg,{},false,{version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}})\nstage.roots[1].Name="__FramebridgeConditionalQA"\nstage.roots[1].Parent=starter\nreturn {root=stage.roots[1].Name,scope="Temporary blank Place1 client runtime fixture"}`,
);
const cleanupProbe = await readFile("tests/studio-conditional-script-cleanup.probe.luau", "utf8");
for (const phase of ["edit-setup", "client-probe", "edit-cleanup"])
  await writeFile(`${output}/cleanup.${phase}.luau`, `local qaPhase=${quoteLuau(phase)}\n${cleanupProbe}`);
const evaluationCases = [
  { data: {}, branches: [0, 0, 0, 0] },
  {
    data: {
      leaderstats: { Coins: 150 },
      attribute: { Ready: true, VIP: true },
      viewport: { width: 390, height: 844 },
    },
    branches: [1, 1, 1, 1],
  },
  {
    data: {
      leaderstats: { Coins: 150 },
      attribute: { Ready: false, VIP: false },
      viewport: { width: 720, height: 400 },
    },
    branches: [2, 0, 0, 0],
  },
  {
    data: { leaderstats: { Coins: 200 }, attribute: { Ready: "true" } },
    branches: [2, 0, 0, 1],
  },
];
await writeFile(
  output + "/pure.luau",
  `local fs=require("@lune/fs")\nlocal serde=require("@lune/serde")\nlocal game={GetService=function()return {JSONEncode=function(_,value)return serde.encode("json",value)end}end}\nlocal Rules=(function()\n${CONDITIONAL_VALIDATOR}\nend)()\nlocal pkg=serde.decode("json",fs.readFile("${output}/design.framebridge.json"))\nlocal nodes={}\nlocal function visit(n)table.insert(nodes,n);for _,child in ipairs(n.children)do visit(child)end end\nfor _,root in ipairs(pkg.roots)do visit(root)end\nRules.validate(nodes)\nlocal rules=pkg.roots[1].children[1].behavior.rules\nlocal cases=serde.decode("json",${quoteLuau(JSON.stringify(evaluationCases))})\nlocal count=0\nfor _,case in ipairs(cases)do for index,rule in ipairs(rules)do local actions,branch=Rules.evaluate(rule,case.data);assert(branch==case.branches[index],"First-match branch mismatch");count+=1 end end\nfor _,file in ipairs({"${output}/native.luau","${output}/runtime.luau","${output}/sources/store.react.luau","${output}/sources/store.fusion.luau","${output}/sources/store.luau.luau"})do local fn,why=loadstring(fs.readFile(file));assert(fn,file..": "..tostring(why))end\nprint("Conditional native parity checks: "..count.."; five native/generated modules compile.")`,
);
await writeFile(
  output + "/model-read.luau",
  `local fs=require("@lune/fs")\nlocal serde=require("@lune/serde")\nlocal roblox=require("@lune/roblox")\nlocal roots=roblox.deserializeModel(fs.readFile("${output}/store.rbxmx"))\nlocal ids={}\nfor _,node in ipairs(roots[1]:GetDescendants())do local id=node:GetAttribute("FramebridgeId");if id then ids[id]=node end end\nlocal owner=ids["rules-screen"];local rules=serde.decode("json",owner:GetAttribute("FramebridgeBehavior")).rules\nassert(#rules==4 and rules[1].id=="purchase" and rules[1].branches[1]["then"][1].target=="buy")\nassert(ids["status"].RichText and math.abs(ids["status"].BackgroundTransparency-0.6)<0.0001)\nassert(serde.decode("json",ids["status"]:GetAttribute("FramebridgeBehavior")).ruleDesign)\nlocal runtime=ids["screen:rules-screen/behavior-runtime"];assert(runtime:IsA("LocalScript") and runtime.Source:find("local mountRules",1,true))\nprint("Independent model read: rule metadata, design defaults, client runtime and stable target IDs passed.")`,
);
console.log(
  "Conditional rules fixture, four sources, model, browser preview, native and pure checks prepared.",
);
