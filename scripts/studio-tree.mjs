import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { MASK_LAYOUT_RUNTIME } from "../packages/core/src/mask-layout-runtime.mjs";
import { TEXT_DECORATION_RUNTIME } from "../packages/core/src/text-decoration-runtime.mjs";
import {
  BEHAVIOR_CLIENT_SOURCE,
  THEMED_BEHAVIOR_CLIENT_SOURCE,
  PARTICLE_BEHAVIOR_CLIENT_SOURCE,
  THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_VERSION,
} from "../packages/core/src/behavior-runtime.mjs";

export const STUDIO_MODULES = Object.freeze([
  "Importer",
  "Cleanup",
  "Relay",
  "ConnectionStorage",
  "Handoff",
  "ConnectionLifetime",
  "EditMode",
  "PlayConnection",
  "PlayConnectionView",
  "Receiver",
  "Editor",
  "View",
  "Components",
  "Clipboard",
  "Brand",
  "SelectionTools",
  "ClassTools",
  "WorldTools",
  "CommandTools",
  "CommandPalette",
  "ImportHistory",
  "AssetGallery",
]);

// These templates become game scripts after import. Keep their source legible
// instead of encoding thousands of lines in one escaped string literal.
export function sourceTemplate(source) {
  let equals = "=";
  while (source.includes(`]${equals}]`)) equals += "=";
  return `-- Trusted Framebridge game-runtime template; exported as source, never evaluated here.\nreturn [${equals}[\n${source}]${equals}]\n`;
}

function runtimeTemplate(name, source) {
  // Split at complete lines, well below Studio's 200,000-character assignment
  // limit. Concatenation restores the exact trusted source, including newlines.
  const parts = [];
  let part = "";
  for (const line of source.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    if (Buffer.byteLength(line) > 60_000)
      throw new Error(`Runtime template has an oversized line: ${name}`);
    if (Buffer.byteLength(part + line) > 60_000) {
      parts.push(part);
      part = "";
    }
    part += line;
  }
  if (part) parts.push(part);
  const children = parts.map((part, index) => ({
    name: `Part${String(index + 1).padStart(2, "0")}`,
    className: "ModuleScript",
    source: sourceTemplate(part),
    children: [],
  }));
  return {
    name,
    className: "ModuleScript",
    children,
    source: `-- Reassemble the readable game-runtime source parts in order.\nreturn table.concat({\n${children.map((child) => `    require(script.${child.name}),`).join("\n")}\n})\n`,
  };
}

export async function loadStudioTree(entrySource, extraModules = []) {
  const notices = await Promise.all(
    [
      "LICENSE",
      "docs/licenses/React-Lua.txt",
      "docs/licenses/React-Lua-dependencies.txt",
      "docs/licenses/Codify.txt",
    ].map((path) => readFile(path, "utf8")),
  );
  const licenseComments = notices
    .join("\n\n")
    .split(/\r?\n/)
    .map((line) => `-- ${line}`)
    .join("\n");
  const vendor = await readFile(
    "plugins/studio/vendor/react-lua-17.2.1.json.gz",
  );
  if (
    createHash("sha256").update(vendor).digest("hex") !==
    "72a6665e75719dc94e51738b883ec167db1f2227ab326102106dbdcbe31434c6"
  )
    throw new Error(
      "React Lua vendor snapshot changed; review upstream provenance and dependency notices before updating its pinned hash.",
    );
  const runtime = JSON.parse(gunzipSync(vendor).toString());
  const module = (name, source) => ({
    name,
    className: "ModuleScript",
    source,
    children: [],
  });
  const modules = await Promise.all(
    STUDIO_MODULES.map(async (name) =>
      module(name, await readFile(`plugins/studio/src/${name}.luau`, "utf8")),
    ),
  );
  return {
    name: "Framebridge",
    className: "Script",
    source: `${licenseComments}\n\n${entrySource}`,
    children: [
      ...modules,
      module("MaskLayout", MASK_LAYOUT_RUNTIME),
      module("TextDecoration", TEXT_DECORATION_RUNTIME),
      module(
        "BehaviorSource",
        `-- Select an inspectable, trusted runtime template for imported UI.\nlocal Templates = script.Parent.BehaviorSources\nreturn {\n    version = ${JSON.stringify(BEHAVIOR_VERSION)},\n    source = require(Templates.Base),\n    themeSource = require(Templates.Themed),\n    particleSource = require(Templates.Particle),\n    themeParticleSource = require(Templates.ThemedParticle),\n}\n`,
      ),
      {
        name: "BehaviorSources",
        className: "Folder",
        children: [
          runtimeTemplate("Base", BEHAVIOR_CLIENT_SOURCE),
          runtimeTemplate("Themed", THEMED_BEHAVIOR_CLIENT_SOURCE),
          runtimeTemplate("Particle", PARTICLE_BEHAVIOR_CLIENT_SOURCE),
          runtimeTemplate(
            "ThemedParticle",
            THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE,
          ),
        ],
      },
      ...runtime,
      ...extraModules,
    ],
  };
}
