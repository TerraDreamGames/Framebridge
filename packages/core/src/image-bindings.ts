import type { RbxNode, TransferPackage } from "./types";
import { flatten } from "./types";

export const SCROLLBAR_PROPERTIES = [
  "TopImage",
  "MidImage",
  "BottomImage",
] as const;
export function imageReferences(node: RbxNode): [string, string][] {
  return [
    ...(node.assetRef ? [["Image", node.assetRef] as [string, string]] : []),
    ...Object.entries(node.assetBindings ?? {}),
  ] as [string, string][];
}
export function validateImageBindings(pkg: TransferPackage) {
  const assets = new Set(pkg.assets.map((a) => a.id));
  for (const node of flatten(pkg.roots)) {
    if (node.assetBindings === undefined) continue;
    if (
      !node.assetBindings ||
      typeof node.assetBindings !== "object" ||
      Array.isArray(node.assetBindings) ||
      node.className !== "ScrollingFrame" ||
      Object.entries(node.assetBindings).some(
        ([key, id]) =>
          !SCROLLBAR_PROPERTIES.includes(
            key as (typeof SCROLLBAR_PROPERTIES)[number],
          ) ||
          typeof id !== "string" ||
          !assets.has(id),
      )
    )
      throw new Error("Invalid native scrollbar image references.");
  }
}
export function imageBindingIndex(pkg: TransferPackage) {
  const index = new Map<string, { node: RbxNode; property: string }[]>();
  for (const node of flatten(pkg.roots))
    for (const [property, reference] of imageReferences(node)) {
      const owners = index.get(reference) ?? [];
      owners.push({ node, property });
      index.set(reference, owners);
    }
  return index;
}
export function bindImage(
  pkg: TransferPackage,
  id: string,
  value: string,
  index = imageBindingIndex(pkg),
) {
  for (const { node, property } of index.get(id) ?? [])
    node.properties[property] = value;
}
