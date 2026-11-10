import { geometry } from "./geometry";
import { nativePaint, nativeShadows, visiblePaints } from "./native-appearance";
import { flatten, type DesignNode, type RbxNode, type Asset } from "./types";
import { imageProcessing } from "./image-processing";

/** These paints can be rendered independently of the container's live content. */
export function needsFillDecoration(n: DesignNode, parent?: DesignNode) {
  return (
    !n.text &&
    !n.nativeMaskBasis &&
    !n.nativeMaskClip &&
    [
      "FRAME",
      "COMPONENT",
      "INSTANCE",
      "COMPONENT_SET",
      "SECTION",
      "RECTANGLE",
      "ELLIPSE",
    ].includes(n.type) &&
    n.width > 0 &&
    n.height > 0 &&
    !geometry(n.transform, n.width, n.height).skewed &&
    (!n.blendMode || ["NORMAL", "PASS_THROUGH"].includes(n.blendMode)) &&
    n.fills.some((p) => p.visible !== false && !nativePaint(p)) &&
    (n.fills.every(
      (p) => p.visible === false || !p.blendMode || p.blendMode === "NORMAL",
    ) ||
      !!paintBlendBackdrop(n, parent))
  );
}

const BLENDS = new Set(
  "MULTIPLY SCREEN OVERLAY DARKEN LIGHTEN LINEAR_BURN LINEAR_DODGE COLOR_DODGE COLOR_BURN HARD_LIGHT SOFT_LIGHT DIFFERENCE EXCLUSION HUE SATURATION COLOR LUMINOSITY".split(
    " ",
  ),
);
/** A frozen source backdrop is valid only where no other source content can contribute. */
export function paintBlendBackdrop(
  n: DesignNode,
  parent?: DesignNode,
): [number, number, number] | undefined {
  const fills = visiblePaints(n.fills),
    background = parent && visiblePaints(parent.fills);
  if (
    n.colorProfile === "DISPLAY_P3" ||
    parent?.colorProfile === "DISPLAY_P3" ||
    !fills.some((p) => p.blendMode && p.blendMode !== "NORMAL") ||
    fills.some(
      (p) =>
        p.blendMode && p.blendMode !== "NORMAL" && !BLENDS.has(p.blendMode),
    ) ||
    !parent ||
    parent.text ||
    parent.opacity !== 1 ||
    parent.radius ||
    parent.cornerSmoothing ||
    parent.corners?.some((v) => v !== 0) ||
    parent.effects?.length ||
    parent.nativeMaskClip ||
    parent.nativeMaskBasis ||
    (parent.blendMode &&
      !["NORMAL", "PASS_THROUGH"].includes(parent.blendMode)) ||
    !background ||
    background.length !== 1 ||
    background[0].type !== "SOLID" ||
    !nativePaint(background[0]) ||
    (background[0].opacity ?? 1) !== 1 ||
    (background[0].color?.a ?? 1) !== 1
  )
    return;
  const c = background[0].color;
  if (!c || [c.r, c.g, c.b].some((v) => !Number.isFinite(v) || v < 0 || v > 1))
    return;
  const box = (source: DesignNode) => {
    const t = source.transform;
    const points = [
      [0, 0],
      [source.width, 0],
      [0, source.height],
      [source.width, source.height],
    ].map(([x, y]) => [
      t[0][0] * x + t[0][1] * y + t[0][2],
      t[1][0] * x + t[1][1] * y + t[1][2],
    ]);
    return [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ];
  };
  const rect = box(n),
    inset = parent.strokeWeight || 0;
  if (
    rect[0] < inset ||
    rect[1] < inset ||
    rect[2] > parent.width - inset ||
    rect[3] > parent.height - inset
  )
    return;
  for (const sibling of parent.children) {
    if (sibling.id === n.id || !sibling.visible) continue;
    if (
      sibling.effects?.length ||
      (sibling.children.length && !sibling.clipsContent)
    )
      return;
    const other = box(sibling);
    if (
      rect[0] < other[2] &&
      rect[2] > other[0] &&
      rect[1] < other[3] &&
      rect[3] > other[1]
    )
      return;
  }
  return [c.r, c.g, c.b];
}

/** Normal own drop effects only; inner/background/layer effects need a separate approximation. */
export function needsShadowDecoration(n: DesignNode, scale = 1) {
  const shadows = n.shadows ?? [],
    effects = n.effects ?? [];
  return (
    !!shadows.length &&
    shadows.length <= 8 &&
    effects.length === shadows.length &&
    effects.every((v) => v === "DROP_SHADOW") &&
    shadows.every(
      (s) =>
        s.type === "DROP_SHADOW" &&
        (!s.blendMode || s.blendMode === "NORMAL") &&
        [s.radius, s.spread, s.offset.x, s.offset.y].every(
          (v) => Number.isFinite(v) && Math.abs(v) <= 1000,
        ) &&
        s.radius >= 0 &&
        [s.color.r, s.color.g, s.color.b, s.color.a ?? 1].every(
          (v) => Number.isFinite(v) && v >= 0 && v <= 1,
        ),
    ) &&
    n.width > 0 &&
    n.height > 0 &&
    n.width * n.height * scale * scale <= 4194304 &&
    !visiblePaints(n.strokes).length &&
    n.colorProfile !== "DISPLAY_P3" &&
    !n.nativeMaskBasis &&
    !n.nativeMaskClip &&
    !geometry(n.transform, n.width, n.height).skewed &&
    (!n.blendMode || ["NORMAL", "PASS_THROUGH"].includes(n.blendMode)) &&
    (!!n.text ||
      needsFillDecoration(n) ||
      nativeShadows(n).length !== shadows.length)
  );
}

export const BAKED_FILL_REASONS = new Set([
  "multiple fills",
  "image fill",
  "complex gradient or paint",
  "transformed gradient",
  "dense or hard-stop gradient",
  "paint blend mode",
]);

export function validateDecorationAsset(asset: Asset) {
  if (
    asset.renderMode !== undefined &&
    !["fills", "shadow", "blend"].includes(asset.renderMode)
  )
    throw new Error("Invalid decoration rendering mode.");
  if (
    asset.renderMode === "blend"
      ? !Array.isArray(asset.backdrop) ||
        asset.backdrop.length !== 3 ||
        asset.backdrop.some(
          (v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1,
        )
      : asset.backdrop !== undefined
  )
    throw new Error("Invalid frozen paint backdrop.");
  if (
    asset.renderMode &&
    (imageProcessing(asset.processing)?.whiteMask ||
      asset.scrollbarSlice ||
      (asset.pixelSize && asset.pixelSize[0] * asset.pixelSize[1] > 4194304))
  )
    throw new Error("Invalid independent decoration pixels or preparation.");
}

/** Runtime geometry is restricted to compiler-owned, noninteractive image helpers. */
export function validateDecorations(roots: RbxNode[], assets?: Asset[]) {
  for (const root of roots) {
    const nodes = flatten([root]);
    const parents = new Map(
      nodes.flatMap((n) => n.children.map((c) => [c.id, n] as const)),
    );
    for (const n of nodes) {
      if (n.decorationRect === undefined) continue;
      const parent = parents.get(n.id),
        rect = n.decorationRect;
      const anchor = n.properties.AnchorPoint;
      const effect = parent && n.id === `${parent.id}/effect`;
      const asset = assets?.find((a) => a.id === n.assetRef);
      if (
        !parent ||
        (!effect && n.id !== `${parent.id}/decoration`) ||
        (assets &&
          (!asset ||
            (effect
              ? asset.renderMode !== "shadow"
              : !["fills", "blend"].includes(asset.renderMode ?? "")))) ||
        n.className !== "ImageLabel" ||
        !n.assetRef ||
        n.children.length ||
        !Array.isArray(rect) ||
        rect.length !== 4 ||
        rect.some(
          (v) =>
            typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1000,
        ) ||
        rect[2] <= 0 ||
        rect[3] <= 0 ||
        ![
          "Frame",
          "CanvasGroup",
          "ScrollingFrame",
          "ViewportFrame",
          "TextButton",
          "ImageButton",
          ...(effect ? ["TextLabel", "TextBox"] : []),
        ].includes(parent.className) ||
        n.properties.Active !== false ||
        n.properties.Selectable !== false ||
        n.properties.BackgroundTransparency !== 1 ||
        n.properties.Rotation !== 0 ||
        !anchor ||
        typeof anchor !== "object" ||
        anchor.type !== "Vector2" ||
        anchor.value[0] !== 0 ||
        anchor.value[1] !== 0 ||
        n.behavior ||
        n.theme ||
        n.themes ||
        n.worldUI ||
        n.maskBasis ||
        n.assetBindings ||
        n.sourceType
      )
        throw new Error("Invalid background decoration helper.");
    }
  }
}
