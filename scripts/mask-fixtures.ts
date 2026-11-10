import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compile } from "../packages/core/src/compiler";
import { flatten } from "../packages/core/src/types";
import { quoteLuau } from "../packages/core/src/source-code";
import { maskDesign, maskPackages } from "../tests/mask-fixtures";
import { maskResizeDesign } from "../tests/mask-resize-fixtures";
import {
  BEHAVIOR_VERSION,
  BEHAVIOR_CLIENT_SOURCE,
} from "../packages/core/src/behavior-runtime.mjs";
const cases = maskPackages();
const changed = maskDesign();
const mask = changed.children[0].children[1];
mask.transform = [
  [1, 0, 50],
  [0, 1, 60],
];
mask.width = 110;
mask.radius = 12;
const updated = compile([changed], "mask-qa-rounded", {}, "fixed");
await mkdir(".artifacts/masks", { recursive: true });
for (const [name, pkg] of Object.entries(cases))
  await writeFile(`.artifacts/masks/${name}.json`, JSON.stringify(pkg));
const header = `local Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal fixtures=${quoteLuau(JSON.stringify(cases))}\nlocal updatedFixture=${quoteLuau(JSON.stringify(updated))}\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\n`;
await writeFile(
  ".artifacts/masks/native-tests.luau",
  header + (await readFile("tests/studio-masks.test.luau", "utf8")),
);
await writeFile(
  ".artifacts/masks/play-setup.luau",
  header + (await readFile("tests/studio-mask-play.setup.luau", "utf8")),
);
const designs = [maskDesign(), maskDesign("circle"), maskDesign("scroll")];
const responsive = maskResizeDesign("STRETCH", "SCALE");
function renameResponsive(node: typeof responsive) {
  node.id = node.id.replace(/^rounded:/, "responsive:");
  node.children.forEach(renameResponsive);
}
renameResponsive(responsive);
responsive.name = "Responsive mask · resize preview";
designs.push(responsive);
function sourceSvg(kind: string) {
  const shape =
    kind === "circle"
      ? '<circle cx="70" cy="70" r="50"/>'
      : kind === "scroll"
        ? '<rect width="200" height="140" rx="24"/>'
        : '<rect x="20" y="20" width="160" height="100" rx="24"/>';
  const content =
    kind === "scroll"
      ? Array.from(
          { length: 12 },
          (_, i) =>
            `<g transform="translate(8 ${8 + i * 36})"><rect width="184" height="28" rx="4" fill="#264d8c"/><text x="8" y="18" fill="white" font-size="14">Quest ${i + 1}</text></g>`,
        ).join("")
      : kind === "responsive" ? '<g transform="translate(44 35)"><rect width="100" height="70" fill="#e6591a"/><text x="24" y="48" fill="white" font-size="14">Find shelter</text></g>' : '<rect width="240" height="160" fill="#e6591a"/><text x="24" y="48" fill="white" font-size="14">Find shelter</text>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><clipPath id="mask">${shape}</clipPath></defs><rect width="320" height="240" fill="#141a24"/><g transform="translate(30 40)"><rect width="12" height="12" fill="#00ff00"/><g clip-path="url(#mask)">${content}</g></g></svg>`;
}
const data = {
  designs,
  package: compile(
    designs,
    "synthetic-mask-preview",
    { layout: "responsive" },
    "fixed",
  ),
  previews: Object.fromEntries(
    designs.map((d) => [
      d.id,
      `data:image/svg+xml;base64,${Buffer.from(sourceSvg(d.id.split(":")[0])).toString("base64")}`,
    ]),
  ),
  assets: {},
  revision: 1,
};
await writeFile(
  ".artifacts/masks/preview.json",
  JSON.stringify({
    data,
    selected: designs.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      width: d.width,
      height: d.height,
      layers: flatten(data.package.roots).length,
    })),
  }),
);
if (process.argv.includes("--browser"))
  await writeFile(
    ".artifacts/masks/browser-native.luau",
    header +
      `local browserFixture=${quoteLuau(await readFile(".artifacts/masks/browser-export.json", "utf8"))}\n` +
      (await readFile("tests/studio-mask-browser.test.luau", "utf8")),
  );
console.log(
  `Prepared ${Object.keys(cases).length} synthetic mask packages; fresh actual Figma visual acceptance remains pending.`,
);
