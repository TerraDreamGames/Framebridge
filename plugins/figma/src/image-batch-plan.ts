import { IMAGE_BATCH_LIMITS } from "../../../packages/core/src/image-batches";
import type { Asset, TransferPackage } from "../../../packages/core/src/types";
import { fingerprintPng } from "./asset-catalog";
import { validAssetId } from "../../../packages/core/src/geometry";
export async function imageBatchPlan(
  pkg: TransferPackage,
  payloads: Record<string, number[]>,
  guard: () => void,
) {
  if (pkg.assets.length > IMAGE_BATCH_LIMITS.references)
    throw new Error("A design can contain at most 10,000 image references.");
  const groups = new Map<string, { assets: Asset[]; bytes: number[] }>(),
    linked = new Set<string>(),
    ids = new Set<string>();
  let total = 0;
  const hashes = new WeakMap<number[], Promise<string>>();
  for (const asset of pkg.assets) {
    guard();
    if (ids.has(asset.id))
      throw new Error("Duplicate image reference identity.");
    ids.add(asset.id);
    if (asset.robloxId) {
      const id = validAssetId(asset.robloxId);
      if (!id) throw new Error("Invalid linked image ID.");
      linked.add(id);
      continue;
    }
    const bytes = payloads[asset.id];
    if (!bytes?.length)
      throw new Error(`Missing image for ${asset.name}. Analyze again.`);
    let promise = hashes.get(bytes);
    if (!promise) {
      promise = fingerprintPng(bytes);
      hashes.set(bytes, promise);
    }
    const hash = await promise;
    guard();
    const group = groups.get(hash);
    if (group) group.assets.push(asset);
    else {
      total += bytes.length;
      if (total > IMAGE_BATCH_LIMITS.analysisBytes)
        throw new Error(
          "Rendered artwork exceeds 64 MiB. Reduce resolution or export smaller sections.",
        );
      groups.set(hash, { assets: [asset], bytes });
    }
    if (groups.size + linked.size > IMAGE_BATCH_LIMITS.unique)
      throw new Error(
        "This design exceeds 1,000 unique images. Export smaller sections.",
      );
  }
  if (groups.size + linked.size > IMAGE_BATCH_LIMITS.unique)
    throw new Error(
      "This design exceeds 1,000 unique images. Export smaller sections.",
    );
  return {
    groups: [...groups.values()],
    linked: pkg.assets.filter((a) => a.robloxId).length,
    linkedUnique: linked.size,
    totalReferences: pkg.assets.length,
    duplicates: pkg.assets.filter((a) => !a.robloxId).length - groups.size,
    bytes: total,
  };
}
