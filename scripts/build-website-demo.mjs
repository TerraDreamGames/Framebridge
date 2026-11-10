import { build } from "esbuild";
import { mkdir, readdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { shadcnStyles } from "./shadcn-styles.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const output = path.join(root, ".artifacts/website-demo");
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "artwork"), { recursive: true });
await build({
  entryPoints: ["plugins/figma/demo/main.tsx"],
  outdir: output,
  entryNames: "demo",
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  target: "es2022",
  assetNames: "assets/[name]-[hash]",
  chunkNames: "assets/[name]-[hash]",
  plugins: [shadcnStyles],
  loader: { ".svg": "dataurl", ".png": "file", ".woff2": "file" },
  define: {
    "import.meta.env": "{}",
    "import.meta.env.DEV": "true",
    "import.meta.env.VITE_FRAMEBRIDGE_RELAY_URL": '""',
    "import.meta.env.VITE_FRAMEBRIDGE_PRIVATE_BETA": '"0"',
  },
});
await writeFile(
  path.join(output, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'none'; form-action 'none'; base-uri 'none'"><title>Framebridge interactive demo</title><link rel="stylesheet" href="./demo.css"></head><body><div id="root"></div><script type="module" src="./demo.js"></script></body></html>`,
);
for (const name of await readdir("assets/examples/inventory")) {
  if (!name.endsWith(".png")) continue;
  const edge =
    name === "window-skin.png" ? 1024 : name === "inset-panel.png" ? 768 : 384;
  await sharp(path.join("assets/examples/inventory", name))
    .resize({
      width: edge,
      height: edge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toFile(path.join(output, "artwork", name));
}
for (const file of [
  "LICENSE",
  "assets/LICENSE",
  "assets/examples/inventory/README.md",
  "docs/licenses/JavaScript-dependencies.txt",
  "docs/licenses/GoogleSans.txt",
]) {
  await mkdir(path.join(output, "notices"), { recursive: true });
  await cp(file, path.join(output, "notices", file.replaceAll("/", "-")));
}
const digest = createHash("sha256")
  .update(await readFile(path.join(output, "demo.js")))
  .digest("hex");
await writeFile(
  path.join(output, "build.json"),
  JSON.stringify(
    {
      format: 1,
      source: "Framebridge production components",
      digest,
      builtAt: new Date().toISOString(),
      localSampleOnly: true,
      scenes: [
        ...(await readFile("plugins/figma/demo/scenes.ts", "utf8")).matchAll(
          /id:\s*"([a-z-]+)"/g,
        ),
      ].map((match) => match[1]),
    },
    null,
    2,
  ),
);
const targetIndex = process.argv.indexOf("--website");
if (targetIndex !== -1) {
  const website = path.resolve(process.argv[targetIndex + 1] ?? "");
  const pkg = JSON.parse(
    await readFile(path.join(website, "package.json"), "utf8"),
  );
  if (pkg.name !== "framebridge")
    throw new Error("Expected the Framebridge website checkout.");
  const destination = path.join(website, "public/plugin-demo");
  await rm(destination, { recursive: true, force: true });
  await cp(output, destination, { recursive: true });
  console.log(`Copied static demo to ${destination}`);
}
console.log(`Demo built: ${output}`);
