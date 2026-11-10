import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { editorRuntimeFixture } from "../tests/editor-runtime-fixtures";
import { buildExport } from "../packages/core/src/export";
import { generateModel } from "../packages/core/src/model-export";
import { quoteLuau } from "../packages/core/src/source-code";
import {
  BEHAVIOR_RUNTIME,
  BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";
import { validateExportPackage } from "../packages/core/src/export-package";

const args = process.argv.slice(2),
  option = (key: string) => {
    const i = args.indexOf(key);
    return i >= 0 ? args[i + 1] : undefined;
  };
const output = resolve(
  option("--output") ?? ".artifacts/editor-runtime-acceptance",
);
const idsFile = option("--asset-ids"),
  mockBindings = args.includes("--test-bindings");
if (idsFile && mockBindings)
  throw new Error(
    "Choose real asset IDs or isolated static test bindings, never both",
  );
const ids: Record<string, string> = idsFile
  ? JSON.parse(await readFile(idsFile, "utf8"))
  : mockBindings
    ? Object.fromEntries(
        editorRuntimeFixture().package.assets.map((a, i) => [
          a.id,
          String(300000000 + i),
        ]),
      )
    : {};
const result = editorRuntimeFixture(ids);
validateExportPackage(result.package);
if (idsFile) {
  for (const a of result.package.assets)
    if (!a.robloxId) throw new Error(`Missing linked ID for ${a.id}`);
}
await mkdir(output, { recursive: true, mode: 0o700 });
await chmod(output, 0o700);
await mkdir(`${output}/images`, { recursive: true, mode: 0o700 });
const entries: Record<string, { bytes: number; sha256: string }> = {};
async function save(name: string, data: string | Uint8Array) {
  await writeFile(`${output}/${name}`, data, { mode: 0o600 });
  await chmod(`${output}/${name}`, 0o600);
  const bytes = typeof data === "string" ? Buffer.from(data) : data;
  entries[name] = {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const mapping = [];
for (const asset of result.package.assets) {
  await save(
    `images/${asset.filename}`,
    new Uint8Array(result.assets[asset.id]),
  );
  mapping.push({
    id: asset.id,
    nodeId: asset.nodeId,
    filename: asset.filename,
    pixelSize: asset.pixelSize,
    robloxId: asset.robloxId ?? null,
    ...entries[`images/${asset.filename}`],
  });
}
await save("assets.json", JSON.stringify(mapping, null, 2) + "\n");
await save(
  "editor.framebridge.json",
  JSON.stringify(result.package, null, 2) + "\n",
);
await save("editor.framebridge.zip", buildExport(result).data);
if (idsFile || mockBindings)
  await save("Editor.rbxmx", generateModel(result.package));
const imports = (
  await Promise.all(
    ["Importer", "Editor"].map(
      async (name) =>
        `local ${name}=(function()\n${await readFile(`plugins/studio/src/${name}.luau`, "utf8")}\nend)()\n`,
    ),
  )
).join("");
const harness =
  `assert(not ${mockBindings},"Static test bindings cannot execute in native Studio")\n` +
  imports +
  `local Runtime=(function()\n${BEHAVIOR_RUNTIME}\nend)()\nlocal runtimeSource={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)}}\nlocal packageJson=${quoteLuau(JSON.stringify(result.package))}\n` +
  (await readFile("tests/studio-editor-runtime-acceptance.luau", "utf8"));
await save("native.luau", harness);
await save(
  "syntax.luau",
  `local fs=require("@lune/fs")\nlocal source=fs.readFile(${quoteLuau(output + "/native.luau")})\nlocal compiled,why=loadstring(source);assert(compiled,why)\nprint("Combined editor native harness compiles; no native execution")\n`,
);
if (idsFile || mockBindings)
  await save(
    "model-readback.luau",
    `local qaOutput=${quoteLuau(output)}\n` +
      (await readFile("tests/editor-runtime-model-readback.luau", "utf8")),
  );
await save(
  "README.txt",
  `Private QA only: Place79318715690547. No upload or live API operation is performed by this generator.\n1. Upload exactly the seven PNGs in assets.json; store {assetIdentity:actualRobloxId} in a private JSON file.\n2. Regenerate with --asset-ids /absolute/path/to/ids.json. These IDs are public asset references, not credentials.\n3. Root: execute native.luau prefixed with local qaPhase="setup" in stopped Edit.\n4. Start ordinary Play. Root: execute prefixed local qaPhase="check" on Client. Capture report and actual client screenshot.\n5. Compare screenshot nine-slice sample points/colors from pixelOracle; a Lua IsLoaded assertion alone does not prove those pixels.\n6. Stop Play. Root: execute prefixed local qaPhase="cleanup" in original Edit process. Verify exact original root references/custom Source/Disabled and Selection boundary.\nNo pairing, beta/OAuth credentials, publishing, HTTP setting, history reset or existing-root update is touched.\nImage UI rendering, physical input, installed-plugin control invocation and published-player remain separate scopes.\n`,
);
await save(
  "manifest.json",
  JSON.stringify(
    {
      schema: "framebridge-editor-runtime-acceptance-preparation-v1",
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      preparedAt: new Date().toISOString(),
      linked: !!idsFile,
      mockBindings,
      assets: 7,
      entries,
      sourcePins: Object.fromEntries(
        await Promise.all(
          [
            "plugins/studio/src/Importer.luau",
            "plugins/studio/src/Editor.luau",
            "packages/core/src/behavior-runtime.mjs",
            "packages/core/src/advanced-controls-runtime.mjs",
          ].map(async (p) => [
            p,
            createHash("sha256")
              .update(await readFile(p))
              .digest("hex"),
          ]),
        ),
      ),
      nativeExecuted: false,
      uploadedPixelsAccepted: false,
      publishedPlayerAccepted: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    output,
    assets: 7,
    linked: !!idsFile,
    nativeExecuted: false,
  }),
);
