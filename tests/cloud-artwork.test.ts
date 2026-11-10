import { describe, it, expect } from "vitest";
import { zlibSync } from "fflate";
import { encode } from "fast-png";
import { libraryPng } from "../packages/core/src/image-processing";
import { readArtworkAccess } from "../plugins/figma/src/artwork-access-storage";
import { iconPng, PNG } from "./image-tools-fixtures";
function chunk(name: string, data: Uint8Array) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  out.write(name, 4);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of out.subarray(4, -4)) {
    crc ^= byte;
    for (let i = 0; i < 8; i++)
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
function custom(
  depth: number,
  color: number,
  rows: Uint8Array,
  extra: Buffer[] = [],
  width = 3,
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(1, 4);
  header[8] = depth;
  header[9] = color;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      chunk("IHDR", header),
      ...extra,
      chunk("IDAT", zlibSync(rows)),
      chunk("IEND", new Uint8Array()),
    ]),
  );
}
describe("bounded private PNG format", () => {
  it.each([0, 1, 2, 3, 4])(
    "preserves independent decoded pixels/alpha with PNG filter %i and strips private metadata",
    (filter) => {
      const raw = iconPng(filter),
        tagged = new Uint8Array(
          Buffer.concat([
            raw.subarray(0, 33),
            chunk("tEXt", new TextEncoder().encode("private project name")),
            chunk("eXIf", new Uint8Array([1, 2, 3])),
            chunk("gAMA", new Uint8Array([0, 0, 177, 143])),
            raw.subarray(33),
          ]),
        ),
        safe = libraryPng(tagged);
      expect(safe.bytes).toEqual(raw);
      expect(PNG.sync.read(Buffer.from(safe.bytes)).data).toEqual(
        PNG.sync.read(Buffer.from(raw)).data,
      );
      expect(Buffer.from(safe.bytes).toString()).not.toContain(
        "private project",
      );
      expect(tagged).not.toEqual(safe.bytes);
    },
  );
  it("preserves 16-bit samples and indexed transparency with independent PNG decoding", () => {
    const raw = encode({
      width: 2,
      height: 1,
      channels: 4,
      depth: 16,
      data: new Uint16Array([1000, 32000, 65535, 10000, 500, 600, 700, 65535]),
    });
    expect(
      PNG.sync.read(Buffer.from(libraryPng(raw).bytes), { skipRescale: true })
        .data,
    ).toEqual(PNG.sync.read(Buffer.from(raw), { skipRescale: true }).data);
    const indexed = custom(2, 3, new Uint8Array([0, 0x18]), [
      chunk("PLTE", new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255])),
      chunk("tRNS", new Uint8Array([0, 128, 255])),
    ]);
    expect(
      Array.from(PNG.sync.read(Buffer.from(libraryPng(indexed).bytes)).data),
    ).toEqual([255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255]);
  });
  it("rejects oversized dimensions, corrupt CRCs, bombs, bad filters/palettes/transparency and animation", () => {
    const raw = iconPng(),
      bad = new Uint8Array(raw);
    bad[45] ^= 1;
    for (const input of [
      new Uint8Array(512 * 1024 + 1),
      bad,
      custom(8, 6, new Uint8Array(100000)),
      custom(8, 6, new Uint8Array([5, ...Array(12).fill(0)])),
      custom(2, 3, new Uint8Array([0, 0xc0]), [
        chunk("PLTE", new Uint8Array([0, 0, 0])),
      ]),
      custom(2, 3, new Uint8Array([0, 0]), [
        chunk("PLTE", new Uint8Array([0, 0, 0])),
        chunk("tRNS", new Uint8Array([1, 2])),
      ]),
      custom(8, 6, new Uint8Array(13), [chunk("tRNS", new Uint8Array([1]))]),
      custom(8, 6, new Uint8Array(13), [chunk("acTL", new Uint8Array(8))]),
      custom(8, 6, new Uint8Array(13), [], 1025),
    ])
      expect(() => libraryPng(input)).toThrow();
  });
  it("stores only a private scoped grant and binds it to service/account", () => {
    const access = {
      version: 1,
      origin: "https://relay.test",
      userId: "123",
      grantToken: "a".repeat(64),
      scope: { kind: "group", id: "456", label: "Group" },
    };
    expect(readArtworkAccess(access, "https://relay.test", "123")).toEqual(
      access,
    );
    for (const raw of [
      { ...access, png: [1] },
      { ...access, assetId: "123" },
      { ...access, grantToken: "bad" },
      { ...access, scope: { ...access.scope, apiKey: "no" } },
    ])
      expect(readArtworkAccess(raw)).toBeUndefined();
    expect(
      readArtworkAccess(access, "https://other.test", "123"),
    ).toBeUndefined();
    expect(
      readArtworkAccess(access, "https://relay.test", "789"),
    ).toBeUndefined();
  });
});
