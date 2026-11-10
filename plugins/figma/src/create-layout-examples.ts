import { layoutExamples } from "../../../packages/core/src/layout-examples";
import {
  advancedControlDesign,
  advancedControlOverrides,
} from "../../../packages/core/src/advanced-control-examples";
import { cloneSettings } from "../../../packages/core/src/clone-settings";
import { remapControl } from "../../../packages/core/src/advanced-controls";
import {
  DEFAULT_OPTIONS,
  type DesignNode,
  type ExportOptions,
  type LayerOverride,
  type Paint as SourcePaint,
} from "../../../packages/core/src/types";
import {
  artworkExamples,
  ARTWORK_IMAGE,
  ARTWORK_VECTOR_PATH,
} from "./artwork-examples";

/** Real native artwork exercises classification, decoration extraction and PNG preparation. */
export async function createArtworkExamples(
  current: ExportOptions = DEFAULT_OPTIONS,
) {
  const image = figma.createImage(figma.base64Decode(ARTWORK_IMAGE));
  return createEditableExamples(
    current,
    artworkExamples(image.hash, current),
    "Framebridge · Artwork examples",
    (source, native) => {
      if (native.type === "VECTOR")
        native.vectorPaths = [
          { windingRule: "NONZERO", data: ARTWORK_VECTOR_PATH },
        ];
    },
  );
}

function nativePaint(paint: SourcePaint): Paint {
  const common = {
    visible: paint.visible ?? true,
    opacity: paint.opacity ?? 1,
    blendMode: (paint.blendMode ?? "NORMAL") as BlendMode,
  };
  if (paint.type === "SOLID" && paint.color)
    return {
      ...common,
      type: "SOLID",
      color: { r: paint.color.r, g: paint.color.g, b: paint.color.b },
      opacity: paint.opacity ?? paint.color.a ?? 1,
    };
  if (paint.type === "IMAGE")
    return {
      ...common,
      type: "IMAGE",
      imageHash: paint.imageHash ?? null,
      scaleMode: "FILL",
    };
  if (paint.type.startsWith("GRADIENT_"))
    return {
      ...common,
      type: paint.type as GradientPaint["type"],
      gradientTransform: paint.gradientTransform ?? [
        [1, 0, 0],
        [0, 1, 0],
      ],
      gradientStops: (paint.gradientStops ?? []).map((stop) => ({
        position: stop.position,
        color: { ...stop.color, a: stop.color.a ?? 1 },
      })),
    };
  throw new Error(`Unsupported example paint: ${paint.type}`);
}

/** Create editable examples without replacing existing content or requiring more pages. */
export async function createLayoutExamples(
  current: ExportOptions = DEFAULT_OPTIONS,
) {
  return createEditableExamples(
    current,
    layoutExamples(),
    "Framebridge · Layout examples",
  );
}

/** A native source scene with inspectable, editable control artwork and references. */
export async function createControlExamples(
  current: ExportOptions = DEFAULT_OPTIONS,
) {
  const designs = advancedControlDesign();
  const names: Record<string, string> = {
    "advanced-screen": "Advanced controls",
    progress: "Health progress",
    "progress-fill": "Health fill",
    slider: "Volume slider",
    "slider-fill": "Slider fill",
    "slider-thumb": "Slider thumb",
    toggle: "Toggle",
    cooldown: "Cooldown",
    "cooldown-fill": "Cooldown fill",
    tip: "Tooltip button",
    tooltip: "Tooltip",
    window: "Draggable window",
    "window-handle": "Drag handle",
    tabs: "Tabs",
    "panel-one": "First panel",
    "panel-two": "Second panel",
    "tab-one": "First tab",
    "tab-two": "Second tab",
    "skill-one": "Base skill",
    "skill-two": "Dependent skill",
    roulette: "Roulette",
    coins: "Live coins",
  };
  const style = (nodes: DesignNode[]) => {
    for (const n of nodes) {
      n.name = names[n.id] ?? n.name;
      if (["progress-fill", "slider-fill", "cooldown-fill"].includes(n.id))
        n.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.65, b: 0.95 } }];
      if (n.id === "slider-thumb")
        n.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      style(n.children);
    }
  };
  style(designs);
  return createEditableExamples(
    current,
    [
      {
        designs,
        options: { ...current, layerOverrides: advancedControlOverrides },
      },
    ],
    "Framebridge · Control examples",
  );
}

async function createEditableExamples(
  current: ExportOptions,
  examples: { designs: DesignNode[]; options: ExportOptions }[],
  title: string,
  configure?: (
    source: DesignNode,
    native: FrameNode | TextNode | RectangleNode | EllipseNode | VectorNode,
  ) => void,
) {
  await figma.loadFontAsync({ family: "Roboto", style: "Regular" });
  const idMap = new Map<string, string>();
  const createdNodeIds: string[] = [];
  const createdNodes: SceneNode[] = [];
  const previousPage = figma.currentPage;
  const previousSelection = [...previousPage.selection];
  const previousOverrides = figma.root.getPluginData(
    "framebridge-layer-overrides",
  );
  let page: PageNode | undefined;
  let section: SectionNode | undefined;
  try {
    try {
      page = figma.createPage();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/\bStarter plan only comes with \d+ pages\b/i.test(message))
        throw error;
      const right = Math.max(
        0,
        ...previousPage.children.map((n) => n.x + n.width),
      );
      section = figma.createSection();
      section.name = title;
      section.x = right + 160;
      section.y = 160;
      createdNodeIds.push(section.id);
    }
    if (page) {
      page.name = title;
      createdNodeIds.push(page.id);
      await figma.setCurrentPageAsync(page);
    }
    const container = page ?? section!;
    function create(source: DesignNode): SceneNode {
      const native = source.text
        ? figma.createText()
        : source.type === "RECTANGLE"
          ? figma.createRectangle()
          : source.type === "ELLIPSE"
            ? figma.createEllipse()
            : source.type === "VECTOR"
              ? figma.createVector()
              : figma.createFrame();
      createdNodes.push(native);
      createdNodeIds.push(native.id);
      idMap.set(source.id, native.id);
      native.name = source.name;
      native.fills = source.fills.map(nativePaint);
      native.opacity = source.opacity;
      native.visible = source.visible;
      if ("strokes" in native) {
        native.strokes = source.strokes.map(nativePaint);
        native.strokeWeight = source.strokeWeight;
        native.strokeAlign = (source.strokeAlign ?? "INSIDE") as
          "INSIDE" | "OUTSIDE" | "CENTER";
      }
      if ("effects" in native)
        native.effects = (source.shadows ?? []).map((shadow) => ({
          ...shadow,
          visible: true,
          blendMode: (shadow.blendMode ?? "NORMAL") as BlendMode,
          color: { ...shadow.color, a: shadow.color.a ?? 1 },
        }));
      if ("isMask" in native) {
        native.isMask = source.isMask ?? false;
        native.maskType = source.maskType ?? "ALPHA";
      }
      configure?.(source, native);
      if (native.type === "TEXT") {
        native.fontName = { family: "Roboto", style: "Regular" };
        native.fontSize = source.text!.runs[0].fontSize;
        native.characters = source.text!.characters;
        native.textAutoResize = "NONE";
        native.textAlignVertical = "CENTER";
        native.textAlignHorizontal = source.text!
          .align as TextNode["textAlignHorizontal"];
        const color = source.text!.runs[0].color;
        if (color)
          native.fills = [
            {
              type: "SOLID",
              color: { r: color.r, g: color.g, b: color.b },
              opacity: color.a ?? 1,
            },
          ];
      } else if (native.type === "FRAME" || native.type === "RECTANGLE") {
        native.cornerRadius = source.radius;
        if (source.corners)
          [
            native.topLeftRadius,
            native.topRightRadius,
            native.bottomRightRadius,
            native.bottomLeftRadius,
          ] = source.corners;
        if (native.type === "FRAME")
          native.clipsContent = source.clipsContent ?? false;
      }
      native.resize(source.width, source.height);
      native.x = source.transform[0][2];
      native.y = source.transform[1][2];
      if (native.type === "FRAME") {
        for (const child of source.children) native.appendChild(create(child));
        if (source.layout) {
          const layout = source.layout;
          native.layoutMode = layout.mode as "VERTICAL" | "HORIZONTAL";
          native.primaryAxisSizingMode = "FIXED";
          native.counterAxisSizingMode = "FIXED";
          native.itemSpacing = layout.spacing;
          [
            native.paddingTop,
            native.paddingRight,
            native.paddingBottom,
            native.paddingLeft,
          ] = layout.padding;
          native.primaryAxisAlignItems = "MIN";
          native.counterAxisAlignItems = "MIN";
        }
      }
      return native;
    }
    const columnWidth =
      Math.max(...examples.map((e) => e.designs[0].width)) + 80;
    const rowHeight =
      Math.max(...examples.map((e) => e.designs[0].height)) + 80;
    const roots = examples.map((example, index) => {
      const root = create(example.designs[0]);
      container.appendChild(root);
      root.x = 160 + (index % 2) * columnWidth;
      root.y = 160 + Math.floor(index / 2) * rowHeight;
      return root;
    });
    if (section)
      section.resizeWithoutConstraints(
        Math.max(...roots.map((n) => n.x + n.width)) + 160,
        Math.max(...roots.map((n) => n.y + n.height)) + 160,
      );
    const layerOverrides: Record<string, LayerOverride> = {
      ...current.layerOverrides,
    };
    for (const example of examples)
      for (const [id, override] of Object.entries(
        example.options.layerOverrides,
      )) {
        const mapped = cloneSettings(override);
        const resolve = (id: string) => idMap.get(id) ?? id;
        if (mapped.behavior) {
          if (mapped.behavior.control)
            mapped.behavior.control = remapControl(
              mapped.behavior.control,
              resolve,
            );
          if (mapped.behavior.action?.target)
            mapped.behavior.action.target = resolve(
              mapped.behavior.action.target,
            );
        }
        layerOverrides[resolve(id)] = mapped;
      }
    const options: ExportOptions = {
      ...current,
      layout: "responsive",
      rootName: "",
      layerOverrides,
    };
    figma.root.setPluginData(
      "framebridge-layer-overrides",
      JSON.stringify(layerOverrides),
    );
    figma.currentPage.selection = roots;
    figma.viewport.scrollAndZoomIntoView(roots);
    figma.commitUndo();
    return {
      options,
      createdNodeIds,
      roots: roots.map((n) => n.id),
      placement: page ? "page" : "section",
      containerId: container.id,
    };
  } catch (error) {
    figma.root.setPluginData("framebridge-layer-overrides", previousOverrides);
    for (const node of createdNodes.reverse()) if (!node.removed) node.remove();
    if (section && !section.removed) section.remove();
    await figma.setCurrentPageAsync(previousPage);
    previousPage.selection = previousSelection;
    if (page && !page.removed) page.remove();
    throw error;
  }
}
