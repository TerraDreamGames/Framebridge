export type Color = { r: number; g: number; b: number; a?: number };
export type Transform = [[number, number, number], [number, number, number]];
export type Paint = {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: Color;
  gradientStops?: { position: number; color: Color }[];
  gradientTransform?: Transform;
  imageHash?: string;
  blendMode?: string;
};
export type TextRun = {
  text: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  color?: Color;
  underline?: boolean;
  strike?: boolean;
};
export type DesignNode = {
  colorProfile?: "LEGACY" | "SRGB" | "DISPLAY_P3";
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  transform: Transform;
  visible: boolean;
  opacity: number;
  fills: Paint[];
  /** Exact native vector geometry, including regions and per-vertex styling. */
  vectorGeometry?: string;
  rasterBounds?: { x: number; y: number; width: number; height: number };
  /** Figma-rendered own fills in unrotated local coordinates; does not move content. */
  decorationBounds?: { x: number; y: number; width: number; height: number };
  /** Extracted own normal drop effects; geometry is independent of editable content. */
  effectBounds?: { x: number; y: number; width: number; height: number };
  strokes: Paint[];
  strokeWeight: number;
  strokeAlign?: string;
  radius: number;
  corners?: number[];
  cornerSmoothing?: number;
  clipsContent?: boolean;
  effects?: string[];
  /** Complete visible effect settings for native render invalidation. */
  effectSettings?: string;
  shadows?: {
    type: "DROP_SHADOW" | "INNER_SHADOW";
    radius: number;
    spread: number;
    offset: { x: number; y: number };
    color: Color;
    blendMode?: string;
  }[];
  blendMode?: string;
  isMask?: boolean;
  maskType?: "ALPHA" | "VECTOR" | "LUMINANCE";
  /** Compiler-owned clipping container; never added to a Figma snapshot. */
  nativeMaskClip?: boolean;
  /** Compiler-owned original-parent coordinate container for responsive masks. */
  nativeMaskBasis?: string;
  transformModifiers?: {
    type: "REPEAT";
    repeatType: "LINEAR" | "RADIAL";
    count: number;
    unitType: "RELATIVE" | "PIXELS";
    offset: number;
    axis?: "HORIZONTAL" | "VERTICAL";
  }[];
  unsupported?: string[];
  constraints?: { horizontal: string; vertical: string };
  layoutSizing?: { horizontal: string; vertical: string };
  scrolling?: "HORIZONTAL" | "VERTICAL" | "BOTH";
  gridCell?: {
    row: number;
    column: number;
    rowSpan: number;
    columnSpan: number;
  };
  layout?: {
    mode: string;
    spacing: number;
    padding: [number, number, number, number];
    primary: string;
    counter: string;
    wrap: boolean;
    sizingX?: string;
    sizingY?: string;
    counterSpacing?: number;
    grid?: {
      rows: number;
      columns: number;
      rowGap: number;
      columnGap: number;
      rowSizes: { type: string; value?: number }[];
      columnSizes: { type: string; value?: number }[];
    };
  };
  grow?: number;
  stretch?: boolean;
  absolute?: boolean;
  text?: {
    characters: string;
    runs: TextRun[];
    align: string;
    verticalAlign: string;
    lineHeight?: number;
    letterSpacing?: number;
    autoResize?: string;
    unsupported?: string[];
  };
  children: DesignNode[];
};
export type ExportOptions = {
  /** Logical design screen for standalone panels; null uses the selected frame as a full screen. */
  screenSize?: [number, number] | null;
  rootPlacement?: "center" | "top-left";
  themes?: import("./theme-tokens").ThemeSettings;
  themeEnabled?: boolean;
  layerOverrides: Record<string, LayerOverride>;
  layout: "exact" | "responsive";
  styleSizing?: "pixels" | "scale";
  appearance: "faithful" | "editable";
  preserveText: boolean;
  detectButtons: boolean;
  includeHidden: boolean;
  imageScale: 1 | 2 | 3;
  rootName: string;
  ignoreGuiInset: boolean;
  assetIds: Record<string, string>;
  fontIds: Record<string, string>;
};
export const DEFAULT_OPTIONS: ExportOptions = {
  layerOverrides: {},
  layout: "exact",
  styleSizing: "pixels",
  appearance: "faithful",
  preserveText: true,
  detectButtons: true,
  includeHidden: false,
  imageScale: 2,
  rootName: "",
  ignoreGuiInset: true,
  assetIds: {},
  fontIds: {},
};
export type Issue = {
  nodeId: string;
  nodeName: string;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
};
export type Value =
  | string
  | number
  | boolean
  | {
      type: "Color3" | "Vector2" | "Vector3" | "UDim" | "UDim2" | "Rect";
      value: number[];
    }
  | { type: "Enum"; value: [string, string] }
  | { type: "Font"; family: string; weight: string; style: string }
  | { type: "ColorSequence" | "NumberSequence"; value: number[][] };
export type LayerOverride = {
  theme?: import("./theme-tokens").ThemeLayer | false;
  scrollbar?: import("./scrollbar").ScrollbarSettings | false;
  worldUI?: import("./world-space").WorldSettings | false;
  behavior?: LayerBehavior | false;
  imageProcessing?: ImageProcessing;
  renderMode?: "auto" | "native" | "image" | "skip";
  className?: string;
  name?: string;
  properties?: Record<string, Value>;
  components?: Partial<
    Record<
      | "corner"
      | "stroke"
      | "shadow"
      | "aspect"
      | "size"
      | "textSize"
      | "scale"
      | "padding"
      | "layout"
      | "grid"
      | "flex",
      Record<string, Value> | false
    >
  >;
};
export type RbxNode = {
  /** Native glyph fallback for captured editable text shadows; no executable data. */
  textDecoration?: import("./text-decoration").TextDecoration;
  themes?: import("./theme-tokens").CompiledThemes;
  theme?: import("./theme-tokens").CompiledThemeLayer;
  /** Source parent identity followed by the transparent mask coordinate helper. */
  maskBasis?: string;
  /** Preserve complete automatic canvas extents for proportional native layout gaps. */
  layoutCanvas?: true;
  /** Compiler-owned background box, normalized to its immediate parent's viewport. */
  decorationRect?: [number, number, number, number];
  worldUI?: import("./world-space").WorldSettings;
  behavior?: CompiledBehavior;
  id: string;
  name: string;
  className: string;
  sourceType?: string;
  properties: Record<string, Value>;
  children: RbxNode[];
  assetRef?: string;
  assetBindings?: Partial<
    Record<"TopImage" | "MidImage" | "BottomImage", string>
  >;
  referenceSize?: [number, number];
  layoutSizing?: ["FIXED" | "HUG" | "FILL", "FIXED" | "HUG" | "FILL"];
};
export type ButtonState =
  "default" | "hover" | "pressed" | "disabled" | "selected";
export type TextBinding = {
  source: "attribute" | "leaderstats";
  key: string;
  template: string;
};
/** Optional author intent. Targets may be stable source IDs or unique layer names. */
export type LayerBehavior = {
  rules?: import("./conditional-rules").ConditionalRule[];
  particles?: import("./particles").ParticleSettings;
  role?: "panel" | "tabGroup";
  initialVisible?: boolean;
  action?: { kind: "open" | "close" | "toggle" | "tab"; target?: string };
  state?: ButtonState;
  binding?: TextBinding;
  control?: import("./advanced-controls").AdvancedControl;
  keyframes?: import("./keyframes").KeyframeSettings;
  motion?: import("./motion").MotionSettings;
};
/** Resolved, bounded data. Packages never carry executable application code. */
export type CompiledBehavior = {
  /** Compiler fingerprint of rule-owned design properties; protects reimport baselines. */
  ruleDesign?: string;
  rules?: import("./conditional-rules").ConditionalRule[];
  particles?: import("./particles").CompiledParticles;
  role?: "panel" | "tabGroup";
  action?: { kind: "open" | "close" | "toggle" | "tab"; target: string };
  state?: { kind: ButtonState; owner: string };
  binding?: TextBinding;
  control?: import("./advanced-controls").AdvancedControl;
  keyframes?: import("./keyframes").CompiledKeyframes;
  motion?: import("./motion").CompiledMotion;
};
export type Asset = {
  /** Render only the source's own fills, without content, strokes or effects. */
  renderMode?: "fills" | "shadow" | "blend";
  /** Compiler-derived frozen opaque source backdrop for own paint blends. */
  backdrop?: [number, number, number];
  /** Exported PNG pixels, independent of the layer's Figma dimensions. */
  pixelSize?: [number, number];
  processing?: ImageProcessing;
  scrollbarSlice?: import("./scrollbar").ScrollbarSlice;
  id: string;
  nodeId: string;
  name: string;
  filename: string;
  width: number;
  height: number;
  scale: number;
  robloxId?: string;
  reason: string;
};
export type ImageProcessing = { whiteMask?: boolean; edgeCleanup?: boolean };
export type TransferPackage = {
  format: "framebridge";
  version: 1;
  sourceId: string;
  name: string;
  createdAt: string;
  options: Pick<ExportOptions, "layout" | "appearance" | "imageScale"> &
    Partial<Pick<ExportOptions, "preserveText" | "styleSizing">>;
  roots: RbxNode[];
  assets: Asset[];
  issues: Issue[];
  stats: { layers: number; instances: number; native: number; raster: number };
};
export type SelectionSummary = {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  layers: number;
};
export type AnalysisResult = {
  designs?: DesignNode[];
  package: TransferPackage;
  previews: Record<string, string>;
  assets: Record<string, number[]>;
  revision: number;
};
export function flatten(nodes: RbxNode[]): RbxNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
