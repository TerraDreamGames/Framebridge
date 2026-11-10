import { advancedControlPackage } from "../packages/core/src/advanced-control-examples";
import { validatePackage } from "../packages/relay/src/protocol";
import { generateModel } from "../packages/core/src/model-export";
import { themePackage } from "../tests/theme-fixtures";
import { particlePackage } from "../tests/particle-fixtures";
import { scrollbarResult } from "../tests/scrollbar-fixtures";
import { motionExportPackage } from "../tests/motion-fixtures";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundleStudio } from "./studio-bundle.mjs";
import { compile } from "../packages/core/src/compiler";
import { node, demoDesign } from "../packages/core/src/demo";
import {
  generateSource,
  quoteLuau,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { responsivePackages } from "../tests/responsive-layout-fixtures";
import { viewportPackage } from "../tests/viewport-fixtures";
import { imageScalingResult } from "../tests/image-scaling-fixtures";
import { flatten, type TransferPackage } from "../packages/core/src/types";
import { behaviorPackage } from "../tests/behavior-fixtures";
import {
  BEHAVIOR_RUNTIME,
  THEMED_BEHAVIOR_RUNTIME,
  THEMED_PARTICLE_BEHAVIOR_RUNTIME,
} from "../packages/core/src/behavior-runtime.mjs";
import { worldPackage } from "../tests/world-space-fixtures";
import { repeatPackages } from "../tests/repeat-fixtures";
import { maskPackages } from "../tests/mask-fixtures";
import {
  maskResizePackage,
  automaticMaskPackages,
} from "../tests/mask-resize-fixtures";
import { decorationPackage } from "../tests/decoration-fixtures";
import { effectPackage } from "../tests/effect-decoration-fixtures";
import { styleSizingPackages } from "../tests/style-sizing-fixtures";
import { conditionalExamplePackage } from "../packages/core/src/conditional-examples";
import { keyframePackage } from "../packages/core/src/keyframe-examples";

const controlsOnly = process.argv.includes("--controls-only");
const packageFileIndex = process.argv.indexOf("--package-file");
if (
  packageFileIndex >= 0 &&
  (!controlsOnly || !process.argv[packageFileIndex + 1])
)
  throw new Error("--package-file requires --controls-only and a package path");
const controlPackage: TransferPackage =
  packageFileIndex >= 0
    ? JSON.parse(await readFile(process.argv[packageFileIndex + 1], "utf8"))
    : advancedControlPackage();
validatePackage(controlPackage);
const themeOnly = process.argv.includes("--theme-only");
const particleOnly = process.argv.includes("--particle-only");
const maskOnly = process.argv.includes("--mask-only");
const rulesOnly = process.argv.includes("--rules-only");
const styleOnly = process.argv.includes("--style-only");
const keyframesOnly = process.argv.includes("--keyframes-only");
const effectsOnly = process.argv.includes("--effects-only");
const repeatOnly = process.argv.includes("--repeat-only");
const scrollbarOnly = process.argv.includes("--scrollbar-only");
const worldPlay = process.argv.includes("--world-play");
const worldOnly = worldPlay || process.argv.includes("--world-only");
let output = styleOnly
  ? ".artifacts/style-source-export"
  : maskOnly
    ? ".artifacts/mask-source-export"
    : repeatOnly
      ? ".artifacts/repeat-source-export"
      : scrollbarOnly
        ? ".artifacts/scrollbar-source-export"
        : worldPlay
          ? ".artifacts/world-source-play"
          : worldOnly
            ? ".artifacts/world-source-export"
            : ".artifacts/source-export";
if (themeOnly) output = ".artifacts/theme-source-export";
if (rulesOnly) output = ".artifacts/conditional-source-export";
if (keyframesOnly) output = ".artifacts/keyframe-source-export";
if (particleOnly) output = ".artifacts/particle-source-export";
if (effectsOnly) output = ".artifacts/effect-source-export";
if (controlsOnly) output = ".artifacts/control-source-export";
await mkdir(output + "/sources", { recursive: true });
await mkdir(".artifacts/source-export-ts", { recursive: true });
await writeFile(
  ".artifacts/source-export-ts/package.json",
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
const values = node('Values "\\\n☃', {
  id: "values",
  width: 500,
  height: 300,
  corners: [4, 16, 8, 24],
  radius: 4,
  fills: [
    {
      type: "GRADIENT_LINEAR",
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0],
      ],
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 0.2 } },
        { position: 1, color: { r: 0, g: 0, b: 1 } },
      ],
    },
  ],
  strokes: [{ type: "SOLID", color: { r: 0.4, g: 1, b: 0.1 } }],
  strokeWeight: 2,
  children: [
    node("Artwork", { id: "artwork", type: "VECTOR", width: 24, height: 24 }),
    node("Text", {
      id: "text",
      type: "TEXT",
      text: {
        characters: 'Hello "world"\\\n☃\u00001',
        align: "CENTER",
        verticalAlign: "CENTER",
        runs: [
          {
            text: 'Hello "world"\\\n☃\u00001',
            fontFamily: "Roboto",
            fontStyle: "Bold Italic",
            fontSize: 18,
          },
        ],
      },
    }),
  ],
});
const styling = node("Styling", {
  id: "styling",
  width: 400,
  height: 300,
  radius: 8,
  corners: [8, 16, 24, 4],
  fills: [
    { type: "SOLID", color: { r: 0.2, g: 0.3, b: 0.5 } },
    { type: "SOLID", color: { r: 0.5, g: 0.2, b: 0.3 }, opacity: 0.5 },
  ],
  strokes: [
    { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
    { type: "SOLID", color: { r: 0, g: 1, b: 0 } },
  ],
  strokeWeight: 2,
  effects: ["DROP_SHADOW"],
  shadows: [
    {
      type: "DROP_SHADOW",
      radius: 12,
      spread: 3,
      offset: { x: 2, y: 5 },
      color: { r: 0.1, g: 0.1, b: 0.2, a: 0.6 },
      blendMode: "NORMAL",
    },
  ],
  children: [
    node("Rich text", {
      id: "styled-text",
      type: "TEXT",
      text: {
        characters: "Hello world",
        align: "CENTER",
        verticalAlign: "TOP",
        runs: [
          {
            text: "Hello ",
            fontFamily: "Roboto",
            fontStyle: "Bold",
            fontSize: 18,
            underline: true,
          },
          {
            text: "world",
            fontFamily: "Source Sans Pro",
            fontStyle: "Italic",
            fontSize: 20,
            strike: true,
          },
        ],
      },
    }),
  ],
});
const wide = node("Large screen", {
  id: "wide",
  children: Array.from({ length: 350 }, (_, i) =>
    node(`Layer${i}`, { id: `wide${i}` }),
  ),
});
let deep = node("Leaf", { id: "leaf" });
for (let i = 0; i < 90; i++)
  deep = node(`Nested${i}`, { id: `deep${i}`, children: [deep] });
const worlds: Record<string, TransferPackage> = {
  worldSurface: worldPackage("surface"),
  worldBillboard: worldPackage("billboard"),
  worldPrompt: worldPackage("prompt"),
};
if (worldPlay) {
  for (const pkg of [worlds.worldSurface, worlds.worldBillboard]) {
    const button = flatten(pkg.roots).find((layer) => layer.id === "action")!;
    button.className = "TextButton";
    button.behavior = { action: { kind: "toggle", target: "object" } };
    flatten(pkg.roots).find((layer) => layer.id === "object")!.behavior = {
      role: "panel",
    };
  }
  await writeFile(
    output + "/setup.luau",
    await readFile("tests/studio-world-source-play.setup.luau", "utf8"),
  );
}
const keyframes = keyframePackage();
// Start all source chains from an explicit local attribute edge so the four
// real renderers can first compare identical authored resting properties.
for (const n of flatten(keyframes.roots))
  if (n.behavior?.keyframes) {
    n.behavior.keyframes.trigger = "attribute";
    n.behavior.keyframes.attribute = "FramebridgeAnimate";
    delete n.behavior.keyframes.owner;
    n.behavior.keyframes.repeats = 0;
    n.behavior.keyframes.yoyo = false;
  }
let cases: Record<string, TransferPackage> = styleOnly
  ? styleSizingPackages()
  : maskOnly
    ? {
        ...maskPackages(),
        maskResponsive: maskResizePackage(),
        maskResponsiveStretch: maskResizePackage("CENTER", "STRETCH"),
        ...automaticMaskPackages(),
      }
    : repeatOnly
      ? repeatPackages()
      : scrollbarOnly
        ? { scrollbars: scrollbarResult(undefined, true).package }
        : worldOnly
          ? worlds
          : {
              advancedControls: advancedControlPackage(),
              decoration: decorationPackage(),
              effects: effectPackage(),
              ...styleSizingPackages(),
              ...repeatPackages(),
              ...maskPackages(),
              maskResponsive: maskResizePackage(),
              maskResponsiveStretch: maskResizePackage("CENTER", "STRETCH"),
              ...automaticMaskPackages(),
              ...worlds,
              scrollbars: scrollbarResult(undefined, true).package,
              motion: motionExportPackage(),
              behaviors: behaviorPackage(),
              imageScaling: imageScalingResult().package,
              viewport: viewportPackage(),
              store: compile(
                demoDesign(),
                "store",
                { layout: "responsive" },
                "fixed",
              ),
              values: compile(
                [values],
                "values",
                {
                  layout: "responsive",
                  assetIds: { "image:artwork": "123456789" },
                },
                "fixed",
              ),
              styling: compile(
                [styling],
                "styling",
                { layout: "responsive" },
                "fixed",
              ),
              multiple: compile(
                [values, styling],
                "multiple",
                {
                  layout: "responsive",
                  assetIds: { "image:artwork": "123456789" },
                },
                "fixed",
              ),
              ...responsivePackages(),
              wide: compile([wide], "wide", {}, "fixed"),
              deep: compile([deep], "deep", {}, "fixed"),
            };
if (themeOnly) cases = { themes: themePackage() };
if (rulesOnly) cases = { conditionalRules: conditionalExamplePackage() };
else if (
  !themeOnly &&
  !particleOnly &&
  !styleOnly &&
  !maskOnly &&
  !repeatOnly &&
  !scrollbarOnly &&
  !worldOnly
)
  cases.conditionalRules = conditionalExamplePackage();
if (keyframesOnly) cases = { keyframes };
else if (
  !themeOnly &&
  !particleOnly &&
  !rulesOnly &&
  !styleOnly &&
  !maskOnly &&
  !repeatOnly &&
  !scrollbarOnly &&
  !worldOnly
)
  cases.keyframes = keyframes;
if (particleOnly) cases = { particles: particlePackage() };
if (effectsOnly) cases = { effects: effectPackage() };
if (controlsOnly) cases = { advancedControls: controlPackage };
let definitions = "local sourceCases = {}\n";
if (controlsOnly) {
  definitions += await readFile(
    "tests/studio-control-source-observer.luau",
    "utf8",
  );
  await writeFile(output + "/Controls.rbxmx", generateModel(controlPackage));
}
for (const [name, pkg] of Object.entries(cases)) {
  await writeFile(`${output}/sources/${name}.json`, JSON.stringify(pkg));
  const sources: Record<string, string> = {};
  for (const format of SOURCE_FORMATS) {
    const code = generateSource(pkg, format.id);
    await writeFile(
      `${output}/sources/${name}.${format.id}.${format.extension}`,
      code,
    );
    if (format.id !== "tsx") {
      let adapted = code
        .replace(
          'require(game:GetService("ReplicatedStorage"):WaitForChild("Packages"):WaitForChild("React"))',
          "require(script.ReactLua.React)",
        )
        .replace(
          'require(game:GetService("ReplicatedStorage"):WaitForChild("Packages"):WaitForChild("Fusion"))',
          "require(script.Fusion)",
        );
      // QA observation supplies deterministic player/time/random input and
      // records the controllers mounted by each real renderer. Export files
      // retain their original module interface and runtime source.
      if (controlsOnly) {
        const marker = /^return function\((?:props|scope|parent)[^\n]*$/m;
        if (!marker.test(adapted))
          throw new Error("Missing source factory: " + format.id);
        adapted = adapted.replace(
          marker,
          (line) => "observeControlRuntime(Runtime)\n" + line,
        );
      }
      sources[format.id] = adapted;
    } else {
      const directory = ".artifacts/source-export-ts/src";
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/${name}.tsx`, code);
    }
  }
  definitions += `sourceCases[${quoteLuau(name)}] = {\n  package = game:GetService("HttpService"):JSONDecode(${quoteLuau(JSON.stringify(pkg))}),\n`;
  for (const [format, code] of Object.entries(sources))
    definitions += `  ${format} = function()\n${code}\nend,\n`;
  definitions += "}\n";
}
await writeFile(output + "/cases.luau", definitions);
await writeFile(
  ".artifacts/source-export-ts/tsconfig.json",
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
  ".artifacts/source-export-ts/default.project.json",
  JSON.stringify(
    {
      name: "SourceExportQA",
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
const syntax = `local fs = require("@lune/fs")\nlocal count = 0\nfor _, name in ipairs(fs.readDir("${output}/sources")) do\n  if name:match("%.luau$") then\n    local fn, why = loadstring(fs.readFile("${output}/sources/" .. name))\n    assert(fn, name .. ": " .. tostring(why))\n    count += 1\n  end\nend\nprint("Generated Luau modules compile: " .. count)\n`;
await writeFile(output + "/syntax.luau", syntax);

// Third-party test dependency only. Never shipped in either plugin bundle.
async function fusionTree(directory: string, name: string): Promise<any> {
  const entries = await readdir(directory, { withFileTypes: true });
  return {
    name,
    source: entries.some((f) => /^init\.lua(u)?$/.test(f.name))
      ? await readFile(
          path.join(
            directory,
            entries.find((f) => /^init\.lua(u)?$/.test(f.name))!.name,
          ),
          "utf8",
        )
      : undefined,
    children: await Promise.all(
      entries
        .filter(
          (entry) =>
            !/^init\.lua(u)?$/.test(entry.name) &&
            (entry.isDirectory() || /\.lua(u)?$/.test(entry.name)),
        )
        .map(async (entry) =>
          entry.isDirectory()
            ? fusionTree(path.join(directory, entry.name), entry.name)
            : {
                name: entry.name.replace(/\.lua(u)?$/, ""),
                children: [],
                source: await readFile(
                  path.join(directory, entry.name),
                  "utf8",
                ),
              },
        ),
    ),
  };
}
const fusion = await fusionTree(".artifacts/dependencies/Fusion/src", "Fusion");
const extras = [
  fusion,
  {
    name: "BehaviorRuntime",
    children: [],
    source: particleOnly
      ? THEMED_PARTICLE_BEHAVIOR_RUNTIME
      : themeOnly
        ? THEMED_BEHAVIOR_RUNTIME
        : BEHAVIOR_RUNTIME,
  },
];
let tsDefinitions = "";
if (process.argv.includes("--compiled-tsx")) {
  const runtimePath = ".artifacts/source-export-ts/node_modules/@rbxts-js";
  const runtimeModules = await Promise.all(
    (await readdir(runtimePath)).map(async (directory) => {
      const base = path.join(runtimePath, directory);
      const project = JSON.parse(
        await readFile(path.join(base, "default.project.json"), "utf8"),
      );
      return fusionTree(path.join(base, project.tree.$path), project.name);
    }),
  );
  const wrappers = await Promise.all(
    ["react", "react-roblox"].map((name) =>
      fusionTree(
        `.artifacts/source-export-ts/node_modules/@rbxts/${name}/src`,
        name,
      ),
    ),
  );
  extras.push({
    name: "RbxTsRuntime",
    children: [
      { name: "@rbxts-js", children: runtimeModules },
      { name: "@rbxts", children: wrappers },
    ],
  });
  for (const name of Object.keys(cases)) {
    const code = await readFile(
      `.artifacts/source-export-ts/out/${name}.luau`,
      "utf8",
    );
    // Adapt only module paths to the test loader. The compiled JSX and the
    // published roblox-ts React wrapper/renderer run unchanged.
    const adapted = code
      .replace(/^local TS = require\([^\n]+\)\n/m, "")
      .replace(
        /^local React = TS.import\([^\n]+\)\n/m,
        'local React = require(script.RbxTsRuntime["@rbxts"].react)\n',
      )
      .replace(
        'script.Parent:WaitForChild("FramebridgeInteractions")',
        "script.BehaviorRuntime",
      );
    tsDefinitions += `sourceCases[${quoteLuau(name)}].tsx = function()\n${adapted}\nend\n`;
  }
}
let test = await readFile(
  controlsOnly
    ? "tests/studio-control-source-export.test.luau"
    : worldPlay
      ? "tests/studio-world-source-play.test.luau"
      : "tests/studio-source-export.test.luau",
  "utf8",
);
if (controlsOnly) {
  const comparison = await readFile(
    "tests/studio-source-export.test.luau",
    "utf8",
  );
  const from = comparison.indexOf("local function same(");
  const to = comparison.indexOf("local function check(");
  if (from < 0 || to <= from)
    throw new Error("Missing native property comparison helpers");
  test = comparison.slice(from, to) + test;
}
await writeFile(
  output + "/native.luau",
  await bundleStudio(definitions + tsDefinitions + test, extras),
);
console.log(
  `Generated ${Object.keys(cases).length} source-export fixtures across four formats.`,
);
