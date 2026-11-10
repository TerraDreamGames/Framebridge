import { needsKeyframeInput } from "./keyframes";
import { textDecoration, validateTextDecorations } from "./text-decoration";
import {
  figmaTextSize,
  nativeTextSize,
  richTextSize,
} from "./font-size-metrics";
import { ruleActions, validRules } from "./conditional-rules";
import { controlNeedsButton } from "./advanced-controls";
import { applyThemes } from "./theme-tokens";
import {
  applyContentSizing,
  applyResponsiveLayout,
  calibrateLayoutStyles,
  type StyleCalibration,
} from "./responsive-layout";
import {
  decorate,
  isolateDecoratedLayout,
  nativePaint,
  nativeShadows,
} from "./native-appearance";
import {
  buttonLayerName,
  createButtonDetector,
  preferredButtonClass,
} from "./button-detection";
import {
  needsFillDecoration,
  needsShadowDecoration,
  paintBlendBackdrop,
  BAKED_FILL_REASONS,
} from "./decoration";
import { needsMotionInput } from "./motion";
import { applyWorldSettings } from "./world-space";
import { artworkAssetId, exportImageProcessing } from "./image-processing";
import { prepareScrollbars, applyScrollbarImages } from "./scrollbar";
import { expandLinearRepeats, linearRepeatPlan } from "./repeats";
import {
  nativeMaskPlan,
  nativeMaskChildren,
  translationOnly,
} from "./native-clipping";
import {
  applyBehaviors,
  behaviorLayerName,
  layerBehavior,
  needsBehaviorHierarchy,
} from "./behaviors";
import { applyLayerOverrides, PROPERTY_SCHEMAS } from "./editor";
import {
  axisConstraint,
  escapeRichText,
  geometry,
  round,
  validAssetId,
} from "./geometry";
import {
  DEFAULT_OPTIONS,
  flatten,
  type Color,
  type DesignNode,
  type ExportOptions,
  type Issue,
  type RbxNode,
  type TransferPackage,
  type Value,
  type Paint,
} from "./types";
const v = (
  type: "UDim2" | "UDim" | "Vector2" | "Color3",
  ...value: number[]
): Value => ({ type, value: value.map(round) });
const en = (type: string, name: string): Value => ({
  type: "Enum",
  value: [type, name],
});
const color = (c: Color): Value => v("Color3", c.r, c.g, c.b);
const white: Color = { r: 1, g: 1, b: 1 };
const paints = (p: Paint[]) => p.filter((x) => x.visible !== false);
const FONT_FAMILIES: Record<string, string> = {
  Roboto: "Roboto",
  Arial: "Arial",
  Arimo: "Arimo",
  Gotham: "GothamSSm",
  "Gotham SSm": "GothamSSm",
  "Source Sans Pro": "SourceSansPro",
  "Source Sans 3": "SourceSansPro",
  Ubuntu: "Ubuntu",
  Montserrat: "Montserrat",
  Nunito: "Nunito",
  "Fredoka One": "FredokaOne",
  "Roboto Mono": "RobotoMono",
  "Roboto Condensed": "RobotoCondensed",
  Oswald: "Oswald",
  Bangers: "Bangers",
};
function weight(style: string) {
  if (/black|heavy/i.test(style)) return "Heavy";
  if (/extra.?bold/i.test(style)) return "ExtraBold";
  if (/semi.?bold|demi/i.test(style)) return "SemiBold";
  if (/bold/i.test(style)) return "Bold";
  if (/medium/i.test(style)) return "Medium";
  if (/extra.?light/i.test(style)) return "ExtraLight";
  if (/light/i.test(style)) return "Light";
  if (/thin/i.test(style)) return "Thin";
  return "Regular";
}
export function fallbackReasons(node: DesignNode): string[] {
  const reasons: string[] = [];
  if (node.unsupported) reasons.push(...node.unsupported);
  if (
    ![
      "FRAME",
      "GROUP",
      "COMPONENT",
      "INSTANCE",
      "COMPONENT_SET",
      "RECTANGLE",
      "ELLIPSE",
      "TEXT",
      "SECTION",
      "TRANSFORM_GROUP",
    ].includes(node.type)
  )
    reasons.push(node.type === "ARC" ? "ellipse arc" : "vector artwork");
  if (node.type === "TRANSFORM_GROUP") {
    const plan = linearRepeatPlan(node);
    if (plan.reason) reasons.push(plan.reason);
  }
  if (node.type === "ELLIPSE" && node.width !== node.height)
    reasons.push("non-circular ellipse");
  const supportedShadows = nativeShadows(node).length;
  const effects = [...(node.effects ?? [])];
  for (let i = 0; i < supportedShadows; i++) {
    const index = effects.indexOf("DROP_SHADOW");
    if (index >= 0) effects.splice(index, 1);
  }
  if (effects.length)
    reasons.push(effects.join(", ").toLowerCase().replace(/_/g, " "));
  if (node.cornerSmoothing) reasons.push("smooth corners");
  const mask = nativeMaskPlan(node);
  if (mask?.reason) reasons.push(`mask group: ${mask.reason}`);
  if (node.blendMode && !["NORMAL", "PASS_THROUGH"].includes(node.blendMode))
    reasons.push("blend mode");
  const fill = paints(node.fills),
    strokes = paints(node.strokes);
  if (fill.length > 1 && (node.text || !fill.every(nativePaint)))
    reasons.push("multiple fills");
  if (fill.some((p) => p.type === "IMAGE")) reasons.push("image fill");
  if (fill.some((p) => !["SOLID", "GRADIENT_LINEAR", "IMAGE"].includes(p.type)))
    reasons.push("complex gradient or paint");
  if (fill.some((p) => p.blendMode && p.blendMode !== "NORMAL"))
    reasons.push("paint blend mode");
  // Native UIGradient only spans the object edges. Arbitrary transforms use a rendered fallback.
  if (fill.some((p) => p.type === "GRADIENT_LINEAR" && !simpleGradient(p)))
    reasons.push("transformed gradient");
  if (
    fill.some(
      (p) =>
        p.gradientStops &&
        (p.gradientStops.length > 20 ||
          new Set(p.gradientStops.map((s) => s.position)).size !==
            p.gradientStops.length),
    )
  )
    reasons.push("dense or hard-stop gradient");
  if ((node.text && strokes.length > 1) || strokes.some((p) => !nativePaint(p)))
    reasons.push("complex stroke");
  if (geometry(node.transform, node.width, node.height).skewed)
    reasons.push("skew or reflection");
  const clips = (n: DesignNode): boolean =>
    !!n.clipsContent || n.children.some(clips);
  if (
    Math.abs(geometry(node.transform, node.width, node.height).rotation) >
      0.001 &&
    clips(node)
  )
    reasons.push("rotated clipping");
  if (node.text?.unsupported?.length) reasons.push(...node.text.unsupported);
  return reasons;
}
// Editable mode can approximate effects, but cannot reproduce vector paths or photos.
function requiresArtworkImage(n: DesignNode): boolean {
  return (
    ![
      "FRAME",
      "GROUP",
      "COMPONENT",
      "INSTANCE",
      "COMPONENT_SET",
      "RECTANGLE",
      "ELLIPSE",
      "TEXT",
      "SECTION",
    ].includes(n.type) ||
    (n.type === "ELLIPSE" &&
      (n.width !== n.height || !!n.unsupported?.includes("ellipse arc"))) ||
    paints(n.fills).some(
      (p) => !["SOLID", "GRADIENT_LINEAR"].includes(p.type),
    ) ||
    !!nativeMaskPlan(n)?.reason
  );
}
function isArtworkGroup(n: DesignNode): boolean {
  if (n.type !== "GROUP" || !n.children.length) return false;
  if (nativeMaskPlan(n)?.clips) return false;
  const art = (child: DesignNode): boolean => {
    if (child.text || (child.layout && child.layout.mode !== "NONE"))
      return false;
    if (child.type === "GROUP")
      return child.children.filter((item) => item.visible).every(art);
    return (
      [
        "VECTOR",
        "BOOLEAN_OPERATION",
        "RECTANGLE",
        "ELLIPSE",
        "STAR",
        "POLYGON",
        "LINE",
      ].includes(child.type) && !child.children.length
    );
  };
  const visible = n.children.filter((child) => child.visible);
  return (
    visible.length > 0 &&
    visible.every(art) &&
    visible.some(
      (child) => requiresArtworkImage(child) || isArtworkGroup(child),
    )
  );
}
function simpleGradient(p: Paint): boolean {
  const t = p.gradientTransform;
  if (!t) return false;
  return (
    (Math.abs(t[0][0] - 1) < 0.0001 &&
      Math.abs(t[0][1]) < 0.0001 &&
      Math.abs(t[0][2]) < 0.0001) ||
    (Math.abs(t[0][0]) < 0.0001 &&
      Math.abs(t[0][1] - 1) < 0.0001 &&
      Math.abs(t[0][2]) < 0.0001)
  );
}
function stopsFor(p: Paint) {
  const stops = [...(p.gradientStops ?? [])]
    .sort((a, b) => a.position - b.position)
    .filter((s, i, all) => i === 0 || s.position > all[i - 1].position);
  if (!stops.length)
    return [
      { position: 0, color: white },
      { position: 1, color: white },
    ];
  if (stops[0].position > 0)
    stops.unshift({ position: 0, color: stops[0].color });
  if (stops[stops.length - 1].position < 1)
    stops.push({ position: 1, color: stops[stops.length - 1].color });
  return stops;
}
export function compile(
  designs: DesignNode[],
  sourceId: string,
  options: Partial<ExportOptions> = {},
  now = new Date().toISOString(),
): TransferPackage {
  const originalSettings: ExportOptions = { ...DEFAULT_OPTIONS, ...options };
  if (
    originalSettings.screenSize != null &&
    (!Array.isArray(originalSettings.screenSize) ||
      originalSettings.screenSize.length !== 2 ||
      !originalSettings.screenSize.every(
        (size) => Number.isInteger(size) && size >= 64 && size <= 8192,
      ))
  )
    throw new Error(
      "Design screen dimensions must be whole numbers from 64 to 8192 pixels.",
    );
  if (
    originalSettings.rootPlacement !== undefined &&
    !["center", "top-left"].includes(originalSettings.rootPlacement)
  )
    throw new Error("Invalid main frame placement.");
  const detectButton = createButtonDetector();
  const scrollbars = prepareScrollbars(designs, originalSettings);
  designs = scrollbars.designs;
  const settings = scrollbars.settings;
  const dynamicBackdrops = new Set<string>();
  for (const edit of Object.values(settings.layerOverrides)) {
    const rules = edit.behavior && edit.behavior.rules;
    if (validRules(rules))
      for (const rule of rules!)
        for (const action of ruleActions(rule))
          if (
            ["BackgroundColor3", "BackgroundTransparency"].includes(
              action.property,
            )
          )
            dynamicBackdrops.add(action.target);
  }
  const issues: Issue[] = [],
    assets: TransferPackage["assets"] = [];
  let native = 0,
    raster = 0,
    layers = 0;
  const styleCalibrations: StyleCalibration[] = [];
  const issue = (
    n: DesignNode,
    code: string,
    message: string,
    severity: Issue["severity"] = "warning",
  ) => issues.push({ nodeId: n.id, nodeName: n.name, code, message, severity });
  const font = (
    family: string,
    style: string,
    n: DesignNode,
  ): Extract<Value, { type: "Font" }> => {
    const custom = validAssetId(settings.fontIds[family]);
    if (!custom && !FONT_FAMILIES[family])
      issue(
        n,
        "font-substitution",
        `${family} is mapped to Source Sans Pro. Map a Roblox font family asset in Settings for a closer match.`,
      );
    if (!custom && ["Arial", "GothamSSm"].includes(FONT_FAMILIES[family] ?? ""))
      issue(
        n,
        "font-substitution",
        family +
          " uses Roblox's " +
          (FONT_FAMILIES[family] === "Arial" ? "Arimo" : "Montserrat") +
          " engine alias. Map a Roblox font family asset in Settings to use the original font.",
      );
    return {
      type: "Font",
      family:
        custom ||
        `rbxasset://fonts/families/${FONT_FAMILIES[family] || "SourceSansPro"}.json`,
      weight: weight(style),
      style: /italic|oblique/i.test(style) ? "Italic" : "Normal",
    };
  };
  const helper = (
    parent: RbxNode,
    suffix: string,
    className: string,
    properties: Record<string, Value>,
  ) =>
    parent.children.push({
      id: `${parent.id}/${suffix}`,
      name: className,
      className,
      properties,
      children: [],
    });
  const textInSubtree = new WeakMap<DesignNode, boolean>();
  function containsEditableText(n: DesignNode): boolean {
    const override = n.nativeMaskBasis
      ? undefined
      : settings.layerOverrides[n.id];
    if (
      override?.renderMode === "skip" ||
      (!n.visible && !settings.includeHidden) ||
      (/\[skip\]/i.test(n.name) &&
        !["native", "image"].includes(override?.renderMode ?? "")) ||
      (/\[raster\]/i.test(n.name) && !override)
    )
      return false;
    const cached = textInSubtree.get(n);
    if (cached !== undefined) return cached;
    const found =
      override?.renderMode === "native" ||
      (!!override?.className && !override.className.startsWith("Image")) ||
      (settings.preserveText && !!n.text) ||
      n.children.some((child) => {
        const childOverride = settings.layerOverrides[child.id];
        return (
          (!!childOverride &&
            childOverride.renderMode !== "skip" &&
            (child.visible || settings.includeHidden) &&
            Object.keys(childOverride).length > 0) ||
          containsEditableText(child)
        );
      });
    textInSubtree.set(n, found);
    return found;
  }
  function visit(
    n: DesignNode,
    parent: DesignNode | undefined,
    order: number,
    buttonAncestor = false,
    safeClipAncestors = true,
  ): RbxNode | undefined {
    const override = n.nativeMaskBasis
      ? undefined
      : settings.layerOverrides[n.id];
    const interaction = layerBehavior(n, override);
    if (!n.visible && !settings.includeHidden && !interaction) return;
    if (
      override?.renderMode === "skip" ||
      (/\[skip\]/i.test(n.name) &&
        !["native", "image"].includes(override?.renderMode ?? ""))
    )
      return;
    if (
      override?.renderMode &&
      !["auto", "native", "image", "skip"].includes(override.renderMode)
    )
      throw new Error("Invalid layer rendering mode.");
    if (
      override?.className &&
      ![
        "Frame",
        "CanvasGroup",
        "ScrollingFrame",
        "ViewportFrame",
        "TextLabel",
        "TextButton",
        "TextBox",
        "ImageLabel",
        "ImageButton",
      ].includes(override.className)
    )
      throw new Error("Unsupported layer instance type.");
    if (++layers > 10000)
      throw new Error(
        "Selection exceeds 10,000 layers. Export smaller sections.",
      );
    const maskPlan = nativeMaskPlan(
      n,
      settings.layerOverrides,
      safeClipAncestors,
    );
    const reasons = fallbackReasons(n);
    if (
      maskPlan?.reason &&
      !reasons.some((reason) => reason.startsWith("mask group:"))
    )
      reasons.push(`mask group: ${maskPlan.reason}`);
    const artworkGroup = isArtworkGroup(n);
    if (artworkGroup) reasons.push("composite vector artwork");
    const forceRaster =
      override?.renderMode === "image" ||
      !!override?.className?.startsWith("Image") ||
      (!override?.className &&
        override?.renderMode !== "native" &&
        /(?:^|[_\s-])imagebutton$/i.test(n.name)) ||
      (override?.renderMode !== "native" && /\[raster\]/i.test(n.name));
    // Keep actual text and its ancestors editable even when artwork prioritizes
    // appearance. Explicit [raster] tags and the setting remain intentional overrides.
    const keepText = containsEditableText(n);
    const preserveBehavior =
      !!interaction?.role ||
      !!interaction?.binding ||
      n.children.some((child) =>
        needsBehaviorHierarchy(child, settings.layerOverrides),
      );
    const unsupportedRepeat =
      n.type === "TRANSFORM_GROUP" && !!linearRepeatPlan(n).reason;
    const explicitNative =
      override?.renderMode === "native" ||
      (!!override?.className && !override.className.startsWith("Image"));
    const unsupportedMask = !!maskPlan?.reason;
    let isRaster =
      forceRaster ||
      (unsupportedRepeat && !explicitNative) ||
      (unsupportedMask && !explicitNative) ||
      (override?.renderMode !== "native" &&
        !((unsupportedRepeat || unsupportedMask) && explicitNative) &&
        !keepText &&
        !preserveBehavior &&
        reasons.length > 0 &&
        (requiresArtworkImage(n) ||
          artworkGroup ||
          settings.appearance === "faithful"));
    const detection = detectButton(
      n,
      parent,
      override,
      settings.detectButtons,
      parent ? settings.layerOverrides[parent.id] : undefined,
    );
    if (
      !override?.className &&
      (interaction?.action ||
        (needsKeyframeInput(interaction?.keyframes) &&
          interaction?.keyframes?.input !== "parent" &&
          !buttonAncestor) ||
        (interaction?.particles?.trigger === "activate" && !buttonAncestor) ||
        controlNeedsButton(interaction?.control) ||
        (settings.themeEnabled !== false &&
          !!override?.theme &&
          !!override.theme.hover &&
          !buttonAncestor) ||
        (needsMotionInput(interaction?.motion) &&
          interaction?.motion?.input !== "parent" &&
          !buttonAncestor))
    ) {
      detection.button = true;
      detection.className = preferredButtonClass(n);
    } else if (
      !override?.className &&
      (interaction?.state ||
        needsMotionInput(interaction?.motion) ||
        needsKeyframeInput(interaction?.keyframes) ||
        controlNeedsButton(interaction?.control) ||
        (parent &&
          layerBehavior(parent, settings.layerOverrides[parent.id])?.action))
    )
      detection.button = false;
    const functionalContainer =
      !artworkGroup &&
      !n.text &&
      [
        "FRAME",
        "GROUP",
        "COMPONENT",
        "INSTANCE",
        "COMPONENT_SET",
        "SECTION",
        "RECTANGLE",
        "ELLIPSE",
      ].includes(n.type) &&
      (n.children.some((child) => {
        const edit = settings.layerOverrides[child.id];
        return (
          (child.visible || settings.includeHidden) &&
          edit?.renderMode !== "skip" &&
          (!/\[skip\]/i.test(child.name) ||
            ["native", "image"].includes(edit?.renderMode ?? ""))
        );
      }) ||
        !!n.scrolling ||
        /(?:\[scroll\]|[_\s-](?:scroll|scrollingframe))$/i.test(n.name) ||
        (!!n.layout && n.layout.mode !== "NONE") ||
        detection.button ||
        explicitNative ||
        keepText ||
        preserveBehavior);
    // A backdrop must not decide whether a scroll/list/button's hierarchy survives.
    if (
      functionalContainer &&
      !forceRaster &&
      !unsupportedRepeat &&
      !unsupportedMask
    )
      isRaster = false;
    const parentEdit = parent && settings.layerOverrides[parent.id];
    const parentBehavior = parentEdit?.behavior || undefined;
    const safeBackdrop =
      !parentEdit?.properties?.BackgroundColor3 &&
      parentEdit?.properties?.BackgroundTransparency === undefined &&
      !parentEdit?.theme &&
      !parentBehavior?.control &&
      !parentBehavior?.motion &&
      !parentBehavior?.keyframes &&
      !(parent && dynamicBackdrops.has(parent.id));
    const backdrop = safeBackdrop ? paintBlendBackdrop(n, parent) : undefined;
    const paintBlend = n.fills.some(
      (p) => p.visible !== false && p.blendMode && p.blendMode !== "NORMAL",
    );
    const bakedFill =
      !isRaster &&
      functionalContainer &&
      needsFillDecoration(n, safeBackdrop ? parent : undefined) &&
      n.width * n.height * settings.imageScale ** 2 <= 4194304;
    const shadowCandidate =
      !isRaster &&
      needsShadowDecoration(n, settings.imageScale) &&
      !paintBlend &&
      (!n.text ||
        !override?.className ||
        ["TextLabel", "TextButton", "TextBox"].includes(override.className)) &&
      override?.components?.shadow !== false &&
      !(
        settings.themeEnabled !== false &&
        override?.theme &&
        override.theme.shadow
      );
    if (
      !isRaster &&
      needsShadowDecoration(n, settings.imageScale) &&
      settings.themeEnabled !== false &&
      override?.theme &&
      override.theme.shadow &&
      !n.text
    )
      issue(
        n,
        "theme-shadow-fallback",
        "A live shadow theme uses the native filled-box UIShadow. This layer's content-shaped effect is not baked so the theme can own its shadow; a live text/child silhouette is unsupported.",
      );
    if (isRaster && preserveBehavior)
      issue(
        n,
        "behavior-raster",
        "This image would flatten an interaction or its target. Keep the container editable and bake its decoration separately.",
        "error",
      );
    if (unsupportedRepeat)
      issue(
        n,
        "repeat-fallback",
        explicitNative
          ? "This repeat pattern cannot be expanded. Choose Image rendering to preserve every copy, or replace it with supported linear repeats."
          : "This repeat pattern is rendered as one image to preserve every copy. Use linear repeats for editable objects.",
        explicitNative || preserveBehavior ? "error" : "warning",
      );
    if (unsupportedMask)
      issue(
        n,
        "mask-fallback",
        `This mask cannot become an editable native clip: ${maskPlan.reason}. Render this container as an image to preserve the complete masked appearance.`,
        explicitNative || preserveBehavior || maskPlan.requiresEditable
          ? "error"
          : "warning",
      );
    const action = detection.button;
    const text = n.text;
    const g = geometry(n.transform, n.width, n.height);
    const scrollAxis =
      n.scrolling === "HORIZONTAL" ? "X" : n.scrolling === "BOTH" ? "XY" : "Y";
    const scrolling =
      !!n.scrolling ||
      /(?:\[scroll\]|[_\s-](?:scroll|scrollingframe))$/i.test(n.name);
    const className = isRaster
      ? action
        ? "ImageButton"
        : "ImageLabel"
      : n.nativeMaskClip
        ? "CanvasGroup"
        : n.nativeMaskBasis
          ? "ScrollingFrame"
          : override?.className ||
            (scrolling
              ? "ScrollingFrame"
              : text
                ? action
                  ? "TextButton"
                  : "TextLabel"
                : action
                  ? detection.className || "TextButton"
                  : n.opacity < 1 &&
                      (n.children.length || paints(n.fills).length > 1)
                    ? "CanvasGroup"
                    : "Frame");
    const bakedShadow =
      shadowCandidate &&
      (!!n.text || n.opacity === 1 || className === "CanvasGroup");
    if (shadowCandidate && !bakedShadow)
      issue(
        n,
        "effect-opacity-fallback",
        "Separated effects need a single native group-opacity pass. This partially transparent non-text owner uses separate Frame/button/scrolling paint layers instead of CanvasGroup, so its drop effect remains an approximation. Use CanvasGroup where its clipping is acceptable, opacity 1, or an intentional subtree image.",
      );
    if (
      bakedFill &&
      paintBlend &&
      n.shadows?.length &&
      override?.components?.shadow !== false
    )
      issue(
        n,
        "blend-drop-fallback",
        "Blended own paint does not support a separate drop-effect reconstruction. Native filled-box shadow behavior can differ; intentionally render the source backdrop and artwork together when both blend and drop effects are required.",
      );
    const result: RbxNode = {
      id: n.id,
      name: buttonLayerName(behaviorLayerName(n.name)),
      className,
      sourceType: n.type,
      ...(n.nativeMaskBasis
        ? { maskBasis: n.nativeMaskBasis, sourceType: "MASK_CONTENT" }
        : {}),
      properties: {},
      children: [],
    };
    const p = result.properties;
    if (className === "ImageButton" && !isRaster)
      Object.assign(p, {
        Image: "",
        ImageColor3: color(white),
        ImageTransparency: 0,
        ScaleType: en("ScaleType", "Stretch"),
      });
    if (action && detection.reason && detection.reason !== "button hint")
      issue(
        n,
        "button-detected",
        `Detected ${className} from ${detection.reason}. Choose Frame or another instance type in Export setup to override it.`,
        "info",
      );
    if (className === "ScrollingFrame")
      Object.assign(p, {
        CanvasSize: v("UDim2", 0, 0, 0, 0),
        AutomaticCanvasSize: en("AutomaticSize", scrollAxis),
        ScrollingDirection: en("ScrollingDirection", scrollAxis),
        ScrollingEnabled: true,
        ScrollBarThickness: 6,
        Active: true,
      });
    if (n.nativeMaskBasis)
      Object.assign(p, {
        CanvasSize: v("UDim2", 0, n.width, 0, n.height),
        AutomaticCanvasSize: en("AutomaticSize", "None"),
        ScrollingDirection: en("ScrollingDirection", "XY"),
        ScrollingEnabled: false,
        ScrollBarThickness: 0,
        Active: false,
        Selectable: false,
      });
    if (className === "TextBox")
      Object.assign(p, {
        ClearTextOnFocus: false,
        TextEditable: true,
        MultiLine: false,
        PlaceholderText: "",
      });
    const constrained =
      parent &&
      settings.layout === "responsive" &&
      (!parent.layout || parent.layout.mode === "NONE" || n.absolute);
    const a = constrained
      ? axisConstraint(
          n.constraints?.horizontal || "MIN",
          g.x,
          n.width,
          parent.width,
        )
      : [0, parent ? g.x : 0, 0, n.width];
    const b = constrained
      ? axisConstraint(
          n.constraints?.vertical || "MIN",
          g.y,
          n.height,
          parent.height,
        )
      : [0, parent ? g.y : 0, 0, n.height];
    p.Position = v("UDim2", a[0], a[1], b[0], b[1]);
    p.Size = v("UDim2", a[2], a[3], b[2], b[3]);
    p.AnchorPoint = v("Vector2", 0, 0);
    p.Rotation = parent ? g.rotation : 0;
    p.Visible = n.visible;
    p.BorderSizePixel = 0;
    p.BackgroundTransparency = 1;
    p.LayoutOrder = order;
    p.ZIndex = order + 1;
    p.ClipsDescendants = n.clipsContent ?? false;
    if (action) {
      p.AutoButtonColor = false;
      p.Active = true;
      p.Selectable = true;
      if (className === "TextButton") p.Text = "";
    }
    if (isRaster) {
      if (
        paintBlend ||
        (n.blendMode && !["NORMAL", "PASS_THROUGH"].includes(n.blendMode))
      )
        issue(
          n,
          "blend-backdrop-fallback",
          "This standalone image is exported without its external parent backdrop. Paint or layer blending against that backdrop is not preserved. Only an editable container's own paints over a known flat opaque source parent support backdrop baking; vectors and subtree images need a flattened source backdrop for exact appearance.",
        );
      raster++;
      if (n.rasterBounds) {
        const box = n.rasterBounds;
        const x = constrained
          ? axisConstraint(
              n.constraints?.horizontal || "MIN",
              box.x,
              box.width,
              parent.width,
            )
          : [0, box.x, 0, box.width];
        const y = constrained
          ? axisConstraint(
              n.constraints?.vertical || "MIN",
              box.y,
              box.height,
              parent.height,
            )
          : [0, box.y, 0, box.height];
        p.Position = v("UDim2", x[0], x[1], y[0], y[1]);
        p.Size = v("UDim2", x[2], x[3], y[2], y[3]);
        p.Rotation = 0;
      }
      const processing = exportImageProcessing(override?.imageProcessing);
      const id = artworkAssetId(n.id, processing);
      const robloxId = validAssetId(settings.assetIds[id]);
      assets.push({
        ...(processing ? { processing } : {}),
        id,
        nodeId: n.id,
        name: result.name,
        filename: `${result.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}_${n.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`,
        width: n.rasterBounds?.width ?? n.width,
        height: n.rasterBounds?.height ?? n.height,
        scale: settings.imageScale,
        robloxId,
        reason: forceRaster ? "Marked [raster]" : reasons.join("; "),
      });
      result.assetRef = id;
      p.Image = robloxId || "";
      p.ImageColor3 = color(white);
      p.ImageTransparency = 0;
      p.ScaleType = en("ScaleType", "Stretch");
      p.ClipsDescendants = false;
      // The PNG already contains fills, text, opacity, effects, and descendants.
      issue(
        n,
        "raster-fallback",
        `Exported as an image to preserve ${forceRaster ? "its appearance" : reasons.join(", ")}. Its descendants are included in that image.`,
        "info",
      );
      if (!robloxId)
        issue(
          n,
          "asset-required",
          "Upload this PNG through Studio Asset Manager, then link its image asset ID before importing.",
          "warning",
        );
      return result;
    }
    native++;
    if (
      !parent &&
      !text &&
      settings.layout === "responsive" &&
      !settings.screenSize
    )
      p.Size = v("UDim2", 1, 0, 1, 0);
    const remainingReasons = reasons.filter(
      (reason) =>
        !(bakedFill && BAKED_FILL_REASONS.has(reason)) &&
        !(bakedShadow && /^drop shadow(?:, drop shadow)*$/.test(reason)),
    );
    if (remainingReasons.length)
      issue(
        n,
        "appearance-approximation",
        `Keeping editable ${keepText ? "text and its container" : "layers"} approximates: ${remainingReasons.join(", ")}. Mark the layer [raster]${keepText ? " or turn off Keep text editable" : " or use Preserve appearance"} for an image fallback.`,
      );
    const opacity = className === "CanvasGroup" ? 1 : n.opacity;
    if (className === "CanvasGroup") {
      p.GroupTransparency = 1 - n.opacity;
      issue(
        n,
        "canvas-group",
        "Group opacity uses CanvasGroup, which clips descendants to its bounds.",
        "info",
      );
      if (n.nativeMaskClip)
        issue(
          n,
          "native-mask",
          "This mask clips editable descendants using CanvasGroup and UICorner. Keep the screen's sibling ZIndex mode; large or frequently resized groups use extra texture memory.",
          "info",
        );
    }
    const fill = bakedFill ? undefined : paints(n.fills)[0];
    const nativeGradient =
      fill?.type === "GRADIENT_LINEAR" &&
      simpleGradient(fill) &&
      (!text || !text.unsupported?.includes("complex text paint"));
    if (fill?.type === "SOLID" && !text) {
      p.BackgroundColor3 = color(fill.color || white);
      p.BackgroundTransparency = round(1 - (fill.opacity ?? 1) * opacity);
    }
    if (nativeGradient) {
      if (!text) {
        p.BackgroundColor3 = color(white);
        p.BackgroundTransparency = round(1 - (fill.opacity ?? 1) * opacity);
      }
      const stops = stopsFor(fill);
      if (stops.length > 20)
        issue(
          n,
          "gradient-stops",
          "More than 20 gradient stops require a raster fallback.",
          "error",
        );
      else
        helper(result, "gradient", "UIGradient", {
          Rotation: Math.abs(fill.gradientTransform![0][1]) > 0.5 ? 90 : 0,
          Color: {
            type: "ColorSequence",
            value: stops.map((s) => [
              s.position,
              s.color.r,
              s.color.g,
              s.color.b,
            ]),
          },
          Transparency: {
            type: "NumberSequence",
            value: stops.map((s) => [s.position, 1 - (s.color.a ?? 1)]),
          },
        });
    }
    const decorateNative = () =>
      decorate(
        {
          ...n,
          ...(bakedFill ? { fills: [] } : {}),
          ...(bakedShadow ? { shadows: [] } : {}),
        },
        result,
        opacity,
        settings.styleSizing === "scale",
      );
    if (!text) decorateNative();
    // Background/effect helpers retain their authored colors; only edge cleanup applies.
    const decorationProcessing =
      bakedFill || bakedShadow
        ? exportImageProcessing({
            edgeCleanup: override?.imageProcessing?.edgeCleanup !== false,
          })
        : undefined;
    if (bakedFill) {
      const box = n.decorationBounds ?? {
        x: 0,
        y: 0,
        width: n.width,
        height: n.height,
      };
      const mode = backdrop ? "blend" : "fills";
      const id = `${artworkAssetId(n.id, decorationProcessing)}:${mode === "blend" ? "blend-v1" : "fills-v1"}`;
      const robloxId = validAssetId(settings.assetIds[id]);
      assets.push({
        ...(decorationProcessing ? { processing: decorationProcessing } : {}),
        id,
        nodeId: n.id,
        name: `${result.name} background`,
        filename: `${result.name.replace(/[^a-z0-9_-]/gi, "_")}_${n.id.replace(/[^a-z0-9]/gi, "_")}_background.png`,
        renderMode: mode,
        ...(backdrop ? { backdrop } : {}),
        width: box.width,
        height: box.height,
        scale: settings.imageScale,
        robloxId,
        reason: reasons
          .filter((reason) => BAKED_FILL_REASONS.has(reason))
          .join(", "),
      });
      const rect: [number, number, number, number] = [
        box.x / n.width,
        box.y / n.height,
        box.width / n.width,
        box.height / n.height,
      ].map(round) as [number, number, number, number];
      result.children.push({
        id: `${n.id}/decoration`,
        name: "Background artwork",
        className: "ImageLabel",
        assetRef: id,
        decorationRect: rect,
        referenceSize: [n.width, n.height],
        layoutSizing: ["FILL", "FILL"],
        properties: {
          Position: v("UDim2", rect[0], 0, rect[1], 0),
          Size: v("UDim2", rect[2], 0, rect[3], 0),
          AnchorPoint: v("Vector2", 0, 0),
          Rotation: 0,
          BackgroundTransparency: 1,
          BorderSizePixel: 0,
          Image: robloxId || "",
          ImageColor3: color(white),
          ImageTransparency: 1 - opacity,
          ScaleType: en("ScaleType", "Stretch"),
          Active: false,
          Selectable: false,
          ZIndex: 0,
          ClipsDescendants: false,
        },
        children: [],
      });
      raster++;
      issue(
        n,
        "decoration-image",
        "Only this container's background is rendered as an image. Its children, layout and input remain editable; resizing stretches the background artwork.",
        "info",
      );
      if (backdrop)
        issue(
          n,
          "frozen-paint-backdrop",
          "Own paint blends are baked against this source parent's flat opaque color. Children stay editable. Changing the parent backdrop in Studio requires a fresh Figma render; gradients, overlapping content and unknown backdrops are unsupported.",
        );
      if (!robloxId)
        issue(
          n,
          "asset-required",
          "Upload or link this background PNG before importing.",
        );
    }
    if (bakedShadow) {
      const box = n.effectBounds ?? {
        x: 0,
        y: 0,
        width: n.width,
        height: n.height,
      };
      const id = `${artworkAssetId(n.id, decorationProcessing)}:shadow-v1`;
      const robloxId = validAssetId(settings.assetIds[id]);
      assets.push({
        ...(decorationProcessing ? { processing: decorationProcessing } : {}),
        id,
        nodeId: n.id,
        name: `${result.name} drop effect`,
        filename: `${result.name.replace(/[^a-z0-9_-]/gi, "_")}_${n.id.replace(/[^a-z0-9]/gi, "_")}_drop_effect.png`,
        renderMode: "shadow",
        width: box.width,
        height: box.height,
        scale: settings.imageScale,
        robloxId,
        reason: "Separated own normal drop shadows; frozen source silhouette",
      });
      const rect = [
        box.x / n.width,
        box.y / n.height,
        box.width / n.width,
        box.height / n.height,
      ].map(round) as [number, number, number, number];
      result.children.push({
        id: `${n.id}/effect`,
        name: "Drop effect artwork",
        className: "ImageLabel",
        assetRef: id,
        decorationRect: rect,
        referenceSize: [n.width, n.height],
        layoutSizing: ["FILL", "FILL"],
        properties: {
          Position: v("UDim2", rect[0], 0, rect[1], 0),
          Size: v("UDim2", rect[2], 0, rect[3], 0),
          AnchorPoint: v("Vector2", 0, 0),
          Rotation: 0,
          BackgroundTransparency: 1,
          BorderSizePixel: 0,
          Image: robloxId || "",
          ImageColor3: color(white),
          ImageTransparency: 1 - opacity,
          ScaleType: en("ScaleType", "Stretch"),
          Active: false,
          Selectable: false,
          ZIndex: -1,
          ClipsDescendants: false,
        },
        children: [],
      });
      raster++;
      issue(
        n,
        n.text ? "live-text-decoration" : "frozen-drop-effect",
        n.text
          ? "Authored text shadows retain their captured pixels while text, font and geometry match. Live edits, bindings and font/shadow themes use bounded native glyph layers that follow the editable text, including rich runs. Soft edges approximate blur; negative spread and exact Gaussian/glow pixels are not preserved. Restoring the authored state restores the capture. Inner shadows and blend effects remain unsupported."
          : "Own normal drop shadows are separated into noninteractive artwork. Children remain editable; their silhouette and shadow color stay frozen until a fresh Figma render. Resizing stretches the artwork. Native strokes, inner shadows, blur and layer blend effects remain unsupported.",
      );
      if (
        (box.x < 0 ||
          box.y < 0 ||
          box.x + box.width > n.width ||
          box.y + box.height > n.height) &&
        (className === "CanvasGroup" ||
          n.clipsContent ||
          parent?.clipsContent ||
          (parent && parent.opacity < 1))
      )
        issue(
          n,
          "clipped-drop-effect",
          "The separated drop effect extends beyond its owner. CanvasGroup always clips that artwork to its bounds, and clipping parents can trim it. Use an unclipped surrounding container for an outer glow; group opacity does not allow an extended child effect to escape the group.",
        );
      if (!robloxId)
        issue(
          n,
          "asset-required",
          "Upload or link this drop-effect PNG before importing.",
        );
    }
    if (text) {
      if (/[\u2600-\u27BF\u{1F000}-\u{1FAFF}]/u.test(text.characters))
        issue(
          n,
          "symbol-glyphs",
          "This text includes symbols or emoji. Verify glyph availability in Studio, or mark the layer [raster] to preserve its appearance.",
        );
      const run = text.runs[0] || {
        text: text.characters,
        fontFamily: "Source Sans Pro",
        fontStyle: "Regular",
        fontSize: 16,
      };
      const configuredFont = override?.properties?.FontFace;
      const fontOverride =
        configuredFont &&
        typeof configuredFont === "object" &&
        configuredFont.type === "Font"
          ? configuredFont
          : undefined;
      const baseFont = fontOverride ?? font(run.fontFamily, run.fontStyle, n);
      const baseSize = figmaTextSize(run.fontSize, baseFont);
      const configuredSize = override?.properties?.TextSize;
      const explicitSize =
        typeof configuredSize === "number" && Number.isFinite(configuredSize)
          ? nativeTextSize(configuredSize).value
          : undefined;
      const usesRichText = text.runs.length > 1 || run.underline || run.strike;
      const effectiveSize =
        explicitSize ??
        (usesRichText
          ? richTextSize(baseSize.requested).value
          : baseSize.value);
      const sizeScale =
        explicitSize !== undefined && baseSize.requested > 0
          ? explicitSize / baseSize.requested
          : 1;
      const sizeNotice = (
        value: ReturnType<typeof figmaTextSize>,
        face: Extract<Value, { type: "Font" }>,
        size: ReturnType<typeof nativeTextSize> = value,
        rich = false,
      ) => {
        if (!value.verified && explicitSize === undefined)
          issue(
            n,
            "font-size-unverified",
            "Native line-height conversion is unverified for " +
              face.family +
              " (" +
              face.weight +
              ", " +
              face.style +
              (rich
                ? "). The source size is retained subject to positive integer RichText sizes. Set Roblox TextSize explicitly to tune it."
                : "). The source size is retained subject to native integer and 1–100 px limits. Set Roblox TextSize explicitly to tune it."),
          );
        if (size.clamped)
          issue(
            n,
            "font-size-limit",
            "This text needs a native line height of " +
              round(size.requested) +
              (rich
                ? " px, below the positive integer RichText size range. It is limited to "
                : " px, outside Roblox's 1–100 px TextSize range. It is limited to ") +
              size.value +
              " px. Adjust the source font size or set Roblox TextSize explicitly.",
          );
      };
      if (explicitSize === undefined && !usesRichText)
        sizeNotice(baseSize, baseFont);
      p.Text = text.characters;
      p.FontFace = baseFont;
      p.TextSize = baseSize.value;
      p.TextColor3 = color(
        nativeGradient
          ? white
          : run.color ||
              fill?.color ||
              fill?.gradientStops?.[0]?.color || { r: 0, g: 0, b: 0 },
      );
      p.TextTransparency = round(
        1 - opacity * (run.color?.a ?? fill?.opacity ?? 1),
      );
      p.TextXAlignment = en(
        "TextXAlignment",
        (
          {
            LEFT: "Left",
            CENTER: "Center",
            RIGHT: "Right",
            JUSTIFIED: "Left",
          } as Record<string, string>
        )[text.align] || "Left",
      );
      p.TextYAlignment = en(
        "TextYAlignment",
        (
          { TOP: "Top", CENTER: "Center", BOTTOM: "Bottom" } as Record<
            string,
            string
          >
        )[text.verticalAlign] || "Top",
      );
      p.TextWrapped = text.autoResize !== "WIDTH_AND_HEIGHT";
      p.TextScaled = false;
      p.RichText = false;
      p.AutoLocalize = false;
      if (text.lineHeight) {
        const requested = text.lineHeight / effectiveSize;
        const lineHeight = round(Math.max(1, Math.min(3, requested)));
        p.LineHeight = lineHeight;
        if (override?.properties?.LineHeight === undefined)
          issue(
            n,
            requested < 1 || requested > 3
              ? "line-height-limit"
              : "line-height",
            "Figma line height " +
              text.lineHeight +
              " px uses a Roblox multiplier of " +
              lineHeight +
              " against native text height " +
              effectiveSize +
              " px." +
              (requested < 1 || requested > 3
                ? " Roblox supports 1–3; the multiplier is clamped and multiline spacing differs."
                : " Check multiline text in Studio."),
          );
      }
      if (text.letterSpacing)
        issue(
          n,
          "letter-spacing",
          "Roblox native text does not reproduce Figma letter spacing. Mark this layer [raster] if exact typography is required.",
        );
      if (text.align === "JUSTIFIED")
        issue(
          n,
          "justified-text",
          "Justified text is mapped to left alignment.",
        );
      if (usesRichText) {
        const richRunSizes: number[] = [];
        p.RichText = true;
        // Font tags inherit the label's italic style. A source-first italic run
        // must not make later normal runs italic; <i> keeps the authored italic
        // runs explicit. User FontFace overrides still choose every run's style.
        if (
          !fontOverride &&
          baseFont.style === "Italic" &&
          text.runs.some((r) => !/italic|oblique/i.test(r.fontStyle))
        )
          p.FontFace = { ...baseFont, style: "Normal" };
        p.Text = text.runs
          .map((r) => {
            const f = fontOverride ?? font(r.fontFamily, r.fontStyle, n);
            const convertedSize = figmaTextSize(r.fontSize, f);
            let requestedRichSize = convertedSize.requested * sizeScale;
            if (explicitSize !== undefined) {
              if (convertedSize.requested === baseSize.requested)
                requestedRichSize = explicitSize;
              else {
                // Only proportional override arithmetic gets an ULP-sized
                // correction. Source-to-native conversion still truncates.
                const integer = Math.round(requestedRichSize);
                if (
                  Math.abs(requestedRichSize - integer) <=
                  Number.EPSILON * Math.max(1, Math.abs(requestedRichSize)) * 4
                )
                  requestedRichSize = integer;
              }
            }
            const richSize = richTextSize(requestedRichSize);
            sizeNotice(convertedSize, f, richSize, true);
            richRunSizes.push(richSize.value);
            const c = nativeGradient
              ? white
              : r.color ||
                fill?.gradientStops?.[0]?.color || { r: 0, g: 0, b: 0 };
            let value = escapeRichText(r.text);
            if (r.underline) value = `<u>${value}</u>`;
            if (r.strike) value = `<s>${value}</s>`;
            return `<font family="${escapeRichText(f.family)}" weight="${f.weight}" size="${richSize.value}" color="rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})" transparency="${round(1 - (c.a ?? 1))}">${f.style === "Italic" ? `<i>${value}</i>` : value}</font>`;
          })
          .join("");
        if (
          text.lineHeight &&
          override?.properties?.LineHeight === undefined &&
          new Set(richRunSizes).size > 1
        )
          issue(
            n,
            "mixed-line-height",
            "Source line height is converted against the first rich run's native height. Roblox multiline and wrapped spacing depends on each line's rendered runs, so leading with mixed sizes is approximate. Check the final text in Studio.",
          );
        p.TextColor3 = color(white);
        p.TextTransparency = 1 - opacity;
      }
    }
    // Contextual scaled strokes need the compiled native TextSize reference.
    if (text) decorateNative();
    result.children.push(
      ...(maskPlan?.clips
        ? nativeMaskChildren(
            maskPlan,
            settings.layout === "responsive" ? n : undefined,
          )
        : n.children
      )
        .map((c, i) =>
          visit(
            c,
            n,
            i,
            buttonAncestor || ["TextButton", "ImageButton"].includes(className),
            safeClipAncestors && translationOnly(n.transform),
          ),
        )
        .filter((x): x is RbxNode => !!x),
    );
    if (n.nativeMaskBasis)
      result.children.unshift({
        id: `${n.id}/mask-scale`,
        name: "Mask coordinate scale",
        className: "UIScale",
        sourceType: "MASK_SCALE",
        properties: { Scale: 1 },
        children: [],
      });
    if (settings.layout === "responsive") applyContentSizing(n, result);
    applyResponsiveLayout(
      n,
      result,
      settings,
      (code, message) => issue(n, code, message),
      parent
        ? [
            parent.width -
              (parent.layout?.padding[1] ?? 0) -
              (parent.layout?.padding[3] ?? 0),
            parent.height -
              (parent.layout?.padding[0] ?? 0) -
              (parent.layout?.padding[2] ?? 0),
          ]
        : [n.width, n.height],
      styleCalibrations,
    );
    isolateDecoratedLayout(n, result);
    const allowed = PROPERTY_SCHEMAS[className];
    if (allowed)
      for (const key of Object.keys(p)) if (!allowed[key]) delete p[key];
    if (["TextButton", "TextLabel", "TextBox"].includes(className) && !text)
      Object.assign(p, {
        Text: "",
        TextSize: 16,
        TextColor3: color(white),
        TextTransparency: 0,
        RichText: false,
        TextScaled: false,
        TextWrapped: true,
      });
    if (
      text &&
      ["TextLabel", "TextButton", "TextBox"].includes(className) &&
      override?.components?.shadow !== false &&
      (bakedShadow ||
        (settings.themeEnabled !== false &&
          override?.theme &&
          override.theme.shadow))
    ) {
      result.textDecoration = textDecoration(
        n,
        result,
        settings.styleSizing === "scale",
        bakedShadow &&
          !Object.keys(override?.properties ?? {}).some((key) =>
            /^(Text|Font|RichText|LineHeight|MaxVisibleGraphemes|Size|AutomaticSize)/.test(
              key,
            ),
          ),
      );
      if (!bakedShadow) {
        result.textDecoration.shadows = [];
        issue(
          n,
          "live-text-decoration",
          "Text shadow themes use bounded editable glyph layers that follow content, rich runs and font changes. Soft edges approximate blur; exact Gaussian pixels and negative spread are not preserved.",
        );
      }
    }
    return result;
  }
  const selected = designs.filter((n) => settings.includeHidden || n.visible);
  const roots = selected
    .map((n, i) => {
      const child = visit(n, undefined, i);
      // A selected panel is not necessarily a full-screen design. Use the
      // declared screen as the root conversion basis, keeping descendant
      // coordinates relative to the panel's measured authored dimensions.
      const screen = settings.layerOverrides[n.id]?.worldUI
        ? undefined
        : settings.screenSize;
      if (child && screen) {
        const bounds = child.assetRef ? n.rasterBounds : undefined;
        const width = bounds?.width ?? n.width;
        const height = bounds?.height ?? n.height;
        const center = settings.rootPlacement !== "top-left";
        child.properties.Size = {
          type: "UDim2",
          value: [width / screen[0], 0, height / screen[1], 0],
        };
        child.properties.AnchorPoint = v(
          "Vector2",
          center ? 0.5 : 0,
          center ? 0.5 : 0,
        );
        child.properties.Position = {
          type: "UDim2",
          value: center
            ? [
                0.5 + ((bounds?.x ?? 0) + (width - n.width) / 2) / screen[0],
                0,
                0.5 + ((bounds?.y ?? 0) + (height - n.height) / 2) / screen[1],
                0,
              ]
            : [
                (bounds?.x ?? 0) / screen[0],
                0,
                (bounds?.y ?? 0) / screen[1],
                0,
              ],
        };
        // The selected interface is a measured viewport host. Internal Hug/Fill
        // semantics remain on its children, and explicit root overrides still
        // apply afterward. Do not let inherited Fill/Hug turn this host full-screen.
        child.layoutSizing = undefined;
        if (child.properties.AutomaticSize)
          child.properties.AutomaticSize = en("AutomaticSize", "None");
      }
      if (Math.abs(geometry(n.transform, n.width, n.height).rotation) > 0.001)
        issue(
          n,
          "root-orientation",
          "Selected roots use an upright local canvas. Nest this layer in a frame if you need to preserve its rotation.",
        );
      if (child?.assetRef && settings.layout === "responsive" && !screen)
        issue(
          n,
          "raster-root-layout",
          "This entire screen is rasterized and keeps its authored size. Use editable mode to enable a responsive root.",
        );
      return child
        ? ({
            id: `screen:${n.id}`,
            name: settings.rootName || n.name,
            className: "ScreenGui",
            referenceSize: screen
              ? [...screen]
              : [
                  Math.max(1, n.rasterBounds?.width ?? n.width),
                  Math.max(1, n.rasterBounds?.height ?? n.height),
                ],
            properties: {
              ResetOnSpawn: false,
              IgnoreGuiInset: settings.ignoreGuiInset,
              ZIndexBehavior: en("ZIndexBehavior", "Sibling"),
              DisplayOrder: 0,
              Enabled: true,
            },
            children: [child],
          } as RbxNode)
        : undefined;
    })
    .filter((x): x is RbxNode => !!x);
  // Deduplicate repeated font warnings across styled runs.
  const seenIssues = new Set<string>();
  const uniqueIssues = issues.filter((issue) => {
    const key = JSON.stringify([issue.nodeId, issue.code, issue.message]);
    if (seenIssues.has(key)) return false;
    seenIssues.add(key);
    return true;
  });
  const overridden = applyLayerOverrides(
    {
      format: "framebridge",
      version: 1,
      sourceId,
      name: settings.rootName || selected[0]?.name || "Figma UI",
      createdAt: now,
      options: {
        layout: settings.layout,
        appearance: settings.appearance,
        preserveText: settings.preserveText,
        imageScale: settings.imageScale,
        ...(settings.styleSizing === "scale"
          ? { styleSizing: "scale" as const }
          : {}),
      },
      roots,
      assets,
      issues: uniqueIssues,
      stats: { layers, native, raster, instances: flatten(roots).length },
    },
    settings.layerOverrides,
  );
  if (settings.styleSizing === "scale")
    calibrateLayoutStyles(overridden.roots, styleCalibrations);
  const result = applyBehaviors(overridden, designs, settings.layerOverrides);
  const themed = applyThemes(
    applyWorldSettings(
      applyScrollbarImages(result, scrollbars.accepted, originalSettings),
      settings.layerOverrides,
    ),
    settings,
  );
  for (const owner of flatten(themed.roots)) {
    if (!owner.textDecoration) continue;
    if (
      Number(owner.properties.BackgroundTransparency ?? 0) < 1 ||
      owner.theme?.base.BackgroundTransparency ||
      owner.theme?.hover?.BackgroundTransparency
    ) {
      themed.issues.push({
        nodeId: owner.id,
        nodeName: owner.name,
        severity: "warning",
        code: "live-text-shadow-background",
        message:
          "Live glyph shadows sit behind the editable text object. Its background can cover the shadow; use transparent text over a separate background frame to keep the glow visible. Native foreground, input and layout remain editable.",
      });
    }
    const shadow = owner.children.find(
      (child) => child.className === "UIShadow" && child.theme,
    );
    if (shadow) {
      // Keep the theme's editable parameters without drawing a rectangular text shadow.
      shadow.properties.Enabled = false;
      owner.textDecoration.themeShadow = shadow.id;
      delete owner.textDecoration.baseline;
    }
  }
  const expanded = expandLinearRepeats(themed, designs);
  try {
    validateTextDecorations(expanded.roots);
  } catch (error) {
    expanded.issues.push({
      nodeId: expanded.roots[0]?.id ?? "",
      nodeName: expanded.roots[0]?.name ?? "Selection",
      severity: "error",
      code: "live-text-decoration-budget",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return expanded;
}
