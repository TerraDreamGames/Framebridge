import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compile } from "../packages/core/src/compiler";
import { quoteLuau } from "../packages/core/src/source-code";
import { realRepeatDesigns, repeatPackages } from "../tests/repeat-fixtures";
import {
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
const cases = repeatPackages();
const expected = [
  [
    [0, 0],
    [30, 0],
    [60, 0],
  ],
  [
    [0, 0],
    [30, 0],
    [60, 0],
  ],
  [
    [0, 0],
    [30, 0],
  ],
  [
    [0, 0],
    [40, 20],
    [75, 0],
    [115, 20],
    [150, 0],
    [190, 20],
  ],
  [
    [0, 0],
    [30, 0],
    [60, 0],
    [0, 25],
    [30, 25],
    [60, 25],
  ],
];
const fixtures = realRepeatDesigns.map((design, index) => ({
  name: design.name,
  groupId: design.children[0].id,
  itemId: design.children[0].children[0].id,
  width: design.children[0].width,
  height: design.children[0].height,
  expected: expected[index],
  package: Object.values(cases)[index],
}));
const changed = structuredClone(realRepeatDesigns[0]);
changed.children[0].transformModifiers![0].count = 4;
changed.children[0].transformModifiers![0].offset = 40;
changed.children[0].width = 140;
const updated = compile([changed], "real-figma-repeat-0", {}, "fixed");
await mkdir(".artifacts/repeats", { recursive: true });
const renders = JSON.parse(
  await readFile("tests/fixtures/native-repeats.svg.json", "utf8"),
) as { id: string; svg: string }[];
const layerCount = (design: (typeof realRepeatDesigns)[number]): number =>
  1 + design.children.reduce((count, child) => count + layerCount(child), 0);
await writeFile(
  ".artifacts/repeats/preview.json",
  JSON.stringify({
    data: {
      designs: realRepeatDesigns,
      package: compile(realRepeatDesigns, "native-repeat-preview", {}, "fixed"),
      previews: Object.fromEntries(
        renders.map((render) => [
          render.id,
          `data:image/svg+xml;base64,${Buffer.from(render.svg).toString("base64")}`,
        ]),
      ),
      assets: {},
      revision: 1,
    },
    selected: realRepeatDesigns.map((design) => ({
      id: design.id,
      name: design.name,
      type: design.type,
      width: design.width,
      height: design.height,
      layers: layerCount(design),
    })),
  }),
);
for (const [name, pkg] of Object.entries(cases))
  await writeFile(`.artifacts/repeats/${name}.json`, JSON.stringify(pkg));
const header = `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal fixtures=${quoteLuau(JSON.stringify(fixtures))}\nlocal updatedFixture=${quoteLuau(JSON.stringify(updated))}\nlocal interactiveFixture=${quoteLuau(JSON.stringify(cases.repeatInteractive))}\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\n`;
await writeFile(
  ".artifacts/repeats/native-tests.luau",
  header + (await readFile("tests/studio-repeats.test.luau", "utf8")),
);
await writeFile(
  ".artifacts/repeats/play-setup.luau",
  header + (await readFile("tests/studio-repeat-play.setup.luau", "utf8")),
);
if (process.argv.includes("--browser"))
  await writeFile(
    ".artifacts/repeats/browser-native.luau",
    header +
      `local browserFixture=${quoteLuau(await readFile(".artifacts/repeats/browser-export.json", "utf8"))}\n` +
      (await readFile("tests/studio-repeat-browser.test.luau", "utf8")),
  );
