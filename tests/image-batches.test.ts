import { afterEach, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRelay } from "../packages/relay/src/server";
import {
  createArtworkPool,
  createRenderCache,
  IMAGE_BATCH_LIMITS,
} from "../packages/core/src/image-batches";
import { imageBatchPlan } from "../plugins/figma/src/image-batch-plan";
import {
  createAssetCatalog,
  CATALOG_BYTES,
  readCatalog,
  reuseArtwork,
} from "../plugins/figma/src/asset-catalog";
import { imagePage } from "../plugins/figma/src/image-pages";
import { flatten } from "../packages/core/src/types";
import { validatePackage } from "../packages/relay/src/protocol";
import { imageBatchFixture, batchPng } from "./image-batch-fixtures";
import { PublicError } from "../packages/relay/src/roblox";
import { validAssetId } from "../packages/core/src/geometry";
import { buildExport } from "../packages/core/src/export";
import { unzipSync, strFromU8 } from "fflate";
import { PNG } from "./image-tools-fixtures";

let server: Server | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
});
const owner = {
  key: "local-batch-key-123",
  ownerType: "user" as const,
  ownerId: "123",
};
function memory() {
  let value: unknown = [];
  return {
    load: async () => structuredClone(value),
    save: vi.fn(async (next: unknown) => {
      value = structuredClone(next);
    }),
  };
}
async function local(
  upload: NonNullable<Parameters<typeof createRelay>[0]>["upload"],
) {
  server = createRelay({ upload });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  vi.stubEnv(
    "VITE_FRAMEBRIDGE_RELAY_URL",
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );
  vi.resetModules();
  const client = await import("../plugins/figma/src/transfer");
  const access = await client.createUploadSession();
  return { client, token: access.uploadToken };
}

it("pools exact repeated PNGs and admits 1,000 unique images while rejecting the next", () => {
  const pool = createArtworkPool();
  const png = batchPng(0),
    first = pool.add(png);
  expect(pool.add(new Uint8Array(png))).toBe(first);
  let byteCount = png.length;
  for (let i = 1; i < 1000; i++) {
    const bytes = batchPng(i);
    byteCount += bytes.length;
    pool.add(bytes);
  }
  expect(pool.usage()).toEqual({ unique: 1000, bytes: byteCount });
  expect(() => pool.add(batchPng(1000))).toThrow("1,000");
  expect(pool.add(png)).toBe(first);
  expect(() => pool.add(new Uint8Array(20_000_001))).toThrow("20 MB");
});
it("counts shared immutable PNG buffers once while bounding raw/prepared pairs and actual memory", () => {
  const cache = createRenderCache<{ bytes: Uint8Array }>(2000);
  const raw = new Uint8Array(16 * 1024 * 1024),
    prepared = new Uint8Array(8 * 1024 * 1024);
  for (let i = 0; i < 1000; i++) {
    cache.set(`raw:${i}`, { bytes: raw });
    cache.set(`prepared:${i}`, { bytes: prepared });
  }
  expect(cache.usage()).toEqual({ entries: 2000, bytes: 24 * 1024 * 1024 });
  cache.set("new", { bytes: new Uint8Array(1) });
  expect(cache.get("raw:0")).toBeUndefined();
  expect(cache.get("raw:999")?.bytes).toBe(raw);
  expect(cache.usage()).toEqual({ entries: 2000, bytes: 24 * 1024 * 1024 + 1 });
  // Replacing the last reference releases its buffer, not one copy per layer.
  for (let i = 0; i < 1000; i++) cache.set(`prepared:${i}`, { bytes: raw });
  expect(cache.usage().bytes).toBe(16 * 1024 * 1024 + 1);
});
it("bounds transient render retention even when tiny processed crops come from large originals", () => {
  const cache = createRenderCache<{ bytes: Uint8Array; name: string }>();
  for (let i = 0; i < 10; i++)
    cache.set(String(i), {
      bytes: new Uint8Array(16 * 1024 * 1024),
      name: String(i),
    });
  expect(cache.usage()).toEqual({
    entries: 4,
    bytes: IMAGE_BATCH_LIMITS.analysisBytes,
  });
  expect(cache.get("0")).toBeUndefined();
  expect(cache.get("9")?.name).toBe("9");
  cache.set("9", { bytes: new Uint8Array(1), name: "replacement" });
  expect(cache.usage().bytes).toBe(48 * 1024 * 1024 + 1);
});
it("preflights repeated references by PNG bytes, catches invalid/over-limit input and respects cancellation", async () => {
  const value = imageBatchFixture(1000, 3000);
  const plan = await imageBatchPlan(value.package, value.assets, () => {});
  expect(plan.groups).toHaveLength(1000);
  expect(plan.duplicates).toBe(2000);
  expect(plan.groups.every((group) => group.assets.length === 3)).toBe(true);
  await expect(
    imageBatchPlan(
      imageBatchFixture(1001).package,
      imageBatchFixture(1001).assets,
      () => {},
    ),
  ).rejects.toThrow("1,000");
  const invalid = imageBatchFixture(1);
  invalid.assets[invalid.package.assets[0].id] = [1, 2, 3];
  await expect(
    imageBatchPlan(invalid.package, invalid.assets, () => {}),
  ).rejects.toThrow("PNG");
  await expect(
    imageBatchPlan(value.package, value.assets, () => {
      throw new Error("cancelled");
    }),
  ).rejects.toThrow("cancelled");
});
it("uploads 1,000 unique images with two workers, binds 3,000 references, then reopens saved links without uploads", async () => {
  let active = 0,
    peak = 0,
    creates = 0;
  const upload = vi.fn(async () => {
    active++;
    peak = Math.max(peak, active);
    const id = String(900000 + creates++);
    await new Promise<void>((r) => setImmediate(r));
    active--;
    return { assetId: id, moderation: "MODERATION_STATE_APPROVED" };
  });
  const { client, token } = await local(upload),
    value = imageBatchFixture(1000, 3000);
  const storage = memory(),
    catalog = createAssetCatalog(storage),
    commits: number[] = [],
    progress: number[] = [];
  const result = await client.uploadArtwork(
    value,
    token,
    owner,
    new AbortController().signal,
    (_, n) => progress.push(n),
    () => true,
    (pkg) => commits.push(pkg.assets.filter((a) => a.robloxId).length),
    catalog,
  );
  expect(upload).toHaveBeenCalledTimes(1000);
  expect(peak).toBeLessThanOrEqual(2);
  expect(result.assets.filter((a) => a.robloxId)).toHaveLength(3000);
  expect(new Set(result.assets.map((a) => a.robloxId)).size).toBe(1000);
  const byId = new Map(
    result.assets.map((a) => [a.id, validAssetId(a.robloxId)]),
  );
  for (const node of flatten(result.roots))
    if (node.assetRef)
      expect(node.properties.Image).toBe(byId.get(node.assetRef));
  expect(() => validatePackage(result)).not.toThrow();
  expect(commits.length).toBeLessThan(150);
  expect(commits.at(-1)).toBe(3000);
  expect(progress.every((n, i) => i === 0 || n >= progress[i - 1])).toBe(true);
  const saved = await storage.load();
  expect(readCatalog(saved)).toHaveLength(1000);
  expect(Buffer.byteLength(JSON.stringify(saved))).toBeLessThan(CATALOG_BYTES);
  expect(JSON.stringify(saved)).not.toContain(owner.key);
  const reopened = createAssetCatalog(storage);
  const again = await client.uploadArtwork(
    value,
    token,
    { ...owner, key: "" },
    new AbortController().signal,
    () => {},
    () => true,
    () => {},
    reopened,
  );
  expect(again.assets.map((a) => validAssetId(a.robloxId))).toEqual(
    result.assets.map((a) => validAssetId(a.robloxId)),
  );
  expect(upload).toHaveBeenCalledTimes(1000);
}, 60_000);
it("exports all 1,000 prepared PNGs in a real ZIP with distinct decoded artwork and matching manifest", () => {
  const value = imageBatchFixture(),
    exported = buildExport(value),
    files = unzipSync(exported.data);
  const images = Object.entries(files).filter(([name]) =>
    name.startsWith("images/"),
  );
  expect(images).toHaveLength(1000);
  const colors = new Set<string>();
  for (const [, bytes] of images) {
    const decoded = PNG.sync.read(Buffer.from(bytes));
    expect([decoded.width, decoded.height]).toEqual([8, 8]);
    colors.add(Array.from(decoded.data.slice(0, 4)).join(","));
  }
  expect(colors.size).toBe(1000);
  const [, json] = Object.entries(files).find(([name]) =>
    name.endsWith(".framebridge.json"),
  )!;
  expect(JSON.parse(strFromU8(json)).assets).toHaveLength(1000);
});
it("drains started work on quota failure and resumes only unfinished images", async () => {
  let creates = 0,
    fail = true;
  const { client, token } = await local(async () => {
    const i = creates++;
    if (i === 7 && fail)
      throw new PublicError("Tester daily upload limit reached.", 429);
    await new Promise<void>((r) => setImmediate(r));
    return {
      assetId: String(700000 + i),
      moderation: "MODERATION_STATE_APPROVED",
    };
  });
  const value = imageBatchFixture(20),
    storage = memory(),
    catalog = createAssetCatalog(storage);
  let partial = value.package;
  await expect(
    client.uploadArtwork(
      value,
      token,
      owner,
      new AbortController().signal,
      () => {},
      () => true,
      (pkg) => {
        partial = structuredClone(pkg);
      },
      catalog,
    ),
  ).rejects.toThrow("daily");
  expect(
    partial.assets.filter((a) => a.robloxId).length,
  ).toBeGreaterThanOrEqual(7);
  const before = creates;
  // A definitively failed provider job is retained in its old session. A fresh
  // upload session resumes from saved successful links without repeating them.
  fail = false;
  const fresh = await client.createUploadSession();
  const completed = await client.uploadArtwork(
    { ...value, package: partial },
    fresh.uploadToken,
    owner,
    new AbortController().signal,
    () => {},
    () => true,
    () => {},
    createAssetCatalog(storage),
  );
  expect(completed.assets.every((a) => a.robloxId)).toBe(true);
  expect(creates - before).toBe(
    20 - partial.assets.filter((a) => a.robloxId).length,
  );
});
it("matches repeated prepared bytes once per recovery pass and keeps manual bindings", async () => {
  const value = imageBatchFixture(1, 1000);
  const match = vi.fn(async () => ({
    owner: "user:123",
    fingerprint: "a".repeat(64),
    assetId: "321",
    name: "saved",
    width: 8,
    height: 8,
    moderation: "MODERATION_STATE_APPROVED",
    savedAt: 1,
  }));
  value.package.assets[0].robloxId = "123";
  const result = await reuseArtwork(
    value,
    owner,
    { match, remember: vi.fn() },
    () => {},
  );
  expect(match).toHaveBeenCalledOnce();
  expect(result.assets[0].robloxId).toBe("123");
  expect(
    result.assets.slice(1).every((a) => a.robloxId === "rbxassetid://321"),
  ).toBe(true);
});
it("bounds visible image work and reaches every item through pagination", () => {
  const all = Array.from({ length: 1000 }, (_, i) => i),
    shown: number[] = [];
  for (let i = 0; i < 25; i++) {
    const page = imagePage(all, i);
    expect(page.items.length).toBeLessThanOrEqual(40);
    shown.push(...page.items);
  }
  expect(shown).toEqual(all);
  expect(imagePage(all.slice(0, 3), 24)).toMatchObject({
    page: 0,
    start: 0,
    end: 3,
  });
  expect(imagePage([], 0)).toMatchObject({ pages: 1, page: 0, items: [] });
});
