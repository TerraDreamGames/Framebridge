import { mkdir, readFile, writeFile } from "node:fs/promises";
import { interactionExampleDesign } from "../packages/core/src/interaction-examples";
import { compile } from "../packages/core/src/compiler";
import { MOTION_DEFAULTS } from "../packages/core/src/motion";
import { node } from "../packages/core/src/demo";
import { encode } from "fast-png";
import { flatten } from "../packages/core/src/types";
import {
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_RUNTIME,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
import { quoteLuau } from "../packages/core/src/source-code";
const presets = structuredClone(MOTION_DEFAULTS);
const designs = interactionExampleDesign();
designs[0].children.push(
  node("Idle movement", {
    id: "idle",
    width: 100,
    height: 36,
    transform: [
      [1, 0, 300],
      [0, 1, 430],
    ],
    fills: [{ type: "SOLID", color: { r: 0.4, g: 0.6, b: 0.9 } }],
  }),
);
designs[0].children.push(
  node("Pattern", {
    id: "pattern",
    type: "RECTANGLE",
    width: 100,
    height: 36,
    transform: [
      [1, 0, 420],
      [0, 1, 430],
    ],
    fills: [{ type: "IMAGE", imageHash: "motion-test-pattern" }],
  }),
);
const overrides = {
  open: {
    behavior: {
      action: { kind: "open" as const, target: "shop" },
      motion: {
        hover: { ...presets.hover, lift: 8, rotation: -5 },
        press: presets.press,
        shine: presets.shine,
        sounds: { volume: 0 },
      },
    },
  },
  shop: {
    behavior: {
      role: "panel" as const,
      initialVisible: false,
      motion: { enter: { ...presets.enter, kind: "slide" as const } },
    },
  },
  inventory: {
    behavior: { role: "panel" as const, motion: { float: presets.float } },
  },
  settings: {
    behavior: { role: "panel" as const, motion: { pulse: presets.pulse } },
  },
  coins: {
    behavior: {
      binding: {
        source: "leaderstats" as const,
        key: "Coins",
        template: "Coins: {value}",
      },
      motion: { enter: presets.enter },
    },
    properties: { TextTransparency: 0.2 },
  },
  idle: {
    behavior: {
      motion: {
        float: presets.float,
        spin: presets.spin,
        pulse: presets.pulse,
      },
    },
  },
  pattern: {
    className: "ImageLabel",
    properties: {
      ScaleType: {
        type: "Enum" as const,
        value: ["ScaleType", "Tile"] as [string, string],
      },
      TileSize: { type: "UDim2" as const, value: [0, 24, 0, 24] },
      ImageTransparency: 0.25,
    },
    behavior: { motion: { drift: presets.drift } },
  },
};
const pkg = compile(designs, "motion-fixture", {
  layout: "responsive",
  layerOverrides: overrides,
});
for (const asset of pkg.assets) asset.robloxId = "123";
if (pkg.issues.some((i) => i.severity === "error"))
  throw new Error(JSON.stringify(pkg.issues));
const noMotionOverrides = structuredClone(overrides);
delete (noMotionOverrides.open.behavior as { motion?: unknown }).motion;
const baseline = compile(designs, "motion-fixture", {
  layout: "responsive",
  layerOverrides: noMotionOverrides,
});
for (const asset of baseline.assets) asset.robloxId = "123";
const pixels = new Uint8Array(24 * 24 * 4);
for (let y = 0; y < 24; y++)
  for (let x = 0; x < 24; x++) {
    const i = (y * 24 + x) * 4;
    const light = x < 12 === y < 12;
    pixels.set(light ? [69, 130, 235, 255] : [23, 39, 74, 255], i);
  }
const bytes = Array.from(
  encode({ width: 24, height: 24, data: pixels, depth: 8, channels: 4 }),
);
const output = ".artifacts/motion-presets";
await mkdir(output, { recursive: true });
await writeFile(
  `${output}/design.framebridge.json`,
  JSON.stringify(pkg, null, 2),
);
await writeFile(
  `${output}/preview.json`,
  JSON.stringify({
    data: {
      designs,
      package: pkg,
      assets: Object.fromEntries(pkg.assets.map((asset) => [asset.id, bytes])),
      previews: {},
      revision: 1,
    },
    selected: designs.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      width: n.width,
      height: n.height,
      layers: pkg.stats.layers,
    })),
    overrides,
  }),
);
await writeFile(`${output}/runtime.luau`, BEHAVIOR_RUNTIME);
await writeFile(
  `${output}/native.luau`,
  `assert(game.PlaceId==0,"Blank QA only")\nlocal Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Runtime=(function()\n${BEHAVIOR_RUNTIME}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\nlocal fixture=${quoteLuau(JSON.stringify(pkg))}\nlocal baselineFixture=${quoteLuau(JSON.stringify(baseline))}\n${await readFile("tests/studio-motion.test.luau", "utf8")}`,
);
console.log(
  `${flatten(pkg.roots).length} motion fixture instances and native checks prepared.`,
);

// Real Play verification keeps all test interfaces in the disposable blank place.
const { responsiveDesigns } =
  await import("../tests/responsive-layout-fixtures");
const layoutPkgs = Object.entries(responsiveDesigns)
  .filter(([name]) => ["hug", "flex", "wrap", "textHug"].includes(name))
  .map(([name, design]) =>
    compile([design], `motion-layout-${name}`, {
      layout: "responsive",
      layerOverrides:
        name === "hug"
          ? {
              panel: {
                behavior: {
                  motion: { hover: { ...presets.hover, scale: 1.2 } },
                },
              },
            }
          : name === "flex"
            ? {
                grow1: {
                  behavior: {
                    motion: { hover: { ...presets.hover, scale: 1.2 } },
                  },
                },
                grow2: { behavior: { motion: { press: presets.press } } },
              }
            : name === "wrap"
              ? {
                  cell0: {
                    behavior: {
                      motion: { hover: { ...presets.hover, scale: 1.2 } },
                    },
                  },
                }
              : {
                  label: {
                    behavior: {
                      motion: { hover: { ...presets.hover, scale: 1.2 } },
                    },
                  },
                },
    }),
  );
await writeFile(
  `${output}/play-setup.luau`,
  `assert(game.PlaceId==0,"Blank QA only")\nlocal Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\nlocal packages=game:GetService("HttpService"):JSONDecode(${quoteLuau(JSON.stringify([pkg, ...layoutPkgs]))})\nlocal names={}\nfor index,pkg in ipairs(packages) do\nlocal name=index==1 and "FramebridgeMotionQA" or "FramebridgeMotionLayoutQA"..tostring(index)\nassert(not game:GetService("StarterGui"):FindFirstChild(name),"QA fixture exists")\nlocal stage=Importer.stage(pkg,{},false,runtimeSource)\nlocal roots=Importer.apply(stage,pkg,game:GetService("StarterGui"),false)\nroots[1].Name=name; roots[1].DisplayOrder=index==1 and 10 or 0; roots[1]:SetAttribute("FramebridgeMotionQA",true)\ntable.insert(names,name)\nend\nreturn names`,
);

try {
  const exported = await readFile(`${output}/browser-export.json`, "utf8");
  await writeFile(
    `${output}/browser-native.luau`,
    `assert(game.PlaceId==0,"Blank QA only")\nlocal Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Runtime=(function()\n${BEHAVIOR_RUNTIME}\nend)()\nlocal pkg=Importer.decode(${quoteLuau(exported)})\nlocal stage=Importer.stage(pkg,{},true,{version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}})\nlocal controller=Runtime.mount(stage.roots[1],{manualMotion=true,reducedMotion=false})\nlocal ok,why=pcall(function()\nlocal button=stage.byId.open.instance\nbutton:SetAttribute("FramebridgeState","hover");controller.stepMotion(1)\nassert(button.Position.Y.Offset==-16 and button.Rotation==-5,"Configured motion did not reach native properties")\nassert(controller.activate("open") and stage.byId.shop.instance.Visible and stage.byId["shop/motion-slot"].instance.Visible)\ncontroller.stepMotion(0.3);assert(stage.byId.shop.instance.BackgroundTransparency==0)\nend)\ncontroller.destroy();Importer.destroy(stage);assert(ok,why)\nreturn {browserExportImported=true,configuredLift=16,action=true,cleanup=controller.connectionCount()==0}`,
  );
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

await writeFile(
  `${output}/play-checks.luau`,
  await readFile("tests/studio-motion-play.test.luau", "utf8"),
);
await mkdir("examples/motion", { recursive: true });
const example = structuredClone(pkg);
example.sourceId = "framebridge-example:motion";
example.createdAt = "2026-10-03T00:00:00Z";
await writeFile(
  "examples/motion/panels-idle-texture.framebridge.json",
  JSON.stringify(example, null, 2),
);
