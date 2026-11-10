import {
  flatten,
  type AnalysisResult,
  type DesignNode,
  type RbxNode,
} from "../../../packages/core/src/types";

export type Entry = {
  node: RbxNode;
  source?: DesignNode;
  children: Entry[];
  baked?: boolean;
  repeatOriginalId?: string;
};
/** Recording needs generated geometry owners that the explorer folds away. */
export function recordingNodes(root?: Entry): RbxNode[] {
  return root ? flatten([root.node]) : [];
}
export function motionSlotContent(slot: RbxNode): RbxNode | undefined {
  if (slot.sourceType !== "MOTION_SLOT") return undefined;
  return slot.children.find(
    (child) =>
      child.behavior?.motion?.slot === slot.id ||
      child.behavior?.keyframes?.slot === slot.id,
  );
}
export function entries(result: AnalysisResult): Entry[] {
  const sources = new Map<string, DesignNode>();
  const exportedIds = new Set(flatten(result.package.roots).map((n) => n.id));
  const scrollbarSources = new Set(
    result.package.assets.filter((a) => a.scrollbarSlice).map((a) => a.nodeId),
  );
  function record(nodes: DesignNode[]) {
    for (const n of nodes) {
      sources.set(n.id, n);
      record(n.children);
    }
  }
  record(result.designs ?? []);
  const repeatPrefixes = [...sources.values()]
    .filter((source) => source.type === "TRANSFORM_GROUP")
    .map((source) => `/repeat:${source.id}:`);
  function originalRepeatId(id: string): string | undefined {
    let original = id;
    for (const prefix of repeatPrefixes) {
      let start = original.indexOf(prefix);
      while (start !== -1) {
        const indices = /^\d+(?:\.\d+)*(?=\/|$)/.exec(
          original.slice(start + prefix.length),
        );
        if (!indices) break;
        original =
          original.slice(0, start) +
          original.slice(start + prefix.length + indices[0].length);
        start = original.indexOf(prefix);
      }
    }
    return original !== id && exportedIds.has(original) ? original : undefined;
  }
  function walk(n: RbxNode, slot?: RbxNode): Entry {
    const source = sources.get(n.id);
    const presentation = slot
      ? {
          ...n,
          properties: {
            ...n.properties,
            ...Object.fromEntries(
              ["Position", "Size", "AnchorPoint", "LayoutOrder"]
                .filter((key) => slot.properties[key] !== undefined)
                .map((key) => [key, slot.properties[key]]),
            ),
          },
          children: [
            ...n.children,
            ...slot.children.filter((child) =>
              child.className.startsWith("UI"),
            ),
          ],
        }
      : n;
    const children = presentation.children.flatMap((child) => {
      if (child.decorationRect) return [];
      if (child.maskBasis)
        return child.children
          .filter((item) => item.sourceType !== "MASK_SCALE")
          .map((item) => walk(item));
      if (child.sourceType === "WORLD_CANVAS")
        return child.children.map((item) => walk(item));
      if (child.sourceType === "MOTION_SLOT") {
        const content = motionSlotContent(child);
        if (content) return [walk(content, child)];
      }
      return [walk(child)];
    });
    const ids = new Set(children.map((c) => c.node.id));
    for (const child of source?.children ?? [])
      if (!ids.has(child.id) && !exportedIds.has(child.id))
        children.push(virtual(child, !!n.assetRef));
    return {
      node: presentation,
      source,
      children,
      repeatOriginalId: originalRepeatId(n.id),
    };
  }
  function virtual(source: DesignNode, baked = false): Entry {
    return {
      source,
      baked,
      node: {
        id: source.id,
        name: source.name,
        className: scrollbarSources.has(source.id)
          ? "Scrollbar artwork"
          : baked
            ? "In image"
            : "Skipped",
        sourceType: source.type,
        properties: {},
        children: [],
      },
      children: source.children.map((n) => virtual(n, baked)),
    };
  }
  const rows = result.package.roots.map((n) => walk(n));
  for (const source of result.designs ?? [])
    if (!rows.some((r) => r.node.id === `screen:${source.id}`))
      rows.push(virtual(source));
  return rows;
}
