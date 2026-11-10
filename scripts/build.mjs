import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import {
  RELEASE_GUIDES,
  RELEASE_NOTICES,
  sourceExamplePaths,
  relocateMarkdownLinks,
  checkReleaseBundle,
} from "./check-release-bundle.mjs";
import { shadcnStyles } from "./shadcn-styles.mjs";
import {
  buildStudioProject,
  configuredStudioEntry,
} from "./studio-project.mjs";
import { FIGMA_CONTROLLER_BUILD_OPTIONS } from "./figma-controller-build.mjs";
import { imagePreparationBuildDefines } from "./image-preparation-build.mjs";
import { connectionBuildSettings } from "./connection-build.mjs";
const layoutExampleFiles = [
  "quest-list",
  "horizontal-carousel",
  "inventory-grid",
  "nested-panels",
].map((name) => `examples/layouts/${name}.framebridge.json`);
const { relayUrl, privateBeta, mode } = connectionBuildSettings(
  JSON.parse(await readFile("framebridge.config.json", "utf8")),
  process.env,
  process.argv,
);
console.log(
  `Framebridge ${mode} build${relayUrl ? ` · ${relayUrl}` : " · sign-in and sync disabled"}`,
);
const gitRevision = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout?.trim();
const clientRevision = /^[a-f0-9]{40,64}$/.test(gitRevision ?? "")
  ? gitRevision
  : "development";
const figmaNotices = (
  await Promise.all(
    [
      "LICENSE",
      "docs/licenses/JavaScript-dependencies.txt",
      "docs/licenses/Inter.txt",
      "docs/licenses/GoogleSans.txt",
    ].map((path) => readFile(path, "utf8")),
  )
).join("\n\n");
const noticeBanner = figmaNotices
  .split(/\r?\n/)
  .map((line) => `// ${line}`)
  .join("\n");
await mkdir("dist/figma", { recursive: true });
await mkdir("dist/studio", { recursive: true });
await mkdir("dist/examples", { recursive: true });
await copyFile(
  "examples/Store.framebridge.json",
  "dist/examples/Store.framebridge.json",
);
await mkdir("dist/examples/layouts", { recursive: true });
for (const path of layoutExampleFiles) await copyFile(path, `dist/${path}`);
await copyFile("examples/layouts/README.md", "dist/examples/layouts/README.md");
await copyFile(
  "examples/layouts/Viewer.client.luau",
  "dist/examples/layouts/Viewer.client.luau",
);
const interactionFiles = [
  "panels-tabs-states.framebridge.json",
  "README.md",
  "DemoData.server.luau",
];
await mkdir("dist/examples/interactions", { recursive: true });
for (const name of interactionFiles)
  await copyFile(
    `examples/interactions/${name}`,
    `dist/examples/interactions/${name}`,
  );
await mkdir("dist/examples/advanced-controls", { recursive: true });
for (const name of [
  "controls.framebridge.json",
  "README.md",
  "DemoControls.client.luau",
])
  if (name === "README.md")
    await writeFile(
      `dist/examples/advanced-controls/${name}`,
      (await readFile(`examples/advanced-controls/${name}`, "utf8")).replace(
        "../../docs/ADVANCED_CONTROLS.md",
        "../../ADVANCED_CONTROLS.md",
      ),
    );
  else
    await copyFile(
      `examples/advanced-controls/${name}`,
      `dist/examples/advanced-controls/${name}`,
    );
await copyFile("docs/ADVANCED_CONTROLS.md", "dist/ADVANCED_CONTROLS.md");
await mkdir("dist/examples/keyframes", { recursive: true });
for (const name of [
  "chains.framebridge.json",
  "README.md",
  "DemoTriggers.client.luau",
])
  if (name === "README.md")
    await writeFile(
      `dist/examples/keyframes/${name}`,
      (await readFile(`examples/keyframes/${name}`, "utf8")).replace(
        "../../docs/KEYFRAME_MOTION.md",
        "../../KEYFRAME_MOTION.md",
      ),
    );
  else
    await copyFile(
      `examples/keyframes/${name}`,
      `dist/examples/keyframes/${name}`,
    );
await writeFile(
  "dist/KEYFRAME_MOTION.md",
  (await readFile("docs/KEYFRAME_MOTION.md", "utf8")).replaceAll(
    "../examples/keyframes/",
    "examples/keyframes/",
  ),
);
const worldExampleFiles = [
  "surface.framebridge.json",
  "billboard.framebridge.json",
  "prompt.framebridge.json",
  "README.md",
];
await mkdir("dist/examples/world-space", { recursive: true });
for (const name of worldExampleFiles) {
  const source = `examples/world-space/${name}`;
  const destination = `dist/examples/world-space/${name}`;
  if (name === "README.md")
    await writeFile(
      destination,
      (await readFile(source, "utf8")).replaceAll(
        "../../docs/WORLD_SPACE.md",
        "../../WORLD_SPACE.md",
      ),
    );
  else await copyFile(source, destination);
}
await copyFile("docs/WORLD_SPACE.md", "dist/WORLD_SPACE.md");
await copyFile("docs/MOTION_PRESETS.md", "dist/MOTION_PRESETS.md");
await copyFile("docs/THEME_TOKENS.md", "dist/THEME_TOKENS.md");
await copyFile("docs/CONDITIONAL_RULES.md", "dist/CONDITIONAL_RULES.md");
await mkdir("dist/examples/conditional-rules", { recursive: true });
for (const file of [
  "store.framebridge.json",
  "DemoData.server.luau",
  "README.md",
]) {
  const content = await readFile(`examples/conditional-rules/${file}`);
  await writeFile(
    `dist/examples/conditional-rules/${file}`,
    file === "README.md"
      ? content
          .toString()
          .replace(
            "../../docs/CONDITIONAL_RULES.md",
            "../../CONDITIONAL_RULES.md",
          )
      : content,
  );
}
await copyFile("docs/UI_PARTICLES.md", "dist/UI_PARTICLES.md");
const particleFiles = [
  "particles.framebridge.json",
  "README.md",
  "DemoParticles.client.luau",
];
await mkdir("dist/examples/ui-particles", { recursive: true });
for (const name of particleFiles) {
  const source = await readFile(`examples/ui-particles/${name}`, "utf8");
  await writeFile(
    `dist/examples/ui-particles/${name}`,
    name === "README.md"
      ? source.replace("../../docs/UI_PARTICLES.md", "../../UI_PARTICLES.md")
      : source,
  );
}
await copyFile("docs/STRUCTURE_REVIEW.md", "dist/STRUCTURE_REVIEW.md");
await copyFile("docs/VISION_REVIEW.md", "dist/VISION_REVIEW.md");
await copyFile(
  "docs/REVIEW_PREFERENCE_SYNC.md",
  "dist/REVIEW_PREFERENCE_SYNC.md",
);
await copyFile("docs/ROBLOX_SIGN_IN.md", "dist/ROBLOX_SIGN_IN.md");
await copyFile("docs/REPORT_FEEDBACK.md", "dist/REPORT_FEEDBACK.md");
await copyFile("docs/IMAGE_BATCHES.md", "dist/IMAGE_BATCHES.md");
await copyFile(
  "docs/CLOUD_ARTWORK_LIBRARY.md",
  "dist/CLOUD_ARTWORK_LIBRARY.md",
);
const responsiveFiles = ["inventory.framebridge.json", "README.md"];
await mkdir("dist/examples/responsive", { recursive: true });
await copyFile(
  "examples/responsive/inventory.framebridge.json",
  "dist/examples/responsive/inventory.framebridge.json",
);
await writeFile(
  "dist/examples/responsive/README.md",
  (await readFile("examples/responsive/README.md", "utf8")).replace(
    "../../docs/DEVICE_PREVIEW.md",
    "../../DEVICE_PREVIEW.md",
  ),
);
await writeFile(
  "dist/DEVICE_PREVIEW.md",
  (await readFile("docs/DEVICE_PREVIEW.md", "utf8")).replace(
    "../examples/responsive/inventory.framebridge.json",
    "examples/responsive/inventory.framebridge.json",
  ),
);
await build({
  ...FIGMA_CONTROLLER_BUILD_OPTIONS,
  banner: { js: noticeBanner },
  outfile: "dist/figma/code.js",
});
const ui = await build({
  plugins: [shadcnStyles],
  loader: { ".woff2": "dataurl", ".png": "dataurl" },
  entryPoints: ["plugins/figma/src/ui.tsx"],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: "ui.js",
  write: false,
  minify: true,
  define: {
    ...(await imagePreparationBuildDefines()),
    "import.meta.env.DEV": "false",
    "import.meta.env.VITE_FRAMEBRIDGE_LIBRARY_MODE": '"false"',
    "import.meta.env.VITE_FRAMEBRIDGE_RELAY_URL": JSON.stringify(relayUrl),
    "import.meta.env.VITE_FRAMEBRIDGE_CLIENT_REVISION":
      JSON.stringify(clientRevision),
    "import.meta.env.VITE_FRAMEBRIDGE_PRIVATE_BETA": JSON.stringify(
      privateBeta ? "1" : "0",
    ),
    "process.env.NODE_ENV": '"production"',
  },
});
const js = ui.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = ui.outputFiles
  .find((f) => f.path.endsWith(".css"))
  .text.replace(/@import[^;]+;/g, "");
const embeddedNotices = JSON.stringify(figmaNotices).replaceAll("<", "\\u003c");
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script type="application/json" id="framebridge-license-notices">${embeddedNotices}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
await writeFile("dist/figma/ui.html", html);
const manifest = JSON.parse(
  await readFile("plugins/figma/manifest.json", "utf8"),
);
if (process.env.FIGMA_PLUGIN_ID) manifest.id = process.env.FIGMA_PLUGIN_ID;
if (relayUrl)
  manifest.networkAccess = {
    allowedDomains: relayUrl.startsWith("http:") ? ["none"] : [relayUrl],
    ...(relayUrl.startsWith("http:") ? { devAllowedDomains: [relayUrl] } : {}),
    reasoning:
      "Transfers selected designs to paired Studio, uploads artwork using authorized Roblox access, and submits voluntary issue reports only after user review.",
  };
await writeFile("dist/figma/manifest.json", JSON.stringify(manifest, null, 2));
await build({
  entryPoints: ["packages/relay/src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/relay/server.mjs",
});
const studioPaths = await buildStudioProject(
  await configuredStudioEntry(relayUrl, privateBeta),
);
const files = {};
for (const artifactPath of [
  "figma/manifest.json",
  "figma/code.js",
  "figma/ui.html",
  ...studioPaths.map((path) => `studio/${path}`),
])
  files[artifactPath] = new Uint8Array(await readFile(`dist/${artifactPath}`));
// Ship the complete reviewed example tree, rather than maintaining a second
// partial list that can omit a newly supported feature's demo or data script.
const examplePaths = await sourceExamplePaths();
for (const examplePath of examplePaths) {
  const source = await readFile(examplePath);
  files[examplePath] = examplePath.endsWith(".md")
    ? strToU8(
        relocateMarkdownLinks(source.toString(), examplePath, examplePath),
      )
    : new Uint8Array(source);
}
for (const guide of RELEASE_GUIDES)
  files[guide] = strToU8(
    relocateMarkdownLinks(
      await readFile(`docs/${guide}`, "utf8"),
      `docs/${guide}`,
      guide,
    ),
  );
for (const artifactPath of RELEASE_NOTICES) {
  const sourcePath = artifactPath.startsWith("licenses/")
    ? `docs/${artifactPath}`
    : artifactPath;
  const source = await readFile(sourcePath);
  files[artifactPath] = artifactPath.endsWith(".md")
    ? strToU8(
        relocateMarkdownLinks(source.toString(), sourcePath, artifactPath),
      )
    : new Uint8Array(source);
}
const releaseZip = zipSync(files);
await writeFile("dist/Framebridge-plugins.zip", releaseZip);
// Validate the actual archive after compression, not the in-memory producer map.
const bundleReport = checkReleaseBundle(
  new Uint8Array(await readFile("dist/Framebridge-plugins.zip")),
  examplePaths,
  studioPaths
    .filter((path) => path !== "Framebridge.rbxmx")
    .map((path) => `studio/${path}`),
);
console.log(
  `Release bundle verified: ${bundleReport.entries} files, ${bundleReport.examples} examples, ${bundleReport.localLinks} local documentation links.`,
);
console.log(
  "Built dist/figma and dist/studio. Install bundle: dist/Framebridge-plugins.zip",
);
