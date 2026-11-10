import { mkdir, readFile, writeFile } from "node:fs/promises";
import { bundleStudio } from "./studio-bundle.mjs";
import { compile } from "../packages/core/src/compiler";
import { demoDesign, node } from "../packages/core/src/demo";
import { responsivePackages } from "../tests/responsive-layout-fixtures";
import { groupedSettingsScene } from "../tests/group-coordinate-fixtures";
import { snapshot } from "../plugins/figma/src/snapshot";
import {
  defaultProperties,
  PROPERTY_SCHEMAS,
} from "../packages/core/src/editor";
await mkdir(".artifacts", { recursive: true });
const pkg = compile(
  demoDesign(),
  "studio-test-source",
  {},
  "2026-09-27T00:00:00Z",
);
await writeFile(
  ".artifacts/demo.framebridge.json",
  JSON.stringify(pkg, null, 2),
);
const rich = node("Native features", {
  id: "features",
  width: 400,
  height: 300,
  children: [
    node("Gradient", {
      id: "gradient",
      width: 180,
      height: 80,
      radius: 12,
      fills: [
        {
          type: "GRADIENT_LINEAR",
          gradientTransform: [
            [1, 0, 0],
            [0, 1, 0],
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 0.4 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        },
      ],
      strokes: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      strokeWeight: 2,
      strokeAlign: "INSIDE",
    }),
    node("Text", {
      id: "rich-text",
      type: "TEXT",
      text: {
        characters: "Hello world",
        align: "CENTER",
        verticalAlign: "TOP",
        runs: [
          {
            text: "Hello",
            fontFamily: "Roboto",
            fontStyle: "Bold",
            fontSize: 16,
          },
          {
            text: " world",
            fontFamily: "Roboto",
            fontStyle: "Italic",
            fontSize: 20,
          },
        ],
      },
    }),
  ],
});
await writeFile(
  ".artifacts/features.framebridge.json",
  JSON.stringify(compile([rich], "features", {}, "fixed")),
);
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
const tests = await readFile("tests/studio.test.luau", "utf8");
const source = `local Importer = (function()\n${importer}\nend)()\nlocal fixture = [====[${JSON.stringify(pkg)}]====]\nlocal features = [====[${JSON.stringify(compile([rich], "features"))}]====]\n${tests}`;
await writeFile(".artifacts/studio-tests.luau", source);
const buttonFixture = compile(
  [
    node("Button examples", {
      id: "button-screen",
      children: [
        node("Buy now", {
          id: "buy-control",
          children: [
            node("Label", {
              id: "buy-label",
              type: "TEXT",
              text: {
                characters: "Buy now",
                align: "CENTER",
                verticalAlign: "CENTER",
                runs: [
                  {
                    text: "Buy now",
                    fontFamily: "Roboto",
                    fontStyle: "Regular",
                    fontSize: 16,
                  },
                ],
              },
            }),
          ],
        }),
        node("Close", {
          id: "close-control",
          children: [node("Path", { id: "close-icon", type: "VECTOR" })],
        }),
        node("Button container", { id: "button-container" }),
      ],
    }),
  ],
  "button-examples",
  { assetIds: { "image:close-icon": "42" } },
  "fixed",
);
await writeFile(
  ".artifacts/studio-button-detection-tests.luau",
  `local Importer = (function()\n${importer}\nend)()\nlocal fixture = [====[${JSON.stringify(buttonFixture)}]====]\n${await readFile("tests/studio-button-detection.test.luau", "utf8")}`,
);
const nativeVisuals = compile(
  [
    node("Visuals", {
      id: "visual-panel",
      width: 400,
      height: 300,
      corners: [0, 12, 24, 6],
      fills: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.25 },
        { type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.4 } },
      ],
      effects: ["DROP_SHADOW"],
      shadows: [
        {
          type: "DROP_SHADOW",
          radius: 12,
          spread: 2,
          offset: { x: 3, y: 4 },
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          blendMode: "NORMAL",
        },
      ],
      strokes: [
        { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
        {
          type: "GRADIENT_LINEAR",
          gradientTransform: [
            [1, 0, 0],
            [0, 1, 0],
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0 } },
            { position: 1, color: { r: 0, g: 0, b: 1 } },
          ],
        },
      ],
      strokeWeight: 2,
      layout: {
        mode: "VERTICAL",
        spacing: 8,
        padding: [4, 4, 4, 4],
        primary: "MIN",
        counter: "MIN",
        wrap: false,
      },
      children: [node("Card", { id: "visual-card", width: 120, height: 40 })],
    }),
  ],
  "native-visuals",
  { layout: "responsive" },
  "fixed",
);
await writeFile(
  ".artifacts/studio-native-appearance-tests.luau",
  `local Importer = (function()\n${importer}\nend)()\nlocal fixture = [====[${JSON.stringify(nativeVisuals)}]====]\n${await readFile("tests/studio-native-appearance.test.luau", "utf8")}`,
);
// Exercise every inspector class/default using Roblox's own property setters.
const editorPackage = structuredClone(pkg);
editorPackage.roots[0].children = Object.keys(PROPERTY_SCHEMAS)
  .filter(
    (className) => className !== "ScreenGui" && !className.startsWith("UI"),
  )
  .map((className) => ({
    id: `editor:${className}`,
    name: className,
    className,
    properties: defaultProperties(className),
    children: Object.keys(PROPERTY_SCHEMAS)
      .filter((c) => c.startsWith("UI"))
      .filter(
        (c) => c !== "UITextSizeConstraint" || className.startsWith("Text"),
      )
      .map((c) => ({
        id: `editor:${className}/${c}`,
        name: c,
        className: c,
        properties: defaultProperties(c),
        children: [],
      })),
  }));
editorPackage.roots[0].properties = defaultProperties("ScreenGui");
editorPackage.assets = [];
editorPackage.issues = [];
const editorTests = await readFile("tests/studio-editor.test.luau", "utf8");
await writeFile(
  ".artifacts/studio-editor-tests.luau",
  `local Importer = (function()\n${importer}\nend)()\nlocal fixture = [====[${JSON.stringify(editorPackage)}]====]\n${editorTests}`,
);
console.log(
  "Created demo packages and detached Studio test script in .artifacts.",
);

const relay = await readFile("plugins/studio/src/Relay.luau", "utf8");
await writeFile(
  ".artifacts/studio-lifetime-tests.luau",
  `local Lifetime = (function()\n${await readFile("plugins/studio/src/ConnectionLifetime.luau", "utf8")}\nend)()\n${await readFile("tests/studio-lifetime.test.luau", "utf8")}`,
);
await writeFile(
  ".artifacts/studio-edit-mode-bundle-tests.luau",
  await bundleStudio(`local allow = require(script.EditMode).new(
    {IsEdit=function() return true end},
    function() return {EditModeActive=true} end
)
assert(allow(), "The production bundle must include the idle-Edit guard")
return {passed=1,failed=0,failures={}}
`),
);
const relayTests = await readFile("tests/studio-relay.test.luau", "utf8");
await writeFile(
  ".artifacts/studio-handoff-tests.luau",
  `local Handoff = (function()\n${await readFile("plugins/studio/src/Handoff.luau", "utf8")}\nend)()\n${await readFile("tests/studio-handoff.test.luau", "utf8")}`,
);
await writeFile(
  ".artifacts/studio-relay-tests.luau",
  `local Relay = (function()\n${relay}\nend)()\n${relayTests}`,
);

const viewTests = await readFile("tests/studio-view.test.luau", "utf8");
const viewController = await readFile("plugins/studio/src/Plugin.server.luau", "utf8");
const connectionCallbacks = ["showConnection", "betaAccess"].map((name) => {
  const body = viewController.match(new RegExp(`(function actions\\.${name}\\([^\\n]*\\n[\\s\\S]*?\\nend)\\nfunction actions\\.`))?.[1];
  if (!body) throw new Error(`Missing production ${name} callback`);
  return body;
}).join("\n");
await writeFile(
  ".artifacts/studio-view-tests.luau",
  await bundleStudio(
    `local Importer = require(script.Importer)\nlocal Editor = require(script.Editor)\nlocal View = require(script.View)\nlocal makeConnectionActions = function(state, view, actions)\n${connectionCallbacks}\nreturn actions\nend\nlocal fixture = [====[${JSON.stringify(pkg)}]====]\n${viewTests}`,
  ),
);

const selectionTools = await readFile(
  "plugins/studio/src/SelectionTools.luau",
  "utf8",
);
await writeFile(
  ".artifacts/studio-selection-tests.luau",
  `local Tools = (function()\n${selectionTools}\nend)()\n${await readFile("tests/studio-selection.test.luau", "utf8")}`,
);

const editor = await readFile("plugins/studio/src/Editor.luau", "utf8");
// Exercise the real Figma snapshot -> compiler -> Studio conversion boundary.
const context = globalThis as unknown as { figma?: unknown };
const previousFigma = context.figma;
let groupedSettings;
let screenSettings;
try {
  context.figma = { mixed: Symbol("mixed") };
  const design = snapshot(groupedSettingsScene());
  design.children[0].children[0].children[1].rasterBounds = {
    x: 237,
    y: 15,
    width: 38,
    height: 42,
  };
  groupedSettings = compile([design], "group-coordinate-qa", {}, "fixed");
  screenSettings = compile(
    [design],
    "panel-screen-qa",
    { screenSize: [1920, 1080], rootPlacement: "center" },
    "fixed",
  );
} finally {
  if (previousFigma === undefined) delete context.figma;
  else context.figma = previousFigma;
}
await writeFile(
  ".artifacts/grouped-settings.framebridge.json",
  JSON.stringify(groupedSettings),
);
await writeFile(
  ".artifacts/panel-settings.framebridge.json",
  JSON.stringify(screenSettings),
);
await writeFile(
  ".artifacts/studio-group-coordinate-tests.luau",
  `local Editor = (function()\n${editor}\nend)()\nlocal serde = require("@lune/serde")\nlocal package = serde.decode("json", [====[${JSON.stringify(groupedSettings)}]====])\nlocal screenPackage = serde.decode("json", [====[${JSON.stringify(screenSettings)}]====])\n${await readFile("tests/studio-group-coordinates.test.luau", "utf8")}`,
);
await writeFile(
  ".artifacts/studio-layout-conversion-tests.luau",
  `local Importer = (function()\n${importer}\nend)()\nlocal Editor = (function()\n${editor}\nend)()\nlocal fixtures = [====[${JSON.stringify(responsivePackages())}]====]\n${await readFile("tests/studio-layout-conversion.test.luau", "utf8")}`,
);
await writeFile(
  ".artifacts/studio-responsive-tests.luau",
  `local Editor = (function()\n${editor}\nend)()\n${await readFile("tests/studio-responsive.test.luau", "utf8")}`,
);
await writeFile(
  ".artifacts/studio-responsive-native-tests.luau",
  `local Importer = (function()\n${importer}\nend)()\nlocal Editor = (function()\n${editor}\nend)()\n${await readFile("tests/studio-responsive-native.test.luau", "utf8")}`,
);
const controller = (
  await readFile("plugins/studio/src/Plugin.server.luau", "utf8")
).replace('"__FRAMEBRIDGE_RELAY_URL__"', '""');
const controllerPrelude = `local native=PluginManager():CreatePlugin()
local unloading=Instance.new("BindableEvent")
local settings={}
local plugin={Unloading=unloading.Event}
function plugin:GetSetting(key)
    local value=settings[key]
    if value==nil then return nil end
    return game:GetService("HttpService"):JSONDecode(game:GetService("HttpService"):JSONEncode(value))
end
function plugin:SetSetting(key,value) settings[key]=value end
for _,method in ipairs({"CreateToolbar","CreateDockWidgetPluginGuiAsync","CreatePluginAction"}) do
    plugin[method]=function(_,...) return native[method](native,...) end
end
local fixture=[====[${JSON.stringify(pkg)}]====]
`;
await writeFile(
  ".artifacts/studio-controller-tests.luau",
  await bundleStudio(
    controllerPrelude +
      controller +
      "\n" +
      (await readFile("tests/studio-controller.test.luau", "utf8")),
  ),
);

const receiver = await readFile("plugins/studio/src/Receiver.luau", "utf8");
await writeFile(
  ".artifacts/studio-handoff-controller-tests.luau",
  await bundleStudio(
    controllerPrelude +
      controller +
      "\n" +
      (await readFile("tests/studio-handoff-controller.test.luau", "utf8")),
  ),
);
const receiverTests = await readFile("tests/studio-receiver.test.luau", "utf8");
await writeFile(
  ".artifacts/studio-handoff-http-tests.luau",
  await bundleStudio(
    controllerPrelude +
      controller +
      "\n" +
      (await readFile("tests/studio-handoff-http.test.luau", "utf8")),
  ),
);
await writeFile(
  ".artifacts/studio-receiver-tests.luau",
  `local Receiver = (function()\n${receiver}\nend)()\n${receiverTests}`,
);

const importHistory = await readFile(
  "plugins/studio/src/ImportHistory.luau",
  "utf8",
);
const historyTests = await readFile("tests/studio-history.test.luau", "utf8");
await writeFile(
  ".artifacts/studio-history-tests.luau",
  `local serde=require("@lune/serde")\nlocal encodeJson=function(v)return serde.encode("json",v) end\nlocal decodeJson=function(v)return serde.decode("json",v) end\nlocal decodePackage=decodeJson\nlocal fixture=[====[${JSON.stringify(pkg)}]====]\nlocal Editor=(function()\n${editor}\nend)()\nlocal ImportHistory=(function()\n${importHistory}\nend)()\n${historyTests}`,
);
await writeFile(
  ".artifacts/studio-history-native-tests.luau",
  `local Http=game:GetService("HttpService")\nlocal encodeJson=function(v)return Http:JSONEncode(v) end\nlocal decodeJson=function(v)return Http:JSONDecode(v) end\nlocal Importer=(function()\n${importer}\nend)()\nlocal decodePackage=Importer.decode\nlocal fixture=[====[${JSON.stringify(pkg)}]====]\nlocal Editor=(function()\n${editor}\nend)()\nlocal ImportHistory=(function()\n${importHistory}\nend)()\n${historyTests}`,
);
await writeFile(
  ".artifacts/studio-gallery-native-tests.luau",
  `local Importer=(function()\n${importer}\nend)()\nlocal AssetGallery=(function()\n${await readFile("plugins/studio/src/AssetGallery.luau", "utf8")}\nend)()\n${await readFile("tests/studio-gallery.test.luau", "utf8")}`,
);
