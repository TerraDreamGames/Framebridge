import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  scrollbarDesign,
  scrollbarOverrides,
  scrollbarResult,
  scrollbarPng,
} from "../tests/scrollbar-fixtures";
import { quoteLuau } from "../packages/core/src/source-code";
import { buildExport } from "../packages/core/src/export";
const output = ".artifacts/scrollbar-artwork";
await mkdir(output, { recursive: true });
const original = scrollbarResult({}),
  configured = scrollbarResult(undefined, true);
await writeFile(
  output + "/preview.json",
  JSON.stringify({
    data: {
      ...original,
      assets: {
        "image:vertical-art": Array.from(scrollbarPng()),
        "image:horizontal-art": Array.from(scrollbarPng("X")),
      },
    },
    selected: [
      {
        id: "scroll-root",
        name: "Scrollbar examples",
        type: "FRAME",
        width: 600,
        height: 420,
        layers: original.package.stats.layers,
      },
    ],
  }),
);
await writeFile(
  output + "/configured.json",
  JSON.stringify(configured.package, null, 2),
);
await writeFile(
  output + "/overrides.json",
  JSON.stringify(scrollbarOverrides(), null, 2),
);
const archive = buildExport(scrollbarResult());
await writeFile(output + "/scrollbars.zip", archive.data);
for (const asset of configured.package.assets)
  await writeFile(
    output + "/" + asset.filename,
    new Uint8Array(configured.assets[asset.id]),
  );
const imported = process.argv.includes("--browser")
  ? JSON.parse(await readFile(output + "/browser-export.json", "utf8"))
  : configured.package;
const prelude =
  'assert(game.PlaceId==0,"Blank QA only")\n' +
  (
    await Promise.all(
      ["Importer", "Editor", "ImportHistory", "AssetGallery"].map(
        async (name) =>
          `local ${name === "ImportHistory" ? "History" : name === "AssetGallery" ? "Gallery" : name}=(function()\n${await readFile("plugins/studio/src/" + name + ".luau", "utf8")}\nend)()\n`,
      ),
    )
  ).join("");
await writeFile(
  output +
    (process.argv.includes("--browser")
      ? "/browser-native.luau"
      : "/native.luau"),
  prelude +
    "local fixtures=" +
    quoteLuau(JSON.stringify(imported)) +
    "\n" +
    (await readFile("tests/studio-scrollbar.test.luau", "utf8")),
);
await writeFile(
  output + "/play-setup.luau",
  prelude +
    `local pkg=Importer.decode(${quoteLuau(JSON.stringify(imported))})\npkg.sourceId="Framebridge-scrollbar-QA"\nlocal stage=Importer.stage(Editor.prepare(pkg,{mode="source",layers={}}),{},false)\nfor _,root in ipairs(stage.roots) do root.Name="Framebridge Scrollbar QA";root.Parent=game:GetService("StarterGui") end\nreturn {placeId=game.PlaceId,roots=#stage.roots}\n`,
);
await writeFile(
  output + "/play-cleanup.luau",
  'assert(game.PlaceId==0,"Blank QA only")\nfor _,root in ipairs(game:GetService("StarterGui"):GetChildren()) do if root:GetAttribute("FramebridgeSource")=="Framebridge-scrollbar-QA" then root:Destroy() end end\nreturn true\n',
);
await writeFile(
  output + "/play-checks.luau",
  `assert(game.PlaceId==0,"Blank QA only")\nlocal gui=game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui"):WaitForChild("Framebridge Scrollbar QA")\ntask.wait(0.4)\nlocal results={}\nfor _,name in ipairs({"Inventory Scroll","Rewards Scroll"}) do\n local scroll=gui:FindFirstChild(name,true);assert(scroll and scroll:IsA("ScrollingFrame"))\n local axis=name=="Inventory Scroll" and "Y" or "X"\n assert(scroll.AbsoluteCanvasSize[axis]>scroll.AbsoluteWindowSize[axis],"Expected overflow")\n local before=scroll:FindFirstChild(axis=="Y" and "Item 5" or "Reward 4").AbsolutePosition\n scroll.CanvasPosition=axis=="Y" and Vector2.new(0,scroll.AbsoluteCanvasSize.Y) or Vector2.new(scroll.AbsoluteCanvasSize.X,0)\n task.wait(0.2)\n local last=scroll:FindFirstChild(axis=="Y" and "Item 5" or "Reward 4")\n assert(last.AbsolutePosition[axis]<before[axis],"Native scroll content did not move")\n assert(last.AbsolutePosition[axis]+last.AbsoluteSize[axis]<=scroll.AbsolutePosition[axis]+scroll.AbsoluteWindowSize[axis]+1,"Last item unreachable")\n assert(scroll.TopImage~="" and scroll.MidImage~="" and scroll.BottomImage~="")\n table.insert(results,{name=name,axis=axis,canvas={scroll.AbsoluteCanvasSize.X,scroll.AbsoluteCanvasSize.Y},window={scroll.AbsoluteWindowSize.X,scroll.AbsoluteWindowSize.Y},position={scroll.CanvasPosition.X,scroll.CanvasPosition.Y}})\nend\nreturn {passed=2,checks=results,scope="Real native scrolling and reachability; mock asset IDs do not prove uploaded artwork rendering"}\n`,
);
console.log("Generated scrollbar PNG, ZIP, browser and native fixtures.");
