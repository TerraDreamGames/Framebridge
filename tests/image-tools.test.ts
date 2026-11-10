import { describe, expect, it } from "vitest";
import { encode } from "fast-png";
import { strFromU8, unzipSync, zlibSync } from "fflate";
import {
  imageProcessing,
  artworkAssetId,
  exportImageProcessing,
  preparePng,
} from "../packages/core/src/image-processing";
import { retainLinkedAssets } from "../packages/core/src/editor";
import { buildExport } from "../packages/core/src/export";
import { buildSourceExport } from "../packages/core/src/source-export";
import { SOURCE_FORMATS } from "../packages/core/src/source-code";
import { flatten } from "../packages/core/src/types";
import { validateUpload } from "../packages/relay/src/roblox";
import { compile } from "../packages/core/src/compiler";
import { imageToolsResult, iconPng, PNG } from "./image-tools-fixtures";

const read = (bytes: Uint8Array, options?: Record<string, unknown>) =>
  PNG.sync.read(Buffer.from(bytes), options);
function chunk(name: string, data: Uint8Array) {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  output.write(name, 4);
  output.set(data, 8);
  let crc = 0xffffffff;
  for (const b of output.subarray(4, -4)) {
    crc ^= b;
    for (let i = 0; i < 8; i++)
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
  return output;
}
function customPng(
  width: number,
  height: number,
  depth: number,
  color: number,
  rows: Uint8Array,
  extra: Buffer[] = [],
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = depth;
  header[9] = color;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    ...extra,
    chunk("IDAT", zlibSync(rows)),
    chunk("IEND", new Uint8Array()),
  ]);
}
describe("image preparation", () => {
  it("cleans new exports by default and preserves every visible color, alpha sample and bound", () => {
    const result = imageToolsResult();
    const asset = result.package.assets[0];
    expect(asset.id).toBe("image:icon:bleed-v2");
    expect(asset.processing).toEqual({ whiteMask: false, edgeCleanup: true });
    const raw = read(iconPng());
    const clean = read(new Uint8Array(result.assets[asset.id]));
    expect([clean.width, clean.height]).toEqual([raw.width, raw.height]);
    let changed = 0;
    for (let i = 0; i < raw.data.length; i += 4) {
      expect(clean.data[i + 3]).toBe(raw.data[i + 3]);
      if (raw.data[i + 3])
        expect(clean.data.slice(i, i + 4)).toEqual(raw.data.slice(i, i + 4));
      else if (clean.data.slice(i, i + 3).some((v, j) => v !== raw.data[i + j]))
        changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
  it("honors an explicit opt-out, including with a white mask or after serialization", () => {
    const disabled = JSON.parse(JSON.stringify({ edgeCleanup: false }));
    const result = imageToolsResult(disabled);
    const asset = result.package.assets[0];
    expect(asset.id).toBe("image:icon");
    expect(asset.processing).toBeUndefined();
    expect(new Uint8Array(result.assets[asset.id])).toEqual(iconPng());
    expect(
      exportImageProcessing({ whiteMask: true, edgeCleanup: false }),
    ).toEqual({
      whiteMask: true,
      edgeCleanup: false,
    });
    expect(exportImageProcessing({ whiteMask: false })).toEqual({
      whiteMask: false,
      edgeCleanup: true,
    });
  });
  it("retains preparation choices without forcing an editable native layer to become an image", () => {
    const designs = imageToolsResult().designs!;
    const native = compile(designs, "source", {
      layerOverrides: {
        icon: {
          renderMode: "native",
          className: "Frame",
          imageProcessing: { whiteMask: true },
        },
      },
    });
    expect(native.assets).toHaveLength(0);
    expect(
      flatten(native.roots).find((node) => node.id === "icon")?.className,
    ).toBe("Frame");
    const image = compile(designs, "source", {
      layerOverrides: {
        icon: { renderMode: "image", imageProcessing: { whiteMask: true } },
      },
    });
    expect(image.assets[0].id).toBe("image:icon:mask-v1:bleed-v2");
    expect(image.assets[0].processing?.whiteMask).toBe(true);
  });
  it("passes unconfigured images through byte-for-byte without decoding", () => {
    const raw = new Uint8Array([1, 2, 3]);
    expect(preparePng(raw)).toBe(raw);
    expect(preparePng(raw, { whiteMask: false, edgeCleanup: false })).toBe(raw);
    expect(artworkAssetId("icon")).toBe("image:icon");
  });
  it.each([0, 1, 2, 3, 4])(
    "preserves bounds and every alpha sample with PNG filter %i",
    (filter) => {
      const raw = iconPng(filter),
        before = raw.slice(),
        original = read(raw);
      const mask = preparePng(raw, { whiteMask: true }),
        result = read(mask);
      expect(raw).toEqual(before);
      expect([result.width, result.height]).toEqual([7, 5]);
      for (let i = 0; i < result.data.length; i += 4) {
        expect(Array.from(result.data.slice(i, i + 3))).toEqual([
          255, 255, 255,
        ]);
        expect(result.data[i + 3]).toBe(original.data[i + 3]);
      }
      expect(
        validateUpload({
          owner: { kind: "user", id: "123" },
          name: "Mask",
          png: Buffer.from(mask).toString("base64"),
        }),
      ).toEqual(Buffer.from(mask));
    },
  );
  it("only changes fully transparent RGB and fills the entire transparent area", () => {
    const raw = iconPng(),
      before = read(raw),
      after = read(preparePng(raw, { edgeCleanup: true }));
    for (let i = 0; i < before.data.length; i += 4) {
      expect(after.data[i + 3]).toBe(before.data[i + 3]);
      if (before.data[i + 3])
        expect(after.data.slice(i, i + 4)).toEqual(before.data.slice(i, i + 4));
    }
    const row = new Uint8Array(8 * 4);
    row.set([100, 180, 220, 128], 3 * 4);
    const image = read(
      preparePng(encode({ width: 8, height: 1, data: row }), {
        edgeCleanup: true,
      }),
    );
    expect(Array.from(image.data.slice(4, 8))).toEqual([100, 180, 220, 0]);
    expect(Array.from(image.data.slice(0, 4))).toEqual([100, 180, 220, 0]);
    expect(Array.from(image.data.slice(5 * 4, 6 * 4))).toEqual([
      100, 180, 220, 0,
    ]);
    expect(Array.from(image.data.slice(7 * 4, 8 * 4))).toEqual([
      100, 180, 220, 0,
    ]);
  });
  it.each([
    [7, 7],
    [1, 13],
    [13, 1],
    [19, 11],
  ])(
    "matches independently calculated nearest visible colors throughout a %i × %i PNG",
    (width, height) => {
      const pixels = new Uint8Array(width * height * 4);
      const seeds: { x: number; y: number; color: number[] }[] = [];
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (
            (x * 13 + y * 7) % 17 !== 3 &&
            !(x === width - 1 && y === height - 1)
          )
            continue;
          const color = [
            (x * 37 + 80) % 256,
            (y * 61 + 100) % 256,
            (x * 19 + y * 29 + 180) % 256,
            [1, 128, 255][seeds.length % 3],
          ];
          seeds.push({ x, y, color });
          pixels.set(color, (y * width + x) * 4);
        }
      const raw = encode({ width, height, data: pixels });
      const clean = read(preparePng(raw, { edgeCleanup: true }));
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          expect(clean.data[offset + 3]).toBe(pixels[offset + 3]);
          if (pixels[offset + 3]) {
            expect(Array.from(clean.data.slice(offset, offset + 4))).toEqual(
              Array.from(pixels.slice(offset, offset + 4)),
            );
            continue;
          }
          const distance = (seed: (typeof seeds)[number]) =>
            (seed.x - x) ** 2 + (seed.y - y) ** 2;
          const nearest = Math.min(...seeds.map(distance));
          const rgb = Array.from(clean.data.slice(offset, offset + 3));
          expect(
            seeds
              .filter((seed) => distance(seed) === nearest)
              .map((seed) => seed.color.slice(0, 3)),
          ).toContainEqual(rgb);
        }
    },
  );
  it("uses Euclidean distance at diagonal edges and retains 16-bit RGB/alpha precision", () => {
    const pixels = new Uint16Array(5 * 5 * 4);
    pixels.set([1000, 2000, 3000, 129], 3 * 5 * 4);
    pixels.set([20000, 30000, 40000, 65000], (2 * 5 + 2) * 4);
    const raw = encode({
      width: 5,
      height: 5,
      depth: 16,
      channels: 4,
      data: pixels,
    });
    const clean = read(preparePng(raw, { edgeCleanup: true }), {
      skipRescale: true,
    });
    // (2,2) is closer than (0,3), despite having a larger Manhattan distance.
    expect(Array.from(clean.data.slice(0, 4))).toEqual([
      20000, 30000, 40000, 0,
    ]);
    for (let i = 0; i < pixels.length; i += 4) {
      expect(clean.data[i + 3]).toBe(pixels[i + 3]);
      if (pixels[i + 3])
        expect(clean.data.slice(i, i + 4)).toEqual(pixels.slice(i, i + 4));
    }
  });
  it("supports combined preparation and opaque/fully transparent inputs", () => {
    for (const alpha of [0, 255]) {
      const raw = encode({
        width: 1,
        height: 1,
        data: new Uint8Array([10, 20, 30, alpha]),
      });
      expect(
        Array.from(
          read(preparePng(raw, { whiteMask: true, edgeCleanup: true })).data,
        ),
      ).toEqual([255, 255, 255, alpha]);
      expect(
        Array.from(read(preparePng(raw, { edgeCleanup: true })).data),
      ).toEqual([10, 20, 30, alpha]);
      expect(preparePng(raw, { edgeCleanup: true })).toBe(raw);
    }
  });
  it("preserves 16-bit alpha precision and supports Adam7 PNGs", () => {
    const raw = encode(
      {
        width: 2,
        height: 1,
        depth: 16,
        channels: 4,
        data: new Uint16Array([100, 200, 300, 129, 20000, 30000, 40000, 65000]),
      },
      { interlace: "Adam7" },
    );
    const result = read(preparePng(raw, { whiteMask: true }), {
      skipRescale: true,
    });
    expect(Array.from(result.data)).toEqual([
      65535, 65535, 65535, 129, 65535, 65535, 65535, 65000,
    ]);
    const rgba = read(iconPng());
    const interlaced = encode(
      { width: 7, height: 5, data: rgba.data },
      { interlace: "Adam7" },
    );
    expect(read(preparePng(interlaced, { edgeCleanup: true })).data).toEqual(
      read(preparePng(iconPng(), { edgeCleanup: true })).data,
    );
  });
  it("preserves indexed/grayscale transparency and ignores suggested RGB palettes", () => {
    const palette = encode({
      width: 2,
      height: 1,
      channels: 1,
      depth: 8,
      data: new Uint8Array([0, 1]),
      palette: [
        [20, 40, 60, 0],
        [100, 120, 140, 128],
      ],
    });
    expect(
      Array.from(read(preparePng(palette, { whiteMask: true })).data),
    ).toEqual([255, 255, 255, 0, 255, 255, 255, 128]);
    const gray = customPng(4, 1, 2, 0, new Uint8Array([0, 0b00011011]), [
      chunk("tRNS", new Uint8Array([0, 1])),
    ]);
    expect(
      Array.from(read(preparePng(gray, { whiteMask: true })).data),
    ).toEqual([
      255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255,
      255,
    ]);
    const rgb = customPng(1, 1, 8, 2, new Uint8Array([0, 10, 20, 30]), [
      chunk("PLTE", new Uint8Array([255, 0, 0])),
    ]);
    expect(
      Array.from(read(preparePng(rgb, { edgeCleanup: true })).data),
    ).toEqual([10, 20, 30, 255]);
  });
  it("retains color metadata byte-for-byte after RGBA encoding", () => {
    const gamma = chunk("gAMA", new Uint8Array([0, 0, 177, 143]));
    const raw = iconPng(),
      profiled = Buffer.concat([
        Buffer.from(raw.subarray(0, 33)),
        gamma,
        Buffer.from(raw.subarray(33)),
      ]);
    const out = Buffer.from(preparePng(profiled, { edgeCleanup: true }));
    expect(out.subarray(33, 33 + gamma.length)).toEqual(gamma);
    expect(read(out).data).toEqual(
      read(preparePng(raw, { edgeCleanup: true })).data,
    );
  });
  it.each([null, [], { whiteMask: "yes" }, { unknown: true }])(
    "rejects malformed preparation flags %j",
    (value) => {
      expect(() => imageProcessing(value as any)).toThrow("settings");
    },
  );
  it("rejects CRC corruption, oversized dimensions, animation and excess decompressed pixels", () => {
    const corrupt = iconPng();
    corrupt[40] ^= 1;
    expect(() => preparePng(corrupt, { whiteMask: true })).toThrow("checksum");
    expect(() =>
      preparePng(customPng(10000, 1, 8, 6, new Uint8Array(5)), {
        whiteMask: true,
      }),
    ).toThrow("dimensions");
    const raw = iconPng(),
      animated = Buffer.concat([
        Buffer.from(raw.subarray(0, 33)),
        chunk("acTL", new Uint8Array(8)),
        Buffer.from(raw.subarray(33)),
      ]);
    expect(() => preparePng(animated, { whiteMask: true })).toThrow("Animated");
    expect(() =>
      preparePng(customPng(1, 1, 8, 6, new Uint8Array(1_000_000)), {
        whiteMask: true,
      }),
    ).toThrow("dimensions");
  });
  it("versions artwork identities so old uploaded PNGs cannot silently satisfy new preparation", () => {
    const raw = imageToolsResult({ edgeCleanup: false }),
      mask = imageToolsResult({ whiteMask: true }),
      clean = imageToolsResult({ edgeCleanup: true });
    expect(
      new Set([raw, mask, clean].map((r) => r.package.assets[0].id)).size,
    ).toBe(3);
    raw.package.assets[0].robloxId = "123";
    retainLinkedAssets(raw, mask);
    expect(mask.package.assets[0].robloxId).toBeUndefined();
    const again = imageToolsResult({ edgeCleanup: false });
    retainLinkedAssets(raw, again);
    expect(again.package.assets[0].robloxId).toBe("123");
    expect(
      flatten(mask.package.roots).find((n) => n.id === "icon")?.properties
        .ImageColor3,
    ).toEqual({ type: "Color3", value: [0.2, 0.7, 1] });
  });
  it.each(SOURCE_FORMATS)(
    "includes prepared pixels in Studio and $label ZIPs",
    ({ id }) => {
      const result = imageToolsResult({ whiteMask: true });
      for (const archive of [
        buildExport(result),
        buildSourceExport(result, id),
      ]) {
        const entries = unzipSync(archive.data),
          png = entries[`images/${result.package.assets[0].filename}`];
        expect(png).toEqual(
          new Uint8Array(result.assets[result.package.assets[0].id]),
        );
        expect(read(png).data[4 * 9]).toBe(255);
      }
      const entries = unzipSync(buildExport(result).data);
      expect(
        JSON.parse(strFromU8(entries["Image_tools.framebridge.json"])).assets[0]
          .processing.whiteMask,
      ).toBe(true);
    },
  );
  it.each(SOURCE_FORMATS)(
    "includes default cleanup and the explicit opt-out in Studio and $label ZIPs",
    ({ id }) => {
      for (const processing of [undefined, { edgeCleanup: false }]) {
        const result = imageToolsResult(processing);
        const asset = result.package.assets[0];
        for (const archive of [
          buildExport(result),
          buildSourceExport(result, id),
        ]) {
          const png = unzipSync(archive.data)[`images/${asset.filename}`];
          expect(png).toEqual(new Uint8Array(result.assets[asset.id]));
          if (processing?.edgeCleanup === false) expect(png).toEqual(iconPng());
          else expect(read(png).data).not.toEqual(read(iconPng()).data);
        }
      }
    },
  );
});
