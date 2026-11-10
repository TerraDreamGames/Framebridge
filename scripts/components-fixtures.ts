import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  componentResult,
  stateComponentResult,
} from "../tests/components-fixtures";
import { extractComponent } from "../packages/core/src/reusable-components";
import {
  generateSource,
  quoteLuau,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { compile } from "../packages/core/src/compiler";
import { BEHAVIOR_RUNTIME } from "../packages/core/src/behavior-runtime.mjs";
import { bundleStudio } from "./studio-bundle.mjs";

const output = ".artifacts/reusable-components",
  tsRoot = output + "/ts";
await mkdir(output + "/sources", { recursive: true });
await mkdir(tsRoot + "/src", { recursive: true });
const designs = [
  ...componentResult().designs!,
  ...stateComponentResult(true).designs!,
];
const data = {
  designs,
  package: compile(
    designs,
    "component-preview",
    { detectButtons: false },
    "fixed",
  ),
  assets: {},
  previews: {},
  revision: 1,
};
await writeFile(
  output + "/preview.json",
  JSON.stringify({
    data,
    selected: [
      {
        id: "shop",
        name: "Shop",
        type: "FRAME",
        width: 800,
        height: 400,
        layers: 7,
      },
      {
        id: "button-set",
        name: "Purchase button",
        type: "COMPONENT_SET",
        width: 880,
        height: 48,
        layers: 11,
      },
    ],
  }),
);
const cases = {
  card: extractComponent(componentResult(), "repeat:card-a"),
  states: extractComponent(stateComponentResult(true), "states:button-set"),
};
let definitions = "local componentCases = {}\n";
for (const [name, result] of Object.entries(cases)) {
  definitions += `componentCases[${quoteLuau(name)}] = {package = game:GetService("HttpService"):JSONDecode(${quoteLuau(JSON.stringify(result.package))}),\n`;
  await writeFile(
    `${output}/sources/${name}.json`,
    JSON.stringify(result.package),
  );
  for (const format of SOURCE_FORMATS) {
    const source = generateSource(result.package, format.id, {
      component: true,
    });
    await writeFile(
      `${output}/sources/${name}.${format.id}.${format.extension}`,
      source,
    );
    if (format.id === "tsx")
      await writeFile(`${tsRoot}/src/${name}.tsx`, source);
    else
      definitions += `${format.id} = function()\n${source.replace('require(game:GetService("ReplicatedStorage"):WaitForChild("Packages"):WaitForChild("React"))', "require(script.ReactLua.React)").replace('require(game:GetService("ReplicatedStorage"):WaitForChild("Packages"):WaitForChild("Fusion"))', "require(script.Fusion)")}\nend,\n`;
  }
  definitions += "}\n";
}
await writeFile(
  tsRoot + "/package.json",
  JSON.stringify({
    private: true,
    dependencies: {
      "@rbxts/compiler-types": "3.0.0-types.0",
      "@rbxts/react": "17.3.7-ts.2",
      "@rbxts/react-roblox": "17.3.7-ts.2",
      "@rbxts/types": "1.0.956",
      "roblox-ts": "3.0.0",
    },
  }),
);
await writeFile(
  tsRoot + "/tsconfig.json",
  JSON.stringify({
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
  }),
);
await writeFile(
  tsRoot + "/default.project.json",
  JSON.stringify({
    name: "ComponentQA",
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
  }),
);
await writeFile(
  output + "/syntax.luau",
  `local fs=require("@lune/fs")\nlocal count=0\nfor _,name in ipairs(fs.readDir("${output}/sources")) do if name:match("%.luau$") then assert(loadstring(fs.readFile("${output}/sources/"..name)));count+=1 end end\nprint("Component Luau syntax: "..count.." modules")\n`,
);

async function moduleTree(directory: string, name: string): Promise<any> {
  const entries = await readdir(directory, { withFileTypes: true }),
    init = entries.find((f) => /^init\.lua(u)?$/.test(f.name));
  return {
    name,
    source: init
      ? await readFile(path.join(directory, init.name), "utf8")
      : undefined,
    children: await Promise.all(
      entries
        .filter(
          (e) =>
            !/^init\.lua(u)?$/.test(e.name) &&
            (e.isDirectory() || /\.lua(u)?$/.test(e.name)),
        )
        .map(async (e) =>
          e.isDirectory()
            ? moduleTree(path.join(directory, e.name), e.name)
            : {
                name: e.name.replace(/\.lua(u)?$/, ""),
                children: [],
                source: await readFile(path.join(directory, e.name), "utf8"),
              },
        ),
    ),
  };
}
const fusion = await moduleTree(".artifacts/dependencies/Fusion/src", "Fusion");
const extras = [
  fusion,
  { name: "BehaviorRuntime", children: [], source: BEHAVIOR_RUNTIME },
];
if (process.argv.includes("--compiled-tsx")) {
  const runtimePath = tsRoot + "/node_modules/@rbxts-js";
  const runtimes = await Promise.all(
    (await readdir(runtimePath)).map(async (directory) => {
      const base = path.join(runtimePath, directory),
        project = JSON.parse(
          await readFile(path.join(base, "default.project.json"), "utf8"),
        );
      return moduleTree(path.join(base, project.tree.$path), project.name);
    }),
  );
  const wrappers = await Promise.all(
    ["react", "react-roblox"].map((name) =>
      moduleTree(`${tsRoot}/node_modules/@rbxts/${name}/src`, name),
    ),
  );
  extras.push({
    name: "RbxTsRuntime",
    children: [
      { name: "@rbxts-js", children: runtimes },
      { name: "@rbxts", children: wrappers },
    ],
  });
  for (const name of Object.keys(cases)) {
    const compiled = (await readFile(`${tsRoot}/out/${name}.luau`, "utf8"))
      .replace(/^local TS = require\([^\n]+\)\n/m, "")
      .replace(
        /^local React = TS.import\([^\n]+\)\n/m,
        'local React = require(script.RbxTsRuntime["@rbxts"].react)\n',
      )
      .replace(
        'script.Parent:WaitForChild("FramebridgeInteractions")',
        "script.BehaviorRuntime",
      );
    definitions += `componentCases[${quoteLuau(name)}].tsx = function()\n${compiled}\nend\n`;
  }
}
if (process.argv.includes("--browser")) {
  const pkg = JSON.parse(
    await readFile(output + "/browser-template.json", "utf8"),
  );
  const source = (
    await readFile(output + "/browser-widget.luau", "utf8")
  ).replace(
    'require(game:GetService("ReplicatedStorage"):WaitForChild("Packages"):WaitForChild("React"))',
    "require(script.ReactLua.React)",
  );
  definitions += `componentCases.browser = {package=game:GetService("HttpService"):JSONDecode(${quoteLuau(JSON.stringify(pkg))}),react=function()\n${source}\nend}\n`;
}
await writeFile(
  output + "/native.luau",
  await bundleStudio(
    definitions + (await readFile("tests/studio-components.test.luau", "utf8")),
    extras,
  ),
);
console.log(
  "Generated two reusable widgets in four source formats, Studio templates and browser fixture.",
);
