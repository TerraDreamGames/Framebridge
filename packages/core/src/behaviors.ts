import { cloneSettings } from "./clone-settings";
import { validParticles, validateParticles } from "./particles";
import {
  validKeyframes,
  compileKeyframes,
  needsKeyframeInput,
  validateKeyframeOwnership,
} from "./keyframes";
import {
  validControl,
  remapControl,
  validateControls,
} from "./advanced-controls";
import {
  flatten,
  type CompiledBehavior,
  type DesignNode,
  type LayerBehavior,
  type LayerOverride,
  type RbxNode,
  type TransferPackage,
} from "./types";
import {
  addMotionSlots,
  hasSpatialMotion,
  motionFromTags,
  motionParent,
  needsMotionInput,
  stripMotionTags,
  validMotion,
} from "./motion";
import {
  validRules,
  ruleActions,
  ruleJSONBytes,
  addRuleDesignMarkers,
  validateConditionalRules,
} from "./conditional-rules";

const states = ["default", "hover", "pressed", "disabled", "selected"];
const actions = ["open", "close", "toggle", "tab"];
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const identity = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 256;
export function validBinding(value: unknown): boolean {
  return (
    record(value) &&
    keys(value, ["source", "key", "template"]) &&
    (value.source === "attribute" || value.source === "leaderstats") &&
    typeof value.key === "string" &&
    /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(value.key) &&
    typeof value.template === "string" &&
    value.template.length <= 4096 &&
    value.template.includes("{value}")
  );
}
export function validLayerBehavior(value: unknown): value is LayerBehavior {
  return (
    record(value) &&
    keys(value, [
      "role",
      "initialVisible",
      "action",
      "state",
      "binding",
      "motion",
      "control",
      "rules",
      "keyframes",
      "particles",
    ]) &&
    (value.role === undefined ||
      value.role === "panel" ||
      value.role === "tabGroup") &&
    (value.initialVisible === undefined ||
      typeof value.initialVisible === "boolean") &&
    (value.state === undefined ||
      (typeof value.state === "string" && states.includes(value.state))) &&
    (value.binding === undefined || validBinding(value.binding)) &&
    (value.control === undefined || validControl(value.control)) &&
    (value.keyframes === undefined || validKeyframes(value.keyframes)) &&
    (value.particles === undefined || validParticles(value.particles)) &&
    (value.motion === undefined || validMotion(value.motion)) &&
    (value.rules === undefined || validRules(value.rules)) &&
    ruleJSONBytes(value) <= 16384 &&
    (value.action === undefined ||
      (record(value.action) &&
        keys(value.action, ["kind", "target"]) &&
        typeof value.action.kind === "string" &&
        actions.includes(value.action.kind) &&
        (value.action.target === undefined
          ? value.action.kind === "close"
          : identity(value.action.target))))
  );
}
/** Bracket tags are preferred. Underscore aliases keep established workflows familiar. */
export function layerBehavior(
  node: DesignNode,
  override?: LayerOverride,
): LayerBehavior | undefined {
  if (override?.behavior === false) return;
  const value: LayerBehavior = {};
  const motion = motionFromTags(node);
  if (motion) value.motion = motion;
  const name = node.name;
  if (/\[panel\]|_panel(?:$|_)/i.test(name)) value.role = "panel";
  if (/\[tabgroup\]|_tabgroup(?:$|_)/i.test(name)) value.role = "tabGroup";
  const action =
    name.match(/\[(open|close|toggle|tab)(?::([^\]]+))?\]/i) ??
    name.match(/_(open|close|toggle|tab)(?::([^\s\[\]]+))?$/i);
  if (action && (action[2]?.trim() || action[1].toLowerCase() === "close"))
    value.action = {
      kind: action[1].toLowerCase() as NonNullable<
        LayerBehavior["action"]
      >["kind"],
      ...(action[2]?.trim() ? { target: action[2].trim() } : {}),
    };
  const state =
    name.match(/\[state:(default|hover|pressed|disabled|selected)\]/i) ??
    name.match(/_(default|hover|clicked|pressed|disabled|active|selected)$/i);
  if (state)
    value.state = ({ clicked: "pressed", active: "selected" }[
      state[1].toLowerCase()
    ] ?? state[1].toLowerCase()) as LayerBehavior["state"];
  const binding = name.match(
    /\[bind:(attribute|leaderstats)\.([A-Za-z_][A-Za-z0-9_-]{0,127})\]/i,
  );
  const live = node.text?.characters.match(
    /\{([A-Za-z_][A-Za-z0-9_-]{0,127})\}/,
  );
  if (binding)
    value.binding = {
      source: binding[1].toLowerCase() as "attribute" | "leaderstats",
      key: binding[2],
      template: (node.text?.characters ?? "{value}")
        .split(`{${binding[2]}}`)
        .join("{value}"),
    };
  else if (live && node.text)
    value.binding = {
      source: "leaderstats",
      key: live[1],
      template: node.text.characters.split(live[0]).join("{value}"),
    };
  if (override?.behavior !== undefined) {
    if (!validLayerBehavior(override.behavior))
      throw new Error(`Invalid interaction settings for ${node.name}.`);
    // An explicit configuration replaces tags, so choosing None really removes an action.
    const configured = JSON.parse(JSON.stringify(override.behavior));
    return Object.keys(configured).length ? configured : undefined;
  }
  return Object.keys(value).length ? value : undefined;
}
export function behaviorLayerName(name: string): string {
  return (
    stripMotionTags(name)
      .replace(
        /\[(?:panel|tabgroup|(?:open|close|toggle|tab)(?::[^\]]+)?|state:(?:default|hover|pressed|disabled|selected)|bind:(?:attribute|leaderstats)\.[^\]]+)\]/gi,
        "",
      )
      .replace(
        /_(?:panel|tabgroup|default|hover|clicked|pressed|disabled|active|selected)$/i,
        "",
      )
      .replace(/_(?:open|close|toggle|tab)(?::[^\s\[\]]+)?$/i, "")
      .trim() || "Layer"
  );
}
export function needsBehaviorHierarchy(
  node: DesignNode,
  overrides: Record<string, LayerOverride>,
): boolean {
  return (
    !!layerBehavior(node, overrides[node.id]) ||
    !!overrides[node.id]?.theme ||
    node.children.some((child) => needsBehaviorHierarchy(child, overrides))
  );
}
const button = (node: RbxNode) =>
  ["TextButton", "ImageButton"].includes(node.className);
const gui = (node: RbxNode) =>
  !node.className.startsWith("UI") &&
  !["ScreenGui", "SurfaceGui", "BillboardGui"].includes(node.className);

export function applyBehaviors(
  pkg: TransferPackage,
  designs: DesignNode[],
  overrides: Record<string, LayerOverride>,
): TransferPackage {
  const sources = new Map<string, DesignNode>();
  function walk(nodes: DesignNode[]) {
    for (const node of nodes) {
      sources.set(node.id, node);
      walk(node.children);
    }
  }
  walk(designs);
  for (const root of pkg.roots) {
    const nodes = flatten([root]);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const parents = new Map<string, RbxNode>();
    nodes.forEach((node) =>
      node.children.forEach((child) => parents.set(child.id, node)),
    );
    const inputs = new Map(
      nodes.flatMap((node) => {
        const source = sources.get(node.id);
        const input = source && layerBehavior(source, overrides[node.id]);
        return input ? [[node.id, input] as const] : [];
      }),
    );
    const error = (node: RbxNode, message: string) =>
      pkg.issues.push({
        nodeId: node.id,
        nodeName: node.name,
        code: "behavior-invalid",
        severity: "error",
        message,
      });
    const nearest = (
      node: RbxNode,
      predicate: (parent: RbxNode) => boolean,
    ) => {
      let parent = parents.get(node.id);
      while (parent) {
        if (predicate(parent)) return parent;
        parent = parents.get(parent.id);
      }
    };
    for (const node of nodes) {
      const input = inputs.get(node.id);
      if (!input) continue;
      const behavior: CompiledBehavior = {};
      if (!gui(node)) {
        error(node, "Interaction settings need a GUI layer.");
        continue;
      }
      if (input.role) behavior.role = input.role;
      if (input.keyframes) {
        try {
          const keyframes = compileKeyframes(
            input.keyframes,
            node,
            nodes,
            sources.get(node.id)?.opacity ?? 1,
          );
          if (needsKeyframeInput(keyframes)) {
            const owner =
              keyframes.input !== "parent" && button(node)
                ? node
                : nearest(node, button);
            if (owner) keyframes.owner = owner.id;
            else
              error(
                node,
                "Keyframe state/action triggers need this button or a nearest parent button.",
              );
          }
          behavior.keyframes = keyframes;
        } catch (why) {
          error(node, String(why instanceof Error ? why.message : why));
        }
      }
      if (input.particles) {
        const particles = cloneSettings(
          input.particles,
        ) as import("./particles").CompiledParticles;
        if (particles.trigger === "activate") {
          const owner = button(node) ? node : nearest(node, button);
          if (owner) particles.owner = owner.id;
          else
            error(
              node,
              "Activated particles need a button or nearest ancestor button.",
            );
        }
        behavior.particles = particles;
      }
      if (input.control) {
        behavior.control = remapControl(input.control, (target) => {
          if (byId.has(target)) return target;
          const matches = nodes.filter(
            (n) =>
              n.name === target ||
              behaviorLayerName(sources.get(n.id)?.name ?? "") === target,
          );
          if (matches.length !== 1) {
            error(
              node,
              "Control target is missing or ambiguous in this screen.",
            );
            return target;
          }
          return matches[0].id;
        });
        if (input.control.kind === "window") node.properties.Active = true;
      }
      if (input.rules) {
        behavior.rules = cloneSettings(input.rules);
        for (const rule of behavior.rules)
          for (const action of ruleActions(rule)) {
            const matches = byId.has(action.target)
              ? [byId.get(action.target)!]
              : nodes.filter(
                  (n) =>
                    n.name === action.target ||
                    sources.get(n.id)?.name === action.target ||
                    behaviorLayerName(sources.get(n.id)?.name ?? "") ===
                      action.target,
                );
            if (matches.length === 1) action.target = matches[0].id;
            else
              error(
                node,
                "Conditional action target is missing or ambiguous in this screen.",
              );
          }
      }
      if (input.motion) {
        const motion = cloneSettings(input.motion);
        if (needsMotionInput(motion)) {
          const owner =
            motion.input !== "parent" && button(node)
              ? node
              : nearest(node, button);
          if (owner)
            (motion as import("./motion").CompiledMotion).owner = owner.id;
          else
            error(
              node,
              "Interactive motion needs a button or a parent button. Choose a button instance type or remove the input effect.",
            );
        }
        if (
          motion.drift &&
          (!["ImageLabel", "ImageButton"].includes(node.className) ||
            typeof node.properties.ScaleType !== "object" ||
            node.properties.ScaleType.type !== "Enum" ||
            node.properties.ScaleType.value[1] !== "Tile")
        )
          error(node, "Texture drift needs an image with Tile image fit.");
        behavior.motion = motion;
      }
      if (input.initialVisible !== undefined) {
        if (!input.role)
          error(node, "Initial visibility needs a panel or tab-group role.");
        else node.properties.Visible = input.initialVisible;
      }
      if (input.binding) {
        if (!["TextLabel", "TextButton"].includes(node.className))
          error(node, "Live text needs an editable TextLabel or TextButton.");
        else if (!validBinding(input.binding))
          error(
            node,
            "Choose a valid data key and include {value} in the label template.",
          );
        else behavior.binding = input.binding;
      }
      if (input.action) {
        const { kind, target } = input.action;
        const matches = target
          ? byId.has(target)
            ? [byId.get(target)!]
            : nodes.filter(
                (candidate) =>
                  candidate.name === target ||
                  behaviorLayerName(sources.get(candidate.id)?.name ?? "") ===
                    target ||
                  sources.get(candidate.id)?.name === target,
              )
          : [];
        const resolved = target
          ? matches.length === 1
            ? matches[0]
            : undefined
          : nearest(
              node,
              (candidate) => inputs.get(candidate.id)?.role === "panel",
            );
        if (!button(node))
          error(
            node,
            "An action needs a TextButton or ImageButton. Choose a button instance type.",
          );
        else if (!resolved || inputs.get(resolved.id)?.role !== "panel")
          error(
            node,
            "Choose one panel in this screen. Missing or ambiguous targets cannot be wired.",
          );
        else if (
          kind === "tab" &&
          inputs.get(parents.get(resolved.id)?.id ?? "")?.role !== "tabGroup"
        )
          error(
            node,
            "A tab target must be a direct panel child of a tab group.",
          );
        else behavior.action = { kind, target: resolved.id };
      }
      if (input.state) {
        const owner = nearest(node, button);
        if (!owner)
          error(node, "A state visual must be inside its owning button.");
        else if (button(node))
          error(
            node,
            "State visuals must be frames, images, or labels, with one input target on the owning button.",
          );
        else behavior.state = { kind: input.state, owner: owner.id };
      }
      if (Object.keys(behavior).length) node.behavior = behavior;
    }
    addRuleDesignMarkers(nodes);
  }
  try {
    addMotionSlots(pkg.roots);
    pkg.stats.instances = flatten(pkg.roots).length;
    validateBehaviors(pkg.roots);
  } catch (error) {
    pkg.issues.push({
      nodeId: pkg.roots[0]?.id ?? "",
      nodeName: pkg.name,
      code: "behavior-invalid",
      severity: "error",
      message: String(error instanceof Error ? error.message : error),
    });
  }
  return pkg;
}

/** Validate untrusted transfer data, including target scope and ownership. */
export function validateBehaviors(roots: RbxNode[]): void {
  for (const root of roots) {
    const nodes = flatten([root]);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    if (
      nodes.some(
        (node) =>
          node.behavior ||
          node.maskBasis ||
          node.decorationRect ||
          node.layoutCanvas,
      ) &&
      (byId.has(`${root.id}/behavior-runtime`) ||
        byId.has(`${root.id}/behavior-runtime/module`))
    )
      throw new Error("Reserved interaction runtime identity.");
    const parents = new Map<string, RbxNode>();
    for (const node of nodes)
      if (
        node.layoutCanvas !== undefined &&
        (node.layoutCanvas !== true ||
          node.className !== "ScrollingFrame" ||
          node.maskBasis)
      )
        throw new Error("Invalid proportional layout canvas.");
    nodes.forEach((node) =>
      node.children.forEach((child) => parents.set(child.id, node)),
    );
    validateKeyframeOwnership(nodes, byId, parents);
    validateControls(nodes, byId, parents);
    validateParticles([root]);
    const owned = new Set<string>();
    for (const node of nodes) {
      if (node.behavior === undefined) continue;
      const b = node.behavior;
      const fail = (condition: boolean, detail: string) => {
        if (!condition) throw new Error(`${node.name}: ${detail}`);
      };
      fail(
        record(b) &&
          keys(b, [
            "role",
            "action",
            "state",
            "binding",
            "motion",
            "control",
            "rules",
            "ruleDesign",
            "keyframes",
            "particles",
          ]) &&
          gui(node) &&
          ruleJSONBytes(b) <= 16384,
        "Invalid interaction data.",
      );
      if (b.ruleDesign !== undefined)
        fail(
          typeof b.ruleDesign === "string" &&
            /^[a-f0-9]{16}$/.test(b.ruleDesign),
          "Invalid conditional design marker.",
        );
      if (b.role !== undefined)
        fail(
          b.role === "panel" || b.role === "tabGroup",
          "Invalid container role.",
        );
      if (b.binding !== undefined)
        fail(
          validBinding(b.binding) &&
            ["TextLabel", "TextButton"].includes(node.className),
          "Invalid live-text binding.",
        );
      if (b.action !== undefined) {
        fail(
          record(b.action) &&
            keys(b.action, ["kind", "target"]) &&
            actions.includes(b.action.kind) &&
            identity(b.action.target) &&
            button(node),
          "Invalid action.",
        );
        const target = byId.get(b.action.target);
        fail(
          target?.behavior?.role === "panel",
          "Action targets must be panels in the same screen.",
        );
        if (b.action.kind === "tab")
          fail(
            motionParent(target!, parents)?.behavior?.role === "tabGroup",
            "Tab panels must belong directly to a tab group.",
          );
      }
      if (b.state !== undefined) {
        fail(
          record(b.state) &&
            keys(b.state, ["kind", "owner"]) &&
            states.includes(b.state.kind) &&
            identity(b.state.owner) &&
            !button(node),
          "Invalid state visual.",
        );
        let parent = parents.get(node.id);
        while (parent && !button(parent)) parent = parents.get(parent.id);
        fail(
          parent?.id === b.state.owner,
          "State owner must be the nearest ancestor button.",
        );
        const key = `${b.state.owner}/${b.state.kind}`;
        fail(
          !owned.has(key),
          "Use one visual for each button state; group its artwork together.",
        );
        owned.add(key);
      }
      if (b.motion !== undefined) {
        const motion = b.motion;
        fail(validMotion(motion, true), "Invalid motion settings.");
        if (needsMotionInput(motion)) {
          let owner: RbxNode | undefined =
            motion.input !== "parent" && button(node)
              ? node
              : parents.get(node.id);
          while (owner && !button(owner)) owner = parents.get(owner.id);
          fail(
            owner?.id === motion.owner && !!owner,
            "Motion input must use this button or its nearest ancestor button.",
          );
        } else
          fail(
            motion.owner === undefined,
            "Idle motion cannot reference an input owner.",
          );
        if (hasSpatialMotion(motion)) {
          const slot = parents.get(node.id);
          fail(
            !!slot &&
              slot.id === `${node.id}/motion-slot` &&
              slot.id === motion.slot &&
              slot.className === "Frame" &&
              slot.children.filter(gui).length === 1,
            "Spatial motion needs its own generated layout slot.",
          );
        } else
          fail(
            motion.slot === undefined,
            "Non-spatial motion cannot reference a layout slot.",
          );
        if (motion.drift)
          fail(
            ["ImageLabel", "ImageButton"].includes(node.className) &&
              typeof node.properties.ScaleType === "object" &&
              node.properties.ScaleType.type === "Enum" &&
              node.properties.ScaleType.value[1] === "Tile",
            "Texture drift needs a tiled image.",
          );
      }
    }
    validateConditionalRules(nodes);
  }
}
export const hasBehaviors = (pkg: TransferPackage) =>
  flatten(pkg.roots).some(
    (node) =>
      !!node.behavior ||
      !!node.themes ||
      !!node.worldUI ||
      !!node.maskBasis ||
      !!node.layoutCanvas ||
      !!node.textDecoration ||
      !!node.decorationRect,
  );
