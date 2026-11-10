import { PROPERTY_SCHEMAS, validProperty, type PropertySpec } from "./editor";
import type { DesignNode, LayerOverride, RbxNode, Value } from "./types";

export type EditableLayer = {
  node: RbxNode;
  source?: DesignNode;
  baked?: boolean;
};
export type OverrideChange = { id: string; value: LayerOverride | undefined };
export type PropertyPart = number | "family" | "weight" | "style";

export function layerClassChoices(
  layer: EditableLayer,
  edit: LayerOverride = {},
): string[] {
  if (!layer.source || layer.baked) return [];
  if (
    edit.renderMode === "image" ||
    edit.className?.startsWith("Image") ||
    layer.node.className.startsWith("Image")
  )
    return ["ImageLabel", "ImageButton"];
  return layer.source.text
    ? ["TextLabel", "TextButton", "TextBox"]
    : ["Frame", "CanvasGroup", "ScrollingFrame", "ViewportFrame", "TextButton"];
}

export function commonClassChoices(
  layers: EditableLayer[],
  overrides: Record<string, LayerOverride>,
): string[] {
  const first =
    layers[0] && layerClassChoices(layers[0], overrides[layers[0].node.id]);
  return (
    first?.filter((name) =>
      layers.every((layer) =>
        layerClassChoices(layer, overrides[layer.node.id]).includes(name),
      ),
    ) ?? []
  );
}

export function commonPropertySchema(
  layers: EditableLayer[],
): Record<string, PropertySpec> {
  if (!layers.length || layers.some((layer) => layer.baked)) return {};
  const result: Record<string, PropertySpec> = {};
  for (const [name, first] of Object.entries(
    PROPERTY_SCHEMAS[layers[0].node.className] ?? {},
  )) {
    const specs = layers.map(
      (layer) => PROPERTY_SCHEMAS[layer.node.className]?.[name],
    );
    if (
      specs.some(
        (spec) => !spec || spec.kind !== first.kind || spec.enum !== first.enum,
      )
    )
      continue;
    const spec = { ...first };
    if (first.min !== undefined)
      spec.min = Math.max(...specs.map((spec) => spec.min ?? -Infinity));
    if (first.max !== undefined)
      spec.max = Math.min(...specs.map((spec) => spec.max ?? Infinity));
    if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max)
      continue;
    if (first.choices) {
      spec.choices = first.choices.filter((choice) =>
        specs.every((spec) => spec.choices?.includes(choice)),
      );
      if (!spec.choices.length) continue;
    }
    result[name] = spec;
  }
  return result;
}

export function layerPropertyValue(layer: EditableLayer, name: string): Value {
  return (
    layer.node.properties[name] ??
    (layer.node.className === "UICorner" && name.endsWith("Radius")
      ? (layer.node.properties.CornerRadius ??
        layer.node.properties.TopLeftRadius)
      : undefined) ??
    PROPERTY_SCHEMAS[layer.node.className]?.[name]?.default
  );
}

export function sharedValue<T>(values: T[]): T | undefined {
  return values.length &&
    values.every((value) => JSON.stringify(value) === JSON.stringify(values[0]))
    ? values[0]
    : undefined;
}

function uniqueLayers(layers: EditableLayer[]) {
  if (
    !layers.length ||
    layers.length > 15000 ||
    new Set(layers.map((layer) => layer.node.id)).size !== layers.length
  )
    throw new Error("Choose distinct layers to edit.");
}

export function classChanges(
  layers: EditableLayer[],
  overrides: Record<string, LayerOverride>,
  className: string,
): OverrideChange[] {
  uniqueLayers(layers);
  if (
    layers.some((layer) => !layer.source || layer.baked) ||
    (className !== "auto" &&
      !commonClassChoices(layers, overrides).includes(className))
  )
    throw new Error(
      "Choose a class compatible with every selected source layer.",
    );
  return layers.map((layer) => {
    const edit = overrides[layer.node.id] ?? {};
    return {
      id: layer.node.id,
      value: {
        ...edit,
        className: className === "auto" ? undefined : className,
        renderMode:
          className === "auto"
            ? "auto"
            : className.startsWith("Image")
              ? "image"
              : "native",
      },
    };
  });
}

export function propertyChanges(
  layers: EditableLayer[],
  overrides: Record<string, LayerOverride>,
  name: string,
  next: Value | undefined,
  part?: PropertyPart,
): OverrideChange[] {
  uniqueLayers(layers);
  if (!commonPropertySchema(layers)[name])
    throw new Error("This property is not shared by every selected layer.");
  return layers.map((layer) => {
    const edit = overrides[layer.node.id] ?? {};
    const properties = { ...edit.properties };
    if (next === undefined) delete properties[name];
    else {
      let value = next;
      if (part !== undefined) {
        const before = layerPropertyValue(layer, name);
        if (typeof before !== "object")
          throw new Error("This property has no editable components.");
        if (typeof part === "number") {
          if (
            !["UDim", "UDim2", "Vector2", "Vector3", "Color3", "Rect"].includes(
              before.type,
            ) ||
            !Number.isInteger(part) ||
            part < 0 ||
            part >= (before as { value: number[] }).value.length ||
            typeof next !== "number"
          )
            throw new Error("Invalid property coordinate.");
          const values = [...(before as { value: number[] }).value];
          values[part] = next;
          value = { ...before, value: values } as Value;
        } else {
          if (before.type !== "Font" || typeof next !== "string")
            throw new Error("Invalid font component.");
          value = { ...before, [part]: next };
        }
      }
      if (!validProperty(layer.node.className, name, value))
        throw new Error(`Invalid ${name} on ${layer.node.name}.`);
      properties[name] = JSON.parse(JSON.stringify(value));
      if (layer.node.className === "UICorner" && name === "CornerRadius")
        for (const key of [
          "TopLeftRadius",
          "TopRightRadius",
          "BottomLeftRadius",
          "BottomRightRadius",
        ])
          delete properties[key];
    }
    return { id: layer.node.id, value: { ...edit, properties } };
  });
}

export function applyOverrideChanges(
  before: Record<string, LayerOverride>,
  changes: OverrideChange[],
): Record<string, LayerOverride> {
  if (new Set(changes.map((change) => change.id)).size !== changes.length)
    throw new Error("Duplicate batch layer.");
  const result = { ...before };
  for (const { id, value } of changes) {
    if (!value) {
      delete result[id];
      for (const key of Object.keys(result))
        if (key.startsWith(id + "/")) delete result[key];
    } else if (
      // An empty custom behavior replaces layer tags and keeps its editor mode.
      value.behavior !== undefined ||
      Object.values(value).some(
        (setting) =>
          setting !== undefined &&
          (typeof setting !== "object" ||
            Object.keys(setting ?? {}).length > 0),
      )
    )
      result[id] = value;
    else delete result[id];
  }
  return result;
}
