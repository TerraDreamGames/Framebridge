import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { connectionBuildSettings } from "./connection-build.mjs";
import {
  buildStudioProject,
  configuredStudioEntry,
  prepareStudioProject,
  rojoBinary,
} from "./studio-project.mjs";

const { relayUrl, privateBeta } = connectionBuildSettings(
  JSON.parse(await readFile("framebridge.config.json", "utf8")),
  process.env,
  process.argv,
);
const entry = await configuredStudioEntry(relayUrl, privateBeta);
if (process.argv.includes("--prepare") || process.argv.includes("--serve")) {
  await prepareStudioProject(entry);
  console.log(
    "Prepared plugins/studio/default.project.json and readable runtime sources.",
  );
  if (process.argv.includes("--serve")) {
    const server = spawn(
      await rojoBinary(),
      ["serve", "plugins/studio/serve.project.json"],
      { stdio: "inherit" },
    );
    const stop = () => server.kill("SIGINT");
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      const [code] = await once(server, "close");
      process.exitCode = code ?? 1;
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
  }
} else {
  await buildStudioProject(entry);
  console.log("Built dist/studio/Framebridge.rbxmx with native ModuleScripts.");
}
