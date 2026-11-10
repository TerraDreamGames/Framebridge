import { mkdir, writeFile } from "node:fs/promises";
import { visionAnalysis } from "../tests/vision-review-fixtures";
import { PNG, iconPng } from "../tests/image-tools-fixtures";
const output = ".artifacts/vision-review";
await mkdir(output, { recursive: true });
const result = visionAnalysis(),
  root = result.designs![0],
  width = 600,
  height = 420,
  pixels = new Uint8Array(width * height * 4);
// Synthetic developer screenshot only. No Figma file or artwork is captured/uploaded.
const draw = (n: typeof root, x = 0, y = 0) => {
  const left = x + (n === root ? 0 : n.transform[0][2]),
    top = y + (n === root ? 0 : n.transform[1][2]);
  const c = n.fills.find((f) => f.type === "SOLID")?.color;
  if (c)
    for (
      let py = Math.max(0, Math.round(top));
      py < Math.min(height, top + n.height);
      py++
    )
      for (
        let px = Math.max(0, Math.round(left));
        px < Math.min(width, left + n.width);
        px++
      )
        pixels.set(
          [c.r * 255, c.g * 255, c.b * 255, 255],
          (py * width + px) * 4,
        );
  n.children.forEach((child) => draw(child, left, top));
};
draw(root);
result.previews[root.id] =
  "data:image/png;base64," +
  PNG.sync.write({ width, height, data: pixels }).toString("base64");
result.assets = Object.fromEntries(
  result.package.assets.map((asset) => [asset.id, Array.from(iconPng())]),
);
await writeFile(
  output + "/preview.json",
  JSON.stringify({
    data: result,
    selected: [
      {
        id: root.id,
        name: root.name,
        type: root.type,
        width,
        height,
        layers: result.package.stats.layers,
      },
    ],
  }),
);
console.log(
  "Vision review fixture: synthetic screenshot and native metadata; no provider or Figma calls.",
);
