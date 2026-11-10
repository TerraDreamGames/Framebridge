// Reproducible CPU benchmark. PNG creation, independent decoding and hashing are
// outside timings; this does not measure native Figma rendering or network I/O.
import { build } from "esbuild";
import { encode } from "fast-png";
import { PNG } from "pngjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { cpus } from "node:os";

const label = process.argv[2] || "candidate";
const out = resolve(process.argv[3] || `.artifacts/image-performance/${label}`);
const source = process.argv[4] || "packages/core/src/image-processing.ts";
await mkdir(out, { recursive: true });
const bundle = await build({
  stdin: {
    contents: await readFile(source, "utf8"),
    resolveDir: resolve("packages/core/src"),
    sourcefile: resolve(source),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
});
const modulePath = resolve(out, "processor.mjs");
await writeFile(modulePath, bundle.outputFiles[0].text);
const { preparePng } = await import(pathToFileURL(modulePath));
const sha = (data) => createHash("sha256").update(data).digest("hex");
const records = [];
for (const [name, size, kind] of [
  ["monochrome-icon", 256, "icon"],
  ["transparent-gradient", 1024, "gradient"],
  ["large-transparent-artwork", 2048, "gradient"],
  ["large-opaque-artwork", 2048, "opaque"],
  ["textured-artwork", 1024, "texture"],
]) {
  const data = new Uint8Array(size * size * 4);
  let random = 12345;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const visible =
        kind === "opaque" ||
        (x - size / 2) ** 2 + (y - size / 2) ** 2 < (size * 0.38) ** 2;
      if (visible) {
        data[i] = kind === "icon" ? 90 : ((x * 255) / size) | 0;
        data[i + 1] = kind === "icon" ? 130 : ((y * 255) / size) | 0;
        data[i + 2] = kind === "icon" ? 210 : (((x + y) * 127) / size) | 0;
        data[i + 3] = kind === "opaque" ? 255 : 1 + ((x + y) % 255);
        if (kind === "texture")
          for (let c = 0; c < 3; c++) {
            random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
            data[i + c] = random >>> 24;
          }
      }
    }
  const input = encode({ width: size, height: size, data });
  // Warm the JIT once, then record three complete independent preparations.
  for (let warmup = 0; warmup < 3; warmup++)
    preparePng(input, { edgeCleanup: true });
  const times = [];
  let output;
  for (let trial = 0; trial < 7; trial++) {
    const start = performance.now();
    output = preparePng(input, { edgeCleanup: true });
    times.push(performance.now() - start);
  }
  const pixels = PNG.sync.read(Buffer.from(output)).data;
  for (let i = 0; i < data.length; i += 4) {
    if (
      pixels[i + 3] !== data[i + 3] ||
      (data[i + 3] &&
        (pixels[i] !== data[i] ||
          pixels[i + 1] !== data[i + 1] ||
          pixels[i + 2] !== data[i + 2]))
    )
      throw Error(`Visible colors or alpha changed: ${name}`);
  }
  const record = {
    name,
    size,
    milliseconds: times,
    median: [...times].sort((a, b) => a - b)[3],
    inputBytes: input.length,
    outputBytes: output.length,
    inputSha256: sha(input),
    pixelsSha256: sha(pixels),
    unchanged: output === input,
  };
  records.push(record);
  console.log(JSON.stringify(record));
}
await writeFile(
  resolve(out, "summary.json"),
  JSON.stringify(
    {
      label,
      scope:
        "PNG preparation CPU only; native rendering, transport and UI excluded.",
      node: process.version,
      cpu: cpus()[0]?.model,
      processorSha256: sha(bundle.outputFiles[0].text),
      records,
    },
    null,
    2,
  ),
);
