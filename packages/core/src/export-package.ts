import { validateThemes } from "./theme-tokens";
import { imageReferences, validateImageBindings } from "./image-bindings";
import { scrollbarSlice } from "./scrollbar";
import { PROPERTY_SCHEMAS, validProperty } from "./editor";
import { validAssetId } from "./geometry";
import { imageScalingIssues } from "./image-scaling";
import { validateBehaviors } from "./behaviors";
import { validateMaskBases } from "./native-clipping";
import { validateDecorations, validateDecorationAsset } from "./decoration";
import { validateTextDecorations } from "./text-decoration";
import { isGuiRoot, validateWorldRoots } from "./world-space";
import type { RbxNode, TransferPackage, Value } from "./types";

function gradientProperty(key: string, value: Value) {
  if (key === "Rotation")
    return typeof value === "number" && Number.isFinite(value);
  const type =
    key === "Color"
      ? "ColorSequence"
      : key === "Transparency"
        ? "NumberSequence"
        : "";
  if (!type || !value || typeof value !== "object" || value.type !== type)
    return false;
  const points = value.value as number[][];
  return (
    Array.isArray(points) &&
    points.length >= 2 &&
    points.length <= 20 &&
    points.every(
      (point, index) =>
        Array.isArray(point) &&
        point.length === (type === "ColorSequence" ? 4 : 2) &&
        point.every(
          (n) =>
            typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
        ) &&
        (index === 0 || point[0] > points[index - 1][0]),
    ) &&
    points[0][0] === 0 &&
    points[points.length - 1][0] === 1
  );
}

export function validateExportPackage(pkg: TransferPackage) {
  if (!pkg?.roots?.length || pkg.roots.length > 100)
    throw new Error("Choose between 1 and 100 screens to export.");
  if (pkg.issues.some((issue) => issue.severity === "error"))
    throw new Error("Resolve blocking review notes before exporting source.");
  const assetIds = new Set<string>();
  for (const asset of pkg.assets) {
    validateDecorationAsset(asset);
    if (asset.scrollbarSlice !== undefined)
      scrollbarSlice(asset.scrollbarSlice);
    if (
      asset.pixelSize !== undefined &&
      (!Array.isArray(asset.pixelSize) ||
        asset.pixelSize.length !== 2 ||
        asset.pixelSize.some((n) => !Number.isInteger(n) || n <= 0 || n > 4096))
    )
      throw new Error("Invalid image pixel dimensions.");
    if (assetIds.has(asset.id))
      throw new Error("Duplicate source asset identity.");
    assetIds.add(asset.id);
    if (asset.robloxId && !validAssetId(asset.robloxId))
      throw new Error("Invalid Roblox image ID.");
  }
  const ids = new Set<string>();
  let count = 0;
  const visit = (node: RbxNode, depth: number) => {
    if (++count > 15000 || depth > 128)
      throw new Error("Export a smaller, shallower selection.");
    if (ids.has(node.id)) throw new Error("Duplicate source layer identity.");
    ids.add(node.id);
    if (
      !Object.prototype.hasOwnProperty.call(PROPERTY_SCHEMAS, node.className) &&
      node.className !== "UIGradient"
    )
      throw new Error("Unsupported source instance type.");
    if ((depth === 0) !== isGuiRoot(node.className))
      throw new Error("UI collectors must be top-level instances.");
    for (const [key, value] of Object.entries(node.properties)) {
      // Decorative background helpers may use a negative ZIndex. The editor's
      // slider range is narrower than the valid native property range.
      const nativeZIndex =
        key === "ZIndex" &&
        PROPERTY_SCHEMAS[node.className]?.ZIndex &&
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= -10000 &&
        value <= 10000;
      if (
        !nativeZIndex &&
        !(node.className === "UIGradient"
          ? gradientProperty(key, value)
          : validProperty(node.className, key, value))
      )
        throw new Error(`Invalid source property: ${node.className}.${key}.`);
    }
    if (
      node.assetRef &&
      (!assetIds.has(node.assetRef) ||
        !["ImageLabel", "ImageButton"].includes(node.className))
    )
      throw new Error("Invalid source image reference.");
    node.children.forEach((child) => visit(child, depth + 1));
  };
  pkg.roots.forEach((root) => visit(root, 0));
  validateImageBindings(pkg);
  validateWorldRoots(pkg.roots);
  validateBehaviors(pkg.roots);
  validateThemes(pkg.roots);
  validateMaskBases(pkg.roots);
  validateDecorations(pkg.roots, pkg.assets);
  validateTextDecorations(pkg.roots);
  const scalingIssue = imageScalingIssues(pkg)[0];
  if (scalingIssue) throw new Error(scalingIssue.message);
}

// CornerRadius sets all corners. Declarative renderers do not promise property
// ordering, so expand the fallback radius and omit the aggregate setter.
export function exportProperties(node: RbxNode): [string, Value][] {
  const props = { ...node.properties };
  const corners = [
    "TopLeftRadius",
    "TopRightRadius",
    "BottomRightRadius",
    "BottomLeftRadius",
  ];
  if (node.className === "UICorner" && corners.some((key) => key in props)) {
    const radius =
      props.CornerRadius ?? PROPERTY_SCHEMAS.UICorner.CornerRadius.default;
    corners.forEach((key) => {
      props[key] ??= radius;
    });
    delete props.CornerRadius;
  }
  return [
    ["Name", node.name],
    ...Object.entries(props)
      .filter(
        ([key]) =>
          !imageReferences(node).some(([property]) => property === key),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  ];
}
