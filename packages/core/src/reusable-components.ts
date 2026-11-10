import { controlReferences, remapControl } from "./advanced-controls";
import { imageReferences } from "./image-bindings";
import { PROPERTY_SCHEMAS } from "./editor";
import { validateExportPackage } from "./export-package";
import {
  flatten,
  type AnalysisResult,
  type ButtonState,
  type DesignNode,
  type RbxNode,
  type TransferPackage,
} from "./types";

export type ComponentGroup = {
  key: string;
  name: string;
  kind: "repeated" | "states" | "single";
  nodeIds: string[];
  states?: Partial<Record<ButtonState, string>>;
  reason: string;
};
const stateNames: Record<string, ButtonState> = {
  default: "default",
  normal: "default",
  resting: "default",
  hover: "hover",
  hovered: "hover",
  pressed: "pressed",
  clicked: "pressed",
  disabled: "disabled",
  selected: "selected",
  active: "selected",
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function digest(text: string | number[]) {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    const n = typeof text === "string" ? text.charCodeAt(i) : text[i];
    a = Math.imul(a ^ n, 16777619);
    b = Math.imul(b, 33) ^ n;
  }
  return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
const gui = (node: RbxNode) =>
  !node.className.startsWith("UI") &&
  !["ScreenGui", "SurfaceGui", "BillboardGui"].includes(node.className);
function sources(result: AnalysisResult) {
  const byId = new Map<string, DesignNode>();
  const pending = (result.designs ?? []).map((node) => ({ node, depth: 0 }));
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth > 100 || byId.size >= 15000 || byId.has(node.id))
      throw new Error(
        "Review a smaller, valid component selection (15,000 layers, 100 levels).",
      );
    byId.set(node.id, node);
    pending.push(
      ...node.children.map((child) => ({ node: child, depth: depth + 1 })),
    );
  }
  return byId;
}
function stateFromName(name: string): ButtonState | undefined {
  const fields = name.split(",").map((field) => field.trim());
  const explicit = fields.filter((field) => /^state\s*=/i.test(field));
  if (explicit.length > 1) return undefined;
  const value =
    explicit.length === 1
      ? explicit[0].replace(/^state\s*=\s*/i, "")
      : fields.length === 1
        ? name
        : "";
  return stateNames[value.trim().toLowerCase()];
}
function externalReferences(node: RbxNode): string[] {
  const nodes = flatten([node]),
    ids = new Set(nodes.map((n) => n.id));
  return nodes.flatMap((n) =>
    [
      ...(n.behavior?.control ? controlReferences(n.behavior.control) : []),
      n.theme?.owner,
      n.behavior?.particles?.owner,
      n.behavior?.action?.target,
      n.behavior?.state?.owner,
      n.behavior?.motion?.owner,
      n.behavior?.keyframes?.owner,
      n.behavior?.keyframes?.slot,
      n.maskBasis,
      n.textDecoration?.captured,
      n.textDecoration?.themeShadow,
      n.behavior?.motion?.slot,
    ].filter((id): id is string => !!id && !ids.has(id)),
  );
}
function ownsNestedStateVisuals(node: RbxNode): boolean {
  return flatten(node.children).some(
    (descendant) => descendant.behavior?.state?.owner === node.id,
  );
}
/** Compare appearance with local identity-normalized behavior, retaining text. */
function comparison(result: AnalysisResult) {
  const source = sources(result);
  const assets = new Map(result.package.assets.map((a) => [a.id, a]));
  const assetKeys = new Map<string, string>();
  const assetKey = (id: string) => {
    let key = assetKeys.get(id);
    if (key) return key;
    const bytes = result.assets[id],
      asset = assets.get(id);
    key = asset?.robloxId
      ? `roblox:${asset.robloxId}`
      : bytes?.length
        ? `png:${digest(bytes)}`
        : `unresolved:${id}`;
    assetKeys.set(id, key);
    return key;
  };
  let comparisons = 0;
  function signature(root: RbxNode) {
    const descendants = flatten([root]);
    comparisons += descendants.length;
    if (comparisons > 200000)
      throw new Error("Select a smaller hierarchy for component review.");
    const ids = new Map(descendants.map((n, index) => [n.id, index]));
    const visit = (node: RbxNode): unknown => {
      const properties = clone(node.properties);
      imageReferences(node).forEach(
        ([property]) => delete properties[property],
      );
      if (node === root) {
        delete properties.Position;
        delete properties.AnchorPoint;
        delete properties.LayoutOrder;
        delete properties.ZIndex;
        delete properties.Size;
      }
      const behavior = clone(node.behavior ?? {});
      const theme = node.theme ? clone(node.theme) : undefined;
      const textDecoration = node.textDecoration
        ? clone(node.textDecoration)
        : undefined;
      const local = (id: string) => `local:${ids.get(id) ?? "external:" + id}`;
      if (behavior.control)
        behavior.control = remapControl(behavior.control, local);
      if (theme?.owner) theme.owner = local(theme.owner);
      if (textDecoration?.captured)
        textDecoration.captured = local(textDecoration.captured);
      if (textDecoration?.themeShadow)
        textDecoration.themeShadow = local(textDecoration.themeShadow);
      if (behavior.particles?.owner)
        behavior.particles.owner = local(behavior.particles.owner);
      if (behavior.action)
        behavior.action.target = local(behavior.action.target);
      if (behavior.keyframes?.owner)
        behavior.keyframes.owner = local(behavior.keyframes.owner);
      if (behavior.keyframes?.slot)
        behavior.keyframes.slot = local(behavior.keyframes.slot);
      if (behavior.state) behavior.state.owner = local(behavior.state.owner);
      if (behavior.motion?.owner)
        behavior.motion.owner = local(behavior.motion.owner);
      if (behavior.motion?.slot)
        behavior.motion.slot = local(behavior.motion.slot);
      return {
        className: node.className,
        properties,
        bounds:
          node === root
            ? [source.get(root.id)?.width, source.get(root.id)?.height]
            : undefined,
        referenceSize: node.referenceSize,
        layoutSizing: node.layoutSizing,
        behavior,
        theme,
        textDecoration,
        images: imageReferences(node).map(([property, id]) => [
          property,
          assetKey(id),
        ]),
        children: node.children.map(visit),
      };
    };
    const canonical = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, entry]) => [key, canonical(entry)]),
            )
          : value;
    return JSON.stringify(canonical(visit(root)));
  }
  // Hashes accelerate candidates; byte equality is required before merging.
  function sameArtwork(a: RbxNode, b: RbxNode): boolean {
    const first = flatten([a]),
      second = flatten([b]);
    return first.every((node, index) =>
      imageReferences(node).every(([property, id]) => {
        const other = imageReferences(second[index]).find(
          ([p]) => p === property,
        )?.[1];
        if (!other) return false;
        if (assets.get(id)?.robloxId || assets.get(other)?.robloxId)
          return assetKey(id) === assetKey(other);
        const left = result.assets[id],
          right = result.assets[other];
        if (left?.length && right?.length)
          return (
            left.length === right.length &&
            left.every((value, i) => value === right[i])
          );
        return assetKey(id) === assetKey(other);
      }),
    );
  }
  return { signature, sameArtwork };
}

/** Read-only suggestions. No source name, override or package is changed. */
export function reviewComponents(result: AnalysisResult): ComponentGroup[] {
  const all = flatten(result.package.roots);
  if (all.length > 15000)
    throw new Error("Review a smaller component selection.");
  const source = sources(result),
    byId = new Map(all.map((n) => [n.id, n]));
  const groups: ComponentGroup[] = [],
    stateNodes = new Set<string>();
  for (const set of source.values()) {
    if (set.type !== "COMPONENT_SET" || byId.get(set.id)?.behavior) continue;
    const states: Partial<Record<ButtonState, string>> = {};
    let compatible = true;
    for (const child of set.children) {
      const state = stateFromName(child.name),
        node = byId.get(child.id);
      if (
        !state ||
        !node ||
        !gui(node) ||
        states[state] ||
        externalReferences(node).length ||
        ownsNestedStateVisuals(node) ||
        node.behavior
      ) {
        compatible = false;
        break;
      }
      states[state] = child.id;
    }
    const nodes = Object.values(states).map((id) => source.get(id)!);
    if (
      !compatible ||
      !states.default ||
      nodes.length < 2 ||
      nodes.some(
        (n) => n.width !== nodes[0].width || n.height !== nodes[0].height,
      )
    )
      continue;
    const nodeIds = Object.values(states);
    nodeIds.forEach((id) => stateNodes.add(id));
    groups.push({
      key: `states:${set.id}`,
      name: set.name,
      kind: "states",
      nodeIds,
      states,
      reason:
        "Named states in one Figma component set, with matching bounds. Review before extracting.",
    });
  }
  const { signature, sameArtwork } = comparison(result);
  const buckets = new Map<
    string,
    { signature: string; node: RbxNode; group: ComponentGroup }[]
  >();
  for (const node of all) {
    if (
      !gui(node) ||
      !source.has(node.id) ||
      stateNodes.has(node.id) ||
      source.get(node.id)?.type === "COMPONENT_SET" ||
      (node.className === "TextLabel" && !node.children.length) ||
      externalReferences(node).length
    )
      continue;
    const value = signature(node),
      key = digest(value),
      bucket = buckets.get(key) ?? [];
    const found = bucket.find(
      (candidate) =>
        candidate.signature === value && sameArtwork(candidate.node, node),
    );
    if (found) found.group.nodeIds.push(node.id);
    else {
      const group: ComponentGroup = {
        key: `repeat:${node.id}`,
        name: node.name,
        kind: "repeated",
        nodeIds: [node.id],
        reason:
          "Matching exported properties, text, hierarchy, internal interactions and artwork. Placement may differ.",
      };
      bucket.push({ signature: value, node, group });
      buckets.set(key, bucket);
    }
  }
  for (const bucket of buckets.values())
    for (const entry of bucket)
      if (entry.group.nodeIds.length > 1) groups.push(entry.group);
  if (groups.length > 200)
    throw new Error("Review fewer than 200 component groups at once.");
  return groups;
}

/** Produce a standalone editable template with only its required artwork. */
export function extractComponent(
  result: AnalysisResult,
  key: string,
  name?: string,
): AnalysisResult {
  const byId = new Map(flatten(result.package.roots).map((n) => [n.id, n]));
  const source = sources(result);
  const selected = key.startsWith("layer:")
    ? byId.get(key.slice(6))
    : undefined;
  const group =
    selected &&
    gui(selected) &&
    source.has(selected.id) &&
    source.get(selected.id)?.type !== "COMPONENT_SET"
      ? {
          key,
          name: selected.name,
          kind: "single" as const,
          nodeIds: [selected.id],
          states: undefined,
        }
      : reviewComponents(result).find((g) => g.key === key);
  if (!group) {
    const set = key.startsWith("states:") ? source.get(key.slice(7)) : undefined;
    if (
      set?.type === "COMPONENT_SET" &&
      set.children.some((child) => {
        const node = byId.get(child.id);
        return node && ownsNestedStateVisuals(node);
      })
    )
      throw new Error(
        "This state family has nested state visuals driven by a variant's own button. Extract that variant independently or remove its internal state configuration before grouping the family.",
      );
    throw new Error(
      "This component suggestion changed. Review the design again.",
    );
  }
  const templateName = (name ?? group.name).trim();
  if (!templateName || templateName.length > 100)
    throw new Error("Use a component name between 1 and 100 characters.");
  const baseId = group.states?.default ?? group.nodeIds[0],
    original = byId.get(baseId)!;
  if (externalReferences(original).length)
    throw new Error(
      "This component references an action, state, motion owner or mask coordinate parent outside its subtree. Include that dependency or configure an independent component first.",
    );
  const design = source.get(baseId)!;
  const width = design.width,
    height = design.height;
  if (!(width > 0 && height > 0 && width <= 8192 && height <= 8192))
    throw new Error(
      "The component needs positive bounds no larger than 8192 pixels.",
    );
  let component = clone(original);
  component.referenceSize = [width, height];
  component.name = templateName;
  component.properties.Position = { type: "UDim2", value: [0, 0, 0, 0] };
  component.properties.AnchorPoint = { type: "Vector2", value: [0, 0] };
  component.properties.Size = { type: "UDim2", value: [0, width, 0, height] };
  component.properties.LayoutOrder = 0;
  if (group.states) {
    // The input target is a fresh wrapper. Default's paint, layout and helper
    // metadata belongs only to its cloned state visual, alongside the other states.
    component = {
      id: `component:${group.key}`,
      name: templateName,
      className: "TextButton",
      referenceSize: [width, height],
      properties: {
        Position: { type: "UDim2", value: [0, 0, 0, 0] },
        AnchorPoint: { type: "Vector2", value: [0, 0] },
        Size: { type: "UDim2", value: [0, width, 0, height] },
        BackgroundTransparency: 1,
        BorderSizePixel: 0,
        Text: "",
        AutoButtonColor: false,
      },
      children: [],
    };
    component.children = Object.entries(group.states).map(([state, id]) => {
      const visual = clone(byId.get(id!)!);
      if (visual.className === "TextButton") visual.className = "TextLabel";
      if (visual.className === "ImageButton") visual.className = "ImageLabel";
      visual.properties = Object.fromEntries(
        Object.entries(visual.properties).filter(
          ([property]) => property in PROPERTY_SCHEMAS[visual.className],
        ),
      );
      visual.properties.Position = { type: "UDim2", value: [0, 0, 0, 0] };
      visual.properties.AnchorPoint = { type: "Vector2", value: [0, 0] };
      visual.properties.Size = { type: "UDim2", value: [1, 0, 1, 0] };
      visual.properties.Visible = state === "default";
      for (const descendant of flatten([visual]))
        for (const binding of [
          descendant.theme,
          descendant.behavior?.particles,
          descendant.behavior?.keyframes,
          descendant.behavior?.motion,
        ])
          if (binding?.owner === visual.id) binding.owner = component.id;
      const particles = visual.behavior?.particles;
      visual.behavior = {
        ...(particles ? { particles } : {}),
        state: { kind: state as ButtonState, owner: component.id },
      };
      return visual;
    });
  }
  const nodes = flatten([component]),
    referenced = new Set(
      nodes.flatMap((n) => imageReferences(n).map(([, id]) => id)),
    );
  const ids = new Set(nodes.map((n) => n.id));
  const pkg: TransferPackage = {
    ...clone(result.package),
    sourceId: `component:${digest(result.package.sourceId + ":" + group.key)}`,
    name: templateName,
    roots: [
      {
        id: `screen:component:${group.key}`,
        name: `${templateName} template`,
        className: "ScreenGui",
        referenceSize: [width, height],
        properties: {
          Enabled: true,
          IgnoreGuiInset: true,
          ResetOnSpawn: false,
        },
        children: [component],
      },
    ],
    assets: result.package.assets
      .filter((a) => referenced.has(a.id))
      .map(clone),
    issues: result.package.issues
      .filter((issue) => ids.has(issue.nodeId))
      .map(clone),
    stats: {
      layers: nodes.length,
      instances: nodes.length + 1,
      native: nodes.filter((n) => !n.assetRef).length,
      raster: nodes.filter((n) => n.assetRef).length,
    },
  };
  const usedThemeTokens = new Set(
    nodes.flatMap((n) =>
      [
        ...Object.values(n.theme?.base ?? {}),
        ...Object.values(n.theme?.hover ?? {}),
      ].map(([token]) => token),
    ),
  );
  if (usedThemeTokens.size) {
    const definitions = result.package.roots.find(
      (root) => flatten([root]).some((n) => ids.has(n.id)) && root.themes,
    )?.themes;
    if (!definitions)
      throw new Error("Component theme definitions are missing.");
    pkg.roots[0].themes = {
      ...clone(definitions),
      modes: Object.fromEntries(
        Object.entries(definitions.modes).map(([mode, tokens]) => [
          mode,
          Object.fromEntries(
            Object.entries(tokens).filter(([id]) => usedThemeTokens.has(id)),
          ),
        ]),
      ),
    };
  }
  validateExportPackage(pkg);
  return {
    package: pkg,
    assets: Object.fromEntries(
      [...referenced]
        .filter((id) => result.assets[id])
        .map((id) => [id, [...result.assets[id]]]),
    ),
    revision: result.revision,
    previews: {},
  };
}
