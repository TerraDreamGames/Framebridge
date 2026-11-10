import type {
  Asset,
  DesignNode,
  LayerOverride,
} from "../../../packages/core/src/types";

/** Only omissions inside this rendered subtree affect its pixels.
 * Other render-type, property and preparation edits must keep its PNG cache valid.
 */
export function artworkRenderContext(
  design: DesignNode,
  overrides: Record<string, LayerOverride>,
  consumed: Set<string>,
  mode?: Asset["renderMode"],
) {
  if (mode === "fills" || mode === "blend" || !design.children.length)
    return "";
  const omitted: string[] = [];
  const visit = (node: DesignNode) => {
    for (const child of node.children) {
      const render = overrides[child.id]?.renderMode;
      if (
        render === "skip" ||
        consumed.has(child.id) ||
        (/\[skip\]/i.test(child.name) &&
          render !== "native" &&
          render !== "image")
      )
        omitted.push(child.id);
      else visit(child);
    }
  };
  visit(design);
  return JSON.stringify(omitted);
}
