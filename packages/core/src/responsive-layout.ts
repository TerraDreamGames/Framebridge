import type { DesignNode, ExportOptions, RbxNode, Value } from "./types";
import { geometry, round } from "./geometry";
import { styleUDim } from "./style-sizing";
import { layerBehavior } from "./behaviors";
import { hasSpatialMotion } from "./motion";
import { hasKeyframeSpatial } from "./keyframes";
import { measureLayout } from "./measured-layout";

const dim = (...value: number[]): Value => ({
  type: "UDim2",
  value: value.map(round),
});
const en = (family: string, name: string): Value => ({
  type: "Enum",
  value: [family, name],
});
const add = (
  owner: RbxNode,
  suffix: string,
  className: string,
  properties: Record<string, Value>,
) => {
  const child: RbxNode = {
    id: `${owner.id}/${suffix}`,
    name: className,
    className,
    properties,
    children: [],
  };
  owner.children.push(child);
  return child;
};
const close = (a: number, b: number) => Math.abs(a - b) < 0.5;
export type StyleCalibration = {
  padding: RbxNode;
  update: (
    owner: RbxNode,
    size: readonly number[],
    parentSize: readonly number[],
  ) => void;
};
const numbers = (value: Value | undefined): number[] =>
  value && typeof value === "object" && "value" in value
    ? (value.value as number[])
    : [];
const enumAxis = (value: Value | undefined) =>
  value && typeof value === "object" && value.type === "Enum"
    ? value.value[1]
    : "None";
const includesAxis = (value: string, axis: number) =>
  value === "XY" || value === (axis === 0 ? "X" : "Y");

/** Resolve generated ratios after overrides and helper parenting, before runtime/source emission. */
export function calibrateLayoutStyles(
  roots: RbxNode[],
  calibrations: StyleCalibration[],
) {
  const pending = new Map(calibrations.map((entry) => [entry.padding, entry]));
  function visit(
    owner: RbxNode,
    parentSize: readonly number[],
    parentLayout = false,
    parentStyleSize = parentSize,
    parentCanvasSize = parentSize,
  ) {
    const size = numbers(owner.properties.Size);
    const automatic = enumAxis(owner.properties.AutomaticSize);
    const viewport = [0, 1].map((axis) => {
      const measured =
        (size[axis * 2] ?? 0) * parentSize[axis] + (size[axis * 2 + 1] ?? 0);
      const reference = owner.referenceSize?.[axis];
      return owner.className === "ScreenGui" ||
        parentLayout ||
        includesAxis(automatic, axis) ||
        !size.length ||
        measured <= 0
        ? (owner.referenceSize?.[axis] ?? parentSize[axis])
        : reference !== undefined && Math.abs(reference - measured) < 0.005
          ? reference
          : measured;
    });
    const padding = owner.children.find(
      (child) => child.className === "UIPadding",
    );
    if (padding) pending.get(padding)?.update(owner, viewport, parentStyleSize);
    const canvas = numbers(owner.properties.CanvasSize);
    const content = viewport.map((dimension, axis) =>
      owner.className === "ScrollingFrame"
        ? Math.max(
            dimension,
            (canvas[axis * 2] ?? 0) * parentCanvasSize[axis] +
              (canvas[axis * 2 + 1] ?? 0),
          )
        : dimension,
    );
    const styleContent = viewport.map((dimension, axis) =>
      owner.className === "ScrollingFrame"
        ? Math.max(
            dimension,
            (canvas[axis * 2] ?? 0) * parentStyleSize[axis] +
              (canvas[axis * 2 + 1] ?? 0),
          )
        : dimension,
    );
    const edge = (key: string, axis: number) => {
      const value = numbers(padding?.properties[key]);
      return (value[0] ?? 0) * styleContent[axis] + (value[1] ?? 0);
    };
    const padded = [
      Math.max(
        0,
        styleContent[0] - edge("PaddingLeft", 0) - edge("PaddingRight", 0),
      ),
      Math.max(
        0,
        styleContent[1] - edge("PaddingTop", 1) - edge("PaddingBottom", 1),
      ),
    ];
    const canvasPadded = [
      Math.max(
        0,
        content[0] - edge("PaddingLeft", 0) - edge("PaddingRight", 0),
      ),
      Math.max(
        0,
        content[1] - edge("PaddingTop", 1) - edge("PaddingBottom", 1),
      ),
    ];
    const layout = owner.children.some((child) =>
      ["UIListLayout", "UIGridLayout"].includes(child.className),
    );
    for (const child of owner.children)
      if (!child.className.startsWith("UI"))
        visit(
          child,
          padded,
          layout,
          owner.className === "ScrollingFrame" ? viewport : padded,
          canvasPadded,
        );
  }
  for (const root of roots) visit(root, root.referenceSize ?? [1, 1]);
}
type Sizing = "FIXED" | "HUG" | "FILL";
function sizing(n: DesignNode): [Sizing, Sizing] {
  const axis = (value: string | undefined): Sizing =>
    value === "HUG" || value === "FILL" ? value : "FIXED";
  return [
    axis(n.layoutSizing?.horizontal ?? n.layout?.sizingX),
    axis(n.layoutSizing?.vertical ?? n.layout?.sizingY),
  ];
}
function autoSize(node: RbxNode, x: boolean, y: boolean) {
  node.properties.AutomaticSize = en(
    "AutomaticSize",
    x && y ? "XY" : x ? "X" : y ? "Y" : "None",
  );
  const size = node.properties.Size as { type: "UDim2"; value: number[] };
  if (x) {
    size.value[0] = 0;
    size.value[1] = 0;
  }
  if (y) {
    size.value[2] = 0;
    size.value[3] = 0;
  }
}
export function applyContentSizing(n: DesignNode, result: RbxNode) {
  const [x, y] = sizing(n);
  result.referenceSize = [Math.max(1, n.width), Math.max(1, n.height)];
  if (x !== "FIXED" || y !== "FIXED") {
    result.layoutSizing = [x, y];
  }
  if (x === "HUG" || y === "HUG") autoSize(result, x === "HUG", y === "HUG");
}

function uniform(children: DesignNode[]) {
  return (
    children.length > 0 &&
    children.every(
      (c) =>
        close(c.width, children[0].width) &&
        close(c.height, children[0].height),
    )
  );
}
function sourceSlot(
  source: DesignNode,
  output: RbxNode,
  settings: ExportOptions,
): RbxNode {
  const g = geometry(source.transform, source.width, source.height);
  if (!source.rasterBounds && Math.abs(g.rotation) < 0.001) return output;
  const behavior = layerBehavior(source, settings.layerOverrides[source.id]);
  // Spatial animation reserves the authored layout box in prepareMotionSlots.
  // A second rotation box would change the recording parent and resolve fill
  // sizes against the rotated bounds instead of the real layout container.
  if (
    !source.rasterBounds &&
    (hasSpatialMotion(behavior?.motion) ||
      hasKeyframeSpatial(behavior?.keyframes) ||
      behavior?.keyframes?.recording)
  )
    return output;
  const t = source.transform;
  const points = [
    [0, 0],
    [source.width, 0],
    [0, source.height],
    [source.width, source.height],
  ].map(([x, y]) => [
    t[0][0] * x + t[0][1] * y + t[0][2],
    t[1][0] * x + t[1][1] * y + t[1][2],
  ]);
  const minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1]));
  const w = Math.max(...points.map((p) => p[0])) - minX,
    h = Math.max(...points.map((p) => p[1])) - minY;
  const slot: RbxNode = {
    id: `${output.id}/slot`,
    name: `${output.name} Slot`,
    className: "Frame",
    properties: {
      Size: dim(0, w, 0, h),
      Position: dim(0, 0, 0, 0),
      BackgroundTransparency: 1,
      BorderSizePixel: 0,
      LayoutOrder: output.properties.LayoutOrder,
      ZIndex: output.properties.ZIndex,
    },
    children: [output],
    referenceSize: [Math.max(1, w), Math.max(1, h)],
    layoutSizing: ["FIXED", "FIXED"],
  };
  output.properties.Position = dim(
    0,
    (source.rasterBounds?.x ?? g.x) - minX,
    0,
    (source.rasterBounds?.y ?? g.y) - minY,
  );
  return slot;
}

/** Native layouts own their children. Unsupported cases keep measured geometry with a reason. */
export function applyResponsiveLayout(
  n: DesignNode,
  result: RbxNode,
  settings: ExportOptions,
  note: (code: string, message: string) => void,
  parentSize: readonly [number, number] = [n.width, n.height],
  calibrations: StyleCalibration[] = [],
) {
  if (settings.layout !== "responsive") return;
  const edit = settings.layerOverrides[n.id];
  if (
    edit?.components?.layout !== undefined ||
    edit?.components?.grid !== undefined
  )
    return;
  let l = n.layout;
  let inferredGrid = false;
  const sourceById = new Map(n.children.map((c) => [c.id, c]));
  let flow = result.children.filter(
    (c) => sourceById.has(c.id) && !sourceById.get(c.id)!.absolute,
  );
  let sources = flow.map((c) => sourceById.get(c.id)!);
  if (
    (!l || l.mode === "NONE") &&
    ["Frame", "CanvasGroup", "ScrollingFrame"].includes(result.className) &&
    !n.children.some(
      (c) => (settings.includeHidden || c.visible) && c.absolute,
    ) &&
    sources.every(
      (c) => !c.grow && !c.stretch && sizing(c).every((s) => s === "FIXED"),
    )
  ) {
    const measured = measureLayout(n, sources);
    const grid = measured.grid;
    const line = measured.vertical ?? measured.horizontal;
    const ordered = grid?.sorted ?? line?.sorted;
    // Negative leading insets cannot be represented by native UIPadding.
    if (
      ordered &&
      ordered.every((c) => c.transform[0][2] >= 0 && c.transform[1][2] >= 0)
    ) {
      const bounds = ordered.reduce(
        (b, c) => [
          Math.min(b[0], c.transform[0][2]),
          Math.min(b[1], c.transform[1][2]),
          Math.max(b[2], c.transform[0][2] + c.width),
          Math.max(b[3], c.transform[1][2] + c.height),
        ],
        [Infinity, Infinity, -Infinity, -Infinity],
      );
      l = {
        mode: grid ? "GRID" : measured.vertical ? "VERTICAL" : "HORIZONTAL",
        spacing: grid?.gapX ?? line!.spacing,
        counterSpacing: grid?.gapY,
        padding: [
          bounds[1],
          Math.max(0, n.width - bounds[2]),
          Math.max(0, n.height - bounds[3]),
          bounds[0],
        ],
        primary: "MIN",
        counter: grid ? "MIN" : line!.alignment,
        wrap: false,
        ...(grid
          ? {
              grid: {
                rows: grid.rows,
                columns: grid.columns,
                rowGap: grid.gapY,
                columnGap: grid.gapX,
                rowSizes: [],
                columnSizes: [],
              },
            }
          : {}),
      };
      inferredGrid = !!grid;
      const order = new Map(ordered.map((c, i) => [c.id, i]));
      for (const output of flow)
        output.properties.LayoutOrder = order.get(output.id)!;
      note(
        grid ? "grid-detected" : "list-detected",
        grid
          ? "Detected equal-size items in regular rows and columns and created an editable UIGridLayout with their measured gaps and padding."
          : "Detected aligned items with consistent spacing and created an editable UIListLayout with their measured order, gap and padding.",
      );
    }
  }
  if (!l || l.mode === "NONE" || !sources.length) return;
  if (
    !["HORIZONTAL", "VERTICAL", "GRID"].includes(l.mode) ||
    l.spacing < 0 ||
    (l.counterSpacing ?? l.spacing) < 0 ||
    (l.grid?.rowGap ?? 0) < 0 ||
    (l.grid?.columnGap ?? 0) < 0 ||
    l.counter === "BASELINE"
  ) {
    note(
      "layout-frozen",
      "This layout uses overlap, baseline alignment or an unsupported layout mode. Its measured positions are preserved.",
    );
    return;
  }
  if (l.mode === "GRID" && !l.grid) {
    note(
      "layout-frozen",
      "Grid track information is missing. Reanalyze the design to convert this grid.",
    );
    return;
  }
  const horizontal = l.mode !== "VERTICAL",
    [top, right, bottom, left] = l.padding;
  const [sx, sy] = sizing(n);
  const hasAbsolute = result.children.some(
    (c) => sourceById.get(c.id)?.absolute,
  );
  let owner = result;
  let overlay: RbxNode | undefined;
  if (hasAbsolute) {
    owner = add(result, "flow", "Frame", {
      Size: dim(sx === "HUG" ? 0 : 1, 0, sy === "HUG" ? 0 : 1, 0),
      Position: dim(0, 0, 0, 0),
      BackgroundTransparency: 1,
      BorderSizePixel: 0,
      ZIndex: 1,
    });
    owner.name = "Flow";
    owner.referenceSize = [Math.max(1, n.width), Math.max(1, n.height)];
    owner.layoutSizing = [sx, sy];
    if (sx === "HUG" || sy === "HUG")
      autoSize(owner, sx === "HUG", sy === "HUG");
    if (result.className === "ScrollingFrame") {
      const canvas = result.properties.AutomaticCanvasSize;
      const axis =
        canvas && typeof canvas === "object" && canvas.type === "Enum"
          ? canvas.value[1]
          : "None";
      autoSize(
        owner,
        sx === "HUG" || axis === "X" || axis === "XY",
        sy === "HUG" || axis === "Y" || axis === "XY",
      );
    }
    result.children = result.children.filter((c) => !flow.includes(c));
    owner.children.push(...flow);
    const absolute = result.children.filter(
      (c) => sourceById.get(c.id)?.absolute,
    );
    // A non-scrolling viewport is a native measurement boundary: AutomaticSize
    // measures the viewport, not its overflowing descendants. With clipping
    // disabled it still draws and receives input outside its bounds.
    overlay = add(result, "absolute", "ScrollingFrame", {
      Size: dim(1, 0, 1, 0),
      Position: dim(0, 0, 0, 0),
      BackgroundTransparency: 1,
      BorderSizePixel: 0,
      ZIndex: 1,
      ScrollingEnabled: false,
      ScrollBarThickness: 0,
      CanvasSize: dim(0, 0, 0, 0),
      ClipsDescendants: false,
    });
    overlay.name = "Absolute";
    overlay.referenceSize = result.referenceSize;
    overlay.layoutSizing = [
      sx === "HUG" ? "HUG" : "FILL",
      sy === "HUG" ? "HUG" : "FILL",
    ];
    overlay.children.push(...absolute);
    result.children = result.children.filter((c) => !absolute.includes(c));
    note(
      "absolute-layout",
      "Absolute-positioned layers stay outside Flow so they keep their authored placement while other content reflows.",
    );
  }
  const unequalRowGap =
    l.wrap && !close(l.counterSpacing ?? l.spacing, l.spacing);
  const fixedCells = sources.every(
    (c) => !c.grow && !c.stretch && sizing(c).every((s) => s === "FIXED"),
  );
  const useGrid =
    l.mode === "GRID" ||
    (l.wrap && fixedCells && uniform(sources) && l.primary !== "SPACE_BETWEEN");
  if (unequalRowGap && !useGrid) {
    // Roblox's native flex layout has one gap. Preserve source spacing rather than silently changing it.
    if (hasAbsolute) {
      result.children = result.children.filter(
        (c) => c !== owner && c !== overlay,
      );
      result.children.push(...flow, ...(overlay?.children ?? []));
    }
    note(
      "layout-frozen",
      "Variable-size wrapped entries use different row and column gaps. Roblox flex has one gap; use a uniform grid or equal gaps for native reflow.",
    );
    return;
  }
  const scaledStyles = settings.styleSizing === "scale";
  const enumName = (value: Value | undefined) =>
    value && typeof value === "object" && value.type === "Enum"
      ? value.value[1]
      : "None";
  const hasAxis = (value: string, axis: number) =>
    value === "XY" || value === (axis === 0 ? "X" : "Y");
  const effective =
    owner === result
      ? { ...owner.properties, ...edit?.properties }
      : owner.properties;
  const automatic = enumName(effective.AutomaticSize);
  const canvasAxis =
    owner.className === "ScrollingFrame"
      ? enumName(effective.AutomaticCanvasSize)
      : "None";
  const canvas = effective.CanvasSize;
  const canvasValues =
    canvas && typeof canvas === "object" && canvas.type === "UDim2"
      ? canvas.value
      : [0, 0, 0, 0];
  const authored = [n.width, n.height];
  const canvasBounds = authored.map((size, axis) =>
    owner.className === "ScrollingFrame"
      ? Math.max(
          size,
          canvasValues[axis * 2] * parentSize[axis] +
            canvasValues[axis * 2 + 1],
        )
      : size,
  );
  const hugAxes = [
    sx === "HUG" || hasAxis(automatic, 0),
    sy === "HUG" || hasAxis(automatic, 1),
  ];
  if (
    owner === result &&
    result.children.some(
      (c) => c.id.startsWith(n.id + "/fill:") || c.decorationRect,
    )
  )
    authored.forEach((_, axis) => {
      if (hasAxis(canvasAxis, axis)) hugAxes[axis] = true;
    });
  const paddingScale = authored.map(
    (_, axis) => scaledStyles && !hugAxes[axis] && !hasAxis(canvasAxis, axis),
  );
  // Native gap scales use the viewport on automatic canvas axes, otherwise the padded canvas.
  const gapBounds = canvasBounds.map((size, axis) =>
    hasAxis(canvasAxis, axis)
      ? authored[axis]
      : Math.max(1, size - (axis === 0 ? left + right : top + bottom)),
  );
  const gap = (pixels: number, axis: number) =>
    styleUDim(pixels, gapBounds[axis], scaledStyles && !hugAxes[axis]);
  if (
    scaledStyles &&
    ((left + right > 0 && !paddingScale[0]) ||
      (top + bottom > 0 && !paddingScale[1]) ||
      (l.spacing > 0 && hugAxes[horizontal ? 0 : 1]))
  )
    note(
      "fixed-style-spacing",
      "Padding on content-sized or automatic scrolling axes stays in pixels, and content-sized gaps stay fixed, so content can grow without changing its own spacing.",
    );
  let layoutNode: RbxNode;
  let flexCell: ((gaps: number[], insets: number[]) => number[]) | undefined;
  if (useGrid) {
    const grid = l.grid;
    const equalTracks = (tracks: { type: string; value?: number }[]) =>
      tracks.length === 0 ||
      tracks.every(
        (t) =>
          t.type === tracks[0].type &&
          close(t.value ?? 1, tracks[0].value ?? 1),
      );
    if (
      !uniform(sources) ||
      !equalTracks(grid?.columnSizes ?? []) ||
      !equalTracks(grid?.rowSizes ?? []) ||
      grid?.columnSizes.some((t) => t.type === "HUG") ||
      grid?.rowSizes.some((t) => t.type === "HUG") ||
      (grid &&
        sources.some((c) => c.gridCell) &&
        !sources
          .map(
            (c) =>
              (c.gridCell?.row ?? 0) * grid.columns + (c.gridCell?.column ?? 0),
          )
          .sort((a, b) => a - b)
          .every((index, i) => index === i)) ||
      sources.some(
        (c) =>
          (c.gridCell?.rowSpan ?? 1) > 1 || (c.gridCell?.columnSpan ?? 1) > 1,
      )
    ) {
      if (hasAbsolute) {
        result.children = result.children.filter(
          (c) => c !== owner && c !== overlay,
        );
        result.children.push(...flow, ...(overlay?.children ?? []));
      }
      note(
        "layout-frozen",
        "This grid uses unequal or content-sized tracks, empty cells, or spanning entries. Its measured geometry stays editable; uniform fixed/flex tracks and consecutive one-cell entries convert to UIGridLayout.",
      );
      return;
    }
    const cols = Math.max(
      1,
      grid?.columns ??
        Math.floor(
          (n.width - left - right + l.spacing) / (sources[0].width + l.spacing),
        ),
    );
    const rows = Math.max(1, grid?.rows ?? Math.ceil(sources.length / cols));
    const gx =
        grid?.columnGap ??
        (horizontal ? l.spacing : (l.counterSpacing ?? l.spacing)),
      gy =
        grid?.rowGap ??
        (horizontal ? (l.counterSpacing ?? l.spacing) : l.spacing);
    const col = grid?.columnSizes[0],
      row = grid?.rowSizes[0];
    const cellW =
      col?.type === "FIXED"
        ? (col.value ?? sources[0].width)
        : sources[0].width;
    const cellH =
      row?.type === "FIXED"
        ? (row.value ?? sources[0].height)
        : sources[0].height;
    const xScale = col?.type === "FLEX" ? 1 / cols : 0,
      yScale = row?.type === "FLEX" ? 1 / rows : 0;
    const gapX = gap(gx, 0).value,
      gapY = gap(gy, 1).value;
    // Automatic canvas axes use the viewport for scaled cells, without subtracting padding.
    const cellInset = [left + right, top + bottom].map((padding, axis) =>
      scaledStyles && hasAxis(canvasAxis, axis) ? padding : 0,
    );
    const cell = [
      xScale ? xScale - ((cols - 1) * gapX[0]) / cols : 0,
      xScale ? (-cellInset[0] - (cols - 1) * gapX[1]) / cols : cellW,
      yScale ? yScale - ((rows - 1) * gapY[0]) / rows : 0,
      yScale ? (-cellInset[1] - (rows - 1) * gapY[1]) / rows : cellH,
    ];
    if (scaledStyles) {
      for (const axis of [1, 3]) {
        if (cell[axis] < 0 && !Number.isInteger(cell[axis])) {
          cell[axis] = Math.floor(cell[axis]);
          note(
            "grid-style-rounding",
            "Native grid offsets use whole pixels. Flexible cells round down so their columns fit; a small remainder may stay at the trailing edge.",
          );
        }
      }
    }
    const gridNode = add(owner, "grid", "UIGridLayout", {
      CellSize: scaledStyles ? { type: "UDim2", value: cell } : dim(...cell),
      CellPadding: { type: "UDim2", value: [...gapX, ...gapY] },
      FillDirection: en(
        "FillDirection",
        horizontal ? "Horizontal" : "Vertical",
      ),
      FillDirectionMaxCells: grid && !inferredGrid ? cols : 0,
      StartCorner: en("StartCorner", "TopLeft"),
      SortOrder: en("SortOrder", "LayoutOrder"),
      HorizontalAlignment: en(
        "HorizontalAlignment",
        l.primary === "CENTER"
          ? "Center"
          : l.primary === "MAX"
            ? "Right"
            : "Left",
      ),
      VerticalAlignment: en(
        "VerticalAlignment",
        l.counter === "CENTER"
          ? "Center"
          : l.counter === "MAX"
            ? "Bottom"
            : "Top",
      ),
    });
    layoutNode = gridNode;
    flexCell = (gaps, insets) => [
      xScale ? xScale - ((cols - 1) * gaps[0]) / cols : 0,
      xScale ? Math.floor((-insets[0] - (cols - 1) * gaps[1]) / cols) : cellW,
      yScale ? yScale - ((rows - 1) * gaps[2]) / rows : 0,
      yScale ? Math.floor((-insets[1] - (rows - 1) * gaps[3]) / rows) : cellH,
    ];
    gridNode.layoutSizing = [
      xScale ? "FILL" : "FIXED",
      yScale ? "FILL" : "FIXED",
    ];
    if (sx === "HUG") {
      const v = owner.properties.Size as { value: number[] };
      v.value[1] = cols * cellW + (cols - 1) * gx + left + right;
    }
    for (const output of flow) {
      const source = sourceById.get(output.id)!;
      if (source.gridCell)
        output.properties.LayoutOrder =
          source.gridCell.row * cols + source.gridCell.column;
    }
  } else {
    const alignX: Record<string, string> = {
      MIN: "Left",
      CENTER: "Center",
      MAX: "Right",
    };
    const alignY: Record<string, string> = {
      MIN: "Top",
      CENTER: "Center",
      MAX: "Bottom",
    };
    const primaryFill = sources.some(
      (c) => c.grow || sizing(c)[horizontal ? 0 : 1] === "FILL",
    );
    layoutNode = add(owner, "layout", "UIListLayout", {
      FillDirection: en(
        "FillDirection",
        horizontal ? "Horizontal" : "Vertical",
      ),
      SortOrder: en("SortOrder", "LayoutOrder"),
      Padding: gap(l.spacing, horizontal ? 0 : 1),
      Wraps: l.wrap,
      HorizontalAlignment: en(
        "HorizontalAlignment",
        alignX[horizontal ? l.primary : l.counter] ?? "Left",
      ),
      VerticalAlignment: en(
        "VerticalAlignment",
        alignY[horizontal ? l.counter : l.primary] ?? "Top",
      ),
      ItemLineAlignment: en(
        "ItemLineAlignment",
        l.counter === "CENTER"
          ? "Center"
          : l.counter === "MAX"
            ? "End"
            : "Start",
      ),
      [horizontal ? "HorizontalFlex" : "VerticalFlex"]: en(
        "UIFlexAlignment",
        primaryFill
          ? "Fill"
          : l.primary === "SPACE_BETWEEN"
            ? "SpaceBetween"
            : "None",
      ),
    });
  }
  const paddingNode = add(owner, "padding", "UIPadding", {
    PaddingTop: styleUDim(top, canvasBounds[1], paddingScale[1]),
    PaddingRight: styleUDim(right, canvasBounds[0], paddingScale[0]),
    PaddingBottom: styleUDim(bottom, canvasBounds[1], paddingScale[1]),
    PaddingLeft: styleUDim(left, canvasBounds[0], paddingScale[0]),
  });
  if (scaledStyles) {
    const initialPadding = { ...paddingNode.properties };
    const gapKey = useGrid ? "CellPadding" : "Padding";
    const initialGap = layoutNode.properties[gapKey];
    const initialCell = layoutNode.properties.CellSize;
    const initialGaps = numbers(initialGap);
    const gapPixels = useGrid
      ? [
          initialGaps[0] * gapBounds[0] + initialGaps[1],
          initialGaps[2] * gapBounds[1] + initialGaps[3],
        ]
      : [l.spacing];
    calibrations.push({
      padding: paddingNode,
      update(actualOwner, viewport, actualParent) {
        if (!actualOwner.children.includes(layoutNode)) return;
        const dimensions = numbers(actualOwner.properties.CanvasSize);
        const bounds = viewport.map((dimension, axis) =>
          actualOwner.className === "ScrollingFrame"
            ? Math.max(
                dimension,
                (dimensions[axis * 2] ?? 0) * actualParent[axis] +
                  (dimensions[axis * 2 + 1] ?? 0),
              )
            : dimension,
        );
        for (const [key, pixels, axis] of [
          ["PaddingLeft", left, 0],
          ["PaddingRight", right, 0],
          ["PaddingTop", top, 1],
          ["PaddingBottom", bottom, 1],
        ] as const) {
          if (paddingNode.properties[key] === initialPadding[key])
            paddingNode.properties[key] = styleUDim(
              pixels,
              bounds[axis],
              paddingScale[axis],
            );
        }
        const pads = [0, 0];
        for (const [key, axis] of [
          ["PaddingLeft", 0],
          ["PaddingRight", 0],
          ["PaddingTop", 1],
          ["PaddingBottom", 1],
        ] as const) {
          const value = numbers(paddingNode.properties[key]);
          pads[axis] += (value[0] ?? 0) * bounds[axis] + (value[1] ?? 0);
        }
        const automaticCanvas =
          actualOwner.className === "ScrollingFrame"
            ? enumAxis(actualOwner.properties.AutomaticCanvasSize)
            : "None";
        const gaps = bounds.map((dimension, axis) =>
          includesAxis(automaticCanvas, axis)
            ? viewport[axis]
            : Math.max(1, dimension - pads[axis]),
        );
        if (layoutNode.properties[gapKey] === initialGap) {
          layoutNode.properties[gapKey] = useGrid
            ? {
                type: "UDim2",
                value: gapPixels.flatMap(
                  (pixels, axis) =>
                    styleUDim(pixels, gaps[axis], !hugAxes[axis]).value,
                ),
              }
            : styleUDim(
                l!.spacing,
                gaps[horizontal ? 0 : 1],
                !hugAxes[horizontal ? 0 : 1],
              );
        }
        if (flexCell && layoutNode.properties.CellSize === initialCell) {
          const insets = pads.map((padding, axis) =>
            includesAxis(automaticCanvas, axis) ? padding : 0,
          );
          layoutNode.properties.CellSize = {
            type: "UDim2",
            value: flexCell(numbers(layoutNode.properties[gapKey]), insets),
          };
        }
      },
    });
  }
  if (
    scaledStyles &&
    owner.className === "ScrollingFrame" &&
    owner.children.some((c) => {
      const gaps =
        c.className === "UIListLayout"
          ? c.properties.Padding
          : c.className === "UIGridLayout"
            ? c.properties.CellPadding
            : undefined;
      if (!gaps || typeof gaps !== "object" || !("value" in gaps)) return false;
      const values = gaps.value as number[];
      return c.className === "UIListLayout"
        ? hasAxis(canvasAxis, horizontal ? 0 : 1) && values[0] > 0
        : (hasAxis(canvasAxis, 0) && values[0] > 0) ||
            (hasAxis(canvasAxis, 1) && values[2] > 0);
    })
  )
    owner.layoutCanvas = true;
  const anyPrimaryFill = sources.some(
    (c) => c.grow || sizing(c)[horizontal ? 0 : 1] === "FILL",
  );
  for (const output of flow) {
    const source = sourceById.get(output.id)!;
    const target = sourceSlot(source, output, settings);
    if (target !== output) {
      const index = owner.children.indexOf(output);
      owner.children[index] = target;
    }
    const [x, y] = sizing(source);
    target.layoutSizing = [
      target.assetRef && x === "HUG" ? "FIXED" : x,
      target.assetRef && y === "HUG" ? "FIXED" : y,
    ];
    if (target === output)
      target.referenceSize = [
        Math.max(1, source.width),
        Math.max(1, source.height),
      ];
    target.properties.Position = dim(0, 0, 0, 0);
    if (target === output) {
      target.properties.Size = dim(0, source.width, 0, source.height);
      if (!target.assetRef && (x === "HUG" || y === "HUG"))
        autoSize(target, x === "HUG", y === "HUG");
    }
    if (!useGrid) {
      const primaryFill = !!source.grow || (horizontal ? x : y) === "FILL";
      const crossFill = !!source.stretch || (horizontal ? y : x) === "FILL";
      if (primaryFill || crossFill || anyPrimaryFill) {
        const values = (target.properties.Size as { value: number[] }).value;
        if (primaryFill) {
          values[horizontal ? 0 : 2] = 0;
          values[horizontal ? 1 : 3] = 0;
        }
        if (crossFill && !l.wrap) {
          values[horizontal ? 2 : 0] = 1;
          values[horizontal ? 3 : 1] = 0;
        }
        add(target, "flex", "UIFlexItem", {
          FlexMode: en("UIFlexMode", primaryFill ? "Custom" : "None"),
          GrowRatio: primaryFill ? source.grow || 1 : 0,
          ShrinkRatio: 0,
          ItemLineAlignment: en(
            "ItemLineAlignment",
            crossFill ? "Stretch" : "Automatic",
          ),
        });
      }
    }
  }
}
