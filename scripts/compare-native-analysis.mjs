// Compare native trials using an independent decoder; compression bytes may
// change, but every decoded sample and the generated UI must remain identical.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { createHash } from "node:crypto";
const beforeDir = resolve(process.argv[2]),
  afterDir = resolve(process.argv[3]);
const before = JSON.parse(await readFile(resolve(beforeDir, "summary.json"))),
  after = JSON.parse(await readFile(resolve(afterDir, "summary.json")));
const sha = (data) => createHash("sha256").update(data).digest("hex");
const records = [];
const profiles = (bytes) => {
  const result = [];
  for (let i = 8; i < bytes.length;) {
    const size = bytes.readUInt32BE(i),
      name = bytes.toString("ascii", i + 4, i + 8);
    if (["cHRM", "gAMA", "iCCP", "sRGB", "cICP", "mDCV", "cLLI"].includes(name))
      result.push(sha(bytes.subarray(i, i + size + 12)));
    i += size + 12;
  }
  return result;
};
for (const record of after.records) {
  const old = before.records.find(
    (r) => r.pair === record.pair && r.cache === record.cache,
  );
  if (!old) throw Error("Missing baseline trial.");
  if (
    old.fixture.id !== record.fixture.id ||
    old.packageSha256 !== record.packageSha256 ||
    old.previewSha256 !== record.previewSha256
  )
    throw Error(`Generated UI changed in ${record.cache}.`);
  const file = `pair-${record.pair}-${record.cache}.json`;
  const a = JSON.parse(await readFile(resolve(beforeDir, file))),
    b = JSON.parse(await readFile(resolve(afterDir, file)));
  if (JSON.stringify(a.result.designs) !== JSON.stringify(b.result.designs))
    throw Error("Artwork crop geometry changed.");
  const keys = Object.keys(a.result.assets).sort();
  if (
    JSON.stringify(keys) !== JSON.stringify(Object.keys(b.result.assets).sort())
  )
    throw Error("Artwork identities changed.");
  for (const id of keys) {
    const raw = Buffer.from(a.result.assets[id]),
      prepared = Buffer.from(b.result.assets[id]);
    const oldPixels = PNG.sync.read(raw, { skipRescale: true }),
      newPixels = PNG.sync.read(prepared, { skipRescale: true });
    const samples = (value) =>
      Buffer.from(
        value.data.buffer,
        value.data.byteOffset,
        value.data.byteLength,
      );
    if (
      raw[24] !== prepared[24] ||
      oldPixels.width !== newPixels.width ||
      oldPixels.height !== newPixels.height ||
      !samples(oldPixels).equals(samples(newPixels)) ||
      JSON.stringify(profiles(raw)) !== JSON.stringify(profiles(prepared))
    )
      throw Error(`PNG precision, pixels or color profiles changed: ${id}`);
  }
  for (const trial of [a, b])
    if (
      !trial.sourceUnchanged ||
      !trial.selectionUnchanged ||
      !trial.scratchFramesRemoved
    )
      throw Error("Native source preservation failed.");
  records.push({
    phase: record.cache,
    pair: record.pair,
    before: old.milliseconds,
    after: record.milliseconds,
    imagesVerified: keys.length,
  });
}
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const phases = [...new Set(records.map((r) => r.phase))].map((phase) => {
  const trials = records.filter((r) => r.phase === phase),
    a = median(trials.map((r) => r.before)),
    b = median(trials.map((r) => r.after));
  return {
    phase,
    beforeMedian: a,
    afterMedian: b,
    speedup: a / b,
    percentLessTime: (1 - b / a) * 100,
  };
});
const comparison = {
  scope: before.scope,
  beforeBundle: before.records[0].bundleSha256,
  afterBundle: after.records[0].bundleSha256,
  verified:
    "Identical generated UI, previews, geometry, every decoded PNG sample, bit depth and color profile; native source/selection preserved and scratch frames removed.",
  records,
  phases,
};
await writeFile(
  resolve(afterDir, "comparison.json"),
  JSON.stringify(comparison, null, 2),
);
console.log(JSON.stringify({ verified: comparison.verified, phases }, null, 2));
