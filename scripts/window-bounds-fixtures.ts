import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ADVANCED_CONTROLS_RUNTIME } from "../packages/core/src/advanced-controls-runtime.mjs";
import { BEHAVIOR_RUNTIME } from "../packages/core/src/behavior-runtime.mjs";

const output = process.argv[2] ?? ".artifacts/window-bounds";
await mkdir(output, { recursive: true, mode: 0o700 });
const files = {
  "controls-runtime.luau": ADVANCED_CONTROLS_RUNTIME,
  "native.luau": `local Runtime=(function()\n${BEHAVIOR_RUNTIME}\nend)()\n${await readFile("tests/studio-window-bounds.test.luau", "utf8")}`,
};
const manifest = [];
for (const [name, source] of Object.entries(files)) {
  await writeFile(`${output}/${name}`, source, { mode: 0o600 });
  manifest.push({
    name,
    bytes: Buffer.byteLength(source),
    utf16: source.length,
    sha256: createHash("sha256").update(source).digest("hex"),
  });
}
await writeFile(
  `${output}/manifest.json`,
  JSON.stringify(
    {
      files: manifest,
      scope: "Independent controller/native geometry preparation; no UI or provider work",
      nativePointerAccepted: false,
      playSafeInsetAccepted: false,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify({ output, files: manifest }));
