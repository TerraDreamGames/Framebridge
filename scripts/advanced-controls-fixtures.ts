import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  advancedControlPackage,
  advancedControlDesign,
  advancedControlOverrides,
} from "../packages/core/src/advanced-control-examples";
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
const output = ".artifacts/advanced-controls";
await mkdir(output, { recursive: true });
await mkdir("examples/advanced-controls", { recursive: true });
const pkg = advancedControlPackage();
if (pkg.issues.some((i) => i.severity === "error"))
  throw new Error(JSON.stringify(pkg.issues));
await writeFile(
  "examples/advanced-controls/controls.framebridge.json",
  JSON.stringify(pkg, null, 2),
);
const header = `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Runtime=(function()\n${BEHAVIOR_RUNTIME}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\nlocal fixture=${quoteLuau(JSON.stringify(pkg))}\n`;
await writeFile(
  `${output}/native.luau`,
  header + (await readFile("tests/studio-advanced-controls.test.luau", "utf8")),
);
await writeFile(
  `${output}/play-setup.luau`,
  `assert(game.PlaceId==0,"Blank QA only")\n${header}local destination=game:GetService("StarterGui")\nassert(not destination:FindFirstChild("FramebridgeAdvancedControlsQA"),"QA fixture already exists")\nlocal p=Importer.decode(fixture)\nlocal stage=Importer.stage(p,{},false,runtimeSource)\nlocal roots=Importer.apply(stage,p,destination,false)\nroots[1].Name="FramebridgeAdvancedControlsQA";roots[1]:SetAttribute("FramebridgeAdvancedControlsQA",true)\nreturn {name=roots[1].Name,controls=8}\n`,
);
await writeFile(
  `${output}/preview.json`,
  JSON.stringify({
    data: {
      designs: advancedControlDesign(),
      package: pkg,
      assets: {},
      previews: {},
      revision: 1,
    },
    layerOverrides: advancedControlOverrides,
    selected: [
      {
        id: "advanced-screen",
        name: "Advanced controls",
        type: "FRAME",
        width: 800,
        height: 620,
        layers: pkg.stats.layers,
      },
    ],
  }),
);
for (const f of SOURCE_FORMATS)
  await writeFile(
    `${output}/Design.${f.id === "tsx" ? "tsx" : f.id + ".luau"}`,
    generateSource(pkg, f.id),
  );
await writeFile(`${output}/Controls.rbxmx`, generateModel(pkg));
await writeFile(`${output}/runtime-client.luau`, BEHAVIOR_CLIENT_SOURCE);
await writeFile(
  `${output}/syntax.luau`,
  `local fs=require("@lune/fs")\nfor _,path in ipairs({${["native.luau", "play-setup.luau", ...SOURCE_FORMATS.filter((f) => f.id !== "tsx").map((f) => `Design.${f.id}.luau`)].map((p) => quoteLuau(output + "/" + p)).join(",")}}) do local code,why=loadstring(fs.readFile(path));assert(code,path..": "..tostring(why)) end\nprint("Advanced control runtime, native checks and all three Luau renderers compile")\n`,
);
console.log(
  "Advanced-control example, native behavior checks, Play setup, renderers and model prepared.",
);

const tsDir = `${output}/roblox-ts`;
await mkdir(`${tsDir}/src`, { recursive: true });
await writeFile(`${tsDir}/src/Design.tsx`, generateSource(pkg, "tsx"));
await writeFile(
  `${tsDir}/package.json`,
  JSON.stringify(
    {
      private: true,
      dependencies: {
        "@rbxts/compiler-types": "3.0.0-types.0",
        "@rbxts/react": "17.3.7-ts.2",
        "@rbxts/react-roblox": "17.3.7-ts.2",
        "@rbxts/types": "1.0.956",
        "roblox-ts": "3.0.0",
      },
    },
    null,
    2,
  ),
);
await writeFile(
  `${tsDir}/tsconfig.json`,
  JSON.stringify(
    {
      compilerOptions: {
        target: "ESNext",
        moduleDetection: "force",
        module: "CommonJS",
        moduleResolution: "Node",
        strict: true,
        noLib: true,
        typeRoots: ["node_modules/@rbxts"],
        types: ["types", "compiler-types"],
        rootDir: "src",
        outDir: "out",
        jsx: "react",
        jsxFactory: "React.createElement",
        jsxFragmentFactory: "React.Fragment",
        allowSyntheticDefaultImports: true,
        downlevelIteration: true,
      },
      include: ["src"],
    },
    null,
    2,
  ),
);
await writeFile(
  `${tsDir}/default.project.json`,
  JSON.stringify(
    {
      name: "AdvancedControlsSourceQA",
      tree: {
        $className: "DataModel",
        ReplicatedStorage: {
          $className: "ReplicatedStorage",
          TS: { $path: "out" },
          rbxts_include: {
            $path: "include",
            node_modules: {
              $className: "Folder",
              "@rbxts": { $path: "node_modules/@rbxts" },
            },
          },
        },
      },
    },
    null,
    2,
  ),
);
