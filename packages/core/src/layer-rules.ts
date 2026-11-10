import type { EditableLayer } from "./bulk-editor";
import type { LayerOverride } from "./types";
export type LayerRuleField =
  | "name"
  | "exportName"
  | "className"
  | "sourceType"
  | "text"
  | "width"
  | "height"
  | "visible"
  | "baked"
  | "overridden";
export type LayerRulePredicate = {
  field: LayerRuleField;
  operator:
    "eq" | "ne" | "contains" | "notContains" | "lt" | "lte" | "gt" | "gte";
  value: string | number | boolean;
};
export type LayerMatchRule = {
  mode: "all" | "any";
  predicates: LayerRulePredicate[];
};
export const LAYER_RULE_FIELDS: LayerRuleField[] = [
  "name",
  "exportName",
  "className",
  "sourceType",
  "text",
  "width",
  "height",
  "visible",
  "baked",
  "overridden",
];
export function validLayerMatchRule(v: unknown): v is LayerMatchRule {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as LayerMatchRule;
  if (
    Object.keys(r).some((k) => !["mode", "predicates"].includes(k)) ||
    !["all", "any"].includes(r.mode) ||
    !Array.isArray(r.predicates) ||
    !r.predicates.length ||
    r.predicates.length > 8
  )
    return false;
  return r.predicates.every((p) => {
    if (
      !p ||
      typeof p !== "object" ||
      Array.isArray(p) ||
      Object.keys(p).some((k) => !["field", "operator", "value"].includes(k)) ||
      !LAYER_RULE_FIELDS.includes(p.field)
    )
      return false;
    const equality = ["eq", "ne"].includes(p.operator);
    if (["visible", "baked", "overridden"].includes(p.field))
      return equality && typeof p.value === "boolean";
    if (["width", "height"].includes(p.field))
      return (
        (equality || ["lt", "lte", "gt", "gte"].includes(p.operator)) &&
        typeof p.value === "number" &&
        Number.isFinite(p.value) &&
        p.value >= 0 &&
        p.value <= 1000000
      );
    return (
      (equality || ["contains", "notContains"].includes(p.operator)) &&
      typeof p.value === "string" &&
      p.value.length <= 256
    );
  });
}
export function matchLayers(
  layers: EditableLayer[],
  overrides: Record<string, LayerOverride>,
  rule: LayerMatchRule,
): EditableLayer[] {
  if (!validLayerMatchRule(rule))
    throw new Error("Invalid layer matching rule.");
  if (
    layers.length > 15000 ||
    new Set(layers.map((l) => l.node.id)).size !== layers.length
  )
    throw new Error("Choose up to 15,000 distinct layers.");
  const test = (layer: EditableLayer, p: LayerRulePredicate) => {
    const n = layer.node,
      s = layer.source;
    const values: Record<LayerRuleField, string | number | boolean> = {
      name: s?.name ?? n.name,
      exportName: n.name,
      className: n.className,
      sourceType: s?.type ?? n.sourceType ?? "",
      text: s?.text?.characters ?? String(n.properties.Text ?? ""),
      width: s?.width ?? n.referenceSize?.[0] ?? 0,
      height: s?.height ?? n.referenceSize?.[1] ?? 0,
      visible: n.properties.Visible !== false,
      baked: !!layer.baked,
      overridden: !!overrides[n.id],
    };
    let value = values[p.field],
      operand = p.value;
    if (typeof value === "string" && typeof operand === "string") {
      value = value.toLowerCase();
      operand = operand.toLowerCase();
    }
    if (p.operator === "eq") return value === operand;
    if (p.operator === "ne") return value !== operand;
    if (typeof value === "string" && typeof operand === "string")
      return p.operator === "contains"
        ? value.includes(operand)
        : !value.includes(operand);
    if (typeof value !== "number" || typeof operand !== "number") return false;
    return p.operator === "lt"
      ? value < operand
      : p.operator === "lte"
        ? value <= operand
        : p.operator === "gt"
          ? value > operand
          : value >= operand;
  };
  return layers.filter((layer) =>
    rule.mode === "all"
      ? rule.predicates.every((p) => test(layer, p))
      : rule.predicates.some((p) => test(layer, p)),
  );
}
