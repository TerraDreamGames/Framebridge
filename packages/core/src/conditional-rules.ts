import { flatten, type RbxNode, type Value } from "./types";

export type RuleScalar = string | number | boolean;
export type RulePredicate = {
  source: "attribute" | "leaderstats" | "viewport";
  key: string;
  operator: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "exists" | "missing";
  value?: RuleScalar;
};
export type RuleCondition = {
  mode: "all" | "any";
  predicates: RulePredicate[];
};
export const RULE_PROPERTIES = [
  "Visible",
  "Interactable",
  "Text",
  "BackgroundColor3",
  "TextColor3",
  "ImageColor3",
  "BackgroundTransparency",
  "TextTransparency",
  "ImageTransparency",
] as const;
export type RuleProperty = (typeof RULE_PROPERTIES)[number];
export type RuleAction = {
  target: string;
  property: RuleProperty;
  value: Value;
};
/** First matching branch wins; ELSE is optional. No user expressions or callbacks. */
export type ConditionalRule = {
  id: string;
  branches: { when: RuleCondition; then: RuleAction[] }[];
  else?: RuleAction[];
};
export const RULE_LIMITS = {
  perLayer: 8,
  perScreen: 32,
  branches: 8,
  predicates: 8,
  actions: 8,
  bytes: 12288,
} as const;
function textBytes(value: string): number {
  let size = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    size += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
  }
  return size;
}
export function ruleJSONBytes(value: unknown): number {
  return textBytes(JSON.stringify(value));
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: Record<string, unknown>, names: string[]) =>
  Object.keys(v).every((key) => names.includes(key));
const scalar = (v: unknown): v is RuleScalar =>
  typeof v === "boolean" ||
  (typeof v === "string" && textBytes(v) <= 4096) ||
  (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e9);
const identity = (v: unknown): v is string =>
  typeof v === "string" && !!v.trim() && textBytes(v) <= 256;
export function validRulePredicate(v: unknown): v is RulePredicate {
  if (
    !record(v) ||
    !fields(v, ["source", "key", "operator", "value"]) ||
    !["attribute", "leaderstats", "viewport"].includes(String(v.source)) ||
    typeof v.key !== "string" ||
    !/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(v.key)
  )
    return false;
  if (v.source === "viewport" && !["width", "height"].includes(v.key))
    return false;
  if (["exists", "missing"].includes(String(v.operator)))
    return v.value === undefined;
  if (
    !["eq", "ne", "lt", "lte", "gt", "gte"].includes(String(v.operator)) ||
    !scalar(v.value)
  )
    return false;
  if (v.source === "viewport" && typeof v.value !== "number") return false;
  return (
    ["eq", "ne"].includes(String(v.operator)) || typeof v.value === "number"
  );
}
export function validRuleCondition(v: unknown): v is RuleCondition {
  return (
    record(v) &&
    fields(v, ["mode", "predicates"]) &&
    ["all", "any"].includes(String(v.mode)) &&
    Array.isArray(v.predicates) &&
    v.predicates.length > 0 &&
    v.predicates.length <= RULE_LIMITS.predicates &&
    v.predicates.every(validRulePredicate)
  );
}
export function validRuleAction(v: unknown): v is RuleAction {
  if (
    !record(v) ||
    !fields(v, ["target", "property", "value"]) ||
    !identity(v.target) ||
    !RULE_PROPERTIES.includes(v.property as RuleProperty)
  )
    return false;
  const p = String(v.property);
  if (["Visible", "Interactable"].includes(p))
    return typeof v.value === "boolean";
  if (p === "Text")
    return typeof v.value === "string" && textBytes(v.value) <= 4096;
  if (p.endsWith("Transparency"))
    return (
      typeof v.value === "number" &&
      Number.isFinite(v.value) &&
      v.value >= 0 &&
      v.value <= 1
    );
  return (
    record(v.value) &&
    fields(v.value, ["type", "value"]) &&
    v.value.type === "Color3" &&
    Array.isArray(v.value.value) &&
    v.value.value.length === 3 &&
    v.value.value.every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
    )
  );
}
export function validRules(v: unknown): v is ConditionalRule[] {
  if (
    !Array.isArray(v) ||
    !v.length ||
    v.length > RULE_LIMITS.perLayer ||
    new Set(v.map((r) => record(r) && r.id)).size !== v.length
  )
    return false;
  const actions = (a: unknown) =>
    Array.isArray(a) &&
    a.length > 0 &&
    a.length <= RULE_LIMITS.actions &&
    a.every(validRuleAction) &&
    new Set(a.map((x) => x.target + "/" + x.property)).size === a.length;
  if (
    !v.every(
      (r) =>
        record(r) &&
        fields(r, ["id", "branches", "else"]) &&
        typeof r.id === "string" &&
        /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(r.id) &&
        Array.isArray(r.branches) &&
        r.branches.length > 0 &&
        r.branches.length <= RULE_LIMITS.branches &&
        r.branches.every(
          (b) =>
            record(b) &&
            fields(b, ["when", "then"]) &&
            validRuleCondition(b.when) &&
            actions(b.then),
        ) &&
        (r.else === undefined || actions(r.else)),
    )
  )
    return false;
  return ruleJSONBytes(v) <= RULE_LIMITS.bytes;
}
export function ruleActions(rule: ConditionalRule) {
  return [...rule.branches.flatMap((b) => b.then), ...(rule.else ?? [])];
}
export function addRuleDesignMarkers(nodes: RbxNode[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const properties = new Map<string, Set<RuleProperty>>();
  for (const n of nodes)
    for (const r of n.behavior?.rules ?? [])
      for (const a of ruleActions(r)) {
        if (!properties.has(a.target)) properties.set(a.target, new Set());
        properties.get(a.target)!.add(a.property);
      }
  for (const [id, keys] of properties) {
    const n = byId.get(id);
    if (!n) continue;
    const text = JSON.stringify(
      [...keys].sort().map((p) => [p, n.properties[p] ?? null]),
    );
    let a = 2166136261,
      b = 5381;
    for (let i = 0; i < text.length; i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619) >>> 0;
      b = (Math.imul(b, 33) ^ text.charCodeAt(i)) >>> 0;
    }
    n.behavior = {
      ...n.behavior,
      ruleDesign:
        a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0"),
    };
  }
}
export function ruleTargetProperty(
  node: RbxNode,
  property: RuleProperty,
): boolean {
  if (
    node.className.startsWith("UI") ||
    ["ScreenGui", "SurfaceGui", "BillboardGui"].includes(node.className) ||
    node.maskBasis ||
    node.decorationRect ||
    node.sourceType === "MOTION_SLOT"
  )
    return false;
  if (property === "Interactable")
    return ["TextButton", "ImageButton"].includes(node.className);
  if (
    property.startsWith("Text") &&
    !["TextLabel", "TextButton", "TextBox"].includes(node.className)
  )
    return false;
  if (
    property.startsWith("Image") &&
    !["ImageLabel", "ImageButton", "ViewportFrame"].includes(node.className)
  )
    return false;
  if (
    property.endsWith("Color3") &&
    node.children.some((n) => n.className === "UIGradient")
  )
    return false;
  return true;
}
/** Disallow competing ownership. Inputs are external, so actions cannot form feedback cycles. */
export function validateConditionalRules(nodes: RbxNode[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map(
    nodes.flatMap((n) => n.children.map((c) => [c.id, n] as const)),
  );
  const tabTargets = new Set(
    nodes.flatMap((n) =>
      n.behavior?.action?.kind === "tab" ? [n.behavior.action.target] : [],
    ),
  );
  const tooltipTargets = new Set(
    nodes.flatMap((n) =>
      n.behavior?.control?.kind === "tooltip"
        ? [n.behavior.control.target]
        : [],
    ),
  );
  const owned = new Map<string, ConditionalRule>();
  let count = 0;
  for (const node of nodes) {
    const rules = node.behavior?.rules;
    if (rules === undefined) continue;
    if (!validRules(rules) || (count += rules.length) > RULE_LIMITS.perScreen)
      throw new Error(
        "Invalid conditional rules or screen rule limit exceeded.",
      );
    for (const rule of rules)
      for (const action of ruleActions(rule)) {
        const target = byId.get(action.target);
        if (!target || !ruleTargetProperty(target, action.property))
          throw new Error(
            "Conditional actions need compatible targets in the same screen.",
          );
        const behavior = target.behavior;
        if (
          target.theme?.base[action.property] ||
          target.theme?.hover?.[action.property]
        )
          throw new Error(
            "Conditional action conflicts with a theme property owner.",
          );
        let ancestor: RbxNode | undefined = target;
        if (action.property.endsWith("Transparency"))
          while (ancestor && ancestor.className !== "CanvasGroup") {
            if (
              ancestor.behavior?.motion?.enter ||
              ancestor.behavior?.motion?.blink ||
              ancestor.behavior?.keyframes
            )
              throw new Error(
                "Conditional transparency conflicts with an animated fade owner.",
              );
            ancestor = parents.get(ancestor.id);
          }
        if (
          (action.property === "Visible" &&
            (behavior?.state ||
              behavior?.role === "tabGroup" ||
              tooltipTargets.has(target.id) ||
              (behavior?.role === "panel" && tabTargets.has(target.id)))) ||
          (action.property === "Text" && behavior?.binding) ||
          (action.property.endsWith("Color3") && behavior?.motion?.hover?.tint)
        )
          throw new Error(
            "Conditional action conflicts with a state, tab, binding or motion property owner.",
          );
        const key = action.target + "/" + action.property;
        if (owned.has(key) && owned.get(key) !== rule)
          throw new Error(
            "Only one conditional rule may own each target property.",
          );
        owned.set(key, rule);
      }
  }
}
export type RuleData = {
  attribute?: Record<string, RuleScalar>;
  leaderstats?: Record<string, RuleScalar>;
  viewport?: { width: number; height: number };
};
export function evaluatePredicate(
  predicate: RulePredicate,
  data: RuleData,
): boolean {
  const source = data[predicate.source];
  const v =
    source && Object.prototype.hasOwnProperty.call(source, predicate.key)
      ? (source as Record<string, unknown>)[predicate.key]
      : undefined;
  const exists = scalar(v);
  if (predicate.operator === "exists") return exists;
  if (predicate.operator === "missing") return !exists;
  if (!exists || typeof v !== typeof predicate.value) return false;
  if (predicate.operator === "eq") return v === predicate.value;
  if (predicate.operator === "ne") return v !== predicate.value;
  if (typeof v !== "number" || typeof predicate.value !== "number")
    return false;
  return predicate.operator === "lt"
    ? v < predicate.value
    : predicate.operator === "lte"
      ? v <= predicate.value
      : predicate.operator === "gt"
        ? v > predicate.value
        : v >= predicate.value;
}
export function evaluateRule(
  rule: ConditionalRule,
  data: RuleData,
): { branch: number; actions: RuleAction[] } {
  const index = rule.branches.findIndex((b) =>
    b.when.mode === "all"
      ? b.when.predicates.every((p) => evaluatePredicate(p, data))
      : b.when.predicates.some((p) => evaluatePredicate(p, data)),
  );
  return {
    branch: index,
    actions: index < 0 ? (rule.else ?? []) : rule.branches[index].then,
  };
}
export function conditionalInputs(root: RbxNode): RulePredicate[] {
  const inputs = flatten([root]).flatMap(
    (n) =>
      n.behavior?.rules?.flatMap((r) =>
        r.branches.flatMap((b) => b.when.predicates),
      ) ?? [],
  );
  return [...new Map(inputs.map((p) => [p.source + "/" + p.key, p])).values()];
}
