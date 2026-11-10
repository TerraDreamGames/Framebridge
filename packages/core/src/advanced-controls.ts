import { cloneSettings } from "./clone-settings";
import type { RbxNode } from "./types";

export type ControlData = { source: "attribute" | "leaderstats"; key: string };
export type AdvancedControl =
  | {
      kind: "progress";
      min: number;
      max: number;
      value: number;
      axis: "X" | "Y";
      fill: string;
      data?: ControlData;
    }
  | { kind: "toggle"; value: boolean; data?: ControlData }
  | {
      kind: "slider";
      min: number;
      max: number;
      value: number;
      step: number;
      axis: "X" | "Y";
      fill?: string;
      thumb?: string;
      data?: ControlData;
    }
  | { kind: "cooldown"; duration: number; fill?: string }
  | { kind: "tooltip"; target: string; delay: number }
  | { kind: "window"; handle?: string; constrain: boolean }
  | { kind: "skill"; requires: string[]; unlocked: boolean; data?: ControlData }
  | { kind: "roulette"; items: string[]; duration: number };
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: Record<string, any>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const finite = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const identity = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 256;
export function validControlData(v: unknown): v is ControlData {
  return (
    record(v) &&
    fields(v, ["source", "key"]) &&
    ["attribute", "leaderstats"].includes(v.source) &&
    typeof v.key === "string" &&
    /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(v.key)
  );
}
export function validControl(v: unknown): v is AdvancedControl {
  if (!record(v) || (v.data !== undefined && !validControlData(v.data)))
    return false;
  const common = ["kind", "data"];
  switch (v.kind) {
    case "progress":
    case "slider":
      return (
        fields(v, [
          ...common,
          "min",
          "max",
          "value",
          "axis",
          "fill",
          ...(v.kind === "slider" ? ["step", "thumb"] : []),
        ]) &&
        finite(v.min, -1e9, 1e9) &&
        finite(v.max, -1e9, 1e9) &&
        v.max > v.min &&
        finite(v.value, v.min, v.max) &&
        ["X", "Y"].includes(v.axis) &&
        (v.kind === "progress"
          ? identity(v.fill)
          : (v.fill === undefined || identity(v.fill)) &&
            (v.thumb === undefined || identity(v.thumb)) &&
            finite(v.step, 0.000001, v.max - v.min))
      );
    case "toggle":
      return fields(v, [...common, "value"]) && typeof v.value === "boolean";
    case "cooldown":
      return (
        fields(v, ["kind", "duration", "fill"]) &&
        finite(v.duration, 0.05, 3600) &&
        (v.fill === undefined || identity(v.fill))
      );
    case "tooltip":
      return (
        fields(v, ["kind", "target", "delay"]) &&
        identity(v.target) &&
        finite(v.delay, 0, 5)
      );
    case "window":
      return (
        fields(v, ["kind", "handle", "constrain"]) &&
        typeof v.constrain === "boolean" &&
        (v.handle === undefined || identity(v.handle))
      );
    case "skill":
      return (
        fields(v, [...common, "requires", "unlocked"]) &&
        typeof v.unlocked === "boolean" &&
        Array.isArray(v.requires) &&
        v.requires.length <= 16 &&
        v.requires.every(identity) &&
        new Set(v.requires).size === v.requires.length
      );
    case "roulette":
      return (
        fields(v, ["kind", "items", "duration"]) &&
        finite(v.duration, 0.1, 30) &&
        Array.isArray(v.items) &&
        v.items.length >= 2 &&
        v.items.length <= 64 &&
        v.items.every(
          (s: unknown) =>
            typeof s === "string" && s.trim().length && s.length <= 128,
        )
      );
    default:
      return false;
  }
}
export const controlNeedsButton = (c?: AdvancedControl) =>
  !!c &&
  ["toggle", "slider", "cooldown", "tooltip", "skill", "roulette"].includes(
    c.kind,
  );
export function controlReferences(c: AdvancedControl): string[] {
  return c.kind === "skill"
    ? c.requires
    : c.kind === "tooltip"
      ? [c.target]
      : c.kind === "window"
        ? c.handle
          ? [c.handle]
          : []
        : "fill" in c
          ? [c.fill, "thumb" in c ? c.thumb : undefined].filter(
              (s): s is string => !!s,
            )
          : [];
}
export function remapControl(
  c: AdvancedControl,
  resolve: (id: string) => string,
): AdvancedControl {
  const next = cloneSettings(c);
  if (next.kind === "skill") next.requires = next.requires.map(resolve);
  else if (next.kind === "tooltip") next.target = resolve(next.target);
  else if (next.kind === "window" && next.handle)
    next.handle = resolve(next.handle);
  else if ("fill" in next && next.fill) next.fill = resolve(next.fill);
  if (next.kind === "slider" && next.thumb) next.thumb = resolve(next.thumb);
  return next;
}
export function validateControls(
  nodes: RbxNode[],
  byId: Map<string, RbxNode>,
  parents: Map<string, RbxNode>,
) {
  const used = new Set<string>();
  const descendant = (child: RbxNode, ancestor: RbxNode) => {
    let p = parents.get(child.id);
    while (p) {
      if (p === ancestor) return true;
      p = parents.get(p.id);
    }
    return false;
  };
  for (const node of nodes) {
    const c = node.behavior?.control;
    if (c === undefined) continue;
    const fail = (ok: unknown, message: string) => {
      if (!ok) throw new Error(`${node.name}: ${message}`);
    };
    fail(validControl(c), "Invalid advanced control settings.");
    fail(
      !controlNeedsButton(c) ||
        ["TextButton", "ImageButton"].includes(node.className),
      "This control needs a button.",
    );
    fail(
      !node.behavior?.keyframes &&
        !node.behavior?.state &&
        !node.behavior?.motion &&
        (!node.behavior?.action || c.kind === "cooldown"),
      "Controls cannot share a state visual, motion, or activation action (except cooldown actions).",
    );
    if (c.kind === "slider")
      fail(
        !node.properties.AutomaticSize ||
          (node.properties.AutomaticSize as any).value?.[1] === "None",
        "Slider tracks cannot use automatic size.",
      );
    for (const id of controlReferences(c)) {
      const target = byId.get(id);
      fail(
        target &&
          !target.className.startsWith("UI") &&
          !["ScreenGui", "SurfaceGui", "BillboardGui"].includes(
            target.className,
          ),
        "Control target must be GUI content in the same screen.",
      );
      if (!target) continue;
      if (c.kind === "skill")
        fail(
          id !== node.id && target.behavior?.control?.kind === "skill",
          "Skill prerequisites must be other skill controls.",
        );
      else if (c.kind === "tooltip")
        fail(
          target.behavior?.role === "panel" &&
            !descendant(node, target) &&
            !target.behavior.keyframes &&
            !target.behavior.motion &&
            !target.behavior.control &&
            !target.behavior.state &&
            parents.get(target.id)?.behavior?.role !== "tabGroup" &&
            !nodes.some((n) => n.behavior?.action?.target === target.id),
          "Tooltip target needs a separate panel without motion, controls, tabs or panel actions.",
        );
      else {
        fail(
          descendant(target, node),
          "Control artwork and handles must be descendants of the control.",
        );
        fail(
          !target.behavior,
          "Control artwork and handles cannot carry another interaction.",
        );
        const parent = parents.get(target.id);
        fail(
          c.kind === "window" ||
            (parent === node &&
              !node.children.some((n) =>
                ["UIListLayout", "UIGridLayout"].includes(n.className),
              ) &&
              !target.children.some((n) =>
                [
                  "UIAspectRatioConstraint",
                  "UISizeConstraint",
                  "UIFlexItem",
                ].includes(n.className),
              ) &&
              (!target.properties.AutomaticSize ||
                (target.properties.AutomaticSize as any).value?.[1] ===
                  "None")),
          "Fill and thumb must be direct children without layout, size constraints or automatic size ownership.",
        );
      }
      if (c.kind !== "skill") {
        fail(!used.has(id), "Control target already has an owner.");
        used.add(id);
      }
    }
    if (c.kind === "window") {
      fail(
        !parents
          .get(node.id)
          ?.children.some((n) =>
            ["UIListLayout", "UIGridLayout"].includes(n.className),
          ),
        "Draggable windows cannot belong to native list/grid layouts.",
      );
      let ancestor: RbxNode | undefined = node;
      while (ancestor) {
        fail(
          !ancestor.properties.Rotation,
          "Draggable windows need unrotated ancestors.",
        );
        ancestor = parents.get(ancestor.id);
      }
    }
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id))
      throw new Error("Skill prerequisites contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    const c = byId.get(id)?.behavior?.control;
    if (c?.kind === "skill") c.requires.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  nodes.forEach((n) => {
    if (n.behavior?.control?.kind === "skill") visit(n.id);
  });
}
