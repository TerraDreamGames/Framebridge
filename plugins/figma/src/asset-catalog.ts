import {
  bindImage,
  imageBindingIndex,
} from "../../../packages/core/src/image-bindings";
import { validAssetId } from "../../../packages/core/src/geometry";
import { sha256Hex } from "../../../packages/core/src/sha256";
import {
  flatten,
  type AnalysisResult,
  type Asset,
  type TransferPackage,
} from "../../../packages/core/src/types";
import {
  ownerKey,
  readCatalog,
  type AssetOwner,
  type CatalogEntry,
} from "./asset-catalog-data";
export {
  ASSET_CATALOG_KEY,
  CATALOG_LIMIT,
  CATALOG_BYTES,
  ownerKey,
  readCatalog,
} from "./asset-catalog-data";
export type { AssetOwner, CatalogEntry } from "./asset-catalog-data";
export async function fingerprintPng(bytes: number[] | Uint8Array) {
  if (
    bytes.length < 8 ||
    bytes.length > 20_000_000 ||
    [137, 80, 78, 71, 13, 10, 26, 10].some((byte, i) => byte !== bytes[i])
  )
    throw new Error("Image matching needs a PNG smaller than 20 MB.");
  return sha256Hex(new Uint8Array(bytes));
}
export type UploadCatalog = {
  match(owner: AssetOwner, bytes: number[]): Promise<CatalogEntry | undefined>;
  remember(
    owner: AssetOwner,
    asset: Asset,
    bytes: number[],
    assetId: string,
    moderation: string,
  ): Promise<void>;
};
export function createAssetCatalog(
  storage: {
    load(): Promise<unknown>;
    save(entries: CatalogEntry[]): Promise<void>;
  },
  changed: (entries: CatalogEntry[]) => void = () => {},
  warning: (message: string) => void = () => {},
  thumbnail: (bytes: number[]) => Promise<string | undefined> = async () =>
    undefined,
) {
  let entries: CatalogEntry[] = [];
  let loaded: Promise<void> | undefined;
  let writes = Promise.resolve();
  const load = () =>
    (loaded ??= storage
      .load()
      .then((v) => {
        entries = readCatalog(v);
        changed(entries);
      })
      .catch((error) => {
        loaded = undefined;
        throw error;
      }));
  const mutate = (fn: () => void) => {
    const write = writes.then(async () => {
      await load();
      fn();
      entries = readCatalog(entries);
      changed(entries);
      await storage.save(entries);
    });
    writes = write.catch(() => {});
    return write;
  };
  return {
    load,
    clear: () =>
      mutate(() => {
        entries = [];
      }),
    remove: (entry: CatalogEntry) =>
      mutate(() => {
        entries = entries.filter(
          (e) => e.owner !== entry.owner || e.fingerprint !== entry.fingerprint,
        );
      }),
    async match(owner: AssetOwner, bytes: number[]) {
      if (!ownerKey(owner)) return;
      try {
        await load();
        const hash = await fingerprintPng(bytes);
        return entries.find(
          (e) => e.owner === ownerKey(owner) && e.fingerprint === hash,
        );
      } catch {
        warning(
          "Saved images could not be read. Uploads can continue; retry the image library to restore reuse.",
        );
      }
    },
    async remember(
      owner: AssetOwner,
      asset: Asset,
      bytes: number[],
      assetId: string,
      moderation: string,
    ) {
      if (!ownerKey(owner) || !validAssetId(assetId)) return;
      try {
        const fingerprint = await fingerprintPng(bytes);
        const preview = await thumbnail(bytes).catch(() => undefined);
        await mutate(() => {
          entries.unshift({
            owner: ownerKey(owner),
            fingerprint,
            assetId,
            moderation,
            name: asset.name,
            width: asset.width,
            height: asset.height,
            savedAt: Date.now(),
            thumbnail: preview,
          });
        });
      } catch {
        warning(
          "The image was uploaded, but its library entry could not be saved. Current links still work.",
        );
      }
    },
  };
}
export function linkArtwork(
  pkg: TransferPackage,
  asset: Asset,
  id: string,
  moderation?: string,
  bindings = imageBindingIndex(pkg),
) {
  const canonical = validAssetId(id);
  if (!canonical) throw new Error("Invalid image asset ID.");
  asset.robloxId = canonical;
  bindImage(pkg, asset.id, canonical, bindings);
  pkg.issues = pkg.issues.filter(
    (issue) =>
      !(
        ["asset-required", "asset-moderation"].includes(issue.code) &&
        issue.nodeId === asset.nodeId &&
        (issue.code === "asset-required"
          ? !pkg.assets.some((a) => a.nodeId === asset.nodeId && !a.robloxId)
          : issue.nodeName === asset.name)
      ),
  );
  if (moderation !== "MODERATION_STATE_APPROVED")
    pkg.issues.push({
      severity: "warning",
      code: "asset-moderation",
      nodeId: asset.nodeId,
      nodeName: asset.name,
      message:
        "Linked to Roblox. Moderation or experience permissions may still prevent this image from displaying.",
    });
}
export async function reuseArtwork(
  result: AnalysisResult,
  owner: AssetOwner,
  catalog: UploadCatalog | undefined,
  guard: () => void,
) {
  const pkg: TransferPackage = JSON.parse(JSON.stringify(result.package));
  const bindings = imageBindingIndex(pkg);
  const matches = new WeakMap<number[], Promise<CatalogEntry | undefined>>();
  if (catalog)
    for (const asset of pkg.assets) {
      guard();
      if (asset.robloxId || !result.assets[asset.id]?.length) continue;
      const bytes = result.assets[asset.id];
      let pending = matches.get(bytes);
      if (!pending) {
        pending = catalog.match(owner, bytes);
        matches.set(bytes, pending);
      }
      const saved = await pending;
      guard();
      if (saved)
        linkArtwork(pkg, asset, saved.assetId, saved.moderation, bindings);
    }
  if (pkg.assets.every((a) => a.robloxId))
    pkg.issues = pkg.issues.filter((i) => i.code !== "asset-required");
  return pkg;
}
