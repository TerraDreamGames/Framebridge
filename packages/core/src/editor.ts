import {
  imageReferences,
  bindImage,
  imageBindingIndex,
} from "./image-bindings";
import { isolateDecoratedLayout } from "./native-appearance";
import { imageScalingIssues, pngPixelSize } from "./image-scaling";
import {
  flatten,
  type AnalysisResult,
  type LayerOverride,
  type RbxNode,
  type TransferPackage,
  type Value,
} from "./types";
import { validAssetId } from "./geometry";
export type PropertySpec = {
  kind:
    | "number"
    | "boolean"
    | "string"
    | "Color3"
    | "Vector2"
    | "Vector3"
    | "Rect"
    | "UDim"
    | "UDim2"
    | "Enum"
    | "Font";
  group: string;
  default: Value;
  min?: number;
  max?: number;
  enum?: string;
  choices?: string[];
};
const propertyNumber = (
  group: string,
  value = 0,
  min = -1e6,
  max = 1e6,
): PropertySpec => ({ kind: "number", group, default: value, min, max });
const propertyBoolean = (group: string, value = false): PropertySpec => ({
  kind: "boolean",
  group,
  default: value,
});
const propertyString = (group: string, value = ""): PropertySpec => ({
  kind: "string",
  group,
  default: value,
});
const propertyVector = (
  group: string,
  kind: "Color3" | "Vector2" | "Vector3" | "UDim" | "UDim2" | "Rect",
  values: number[],
  min = -1e6,
  max = 1e6,
): PropertySpec => ({
  kind,
  group,
  default: { type: kind, value: values },
  min,
  max,
});
const propertyEnum = (
  group: string,
  family: string,
  choices: string[],
  value = choices[0],
): PropertySpec => ({
  kind: "Enum",
  group,
  enum: family,
  choices,
  default: { type: "Enum", value: [family, value] },
});
const guiProperties: Record<string, PropertySpec> = {
  Position: propertyVector("Layout", "UDim2", [0, 0, 0, 0]),
  Size: propertyVector("Layout", "UDim2", [0, 100, 0, 100]),
  AnchorPoint: propertyVector("Layout", "Vector2", [0, 0], 0, 1),
  Rotation: propertyNumber("Layout"),
  LayoutOrder: propertyNumber("Layout", 0, 0),
  ZIndex: propertyNumber("Layout", 1, 1),
  AutomaticSize: propertyEnum("Layout", "AutomaticSize", [
    "None",
    "X",
    "Y",
    "XY",
  ]),
  Visible: propertyBoolean("Appearance", true),
  BackgroundColor3: propertyVector("Appearance", "Color3", [1, 1, 1], 0, 1),
  BackgroundTransparency: propertyNumber("Appearance", 1, 0, 1),
  BorderSizePixel: propertyNumber("Appearance", 0, 0, 100),
  ClipsDescendants: propertyBoolean("Appearance"),
  Active: propertyBoolean("Interaction"),
  Selectable: propertyBoolean("Interaction"),
};
const textProperties: Record<string, PropertySpec> = {
  Text: propertyString("Text"),
  TextSize: propertyNumber("Text", 16, 1, 100),
  TextColor3: propertyVector("Text", "Color3", [1, 1, 1], 0, 1),
  TextTransparency: propertyNumber("Text", 0, 0, 1),
  TextWrapped: propertyBoolean("Text", true),
  TextScaled: propertyBoolean("Text"),
  RichText: propertyBoolean("Text"),
  AutoLocalize: propertyBoolean("Text"),
  LineHeight: propertyNumber("Text", 1, 1, 3),
  TextXAlignment: propertyEnum("Text", "TextXAlignment", [
    "Left",
    "Center",
    "Right",
  ]),
  TextYAlignment: propertyEnum("Text", "TextYAlignment", [
    "Top",
    "Center",
    "Bottom",
  ]),
  FontFace: {
    kind: "Font",
    group: "Text",
    default: {
      type: "Font",
      family: "rbxasset://fonts/families/SourceSansPro.json",
      weight: "Regular",
      style: "Normal",
    },
  },
};
const imageProperties: Record<string, PropertySpec> = {
  Image: propertyString("Image"),
  ImageColor3: propertyVector("Image", "Color3", [1, 1, 1], 0, 1),
  ImageTransparency: propertyNumber("Image", 0, 0, 1),
  ScaleType: propertyEnum("Image", "ScaleType", [
    "Stretch",
    "Fit",
    "Crop",
    "Tile",
    "Slice",
  ]),
  SliceCenter: propertyVector("Image", "Rect", [0, 0, 0, 0], 0),
  SliceScale: propertyNumber("Image", 1, 0),
  TileSize: propertyVector("Image", "UDim2", [1, 0, 1, 0], 0),
};

const buttonProperties = {
  Interactable: propertyBoolean("Interaction", true),
  AutoButtonColor: propertyBoolean("Interaction", true),
};
export const PROPERTY_SCHEMAS: Record<string, Record<string, PropertySpec>> = {
  SurfaceGui: {
    Enabled: propertyBoolean("World UI", true),
    ResetOnSpawn: propertyBoolean("World UI"),
    Active: propertyBoolean("World UI", true),
    ClipsDescendants: propertyBoolean("World UI", true),
    ZIndexBehavior: propertyEnum("World UI", "ZIndexBehavior", [
      "Sibling",
      "Global",
    ]),
    AlwaysOnTop: propertyBoolean("World UI", true),
    LightInfluence: propertyNumber("World UI", 0, 0, 1),
    MaxDistance: propertyNumber("World UI", 100, 0, 10000),
    Face: propertyEnum("World UI", "NormalId", [
      "Front",
      "Back",
      "Left",
      "Right",
      "Top",
      "Bottom",
    ]),
    CanvasSize: propertyVector("World UI", "Vector2", [400, 300], 1, 100000),
    SizingMode: propertyEnum("World UI", "SurfaceGuiSizingMode", ["FixedSize"]),
  },
  BillboardGui: {
    Enabled: propertyBoolean("World UI", true),
    ResetOnSpawn: propertyBoolean("World UI"),
    Active: propertyBoolean("World UI", true),
    ClipsDescendants: propertyBoolean("World UI", true),
    ZIndexBehavior: propertyEnum("World UI", "ZIndexBehavior", [
      "Sibling",
      "Global",
    ]),
    AlwaysOnTop: propertyBoolean("World UI", true),
    LightInfluence: propertyNumber("World UI", 0, 0, 1),
    MaxDistance: propertyNumber("World UI", 100, 0, 10000),
    Size: propertyVector("World UI", "UDim2", [4, 0, 3, 0], 0),
    StudsOffsetWorldSpace: propertyVector(
      "World UI",
      "Vector3",
      [0, 2, 0],
      -1000,
      1000,
    ),
  },
  ScreenGui: {
    Enabled: propertyBoolean("Screen", true),
    IgnoreGuiInset: propertyBoolean("Screen", true),
    ResetOnSpawn: propertyBoolean("Screen"),
    DisplayOrder: propertyNumber("Screen", 0, 0),
    ZIndexBehavior: propertyEnum("Screen", "ZIndexBehavior", [
      "Sibling",
      "Global",
    ]),
  },
  Frame: guiProperties,
  CanvasGroup: {
    ...guiProperties,
    GroupTransparency: propertyNumber("Appearance", 0, 0, 1),
  },
  ViewportFrame: {
    ...guiProperties,
    Ambient: propertyVector(
      "3D lighting",
      "Color3",
      [200 / 255, 200 / 255, 200 / 255],
      0,
      1,
    ),
    LightColor: propertyVector(
      "3D lighting",
      "Color3",
      [140 / 255, 140 / 255, 140 / 255],
      0,
      1,
    ),
    LightDirection: propertyVector("3D lighting", "Vector3", [-1, -1, -1]),
    ImageColor3: propertyVector("3D appearance", "Color3", [1, 1, 1], 0, 1),
    ImageTransparency: propertyNumber("3D appearance", 0, 0, 1),
  },
  TextLabel: { ...guiProperties, ...textProperties },
  TextButton: { ...guiProperties, ...textProperties, ...buttonProperties },
  TextBox: {
    ...guiProperties,
    ...textProperties,
    PlaceholderText: propertyString("Input"),
    PlaceholderColor3: propertyVector("Input", "Color3", [0.7, 0.7, 0.7], 0, 1),
    ClearTextOnFocus: propertyBoolean("Input"),
    MultiLine: propertyBoolean("Input"),
    TextEditable: propertyBoolean("Input", true),
  },
  ImageLabel: { ...guiProperties, ...imageProperties },
  ImageButton: { ...guiProperties, ...imageProperties, ...buttonProperties },
  ScrollingFrame: {
    ...guiProperties,
    CanvasSize: propertyVector("Scrolling", "UDim2", [0, 0, 0, 0], 0),
    AutomaticCanvasSize: propertyEnum(
      "Scrolling",
      "AutomaticSize",
      ["None", "X", "Y", "XY"],
      "Y",
    ),
    ScrollingDirection: propertyEnum(
      "Scrolling",
      "ScrollingDirection",
      ["X", "Y", "XY"],
      "Y",
    ),
    TopImage: propertyString("Scrolling", ""),
    MidImage: propertyString("Scrolling", ""),
    BottomImage: propertyString("Scrolling", ""),
    ScrollingEnabled: propertyBoolean("Scrolling", true),
    ScrollBarThickness: propertyNumber("Scrolling", 6, 0, 100),
    ScrollBarImageColor3: propertyVector(
      "Scrolling",
      "Color3",
      [0.7, 0.7, 0.7],
      0,
      1,
    ),
    ScrollBarImageTransparency: propertyNumber("Scrolling", 0, 0, 1),
  },
  UICorner: {
    CornerRadius: propertyVector("Corner", "UDim", [0, 8], 0),
    TopLeftRadius: propertyVector("Corner", "UDim", [0, 8], 0),
    TopRightRadius: propertyVector("Corner", "UDim", [0, 8], 0),
    BottomRightRadius: propertyVector("Corner", "UDim", [0, 8], 0),
    BottomLeftRadius: propertyVector("Corner", "UDim", [0, 8], 0),
  },
  UIShadow: {
    Enabled: propertyBoolean("Shadow", true),
    BlurRadius: propertyVector("Shadow", "UDim", [0, 12], 0, 1000),
    Offset: propertyVector("Shadow", "UDim2", [0, 0, 0, 4]),
    Spread: propertyVector("Shadow", "UDim2", [0, 0, 0, 0]),
    Color: propertyVector("Shadow", "Color3", [0, 0, 0], 0, 1),
    Transparency: propertyNumber("Shadow", 0.75, 0, 1),
    ZIndex: propertyNumber("Shadow", -1, -10000, -1),
  },
  UIStroke: {
    StrokeSizingMode: propertyEnum("Stroke", "StrokeSizingMode", [
      "FixedSize",
      "ScaledSize",
    ]),
    Color: propertyVector("Stroke", "Color3", [0, 0, 0], 0, 1),
    Thickness: propertyNumber("Stroke", 1, 0, 100),
    Transparency: propertyNumber("Stroke", 0, 0, 1),
    ApplyStrokeMode: propertyEnum("Stroke", "ApplyStrokeMode", [
      "Contextual",
      "Border",
    ]),
    BorderStrokePosition: propertyEnum("Stroke", "BorderStrokePosition", [
      "Inner",
      "Center",
      "Outer",
    ]),
    LineJoinMode: propertyEnum("Stroke", "LineJoinMode", [
      "Round",
      "Bevel",
      "Miter",
    ]),
  },
  UIAspectRatioConstraint: {
    AspectRatio: propertyNumber("Aspect ratio", 1, 0.001, 1000),
    AspectType: propertyEnum("Aspect ratio", "AspectType", [
      "FitWithinMaxSize",
      "ScaleWithParentSize",
    ]),
    DominantAxis: propertyEnum("Aspect ratio", "DominantAxis", [
      "Width",
      "Height",
    ]),
  },
  UISizeConstraint: {
    MinSize: propertyVector("Size limits", "Vector2", [0, 0], 0),
    MaxSize: propertyVector("Size limits", "Vector2", [1000000, 1000000], 0),
  },
  UITextSizeConstraint: {
    MinTextSize: propertyNumber("Text limits", 10, 1, 100),
    MaxTextSize: propertyNumber("Text limits", 36, 1, 100),
  },
  UIScale: { Scale: propertyNumber("Scale", 1, 0.01, 100) },
  UIPadding: {
    PaddingTop: propertyVector("Padding", "UDim", [0, 0], 0),
    PaddingBottom: propertyVector("Padding", "UDim", [0, 0], 0),
    PaddingLeft: propertyVector("Padding", "UDim", [0, 0], 0),
    PaddingRight: propertyVector("Padding", "UDim", [0, 0], 0),
  },
  UIListLayout: {
    Wraps: propertyBoolean("List layout"),
    ItemLineAlignment: propertyEnum("List layout", "ItemLineAlignment", [
      "Automatic",
      "Start",
      "Center",
      "End",
      "Stretch",
    ]),
    FillDirection: propertyEnum(
      "List layout",
      "FillDirection",
      ["Horizontal", "Vertical"],
      "Vertical",
    ),
    SortOrder: propertyEnum("List layout", "SortOrder", [
      "LayoutOrder",
      "Name",
    ]),
    Padding: propertyVector("List layout", "UDim", [0, 8], 0),
    HorizontalAlignment: propertyEnum("List layout", "HorizontalAlignment", [
      "Left",
      "Center",
      "Right",
    ]),
    VerticalAlignment: propertyEnum("List layout", "VerticalAlignment", [
      "Top",
      "Center",
      "Bottom",
    ]),
    HorizontalFlex: propertyEnum("List layout", "UIFlexAlignment", [
      "None",
      "Fill",
      "SpaceAround",
      "SpaceBetween",
      "SpaceEvenly",
    ]),
    VerticalFlex: propertyEnum("List layout", "UIFlexAlignment", [
      "None",
      "Fill",
      "SpaceAround",
      "SpaceBetween",
      "SpaceEvenly",
    ]),
  },
  UIGridLayout: {
    CellSize: propertyVector("Grid layout", "UDim2", [0, 80, 0, 80]),
    CellPadding: propertyVector("Grid layout", "UDim2", [0, 8, 0, 8], 0),
    FillDirection: propertyEnum("Grid layout", "FillDirection", [
      "Horizontal",
      "Vertical",
    ]),
    FillDirectionMaxCells: propertyNumber("Grid layout", 0, 0, 10000),
    StartCorner: propertyEnum("Grid layout", "StartCorner", [
      "TopLeft",
      "TopRight",
      "BottomLeft",
      "BottomRight",
    ]),
    SortOrder: propertyEnum("Grid layout", "SortOrder", [
      "LayoutOrder",
      "Name",
    ]),
    HorizontalAlignment: propertyEnum("Grid layout", "HorizontalAlignment", [
      "Left",
      "Center",
      "Right",
    ]),
    VerticalAlignment: propertyEnum("Grid layout", "VerticalAlignment", [
      "Top",
      "Center",
      "Bottom",
    ]),
  },
  UIFlexItem: {
    FlexMode: propertyEnum("Flex item", "UIFlexMode", [
      "None",
      "Grow",
      "Shrink",
      "Fill",
      "Custom",
    ]),
    GrowRatio: propertyNumber("Flex item", 1, 0, 10000),
    ShrinkRatio: propertyNumber("Flex item", 1, 0, 10000),
    ItemLineAlignment: propertyEnum("Flex item", "ItemLineAlignment", [
      "Automatic",
      "Start",
      "Center",
      "End",
      "Stretch",
    ]),
  },
};
export const COMPONENT_CLASSES = {
  corner: "UICorner",
  stroke: "UIStroke",
  shadow: "UIShadow",
  aspect: "UIAspectRatioConstraint",
  size: "UISizeConstraint",
  textSize: "UITextSizeConstraint",
  scale: "UIScale",
  padding: "UIPadding",
  layout: "UIListLayout",
  grid: "UIGridLayout",
  flex: "UIFlexItem",
} as const;
export function defaultProperties(className: string): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(PROPERTY_SCHEMAS[className] ?? {})
      .filter(([key]) => className !== "UICorner" || key === "CornerRadius")
      .map(([key, spec]) => [key, JSON.parse(JSON.stringify(spec.default))]),
  );
}
export function validProperty(
  className: string,
  key: string,
  value: unknown,
): value is Value {
  const spec = PROPERTY_SCHEMAS[className]?.[key];
  if (!spec) return false;
  if (
    (key === "Size" || key === "CanvasSize") &&
    value &&
    typeof value === "object" &&
    "value" in value &&
    Array.isArray((value as any).value) &&
    ((value as any).value[0] < 0 || (value as any).value[2] < 0)
  )
    return false;
  if (spec.kind === "boolean") return typeof value === "boolean";
  if (spec.kind === "number")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= (spec.min ?? -1e6) &&
      value <= (spec.max ?? 1e6)
    );
  if (spec.kind === "string")
    return (
      typeof value === "string" &&
      value.length <= 1000000 &&
      (key !== "Image" || value === "" || !!validAssetId(value))
    );
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, any>;
  if (spec.kind === "Font")
    return (
      v.type === "Font" &&
      typeof v.family === "string" &&
      (!!validAssetId(v.family) ||
        /^rbxasset:\/\/fonts\/families\/\w+\.json$/.test(v.family)) &&
      [
        "Thin",
        "ExtraLight",
        "Light",
        "Regular",
        "Medium",
        "SemiBold",
        "Bold",
        "ExtraBold",
        "Heavy",
      ].includes(v.weight) &&
      ["Normal", "Italic"].includes(v.style)
    );
  if (spec.kind === "Enum")
    return (
      v.type === "Enum" &&
      Array.isArray(v.value) &&
      v.value.length === 2 &&
      v.value[0] === spec.enum &&
      spec.choices!.includes(v.value[1])
    );
  const length = {
    UDim: 2,
    UDim2: 4,
    Vector2: 2,
    Vector3: 3,
    Color3: 3,
    Rect: 4,
  }[spec.kind];
  return (
    v.type === spec.kind &&
    Array.isArray(v.value) &&
    v.value.length === length &&
    (spec.kind !== "Rect" ||
      (v.value[0] <= v.value[2] && v.value[1] <= v.value[3])) &&
    (key !== "TileSize" ||
      ((v.value[0] > 0 || Math.trunc(v.value[1]) > 0) &&
        (v.value[2] > 0 || Math.trunc(v.value[3]) > 0))) &&
    v.value.every(
      (n: unknown) =>
        typeof n === "number" &&
        Number.isFinite(n) &&
        n >= (spec.min ?? -1e6) &&
        n <= (spec.max ?? 1e6),
    )
  );
}
/** Overrides become validated data; never scripts, paths, or arbitrary Studio properties. */
export function applyLayerOverrides(
  pkg: TransferPackage,
  overrides: Record<string, LayerOverride>,
): TransferPackage {
  const maskHelper = (node: RbxNode) =>
    !!node.maskBasis ||
    !!node.decorationRect ||
    node.sourceType === "MASK_SCALE";
  function visit(nodes: RbxNode[]): RbxNode[] {
    return nodes
      .filter((n) => maskHelper(n) || overrides[n.id]?.renderMode !== "skip")
      .map((n) => {
        const edit = maskHelper(n) ? undefined : overrides[n.id];
        if (edit?.name !== undefined) {
          if (
            typeof edit.name !== "string" ||
            !edit.name.trim() ||
            edit.name.length > 100
          )
            throw new Error("Layer names must contain 1–100 characters.");
          n.name = edit.name.trim();
        }
        if (edit?.components) {
          for (const [suffix, properties] of Object.entries(edit.components)) {
            const cls =
              COMPONENT_CLASSES[suffix as keyof typeof COMPONENT_CLASSES];
            if (!cls) throw new Error("Unsupported UI modifier.");
            if (!PROPERTY_SCHEMAS[n.className]?.Size)
              throw new Error("UI modifiers need a GUI layer.");
            n.children = n.children.filter(
              (child) =>
                child.id !== `${n.id}/${suffix}` &&
                !(
                  properties !== false &&
                  ["layout", "grid"].includes(suffix) &&
                  ["UIListLayout", "UIGridLayout"].includes(child.className)
                ),
            );
            if (properties !== false)
              n.children.push({
                id: `${n.id}/${suffix}`,
                name: cls,
                className: cls,
                properties: { ...defaultProperties(cls), ...properties },
                children: [],
              });
          }
        }
        // Compiler-created properties remain intact, including sequence types.
        if (
          n.className === "UICorner" &&
          edit?.properties?.CornerRadius !== undefined &&
          ![
            "TopLeftRadius",
            "TopRightRadius",
            "BottomRightRadius",
            "BottomLeftRadius",
          ].some((key) => edit.properties?.[key] !== undefined)
        )
          for (const key of [
            "TopLeftRadius",
            "TopRightRadius",
            "BottomRightRadius",
            "BottomLeftRadius",
          ])
            delete n.properties[key];
        for (const [key, value] of Object.entries(edit?.properties ?? {})) {
          if (!PROPERTY_SCHEMAS[n.className]?.[key]) {
            pkg.issues.push({
              nodeId: n.id,
              nodeName: n.name,
              code: "inactive-property",
              severity: "warning",
              message: `${key} is inactive on ${n.className}. It is retained if you switch the layer type back.`,
            });
            continue;
          }
          if (!validProperty(n.className, key, value))
            throw new Error(`Invalid ${key} on ${n.name}.`);
          n.properties[key] = JSON.parse(JSON.stringify(value));
          if (key === "Image" && n.assetRef) {
            const asset = pkg.assets.find((a) => a.id === n.assetRef);
            if (asset)
              asset.robloxId = validAssetId(String(value)) ?? undefined;
          }
        }
        if (edit?.components) {
          for (const [suffix, props] of Object.entries(edit.components)) {
            if (props === false) continue;
            const cls =
              COMPONENT_CLASSES[suffix as keyof typeof COMPONENT_CLASSES];
            for (const [key, value] of Object.entries(props!))
              if (!validProperty(cls, key, value))
                throw new Error(`Invalid ${key} on ${cls}.`);
          }
        }
        if (n.className === "UISizeConstraint") {
          const min = n.properties.MinSize as Extract<
            Value,
            {
              type:
                "Vector2" | "Vector3" | "Color3" | "UDim" | "UDim2" | "Rect";
            }
          >;
          const max = n.properties.MaxSize as typeof min;
          if (min && max && min.value.some((v, i) => v > max.value[i]))
            throw new Error("MinSize must not exceed MaxSize.");
        }
        if (
          n.className === "UITextSizeConstraint" &&
          Number(n.properties.MinTextSize) > Number(n.properties.MaxTextSize)
        )
          throw new Error(
            "Minimum text size must not exceed maximum text size.",
          );
        n.children = visit(n.children);
        isolateDecoratedLayout({ id: n.id }, n);
        return n;
      });
  }
  pkg.roots = visit(pkg.roots);
  const assetRefs = new Set(
    flatten(pkg.roots).flatMap((n) => imageReferences(n).map(([, id]) => id)),
  );
  pkg.assets = pkg.assets.filter((a) => assetRefs.has(a.id));
  pkg.issues = pkg.issues.filter(
    (i) =>
      i.code !== "asset-required" ||
      pkg.assets.some((a) => a.nodeId === i.nodeId && !a.robloxId),
  );
  pkg.stats.instances = flatten(pkg.roots).length;
  return pkg;
}
/** Reanalysis keeps uploaded IDs only when the rendered PNG itself is unchanged. */
export function retainLinkedAssets(
  previous: AnalysisResult | undefined,
  next: AnalysisResult,
  overrides: Record<string, LayerOverride> = {},
): AnalysisResult {
  for (const asset of next.package.assets)
    asset.pixelSize = pngPixelSize(next.assets[asset.id]) ?? asset.pixelSize;
  next.package.issues = next.package.issues.filter(
    (issue) => issue.code !== "image-slice-bounds",
  );
  next.package.issues.push(...imageScalingIssues(next.package));
  if (!previous || previous.package.sourceId !== next.package.sourceId)
    return next;
  const imageBindings = imageBindingIndex(next.package);
  const previousAssets = new Map(
    previous.package.assets.filter((a) => a.robloxId).map((a) => [a.id, a]),
  );
  for (const asset of next.package.assets) {
    if (
      (!asset.scrollbarSlice &&
        overrides[asset.nodeId]?.properties?.Image !== undefined) ||
      (imageBindings.get(asset.id) ?? []).some(
        ({ node, property }) =>
          overrides[node.id]?.properties?.[property] !== undefined,
      )
    )
      continue;
    const old = previousAssets.get(asset.id);
    const before = previous.assets[asset.id],
      after = next.assets[asset.id];
    if (
      !old ||
      asset.robloxId ||
      !before ||
      !after ||
      before.length !== after.length ||
      !before.every((v, i) => v === after[i])
    )
      continue;
    asset.robloxId = old.robloxId;
    bindImage(
      next.package,
      asset.id,
      validAssetId(old.robloxId)!,
      imageBindings,
    );
  }
  next.package.issues = next.package.issues.filter(
    (i) =>
      i.code !== "asset-required" ||
      next.package.assets.some((a) => a.nodeId === i.nodeId && !a.robloxId),
  );
  return next;
}
