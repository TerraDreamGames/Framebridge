import path from "node:path";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import sharp from "sharp";
const args = process.argv.slice(2);
const input = args[0];
const target = args.indexOf("--website");
if (!input || target < 0 || !args[target + 1])
  throw new Error(
    "Usage: npm run media:import -- /path/to/screenshots.zip --website /path/to/framebridge-website",
  );
const website = path.resolve(args[target + 1]);
if (
  JSON.parse(await readFile(path.join(website, "package.json"), "utf8"))
    .name !== "framebridge"
)
  throw new Error("Expected the Framebridge website checkout.");
const files = (await stat(input)).isDirectory()
  ? Object.fromEntries(
      await Promise.all(
        (await readdir(input))
          .filter((name) => /\.(png|jpg)$/.test(name))
          .map(async (name) => [name, await readFile(path.join(input, name))]),
      ),
    )
  : unzipSync(await readFile(input));
const sceneSource = await readFile("plugins/figma/demo/scenes.ts","utf8");
const scenes = new Set([...sceneSource.matchAll(/id:\s*"([a-z-]+)"/g)].map(match=>match[1]));
const output = path.join(website, "public/guides/current");
await mkdir(output, { recursive: true });
const capturedAt = new Date().toISOString().slice(0, 10);
let manifest = {};
try {
  const previous = JSON.parse(
    await readFile(path.join(output, "manifest.json"), "utf8"),
  );
  manifest = Object.fromEntries(
    Object.entries(previous.images).map(([key, image]) => [
      key,
      { ...image, capturedAt: image.capturedAt ?? previous.capturedAt },
    ]),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let imported = 0;
for (const [name, bytes] of Object.entries(files)) {
  const match = /^([a-z-]+)-(light|dark)\.(png|jpg)$/.exec(name);
  if (!match) continue;
  const [, scene, theme] = match;
  if (!scenes.has(scene)) throw new Error(`Unknown screenshot: ${name}`);
  const image = sharp(bytes, { limitInputPixels: 20_000_000 });
  const size = await image.metadata();
  if (!size.width || !size.height || size.width < 200 || size.height < 150)
    throw new Error(`Invalid screenshot dimensions: ${name}`);
  const jpeg = await image
    .clone()
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  await writeFile(path.join(output, `${scene}-${theme}.jpg`), jpeg);
  for (const width of [768, 1536])
    await image
      .clone()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 88 })
      .toFile(path.join(output, `${scene}-${theme}-${width}.webp`));
  manifest[`${scene}-${theme}`] = {
    capturedAt,
    src: `/guides/current/${scene}-${theme}.jpg`,
    width: size.width,
    height: size.height,
    bytes: jpeg.length,
    sha256: createHash("sha256").update(jpeg).digest("hex"),
  };
  imported++;
}
if (!imported) throw new Error("No recognized screenshot files were found.");
for (const scene of new Set(
  Object.keys(manifest).map((key) => key.replace(/-(light|dark)$/, "")),
)) {
  if (!manifest[`${scene}-light`] || !manifest[`${scene}-dark`])
    throw new Error(`Both themes are required for ${scene}.`);
}
const data = {
  capturedAt,
  origin: "Framebridge production components · local InventoryUI sample",
  images: manifest,
};
await writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(data, null, 2) + "\n",
);
await writeFile(
  path.join(website, "src/docs/demo-media.json"),
  JSON.stringify(data, null, 2) + "\n",
);
console.log(
  `Imported ${imported} screenshots; retained ${Object.keys(manifest).length} theme views with JPEG and responsive WebP versions.`,
);
