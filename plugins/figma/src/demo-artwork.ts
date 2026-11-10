import {
  DEMO_INTERFACE_RESOURCES,
  type DemoArtwork,
} from "../../../packages/core/src/demo";
import { pngPixelSize } from "../../../packages/core/src/image-scaling";

const resources = [
  "inventory-backpack",
  "wayfinder-sword",
  "trail-dagger",
  "iron-shield",
  "health-potion",
  "energy-potion",
  "mana-potion",
  "azure-crystal",
  "amethyst-crystal",
  "ruby-crystal",
  "emerald-crystal",
  "oak-wood",
  "gold-coins",
  ...DEMO_INTERFACE_RESOURCES,
] as const;
const interfaceResources = new Set<string>(DEMO_INTERFACE_RESOURCES);

/** Locate the main solid component, ignoring stray fringe pixels. This only
 * normalizes browser textures; high-resolution PNG masters stay untouched. */
function componentBounds(
  bitmap: ImageBitmap,
): [number, number, number, number] {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const width = (canvas.width = Math.max(1, Math.round(bitmap.width * scale)));
  const height = (canvas.height = Math.max(
    1,
    Math.round(bitmap.height * scale),
  ));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [0, 0, bitmap.width, bitmap.height];
  context.drawImage(bitmap, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let largest = 0;
  let bounds = [0, 0, width - 1, height - 1];
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || pixels[start * 4 + 3] < 128) continue;
    let head = 0,
      tail = 1;
    queue[0] = start;
    visited[start] = 1;
    let left = width,
      top = height,
      right = 0,
      bottom = 0;
    while (head < tail) {
      const current = queue[head++];
      const x = current % width,
        y = Math.floor(current / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (const next of [
        x ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ]) {
        if (next < 0 || visited[next] || pixels[next * 4 + 3] < 128) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (tail > largest) {
      largest = tail;
      bounds = [
        Math.max(0, left - 1),
        Math.max(0, top - 1),
        Math.min(width, right + 2),
        Math.min(height, bottom + 2),
      ];
    }
  }
  if (!largest) return [0, 0, bitmap.width, bitmap.height];
  const x = Math.floor((bounds[0] * bitmap.width) / width);
  const y = Math.floor((bounds[1] * bitmap.height) / height);
  const right = Math.ceil((bounds[2] * bitmap.width) / width);
  const bottom = Math.ceil((bounds[3] * bitmap.height) / height);
  return [x, y, right - x, bottom - y];
}

let cached: Promise<DemoArtwork> | undefined;

/** Browser demo only. Keep reusable masters in assets; cache small preview
 * textures once, rather than embedding twelve full-resolution PNGs per render. */
export function loadDemoArtwork(
  base = "/assets/examples/inventory/",
): Promise<DemoArtwork> {
  if (!cached) {
    cached = Promise.all(
      resources.map(async (key) => {
        const response = await fetch(`${base}${key}.png`);
        if (!response.ok) throw new Error(`Could not load ${key} artwork.`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const dimensions = pngPixelSize(bytes);
        if (!dimensions) throw new Error(`Invalid ${key} PNG.`);
        const maxEdge =
          key === "window-skin" ? 1024 : key === "inset-panel" ? 768 : 384;
        const factor = Math.min(1, maxEdge / Math.max(...dimensions));
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
          {
            resizeWidth: Math.max(1, Math.round(dimensions[0] * factor)),
            resizeHeight: Math.max(1, Math.round(dimensions[1] * factor)),
            resizeQuality: "high",
          },
        );
        const canvas = document.createElement("canvas");
        try {
          const [x, y, width, height] = interfaceResources.has(key)
            ? componentBounds(bitmap)
            : [0, 0, bitmap.width, bitmap.height];
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not prepare inventory artwork.");
          context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
          return [key, canvas.toDataURL("image/png")] as const;
        } finally {
          bitmap.close();
        }
      }),
    ).then(Object.fromEntries);
    void cached.catch(() => {
      cached = undefined;
    });
  }
  return cached;
}
