import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  keyframePackage,
  keyframeDesign,
  keyframeOverrides,
  exampleChain,
} from "../packages/core/src/keyframe-examples";
import {
  sampleKeyframes,
  KEYFRAME_EASINGS,
} from "../packages/core/src/keyframes";
import {
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_RUNTIME,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
import {
  quoteLuau,
  SOURCE_FORMATS,
  generateSource,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { flatten } from "../packages/core/src/types";
import { compile } from "../packages/core/src/compiler";
import { responsiveDesigns } from "../tests/responsive-layout-fixtures";
import { worldPackage } from "../tests/world-space-fixtures";
const output = ".artifacts/keyframes";
await mkdir(output, { recursive: true });
await mkdir("examples/keyframes", { recursive: true });
const pkg = keyframePackage();
if (pkg.issues.some((i) => i.severity === "error"))
  throw new Error(JSON.stringify(pkg.issues));
await writeFile(
  "examples/keyframes/chains.framebridge.json",
  JSON.stringify(pkg, null, 2),
);
await writeFile(
  `${output}/preview.json`,
  JSON.stringify({
    data: {
      designs: keyframeDesign(),
      package: pkg,
      assets: {},
      previews: {},
      revision: 1,
    },
    overrides: keyframeOverrides,
    selected: [
      {
        id: "keyframe-screen",
        name: "Keyframe chains",
        type: "FRAME",
        width: 800,
        height: 600,
        layers: pkg.stats.layers,
      },
    ],
  }),
);
const oracle = KEYFRAME_EASINGS.flatMap((easing) =>
  ["in", "out", "inOut"].map((direction) => {
    const chain = exampleChain("activate", {
      frames: [
        {
          ...exampleChain("activate").frames[0],
          easing,
          direction: direction as "in",
        },
        {
          ...exampleChain("activate").frames[1],
          time: 1,
          easing,
          direction: direction as "in",
        },
      ],
    });
    return {
      chain,
      samples: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((time) => ({
        elapsed: time,
        ...sampleKeyframes(chain, time),
      })),
    };
  }),
);
const baseline = keyframePackage({
  layerOverrides: {
    activate: {
      behavior: {
        keyframes: exampleChain("activate", {
          frames: exampleChain("activate").frames.map((f) => ({
            ...f,
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
          })),
        }),
      },
    },
  },
});
delete flatten(baseline.roots).find((n) => n.id === "activate")!.behavior;
const header = `assert(game.PlaceId==0,"Blank QA only")\nlocal Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Runtime=(function()\n${BEHAVIOR_RUNTIME}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\nlocal fixture=${quoteLuau(JSON.stringify(pkg))}\nlocal baselineFixture=${quoteLuau(JSON.stringify(baseline))}\nlocal oracle=game:GetService("HttpService"):JSONDecode(${quoteLuau(JSON.stringify(oracle))})\n`;
await writeFile(
  `${output}/native.luau`,
  header + (await readFile("tests/studio-keyframes.test.luau", "utf8")),
);
await writeFile(
  `${output}/import-validation.luau`,
  `local serde=require("@lune/serde")\nlocal Http={JSONDecode=function(_,raw)return serde.decode("json",raw) end,JSONEncode=function(_,value)return serde.encode("json",value) end}\nlocal game={GetService=function(_,name)assert(name=="HttpService");return Http end}\nlocal Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal fixture=${quoteLuau(JSON.stringify(pkg))}\nlocal promptFixture=${quoteLuau(JSON.stringify(worldPackage("prompt")))}\n${await readFile("tests/studio-keyframes-validation.test.luau", "utf8")}`,
);
const layouts = Object.entries(responsiveDesigns)
  .filter(([name]) => ["hug", "flex", "wrap", "textHug"].includes(name))
  .map(([name, design]) =>
    compile([design], `keyframe-layout-${name}`, {
      layout: "responsive",
      layerOverrides: Object.fromEntries(
        (name === "hug"
          ? ["panel"]
          : name === "flex"
            ? ["grow1", "grow2"]
            : name === "wrap"
              ? ["cell0"]
              : ["label"]
        ).map((id) => [
          id,
          {
            behavior: {
              keyframes: exampleChain("attribute", {
                attribute: "FramebridgeAnimate",
                finish: "restore",
                frames: [
                  { ...exampleChain("mount").frames[0] },
                  {
                    ...exampleChain("mount").frames[1],
                    x: 0,
                    y: 0,
                    rotation: 0,
                    opacity: 1,
                    scale: 1.2,
                    time: 1,
                  },
                  { ...exampleChain("mount").frames[0], time: 2 },
                ],
              }),
            },
          },
        ]),
      ),
    }),
  );
await writeFile(
  `${output}/play-setup.luau`,
  header +
    `local packages=game:GetService("HttpService"):JSONDecode(${quoteLuau(JSON.stringify([pkg, ...layouts]))})\nlocal destination=game:GetService("StarterGui");local names={}\nfor index,p in ipairs(packages) do\nlocal name=index==1 and "FramebridgeKeyframesQA" or "FramebridgeKeyframeLayoutQA"..index\nassert(not destination:FindFirstChild(name),"QA exists")\nlocal stage=Importer.stage(p,{},false,runtimeSource)\nlocal roots=Importer.apply(stage,p,destination,false)\nroots[1].Name=name;roots[1]:SetAttribute("FramebridgeKeyframesQA",true);roots[1].DisplayOrder=index==1 and 10 or 0\ntable.insert(names,name)\nend\nreturn names\n`,
);
await writeFile(
  `${output}/play-checks.luau`,
  await readFile("tests/studio-keyframes-play.test.luau", "utf8"),
);
for (const f of SOURCE_FORMATS)
  await writeFile(
    `${output}/Design.${f.id === "tsx" ? "tsx" : f.id + ".luau"}`,
    generateSource(pkg, f.id),
  );
await writeFile(`${output}/Chains.rbxmx`, generateModel(pkg));
await writeFile(`${output}/runtime-client.luau`, BEHAVIOR_CLIENT_SOURCE);
await writeFile(
  `${output}/model-check.luau`,
  `local fs=require("@lune/fs")\nlocal roblox=require("@lune/roblox")\nlocal roots=roblox.deserializeModel(fs.readFile(${quoteLuau(output + "/Chains.rbxmx")}))\nassert(#roots==1)\nlocal scripts,chains=0,0\nfor _,i in ipairs(roots[1]:GetDescendants()) do\nif i:IsA("LocalScript") and i:GetAttribute("FramebridgeRuntime") then scripts+=1;assert(i.Source==fs.readFile(${quoteLuau(output + "/runtime-client.luau")})) end\nlocal raw=i:GetAttribute("FramebridgeBehavior");if raw and raw:find('"keyframes"',1,true) then chains+=1;assert(not raw:find('"recording"',1,true)) end\nend\nassert(scripts==1 and chains==7)\nprint("Independent model read: "..tostring(#roots[1]:GetDescendants()+1).." instances, 7 chains and exact trusted runtime")\n`,
);
await writeFile(
  `${output}/syntax.luau`,
  `local fs=require("@lune/fs")\nfor _,path in ipairs({${["native.luau", "play-setup.luau", ...SOURCE_FORMATS.filter((f) => f.id !== "tsx").map((f) => `Design.${f.id}.luau`)].map((p) => quoteLuau(output + "/" + p)).join(",")}}) do local code,why=loadstring(fs.readFile(path));assert(code,path..": "..tostring(why)) end\nprint("Keyframe runtime, native checks and all three Luau renderers compile")\n`,
);
console.log(
  `${flatten(pkg.roots).length} instances, 7 chains, cross-language oracle and native/Play fixtures prepared.`,
);
