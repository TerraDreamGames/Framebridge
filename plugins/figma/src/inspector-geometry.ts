import type { RbxNode, Value } from "../../../packages/core/src/types";
import { previewFlow, previewConstrainedSize } from "./preview-layout";

export type SizeUnit = "scale" | "offset";
export type InspectorGeometry = {
  parent: [number, number];
  size: [number, number];
  controlled: [string | undefined, string | undefined];
  ownsPosition: boolean;
};
export const geometryNumbers = (value: Value | undefined): number[] =>
  value && typeof value === "object" && "value" in value
    ? (value.value as number[])
    : [];
const enumName = (value: Value | undefined, fallback: string) =>
  value && typeof value === "object" && value.type === "Enum"
    ? value.value[1]
    : fallback;

function measured(
  node: RbxNode,
  parent: readonly number[],
  forced?: { w: number; h: number },
): [number, number] {
  return previewConstrainedSize(node, parent[0], parent[1], forced).size;
}

/** Authored parent coordinates, using the same logical hierarchy as the inspector.
 * Motion/world helper parents are already folded by layer-entries. Never use a
 * device-preview size or a node's Figma page coordinates as the conversion basis. */
export function inspectorGeometry(
  node: RbxNode,
  ancestors: readonly RbxNode[],
): InspectorGeometry {
  let parent: [number, number] = [0, 0];
  let styleParent: [number, number] = parent;
  let flow: ReturnType<typeof previewFlow> | undefined;
  let layout: RbxNode | undefined;
  for (const [index, ancestor] of ancestors.entries()) {
    const size: [number, number] =
      index === 0
        ? (ancestor.referenceSize ?? [0, 0])
        : measured(
            ancestor,
            parent,
            flow?.ownsPosition ? flow.boxes.get(ancestor.id) : undefined,
          );
    flow = previewFlow(
      ancestor,
      size[0],
      size[1],
      parent[0],
      parent[1],
      styleParent[0] || size[0],
      styleParent[1] || size[1],
    );
    layout = ancestor.children.find((child) =>
      ["UIListLayout", "UIGridLayout"].includes(child.className),
    );
    parent = [flow.width, flow.height];
    styleParent = ancestor.className === "ScrollingFrame" ? size : parent;
  }
  const size = measured(
    node,
    parent,
    flow?.ownsPosition ? flow.boxes.get(node.id) : undefined,
  );
  const controlled: InspectorGeometry["controlled"] = [undefined, undefined];
  const automatic = enumName(node.properties.AutomaticSize, "None");
  if (automatic === "X" || automatic === "XY")
    controlled[0] =
      "Content controls width. Change Auto size in More layout to edit it.";
  if (automatic === "Y" || automatic === "XY")
    controlled[1] =
      "Content controls height. Change Auto size in More layout to edit it.";
  const aspectAxis = previewConstrainedSize(
    node,
    parent[0],
    parent[1],
    flow?.ownsPosition ? flow.boxes.get(node.id) : undefined,
  ).aspectControlledAxis;
  if (aspectAxis !== undefined)
    controlled[aspectAxis] =
      "The aspect ratio constraint controls this dimension.";
  if (layout?.className === "UIGridLayout")
    controlled.fill("The parent grid controls cell size.");
  if (layout?.className === "UIListLayout") {
    const horizontal =
      enumName(layout.properties.FillDirection, "Vertical") === "Horizontal";
    const item = node.children.find(
      (child) => child.className === "UIFlexItem",
    );
    const mode = enumName(
      item?.properties.FlexMode,
      enumName(
        layout.properties[horizontal ? "HorizontalFlex" : "VerticalFlex"],
        "None",
      ),
    );
    if (["Fill", "Grow", "Shrink", "Custom"].includes(mode))
      controlled[horizontal ? 0 : 1] =
        "The parent list's flex layout controls this dimension.";
    if (
      enumName(
        item?.properties.ItemLineAlignment ??
          layout.properties.ItemLineAlignment,
        "Start",
      ) === "Stretch"
    )
      controlled[horizontal ? 1 : 0] =
        "The parent list stretches this dimension.";
  }
  return {
    parent,
    size,
    controlled,
    ownsPosition: flow?.ownsPosition ?? false,
  };
}

export function inferredSizeUnit(size: Value): SizeUnit | undefined {
  const v = geometryNumbers(size);
  const scale = !!v[0] || !!v[2],
    offset = !!v[1] || !!v[3];
  return scale && !offset ? "scale" : offset && !scale ? "offset" : undefined;
}
export function sizePixels(
  size: Value,
  parent: readonly number[],
): [number, number] {
  const v = geometryNumbers(size);
  return [
    (v[0] ?? 0) * parent[0] + (v[1] ?? 0),
    (v[2] ?? 0) * parent[1] + (v[3] ?? 0),
  ];
}
export function convertedSize(
  size: Value,
  parent: readonly number[],
  unit: SizeUnit,
  controlled: readonly unknown[] = [],
): Value {
  const before = geometryNumbers(size),
    pixels = sizePixels(size, parent);
  const value = [0, 1].flatMap((axis) => {
    if (controlled[axis]) return before.slice(axis * 2, axis * 2 + 2);
    if (!(parent[axis] > 0) && before[axis * 2])
      throw new Error(
        "The parent must have a measurable size to convert this dimension.",
      );
    if (unit === "scale" && !(parent[axis] > 0))
      throw new Error("The parent must have a measurable size to use Scale.");
    return unit === "scale"
      ? [pixels[axis] / parent[axis], 0]
      : [0, pixels[axis]];
  });
  return { type: "UDim2", value };
}

/** Keep every visible point fixed when moving the pivot, including rotation and UIScale. */
export function anchoredProperties(
  node: RbxNode,
  context: InspectorGeometry,
  anchor: readonly [number, number],
): Record<string, Value> {
  if (anchor.some((value) => !Number.isFinite(value) || value < 0 || value > 1))
    throw new Error("Anchor coordinates must be between 0 and 1.");
  const changes: Record<string, Value> = {
    AnchorPoint: { type: "Vector2", value: [...anchor] },
  };
  if (context.ownsPosition) return changes;
  const before = geometryNumbers(node.properties.AnchorPoint);
  const scale = Number(
    node.children.find((child) => child.className === "UIScale")?.properties
      .Scale ?? 1,
  );
  const dx = (anchor[0] - (before[0] ?? 0)) * context.size[0] * scale;
  const dy = (anchor[1] - (before[1] ?? 0)) * context.size[1] * scale;
  // Roblox rotates about the visual center, not AnchorPoint. Preserving the
  // unrotated box also preserves every rotated point; do not rotate this delta.
  const delta = [dx, dy];
  const position = [
    ...(geometryNumbers(node.properties.Position).length
      ? geometryNumbers(node.properties.Position)
      : [0, 0, 0, 0]),
  ];
  for (const axis of [0, 1]) {
    // Preserve responsive positions instead of introducing a pixel offset.
    if (position[axis * 2 + 1] === 0 && context.parent[axis] > 0)
      position[axis * 2] += delta[axis] / context.parent[axis];
    else position[axis * 2 + 1] += delta[axis];
  }
  changes.Position = { type: "UDim2", value: position };
  return changes;
}
