import type { Asset, DesignNode } from "../../../packages/core/src/types";

/** Only standalone, translation-only solid vectors have context-free pixels. */
export function vectorRenderKey(
  node: SceneNode,
  design: DesignNode,
  root: boolean,
  renderMode?: Asset["renderMode"],
): string | undefined {
  const solid = (paint: Paint) =>
    paint.type === "SOLID" &&
    (!paint.blendMode || paint.blendMode === "NORMAL") &&
    !Object.keys(paint.boundVariables ?? {}).length;
  if (
    node.type !== "VECTOR" ||
    root ||
    renderMode ||
    !design.vectorGeometry ||
    design.children.length ||
    node.isMask ||
    !["NORMAL", "PASS_THROUGH"].includes(node.blendMode) ||
    node.effects.length ||
    node.strokes.length ||
    node.fills === figma.mixed ||
    !node.fills.every(solid) ||
    Object.keys(node.boundVariables ?? {}).length ||
    node.vectorNetwork.regions?.some(
      (region) =>
        region.fillStyleId || region.fills?.some((paint) => !solid(paint)),
    )
  )
    return;
  const t = design.transform;
  if (t[0][0] !== 1 || t[0][1] !== 0 || t[1][0] !== 0 || t[1][1] !== 1) return;
  // Keep every other snapshot field, including complete geometry and resolved
  // paints. Identity, naming and translation belong to each exported reference.
  const {
    id,
    name,
    transform,
    rasterBounds,
    decorationBounds,
    effectBounds,
    ...appearance
  } = design;
  return JSON.stringify(appearance);
}
