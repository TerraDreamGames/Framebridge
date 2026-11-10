import { imageReferences } from "../../../packages/core/src/image-bindings";
import {
  flatten,
  type AnalysisResult,
  type Asset,
  type RbxNode,
} from "../../../packages/core/src/types";
import { entries, type Entry } from "./layer-entries";

/** Folded artwork belongs to its editable owner, not the generated screen. */
export function imageUseTarget(
  result: AnalysisResult,
  asset: Asset,
): string | undefined {
  const available = new Map<string, Entry>();
  function collect(rows: Entry[]) {
    for (const row of rows) {
      available.set(row.node.id, row);
      collect(row.children);
    }
  }
  collect(entries(result));
  const nodes = flatten(result.package.roots);
  const node = nodes.find((candidate) =>
    imageReferences(candidate).some(([, id]) => id === asset.id),
  );
  if (!node) return;
  if (available.has(node.id)) return node.id;

  const parents = new Map<string, RbxNode>();
  for (const parent of nodes)
    for (const child of parent.children) parents.set(child.id, parent);
  for (let owner = parents.get(node.id); owner; owner = parents.get(owner.id)) {
    const row = available.get(owner.id);
    if (row && (row.source || owner.sourceType || owner.id === asset.nodeId))
      return owner.id;
  }
}
