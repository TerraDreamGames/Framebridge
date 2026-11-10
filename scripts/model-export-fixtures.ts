import { mkdir, writeFile, readFile } from "node:fs/promises";
import { modelPackages } from "../tests/model-export-fixtures";
import { generateModel } from "../packages/core/src/model-export";
import { quoteLuau } from "../packages/core/src/source-code";
import { flatten, type TransferPackage } from "../packages/core/src/types";
import { ruleActions } from "../packages/core/src/conditional-rules";
import {
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_BOOTSTRAP_SOURCE,
  behaviorModuleSource,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";

const output = ".artifacts/model-export";
await mkdir(output, { recursive: true });
await writeFile(
  `${output}/runtime-version.json`,
  JSON.stringify(BEHAVIOR_VERSION),
);
const cases = modelPackages();
await writeFile(`${output}/generated-runtime.luau`, BEHAVIOR_BOOTSTRAP_SOURCE);
await writeFile(
  `${output}/generated-runtime-module.luau`,
  behaviorModuleSource(BEHAVIOR_CLIENT_SOURCE),
);
for (const [name, pkg] of Object.entries(cases)) {
  await writeFile(`${output}/${name}.rbxmx`, generateModel(pkg));
  await writeFile(`${output}/${name}.json`, JSON.stringify(pkg));
}
await writeFile(`${output}/manifest.json`, JSON.stringify(Object.keys(cases)));
const combined: TransferPackage = {
  ...structuredClone(cases.demo),
  sourceId: "framebridge-model-export-native-acceptance",
  name: "Framebridge Model Export Acceptance",
  roots: [],
  assets: [],
  issues: [],
};
for (const [name, original] of Object.entries(cases)) {
  const pkg = structuredClone(original);
  for (const asset of pkg.assets) {
    asset.id = name + "/" + asset.id;
    combined.assets.push(asset);
  }
  for (const entry of flatten(pkg.roots)) {
    entry.id = name + "/" + entry.id;
    if (entry.maskBasis) entry.maskBasis = name + "/" + entry.maskBasis;
    if (entry.textDecoration?.captured)
      entry.textDecoration.captured =
        name + "/" + entry.textDecoration.captured;
    if (entry.textDecoration?.themeShadow)
      entry.textDecoration.themeShadow =
        name + "/" + entry.textDecoration.themeShadow;
    if (entry.behavior?.action)
      entry.behavior.action.target = name + "/" + entry.behavior.action.target;
    for (const rule of entry.behavior?.rules ?? [])
      for (const action of ruleActions(rule))
        action.target = name + "/" + action.target;
    if (entry.behavior?.state)
      entry.behavior.state.owner = name + "/" + entry.behavior.state.owner;
    if (entry.behavior?.motion?.owner)
      entry.behavior.motion.owner = name + "/" + entry.behavior.motion.owner;
    if (entry.behavior?.motion?.slot)
      entry.behavior.motion.slot = name + "/" + entry.behavior.motion.slot;
    if (entry.assetRef) entry.assetRef = name + "/" + entry.assetRef;
    if (entry.assetBindings)
      for (const key of Object.keys(
        entry.assetBindings,
      ) as (keyof typeof entry.assetBindings)[])
        entry.assetBindings[key] = name + "/" + entry.assetBindings[key];
  }
  for (const root of pkg.roots) root.name = name + " / " + root.name;
  combined.roots.push(...pkg.roots);
}
const xml = generateModel(combined);
// A test-only folder makes one native Insert from File operation easy to clean up.
const fixtureXml = xml
  .replace(
    '  <Meta name="ExplicitAutoJoints">true</Meta>',
    '  <Meta name="ExplicitAutoJoints">true</Meta>\n  <Item class="Folder" referent="AcceptanceFolder"><Properties><string name="Name">Framebridge Model Export Acceptance</string></Properties>',
  )
  .replace("</roblox>", "  </Item>\n</roblox>");
await writeFile(`${output}/Acceptance.rbxmx`, fixtureXml);
await writeFile(`${output}/Acceptance.json`, JSON.stringify(combined));
const entry =
  `local modelPackage = game:GetService("HttpService"):JSONDecode(${quoteLuau(JSON.stringify(combined))})\n` +
  (await readFile("tests/studio-model-export.test.luau", "utf8")).replace(
    "local Importer = require(script.Importer)",
    "",
  );
const importer = await readFile("plugins/studio/src/Importer.luau", "utf8");
await writeFile(
  `${output}/native.luau`,
  `local Importer = (function()\n${importer}\nend)()\nlocal BehaviorSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\n${entry}`,
);
console.log(
  `Prepared ${Object.keys(cases).length} models; ${flatten(combined.roots).length} native acceptance instances.`,
);
