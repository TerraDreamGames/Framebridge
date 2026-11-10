import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  devicePreviewDesign,
  devicePreviewOverrides,
  devicePreviewPackage,
} from "../tests/device-preview-fixture";
import { demoSvg } from "../packages/core/src/demo";
import { quoteLuau } from "../packages/core/src/source-code";
import {
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
const designs = devicePreviewDesign();
const pkg = devicePreviewPackage();
pkg.createdAt = "2026-10-03T00:00:00Z";
if (pkg.issues.some((issue) => issue.severity === "error"))
  throw new Error(JSON.stringify(pkg.issues));
await mkdir(".artifacts/device-preview", { recursive: true });
await mkdir("examples/responsive", { recursive: true });
await writeFile(
  "examples/responsive/inventory.framebridge.json",
  JSON.stringify(pkg, null, 2),
);
await writeFile(
  ".artifacts/device-preview/preview.json",
  JSON.stringify({
    data: {
      designs,
      package: pkg,
      assets: {},
      revision: 1,
      previews: {
        [designs[0].id]:
          `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoSvg(designs))}`,
      },
    },
    selected: designs.map((design) => ({
      id: design.id,
      name: design.name,
      type: design.type,
      width: design.width,
      height: design.height,
      layers: pkg.stats.layers,
    })),
    overrides: devicePreviewOverrides,
  }),
);
console.log(
  "Responsive inventory example and device-preview fixture prepared.",
);

let nativePackage = JSON.stringify(pkg);
try {
  nativePackage = await readFile(
    ".artifacts/device-preview/browser-export.json",
    "utf8",
  );
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
await writeFile(
  ".artifacts/device-preview/play-setup.luau",
  `
assert(game.PlaceId == 0, "Blank QA only")
local parent = game:GetService("StarterGui")
assert(not parent:FindFirstChild("FramebridgeDevicePreviewQA"), "Device QA fixture already exists")
local Importer = (function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()
local pkg = Importer.decode(${quoteLuau(nativePackage)})
assert(pkg.roots[1].referenceSize[1] == 1024 and pkg.roots[1].referenceSize[2] == 768)
local staged = Importer.stage(pkg, {}, false, {version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}})
local roots = Importer.apply(staged, pkg, parent, false)
roots[1].Name = "FramebridgeDevicePreviewQA"
roots[1]:SetAttribute("FramebridgeDevicePreviewQA", true)
return {imported=true, assets=#pkg.assets, originalCanvas=pkg.roots[1].referenceSize}
`,
);
await writeFile(
  ".artifacts/device-preview/play-checks.luau",
  await readFile("tests/studio-device-preview.test.luau", "utf8"),
);
