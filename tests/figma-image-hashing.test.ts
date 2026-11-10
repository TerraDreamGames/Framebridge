import { createHash } from "node:crypto";
import { encode } from "fast-png";
import { afterEach, expect, it, vi } from "vitest";
import {
  fingerprintPng,
  createAssetCatalog,
} from "../plugins/figma/src/asset-catalog";
import { createCloudArtworkManager } from "../plugins/figma/src/cloud-artwork-manager";
import type { ArtworkSnapshot } from "../packages/core/src/cloud-artwork";

afterEach(() => vi.unstubAllGlobals());
const oracle = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function largePng() {
  const data = new Uint8Array(192 * 128 * 4);
  let state = 0x11223344;
  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = state >>> 24;
  }
  return encode({ width: 192, height: 128, channels: 4, data });
}
const png = largePng();

it.each([undefined, {}])(
  "fingerprints and reopens a >64KB PNG catalog without Web Crypto (%j)",
  async (crypto) => {
    vi.stubGlobal("crypto", crypto);
    expect(png.length).toBeGreaterThan(65536);
    expect(await fingerprintPng(png)).toBe(oracle(png));
    const owner = { ownerType: "user" as const, ownerId: "123" };
    let stored: unknown;
    const storage = {
      load: async () => structuredClone(stored),
      save: async (value: unknown) => {
        stored = structuredClone(value);
      },
    };
    const first = createAssetCatalog(storage);
    await first.remember(
      owner,
      {
        id: "png",
        nodeId: "layer",
        name: "Large PNG",
        filename: "large.png",
        width: 192,
        height: 128,
        scale: 1,
        reason: "image",
      },
      Array.from(png),
      "987",
      "MODERATION_STATE_APPROVED",
    );
    expect(
      (await createAssetCatalog(storage).match(owner, Array.from(png)))
        ?.assetId,
    ).toBe("rbxassetid://987");
  },
);

function manager(expectedHash: string, bytes = png) {
  const itemId = "c".repeat(32);
  const snapshot: ArtworkSnapshot = {
    generation: "a".repeat(32),
    revision: 1,
    scope: { kind: "personal", id: "123", label: "Test user" },
    folders: [],
    items: [
      {
        id: itemId,
        name: "Large PNG",
        folder: null,
        sha256: expectedHash,
        bytes: bytes.length,
        width: 192,
        height: 128,
        savedAt: 1,
      },
    ],
    usage: { items: 1, bytes: bytes.length, pending: 0, cleanup: 0 },
  };
  const access = {
    version: 1,
    origin: "https://relay.test",
    userId: "123",
    grantToken: "d".repeat(64),
    scope: snapshot.scope,
  };
  const api = vi.fn(async (path: string) => {
    if (path === "/config") return { enabled: true };
    if (path === "") return structuredClone(snapshot);
    if (path === "/images/" + itemId) return bytes;
    throw new Error("Unexpected test request: " + path);
  });
  const value = createCloudArtworkManager(
    "https://relay.test",
    { load: async () => access, save: vi.fn() },
    api,
    () => {},
  );
  return { value, api, itemId };
}

it.each([undefined, {}])(
  "validates cloud-download bytes and still rejects an integrity mismatch without Web Crypto (%j)",
  async (crypto) => {
    vi.stubGlobal("crypto", crypto);
    const valid = manager(oracle(png));
    await valid.value.setAccount({ userId: "123", token: "b".repeat(64) });
    await valid.value.restore();
    const downloaded = await valid.value.download(valid.itemId);
    expect(downloaded?.bytes).toEqual(png);
    expect(valid.value.snapshot().error).toBe("");
    expect(valid.api.mock.calls.map(([path]) => path)).toEqual([
      "/config",
      "",
      "/images/" + valid.itemId,
    ]);
    valid.value.dispose();
    const invalid = manager("0".repeat(64));
    await invalid.value.setAccount({ userId: "123", token: "b".repeat(64) });
    await invalid.value.restore();
    expect(await invalid.value.download(invalid.itemId)).toBeUndefined();
    expect(invalid.value.snapshot().error).toBe(
      "Cloud artwork failed integrity checks.",
    );
    invalid.value.dispose();
  },
);
