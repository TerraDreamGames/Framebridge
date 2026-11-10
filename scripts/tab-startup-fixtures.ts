import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import {
  BEHAVIOR_RUNTIME,
  BEHAVIOR_CLIENT_SOURCE,
  THEMED_BEHAVIOR_CLIENT_SOURCE,
  PARTICLE_BEHAVIOR_CLIENT_SOURCE,
  THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE,
  behaviorModuleSource,
} from "../packages/core/src/behavior-runtime.mjs";

const output = ".artifacts/tab-startup-order";
await mkdir(output, { recursive: true, mode: 0o700 });
const sources = {
  "runtime.luau": BEHAVIOR_RUNTIME,
  ...Object.fromEntries(
    [BEHAVIOR_CLIENT_SOURCE, THEMED_BEHAVIOR_CLIENT_SOURCE,
      PARTICLE_BEHAVIOR_CLIENT_SOURCE, THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE]
      .map((source, index) => [`client-${index}.luau`, behaviorModuleSource(source)]),
  ),
};
const files = [];
for (const [name, source] of Object.entries(sources)) {
  await writeFile(`${output}/${name}`, source, { mode: 0o600 });
  files.push({ name, bytes: Buffer.byteLength(source), sha256: createHash("sha256").update(source).digest("hex") });
}
await writeFile(`${output}/manifest.json`, JSON.stringify({
  files,
  scope: "Trusted runtime registration-order regressions with simulated signals; no native UI acceptance",
  installedStartupAccepted: false,
}, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ output, files }));
