import { expect, it, vi } from "vitest";
import {
  createAssetCatalog,
  readCatalog,
  fingerprintPng,
  reuseArtwork,
  CATALOG_LIMIT,
  CATALOG_BYTES,
} from "../plugins/figma/src/asset-catalog";
import { imageToolsResult } from "./image-tools-fixtures";
import { flatten } from "../packages/core/src/types";
const owner = { ownerType: "user" as const, ownerId: "123" };
function memory() {
  let value: unknown;
  return {
    load: async () => structuredClone(value),
    save: vi.fn(async (v: unknown) => {
      value = structuredClone(v);
    }),
  };
}
it("reopens saved uploads and reuses identical bytes under the same creator without retaining credentials", async () => {
  const storage = memory(),
    first = createAssetCatalog(storage),
    value = imageToolsResult();
  const credentials = { ...owner, key: "not-for-storage" };
  await first.remember(
    credentials,
    value.package.assets[0],
    value.assets[value.package.assets[0].id],
    "987",
    "MODERATION_STATE_REVIEWING",
  );
  const second = createAssetCatalog(storage),
    reused = await reuseArtwork(value, owner, second, () => {});
  expect(reused.assets[0].robloxId).toBe("rbxassetid://987");
  expect(flatten(reused.roots).find((n) => n.assetRef)?.properties.Image).toBe(
    "rbxassetid://987",
  );
  expect(reused.issues.some((i) => i.code === "asset-moderation")).toBe(true);
  expect(value.package.assets[0].robloxId).toBeUndefined();
  expect(JSON.stringify(await storage.load())).not.toMatch(
    /not-for-storage|png|assets|key/,
  );
});
it("isolates user/group owners and changed prepared pixels, even when layer identities match", async () => {
  const catalog = createAssetCatalog(memory()),
    value = imageToolsResult(),
    asset = value.package.assets[0];
  await catalog.remember(
    owner,
    asset,
    value.assets[asset.id],
    "987",
    "MODERATION_STATE_APPROVED",
  );
  for (const other of [
    { ownerType: "group" as const, ownerId: "123" },
    { ...owner, ownerId: "456" },
  ])
    expect(
      (await reuseArtwork(value, other, catalog, () => {})).assets[0].robloxId,
    ).toBeUndefined();
  const changed = imageToolsResult({ whiteMask: true });
  expect(
    (await reuseArtwork(changed, owner, catalog, () => {})).assets[0].robloxId,
  ).toBeUndefined();
});
it("manual image links win; abort or changed source prevents a cache match from binding", async () => {
  const value = imageToolsResult();
  value.package.assets[0].robloxId = "321";
  const catalog = { match: vi.fn(), remember: vi.fn() };
  expect(
    (await reuseArtwork(value, owner, catalog, () => {})).assets[0].robloxId,
  ).toBe("321");
  expect(catalog.match).not.toHaveBeenCalled();
  value.package.assets[0].robloxId = undefined;
  let current = true;
  catalog.match.mockImplementation(async () => {
    current = false;
    return { assetId: "987" };
  });
  await expect(
    reuseArtwork(value, owner, catalog, () => {
      if (!current) throw new Error("changed");
    }),
  ).rejects.toThrow("changed");
});
it("keeps newest unique records inside count/byte bounds and strips unexpected fields", () => {
  const records = Array.from({ length: 400 }, (_, i) => ({
    owner: "user:123",
    fingerprint: i.toString(16).padStart(64, "0"),
    assetId: "987",
    name: "Unicode 🧊 ".repeat(100),
    width: 48,
    height: 48,
    moderation: "MODERATION_STATE_APPROVED",
    savedAt: i,
    thumbnail: "data:image/png;base64," + "A".repeat(10000),
    key: "secret",
  }));
  records.unshift({ ...records[399], savedAt: 999 });
  const clean = readCatalog(records);
  expect(clean.length).toBeLessThanOrEqual(CATALOG_LIMIT);
  expect(Buffer.byteLength(JSON.stringify(clean))).toBeLessThan(CATALOG_BYTES);
  expect(clean[0].savedAt).toBe(999);
  expect(new Set(clean.map((e) => e.fingerprint)).size).toBe(clean.length);
  expect(JSON.stringify(clean)).not.toContain("secret");
  expect(
    readCatalog([
      { ...records[0], owner: "unknown:123" },
      { ...records[0], assetId: "javascript:alert(1)" },
    ]),
  ).toEqual([]);
});
it("serializes concurrent successful uploads, removal and clearing across reopen", async () => {
  const storage = memory(),
    catalog = createAssetCatalog(storage),
    value = imageToolsResult(),
    asset = value.package.assets[0];
  const bytes = value.assets[asset.id];
  await Promise.all([
    catalog.remember(owner, asset, bytes, "987", "MODERATION_STATE_APPROVED"),
    catalog.remember(
      { ...owner, ownerId: "456" },
      asset,
      bytes,
      "321",
      "MODERATION_STATE_APPROVED",
    ),
  ]);
  expect((await storage.load()) as unknown[]).toHaveLength(2);
  await catalog.remove(((await storage.load()) as any[])[0]);
  expect((await storage.load()) as unknown[]).toHaveLength(1);
  await catalog.clear();
  expect(await storage.load()).toEqual([]);
  expect(await createAssetCatalog(storage).match(owner, bytes)).toBeUndefined();
});
it("read/write failures preserve current uploads and never overwrite unread saved records", async () => {
  const storage = {
      load: vi.fn().mockRejectedValueOnce(new Error("unread")),
      save: vi.fn(),
    },
    warning = vi.fn();
  const catalog = createAssetCatalog(storage, () => {}, warning),
    value = imageToolsResult(),
    asset = value.package.assets[0];
  await catalog.remember(
    owner,
    asset,
    value.assets[asset.id],
    "987",
    "MODERATION_STATE_APPROVED",
  );
  expect(storage.save).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalled();
  storage.load.mockResolvedValue([]);
  storage.save.mockRejectedValueOnce(new Error("write"));
  await catalog.remember(
    owner,
    asset,
    value.assets[asset.id],
    "987",
    "MODERATION_STATE_APPROVED",
  );
  expect(warning.mock.calls.slice(-1)[0]?.[0]).toContain("uploaded");
});
it("rejects non-PNG and oversized files before hashing", async () => {
  await expect(fingerprintPng([1, 2, 3])).rejects.toThrow("PNG");
  await expect(fingerprintPng(new Array(20_000_001).fill(0))).rejects.toThrow(
    "20 MB",
  );
});
