import { remapControl } from "./advanced-controls";
import { round } from "./geometry";
import {
  flatten,
  type DesignNode,
  type RbxNode,
  type TransferPackage,
  type Value,
} from "./types";

const MAX_INSTANCES = 10_000;
export type RepeatOffset = { x: number; y: number; indices: number[] };
export type RepeatPlan =
  | { offsets: RepeatOffset[]; reason?: undefined }
  | { reason: string; offsets?: undefined };

/** Figma applies each modifier to the whole preceding pattern, in array order. */
export function linearRepeatPlan(node: DesignNode): RepeatPlan {
  if (!node.transformModifiers?.length || !node.children.length)
    return { reason: "repeat group has no supported repeat pattern" };
  let count = 1;
  for (const m of node.transformModifiers) {
    if (m.type !== "REPEAT" || m.repeatType !== "LINEAR")
      return { reason: "radial or unknown repeat modifier" };
    if (
      !Number.isInteger(m.count) ||
      m.count < 2 ||
      !["HORIZONTAL", "VERTICAL"].includes(m.axis ?? "") ||
      !["RELATIVE", "PIXELS"].includes(m.unitType) ||
      !Number.isFinite(m.offset)
    )
      return { reason: "invalid linear repeat modifier" };
    count *= m.count;
    if (count > MAX_INSTANCES)
      return { reason: "repeat expansion exceeds 10,000 objects" };
  }
  const points = node.children.flatMap((child) => {
    const [[a, c, x], [b, d, y]] = child.transform;
    return [
      [x, y],
      [x + a * child.width, y + b * child.width],
      [x + c * child.height, y + d * child.height],
      [
        x + a * child.width + c * child.height,
        y + b * child.width + d * child.height,
      ],
    ];
  });
  let width =
    Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]));
  let height =
    Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]));
  if (![width, height].every(Number.isFinite))
    return { reason: "repeat pattern has invalid bounds" };
  let offsets: RepeatOffset[] = [{ x: 0, y: 0, indices: [] }];
  for (const m of node.transformModifiers) {
    const horizontal = m.axis === "HORIZONTAL";
    const step =
      m.offset * (m.unitType === "PIXELS" ? 1 : horizontal ? width : height);
    if (!Number.isFinite(step) || Math.abs(step) * (m.count - 1) > 1_000_000)
      return { reason: "repeat pattern exceeds supported dimensions" };
    offsets = Array.from({ length: m.count }, (_, index) =>
      offsets.map((p) => ({
        x: round(p.x + (horizontal ? step * index : 0)),
        y: round(p.y + (horizontal ? 0 : step * index)),
        indices: [...p.indices, index],
      })),
    ).flat();
    if (horizontal) width += Math.abs(step) * (m.count - 1);
    else height += Math.abs(step) * (m.count - 1);
  }
  return { offsets };
}

function translated(
  value: Value | undefined,
  delta: RepeatOffset,
  parent: DesignNode,
  child: DesignNode,
  responsive: boolean,
): Value | undefined {
  if (typeof value !== "object" || value.type !== "UDim2") return value;
  const [sx, ox, sy, oy] = value.value;
  const scaleX =
    responsive && child.constraints?.horizontal === "SCALE" && parent.width > 0;
  const scaleY =
    responsive && child.constraints?.vertical === "SCALE" && parent.height > 0;
  // Keep the existing constraint strategy. Scale-based placement stays relative;
  // offset-based placement retains its authored repeat spacing.
  return {
    type: "UDim2",
    value: [
      round(sx + (scaleX ? delta.x / parent.width : 0)),
      round(ox + (scaleX ? 0 : delta.x)),
      round(sy + (scaleY ? delta.y / parent.height : 0)),
      round(oy + (scaleY ? 0 : delta.y)),
    ],
  };
}

/** Expand only after overrides, image bindings and behavior targets are resolved. */
export function expandLinearRepeats(
  pkg: TransferPackage,
  designs: DesignNode[],
): TransferPackage {
  const byId = new Map<string, DesignNode>();
  const collect = (node: DesignNode) => {
    byId.set(node.id, node);
    node.children.forEach(collect);
  };
  designs.forEach(collect);
  let instances = flatten(pkg.roots).length;
  function expand(node: RbxNode) {
    node.children.forEach(expand);
    const source = byId.get(node.id);
    if (source?.type !== "TRANSFORM_GROUP" || node.assetRef) return;
    const plan = linearRepeatPlan(source);
    if (!plan.offsets) return;
    const sourceChildren = source.children.map((c) => c.id);
    // Motion/layout wrappers belong to the source child too. Decorations on the
    // repeat container itself are outside the repeated pattern.
    const originals = node.children.filter((c) =>
      sourceChildren.some((id) => c.id === id || c.id.startsWith(`${id}/`)),
    );
    const originalNodes = flatten(originals);
    const sourceNodes = originalNodes.filter(
      (n) =>
        n.sourceType && !["MOTION_SLOT", "WORLD_CANVAS"].includes(n.sourceType),
    );
    const sourceIds = sourceNodes
      .map((n) => n.id)
      .sort((a, b) => b.length - a.length);
    const stride = (key: string) => {
      const values = originals
        .map((n) => n.properties[key])
        .filter((v): v is number => typeof v === "number");
      return values.length ? Math.max(...values) - Math.min(...values) + 1 : 1;
    };
    const orderStride = stride("LayoutOrder"),
      zStride = stride("ZIndex");
    const extra = originalNodes.length * (plan.offsets.length - 1);
    if (instances + extra > MAX_INSTANCES)
      throw new Error(
        "Expanded repeat groups exceed 10,000 Roblox instances. Export smaller sections or render the group as an image.",
      );
    instances += extra;
    const copies: RbxNode[] = [];
    for (const [copyIndex, delta] of plan.offsets.slice(1).entries()) {
      const suffix = `/repeat:${source.id}:${delta.indices.join(".")}`;
      const ids = new Map(
        originalNodes.map((n) => {
          const sourceId = sourceIds.find(
            (id) => n.id === id || n.id.startsWith(`${id}/`),
          );
          return [
            n.id,
            sourceId
              ? `${sourceId}${suffix}${n.id.slice(sourceId.length)}`
              : `${n.id}${suffix}`,
          ];
        }),
      );
      if ([...ids.values()].some((id) => id.length > 256))
        throw new Error(
          "Nested repeat identities exceed 256 characters. Export smaller sections or render the group as an image.",
        );
      const rewrite = (n: RbxNode) => {
        n.id = ids.get(n.id)!;
        if (n.textDecoration?.captured)
          n.textDecoration.captured =
            ids.get(n.textDecoration.captured) ?? n.textDecoration.captured;
        if (n.textDecoration?.themeShadow)
          n.textDecoration.themeShadow =
            ids.get(n.textDecoration.themeShadow) ??
            n.textDecoration.themeShadow;
        if (n.behavior?.control)
          n.behavior.control = remapControl(
            n.behavior.control,
            (id) => ids.get(id) ?? id,
          );
        if (n.theme?.owner)
          n.theme.owner = ids.get(n.theme.owner) ?? n.theme.owner;
        if (n.behavior?.keyframes) {
          if (n.behavior.keyframes.owner)
            n.behavior.keyframes.owner =
              ids.get(n.behavior.keyframes.owner) ?? n.behavior.keyframes.owner;
          if (n.behavior.keyframes.slot)
            n.behavior.keyframes.slot =
              ids.get(n.behavior.keyframes.slot) ?? n.behavior.keyframes.slot;
        }
        if (n.behavior?.particles?.owner)
          n.behavior.particles.owner =
            ids.get(n.behavior.particles.owner) ?? n.behavior.particles.owner;
        if (n.behavior?.action)
          n.behavior.action.target =
            ids.get(n.behavior.action.target) ?? n.behavior.action.target;
        if (n.behavior?.state)
          n.behavior.state.owner =
            ids.get(n.behavior.state.owner) ?? n.behavior.state.owner;
        if (n.behavior?.motion?.slot)
          n.behavior.motion.slot =
            ids.get(n.behavior.motion.slot) ?? n.behavior.motion.slot;
        if (n.behavior?.motion?.owner)
          n.behavior.motion.owner =
            ids.get(n.behavior.motion.owner) ?? n.behavior.motion.owner;
        n.children.forEach(rewrite);
      };
      const pattern: RbxNode[] = JSON.parse(JSON.stringify(originals));
      for (let index = 0; index < originals.length; index++) {
        const original = originals[index];
        const copy = pattern[index];
        rewrite(copy);
        const child = source.children.find(
          (c) => original.id === c.id || original.id.startsWith(`${c.id}/`),
        )!;
        const position = translated(
          copy.properties.Position,
          delta,
          source,
          child,
          pkg.options.layout === "responsive",
        );
        if (position) copy.properties.Position = position;
        for (const [key, span] of [
          ["LayoutOrder", orderStride],
          ["ZIndex", zStride],
        ] as const)
          if (typeof copy.properties[key] === "number")
            copy.properties[key] += (copyIndex + 1) * span;
        copies.push(copy);
      }
    }
    node.children.push(...copies);
    pkg.issues.push({
      nodeId: source.id,
      nodeName: source.name,
      severity: "info",
      code: "linear-repeat",
      message:
        "Linear repeats become independent editable objects. Change the repeat count or spacing in Figma and reimport to regenerate them; identical artwork shares one image.",
    });
    const repeated = plan.offsets.length - 1;
    pkg.stats.layers += sourceNodes.length * repeated;
    pkg.stats.raster += sourceNodes.filter((n) => n.assetRef).length * repeated;
    pkg.stats.native +=
      sourceNodes.filter((n) => !n.assetRef).length * repeated;
  }
  pkg.roots.forEach(expand);
  pkg.stats.instances = instances;
  return pkg;
}
