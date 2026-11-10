import { relativeTo } from "./geometry";
import {
  flatten,
  type RbxNode,
  type DesignNode,
  type LayerOverride,
  type Paint,
  type Transform,
} from "./types";

type Clip = { mask: DesignNode; content: DesignNode[]; opacity: number };
export type NativeMaskPlan =
  | { clips: Clip[]; children: (DesignNode | Clip)[]; reason?: undefined }
  | {
      reason: string;
      requiresEditable?: boolean;
      clips?: undefined;
      children?: undefined;
    };

/** CanvasGroup clipping cannot follow rotated, skewed or scaled transforms. */
export const translationOnly = (t: Transform): boolean =>
  t.every((row) => row.every(Number.isFinite)) &&
  Math.abs(t[0][0] - 1) < 0.00001 &&
  Math.abs(t[1][1] - 1) < 0.00001 &&
  Math.abs(t[0][1]) < 0.00001 &&
  Math.abs(t[1][0]) < 0.00001;
const alpha = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 1;

function paintAlpha(p: Paint, vector: boolean): number | undefined {
  if (!alpha(p.opacity ?? 1) || (p.blendMode && p.blendMode !== "NORMAL"))
    return;
  if (p.type === "SOLID") {
    if (!alpha(p.color?.a ?? 1)) return;
    return (p.opacity ?? 1) * (p.color?.a ?? 1);
  }
  if (p.type.startsWith("GRADIENT_") && p.gradientStops?.length) {
    const values = p.gradientStops.map((stop) => stop.color.a ?? 1);
    if (!values.every(alpha) || (!vector && new Set(values).size !== 1)) return;
    return (p.opacity ?? 1) * Math.max(...values);
  }
  // Image alpha is not available in a geometry snapshot.
}

function clipOpacity(mask: DesignNode): number | string {
  const kind = mask.maskType ?? "ALPHA";
  if (kind !== "ALPHA" && kind !== "VECTOR")
    return "luminance masks require a combined image";
  if (!alpha(mask.opacity)) return "the mask has invalid opacity";
  if (mask.strokes.some((p) => p.visible !== false) && mask.strokeWeight > 0)
    return "stroked masks require a combined image";
  const fills = mask.fills.filter((p) => p.visible !== false);
  const values = fills.map((p) => paintAlpha(p, kind === "VECTOR"));
  if (values.some((value) => value === undefined))
    return "the mask has non-uniform or unknown paint alpha";
  const effective =
    mask.opacity *
    (1 - (values as number[]).reduce((remaining, a) => remaining * (1 - a), 1));
  // Vector masks use the filled outline at full opacity when any region is visible.
  return kind === "VECTOR" ? (effective > 0 ? 1 : 0) : effective;
}

/** Figma masks apply to following siblings, with a new mask starting a new run. */
export function nativeMaskPlan(
  node: DesignNode,
  overrides: Record<string, LayerOverride> = {},
  safeAncestors = true,
): NativeMaskPlan | undefined {
  if (!node.children.some((child) => child.visible && child.isMask)) return;
  const fail = (reason: string, requiresEditable = false): NativeMaskPlan => ({
    reason,
    requiresEditable,
  });
  if (node.layout && node.layout.mode !== "NONE")
    return fail("a mask directly inside auto layout requires a combined image");
  if (!safeAncestors || !translationOnly(node.transform))
    return fail(
      "rotated or transformed mask ancestors require a combined image",
    );
  const clips: Clip[] = [],
    children: (DesignNode | Clip)[] = [];
  let active: Clip | undefined;
  for (const child of node.children) {
    if (child.visible && child.isMask) {
      const mask = child;
      if (
        !["RECTANGLE", "ELLIPSE"].includes(mask.type) ||
        !Number.isFinite(mask.width) ||
        !Number.isFinite(mask.height) ||
        mask.width <= 0 ||
        mask.height <= 0 ||
        (mask.type === "ELLIPSE" && mask.width !== mask.height)
      )
        return fail(
          "only rectangular and circular mask shapes have native clips",
        );
      if (
        mask.unsupported?.length ||
        mask.cornerSmoothing ||
        mask.effects?.length ||
        mask.shadows?.length ||
        mask.children.length
      )
        return fail("mask shape styling requires a combined image");
      if (!translationOnly(mask.transform))
        return fail("rotated or transformed masks require a combined image");
      const radii = mask.corners ?? [
        mask.radius,
        mask.radius,
        mask.radius,
        mask.radius,
      ];
      if (
        radii.length !== 4 ||
        radii.some((r) => !Number.isFinite(r) || r < 0) ||
        new Set(radii).size > 1
      )
        return fail("the mask needs one uniform corner radius");
      if (
        mask.blendMode &&
        !["NORMAL", "PASS_THROUGH"].includes(mask.blendMode)
      )
        return fail("blended masks require a combined image");
      const opacity = clipOpacity(mask);
      if (typeof opacity === "string") return fail(opacity);
      const edit = overrides[mask.id];
      if (
        edit?.renderMode === "skip" ||
        edit?.renderMode === "image" ||
        (edit?.className && edit.className !== "CanvasGroup")
      )
        return fail(
          "keep the mask as a CanvasGroup clip or render its parent as an image",
          true,
        );
      active = { mask, content: [], opacity };
      clips.push(active);
      children.push(active);
    } else {
      // A separate mask object or clipped frame starts its own clipping scope.
      // Nested scrolling frames inside an ordinary group remain masked normally.
      if (
        child.visible &&
        ((["FRAME", "COMPONENT", "INSTANCE"].includes(child.type) &&
          child.clipsContent) ||
          child.children.some((nested) => nested.visible && nested.isMask))
      )
        active = undefined;
      if (active) active.content.push(child);
      else children.push(child);
    }
  }
  return { clips, children };
}

/** Rebase only masked siblings. Source IDs, raw snapshots and artwork stay intact. */
export function nativeMaskChildren(
  plan: Extract<NativeMaskPlan, { clips: Clip[] }>,
  sourceParent?: DesignNode,
): DesignNode[] {
  return plan.children.map((item) => {
    if (!("mask" in item)) return item;
    const { mask, content, opacity } = item;
    const members = content.map((node) => ({
      ...node,
      transform: relativeTo(mask.transform, node.transform),
      rasterBounds: node.rasterBounds
        ? {
            ...node.rasterBounds,
            x: node.rasterBounds.x - mask.transform[0][2],
            y: node.rasterBounds.y - mask.transform[1][2],
          }
        : undefined,
    }));
    return {
      ...mask,
      name: `${mask.name} clip`,
      nativeMaskClip: true,
      isMask: false,
      maskType: undefined,
      opacity,
      fills: [],
      strokes: [],
      strokeWeight: 0,
      shadows: [],
      effects: [],
      clipsContent: true,
      children: sourceParent
        ? [
            {
              ...mask,
              id: `${mask.id}/mask-content`,
              name: "Mask content coordinates",
              type: "FRAME",
              nativeMaskClip: false,
              nativeMaskBasis: sourceParent.id,
              isMask: false,
              maskType: undefined,
              width: sourceParent.width,
              height: sourceParent.height,
              transform: [
                [1, 0, -mask.transform[0][2]],
                [0, 1, -mask.transform[1][2]],
              ],
              constraints: { horizontal: "MIN", vertical: "MIN" },
              opacity: 1,
              radius: 0,
              corners: undefined,
              fills: [],
              strokes: [],
              effects: [],
              shadows: [],
              strokeWeight: 0,
              clipsContent: false,
              children: content,
            },
          ]
        : members,
    };
  });
}

/** A helper may follow only an ancestor in the same owned UI tree. */
export function validateMaskBases(roots: RbxNode[]): void {
  for (const root of roots) {
    const nodes = flatten([root]),
      byId = new Map(nodes.map((n) => [n.id, n]));
    const parents = new Map<string, RbxNode>();
    for (const n of nodes)
      for (const child of n.children) parents.set(child.id, n);
    for (const n of nodes) {
      if (n.maskBasis === undefined) continue;
      const anchor = n.properties.AnchorPoint;
      const clip = parents.get(n.id),
        source = byId.get(n.maskBasis);
      let ancestor = clip && parents.get(clip.id),
        found = false;
      while (ancestor) {
        if (ancestor === source) {
          found = true;
          break;
        }
        ancestor = parents.get(ancestor.id);
      }
      if (
        typeof n.maskBasis !== "string" ||
        !n.maskBasis.length ||
        n.maskBasis.length > 256 ||
        !["Frame", "ScrollingFrame"].includes(n.className) ||
        (n.className === "ScrollingFrame" &&
          (n.properties.ScrollingEnabled !== false ||
            n.properties.ScrollBarThickness !== 0 ||
            n.properties.Active !== false ||
            n.properties.Selectable !== false)) ||
        clip?.className !== "CanvasGroup" ||
        !found ||
        source?.className.startsWith("UI") ||
        ["ScreenGui", "SurfaceGui", "BillboardGui"].includes(
          source?.className ?? "",
        ) ||
        n.assetRef ||
        n.assetBindings ||
        n.behavior ||
        n.worldUI ||
        n.properties.BackgroundTransparency !== 1 ||
        n.properties.ClipsDescendants !== false ||
        n.properties.Rotation !== 0 ||
        !anchor ||
        typeof anchor !== "object" ||
        anchor.type !== "Vector2" ||
        anchor.value.length !== 2 ||
        anchor.value.some((v) => v !== 0) ||
        n.children
          .filter((c) => c.className.startsWith("UI"))
          .some(
            (c) =>
              c.className !== "UIScale" ||
              c.id !== `${n.id}/mask-scale` ||
              c.properties.Scale !== 1,
          ) ||
        n.children.filter((c) => c.className === "UIScale").length !== 1
      )
        throw new Error("Invalid mask coordinate container.");
    }
  }
}
