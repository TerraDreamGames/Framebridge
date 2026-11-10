import type { DesignNode, Transform } from "../../../packages/core/src/types";
import { relativeTo } from "../../../packages/core/src/geometry";
function copyPaints(
  value: readonly Paint[] | typeof figma.mixed,
): import("../../../packages/core/src/types").Paint[] {
  return value === figma.mixed ? [] : JSON.parse(JSON.stringify(value));
}
export function snapshot(node: SceneNode, depth = 0): DesignNode {
  if (depth > 100)
    throw new Error(
      "Layer nesting exceeds 100 levels. Simplify the selection before exporting.",
    );
  // Native property getters cross Figma's sandbox boundary. Read shared fields
  // once and derive both compiler data and render identity from the same values.
  const strokeWeight = "strokeWeight" in node ? node.strokeWeight : 0;
  const radius = "cornerRadius" in node ? node.cornerRadius : 0;
  const effects =
    "effects" in node ? node.effects.filter((e) => e.visible) : [];
  const n: DesignNode = {
    colorProfile: figma.root?.documentColorProfile,
    id: node.id,
    name: node.name,
    type: node.type,
    width: node.width,
    height: node.height,
    transform: node.relativeTransform.map((row) => [...row]) as Transform,
    visible: node.visible,
    opacity: "opacity" in node ? node.opacity : 1,
    fills: "fills" in node ? copyPaints(node.fills) : [],
    strokes: "strokes" in node ? copyPaints(node.strokes) : [],
    strokeWeight: typeof strokeWeight === "number" ? strokeWeight : 0,
    strokeAlign: "strokeAlign" in node ? node.strokeAlign : undefined,
    radius: typeof radius === "number" ? radius : 0,
    corners:
      "topLeftRadius" in node
        ? [
            node.topLeftRadius,
            node.topRightRadius,
            node.bottomRightRadius,
            node.bottomLeftRadius,
          ]
        : undefined,
    cornerSmoothing: "cornerSmoothing" in node ? node.cornerSmoothing : 0,
    clipsContent: "clipsContent" in node ? node.clipsContent : false,
    effects: effects.map((e) => e.type),
    effectSettings: effects.length ? JSON.stringify(effects) : undefined,
    shadows: effects
      .filter(
        (e): e is DropShadowEffect | InnerShadowEffect =>
          e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW",
      )
      .map((e) => ({
        type: e.type,
        radius: e.radius,
        spread: e.spread ?? 0,
        offset: { ...e.offset },
        color: { ...e.color },
        blendMode: e.blendMode,
      })),
    blendMode: "blendMode" in node ? node.blendMode : undefined,
    isMask: "isMask" in node && node.isMask,
    maskType: "maskType" in node ? node.maskType : undefined,
    transformModifiers:
      "transformModifiers" in node
        ? JSON.parse(JSON.stringify(node.transformModifiers))
        : undefined,
    unsupported:
      strokeWeight === figma.mixed ? ["independent stroke widths"] : [],
    constraints: "constraints" in node ? { ...node.constraints } : undefined,
    layoutSizing:
      "layoutSizingHorizontal" in node
        ? {
            horizontal: node.layoutSizingHorizontal,
            vertical: node.layoutSizingVertical,
          }
        : undefined,
    scrolling:
      "overflowDirection" in node && node.overflowDirection !== "NONE"
        ? node.overflowDirection
        : undefined,
    gridCell:
      "gridRowAnchorIndex" in node &&
      node.parent &&
      "layoutMode" in node.parent &&
      node.parent.layoutMode === "GRID"
        ? {
            row: node.gridRowAnchorIndex,
            column: node.gridColumnAnchorIndex,
            rowSpan: node.gridRowSpan,
            columnSpan: node.gridColumnSpan,
          }
        : undefined,
    grow: "layoutGrow" in node ? node.layoutGrow : 0,
    stretch: "layoutAlign" in node && node.layoutAlign === "STRETCH",
    absolute:
      "layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE",
    children:
      "children" in node
        ? node.children.map((child) => snapshot(child, depth + 1))
        : [],
  };
  if (node.type === "VECTOR") {
    const paths = node.vectorPaths,
      network = node.vectorNetwork;
    if (paths && network)
      n.vectorGeometry = JSON.stringify([
        paths,
        network,
        node.strokeCap,
        node.strokeJoin,
        node.dashPattern,
        node.handleMirroring,
      ]);
  }
  // Groups and boolean operations do not establish a Figma coordinate space:
  // their children report coordinates in the enclosing frame/page. Roblox Frames
  // do establish one. Rebase against the direct parent's absolute transform,
  // including nested/rotated groups and the first copy of a transform group.
  if (
    node.type === "GROUP" ||
    node.type === "BOOLEAN_OPERATION" ||
    node.type === "TRANSFORM_GROUP"
  ) {
    const basis = node.absoluteTransform as Transform;
    node.children.forEach((child, index) => {
      n.children[index].transform = relativeTo(
        basis,
        child.absoluteTransform as Transform,
      );
    });
  }
  if ("layoutMode" in node && node.layoutMode !== "NONE")
    n.layout = {
      mode: node.layoutMode,
      spacing: node.itemSpacing,
      padding: [
        node.paddingTop,
        node.paddingRight,
        node.paddingBottom,
        node.paddingLeft,
      ],
      primary: node.primaryAxisAlignItems,
      counter: node.counterAxisAlignItems,
      wrap: node.layoutWrap === "WRAP",
      sizingX: node.layoutSizingHorizontal,
      sizingY: node.layoutSizingVertical,
      counterSpacing: node.counterAxisSpacing ?? node.itemSpacing,
      grid:
        node.layoutMode === "GRID"
          ? {
              rows: node.gridRowCount,
              columns: node.gridColumnCount,
              rowGap: node.gridRowGap,
              columnGap: node.gridColumnGap,
              rowSizes: node.gridRowSizes.map((t) => ({
                type: t.type,
                value: t.value,
              })),
              columnSizes: node.gridColumnSizes.map((t) => ({
                type: t.type,
                value: t.value,
              })),
            }
          : undefined,
    };
  if (node.type === "TEXT") {
    const segments = node.getStyledTextSegments([
      "fontName",
      "fontSize",
      "fills",
      "textDecoration",
      "letterSpacing",
      "lineHeight",
      "textCase",
      "paragraphSpacing",
      "paragraphIndent",
      "listOptions",
    ]);
    const unsupported: string[] = [];
    const runPaints = segments.map((s) =>
      s.fills.filter((f) => f.visible !== false),
    );
    const firstPaint = runPaints[0]?.[0];
    if (
      runPaints.some(
        (fills) =>
          fills.length !== 1 ||
          !["SOLID", "GRADIENT_LINEAR"].includes(fills[0].type),
      ) ||
      (runPaints.some((fills) => fills[0]?.type === "GRADIENT_LINEAR") &&
        runPaints.some(
          (fills) => JSON.stringify(fills[0]) !== JSON.stringify(firstPaint),
        ))
    )
      unsupported.push("complex text paint");
    if (segments.some((s) => s.textCase !== "ORIGINAL"))
      unsupported.push("text case transform");
    if (segments.some((s) => s.letterSpacing.value !== 0))
      unsupported.push("letter spacing");
    if (
      segments.some(
        (s) =>
          s.paragraphSpacing !== 0 ||
          s.paragraphIndent !== 0 ||
          s.listOptions.type !== "NONE",
      )
    )
      unsupported.push("paragraph or list formatting");
    if (node.textTruncation === "ENDING") unsupported.push("text truncation");
    if (node.hasMissingFont) unsupported.push("missing source font");
    if (node.textAlignHorizontal === "JUSTIFIED")
      unsupported.push("justified text");
    n.text = {
      characters: node.characters,
      align: node.textAlignHorizontal,
      verticalAlign: node.textAlignVertical,
      autoResize: node.textAutoResize,
      unsupported,
      lineHeight:
        typeof node.lineHeight === "object" && node.lineHeight.unit !== "AUTO"
          ? node.lineHeight.unit === "PIXELS"
            ? node.lineHeight.value
            : ((segments[0]?.fontSize ?? 16) * node.lineHeight.value) / 100
          : undefined,
      letterSpacing:
        typeof node.letterSpacing === "object"
          ? node.letterSpacing.value
          : undefined,
      runs: segments.map((s) => {
        const fill = s.fills.find(
          (f) => f.visible !== false && f.type === "SOLID",
        ) as SolidPaint | undefined;
        return {
          text: s.characters,
          fontFamily: s.fontName.family,
          fontStyle: s.fontName.style,
          fontSize: s.fontSize,
          color: fill ? { ...fill.color, a: fill.opacity ?? 1 } : undefined,
          underline: s.textDecoration === "UNDERLINE",
          strike: s.textDecoration === "STRIKETHROUGH",
        };
      }),
    };
  }
  // Partial arcs cannot be represented by a circular UICorner.
  if (
    node.type === "ELLIPSE" &&
    (node.arcData.innerRadius > 0 ||
      Math.abs(node.arcData.endingAngle - node.arcData.startingAngle) <
        Math.PI * 2 - 0.001)
  )
    n.type = "ARC";
  return n;
}
