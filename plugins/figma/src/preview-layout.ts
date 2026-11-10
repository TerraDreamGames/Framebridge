import type { RbxNode, Value } from "../../../packages/core/src/types";
const values = (v: Value | undefined): number[] =>
  v && typeof v === "object" && "value" in v ? (v.value as number[]) : [];
const name = (v: Value | undefined, fallback: string) =>
  v && typeof v === "object" && v.type === "Enum" ? v.value[1] : fallback;
function canvasBasis(
  node: RbxNode,
  width: number,
  height: number,
  parentWidth = width,
  parentHeight = height,
): [number, number] {
  if (node.className !== "ScrollingFrame") return [width, height];
  const canvas = values(node.properties.CanvasSize);
  return [
    Math.max(width, (canvas[0] ?? 0) * parentWidth + (canvas[1] ?? 0)),
    Math.max(height, (canvas[2] ?? 0) * parentHeight + (canvas[3] ?? 0)),
  ];
}
export function previewSize(
  node: RbxNode,
  width: number,
  height: number,
): [number, number] {
  const dim = values(node.properties.Size),
    axis = name(node.properties.AutomaticSize, "None");
  return [
    axis === "X" || axis === "XY"
      ? (node.referenceSize?.[0] ?? 100)
      : (dim[0] ?? 0) * width + (dim[1] ?? 100),
    axis === "Y" || axis === "XY"
      ? (node.referenceSize?.[1] ?? 100)
      : (dim[2] ?? 0) * height + (dim[3] ?? 100),
  ];
}
/** Native constraints cap the layout's box before applying its aspect ratio. */
export function previewConstrainedSize(
  node: RbxNode,
  width: number,
  height: number,
  forced?: { w?: number; h?: number },
) {
  const raw = previewSize(node, width, height);
  const limit = node.children.find(
    (child) => child.className === "UISizeConstraint",
  );
  const min = values(limit?.properties.MinSize),
    max = values(limit?.properties.MaxSize);
  let w = Math.max(
    min[0] ?? 0,
    Math.min(max[0] ?? Infinity, forced?.w ?? raw[0]),
  );
  let h = Math.max(
    min[1] ?? 0,
    Math.min(max[1] ?? Infinity, forced?.h ?? raw[1]),
  );
  let aspectControlledAxis: 0 | 1 | undefined;
  const aspect = node.children.find(
    (child) => child.className === "UIAspectRatioConstraint",
  );
  if (aspect) {
    const ratio = Number(aspect.properties.AspectRatio) || 1;
    const withParent =
      name(aspect.properties.AspectType, "FitWithinMaxSize") ===
      "ScaleWithParentSize";
    const fromWidth = withParent
      ? name(aspect.properties.DominantAxis, "Width") === "Width"
      : w <= h * ratio;
    if (fromWidth) h = w / ratio;
    else w = h * ratio;
    aspectControlledAxis = fromWidth ? 1 : 0;
    if (withParent) {
      const factor = Math.min(
        1,
        Math.min(width, max[0] ?? Infinity) / Math.max(w, 1e-12),
        Math.min(height, max[1] ?? Infinity) / Math.max(h, 1e-12),
      );
      w *= Math.max(0, factor);
      h *= Math.max(0, factor);
    }
  }
  return { size: [w, h] as [number, number], aspectControlledAxis };
}
export type PreviewBox = { x: number; y: number; w: number; h: number };
/** Native automatic canvases include layout padding beyond the last item. */
export function previewScrollSize(
  node: RbxNode,
  width: number,
  height: number,
  boxes: Map<string, PreviewBox>,
  parentWidth = width,
  parentHeight = height,
): [number, number] {
  const canvas = values(node.properties.CanvasSize);
  const automatic = name(node.properties.AutomaticCanvasSize, "None");
  const padding = node.children.find(
    (child) => child.className === "UIPadding",
  );
  const right = values(padding?.properties.PaddingRight);
  const bottom = values(padding?.properties.PaddingBottom);
  const [canvasWidth, canvasHeight] = canvasBasis(
    node,
    width,
    height,
    parentWidth,
    parentHeight,
  );
  let x = (canvas[0] ?? 0) * parentWidth + (canvas[1] ?? 0);
  let y = (canvas[2] ?? 0) * parentHeight + (canvas[3] ?? 0);
  const entries = [...boxes.values()];
  if (automatic === "X" || automatic === "XY")
    x = Math.max(
      x,
      Math.max(0, ...entries.map((box) => box.x + box.w)) +
        (right[0] ?? 0) * canvasWidth +
        (right[1] ?? 0),
    );
  if (automatic === "Y" || automatic === "XY")
    y = Math.max(
      y,
      Math.max(0, ...entries.map((box) => box.y + box.h)) +
        (bottom[0] ?? 0) * canvasHeight +
        (bottom[1] ?? 0),
    );
  return [Math.max(width, x), Math.max(height, y)];
}
/** Approximate native flow for the review preview; Studio remains the final renderer. */
export function previewFlow(
  node: RbxNode,
  width: number,
  height: number,
  parentWidth = width,
  parentHeight = height,
  styleParentWidth = parentWidth,
  styleParentHeight = parentHeight,
) {
  const layout = node.children.find(
    (n) => n.className === "UIListLayout" || n.className === "UIGridLayout",
  );
  const padding = node.children.find((n) => n.className === "UIPadding");
  const [canvasWidth, canvasHeight] = canvasBasis(
    node,
    width,
    height,
    styleParentWidth,
    styleParentHeight,
  );
  const px = (key: string, base: number) => {
    const v = values(padding?.properties[key]);
    return (v[0] ?? 0) * base + (v[1] ?? 0);
  };
  const left = px("PaddingLeft", canvasWidth),
    top = px("PaddingTop", canvasHeight),
    iw = Math.max(0, canvasWidth - left - px("PaddingRight", canvasWidth)),
    ih = Math.max(0, canvasHeight - top - px("PaddingBottom", canvasHeight));
  const automatic = name(node.properties.AutomaticCanvasSize, "None");
  const gapWidth = automatic === "X" || automatic === "XY" ? width : iw;
  const gapHeight = automatic === "Y" || automatic === "XY" ? height : ih;
  const children = node.children
    .filter((n) => !n.className.startsWith("UI"))
    .sort((a, b) =>
      layout
        ? Number(a.properties.LayoutOrder ?? 0) -
          Number(b.properties.LayoutOrder ?? 0)
        : 0,
    );
  const boxes = new Map<string, PreviewBox>();
  const align = (mode: string, remaining: number) =>
    mode === "Center"
      ? remaining / 2
      : ["Right", "Bottom", "End"].includes(mode)
        ? remaining
        : 0;
  if (!layout) {
    for (const child of children) {
      const p = values(child.properties.Position),
        [w, h] = previewSize(child, iw, ih);
      boxes.set(child.id, {
        x: left + (p[0] ?? 0) * iw + (p[1] ?? 0),
        y: top + (p[2] ?? 0) * ih + (p[3] ?? 0),
        w,
        h,
      });
    }
    return {
      children,
      boxes,
      width: iw,
      height: ih,
      left,
      top,
      ownsPosition: false,
    };
  }
  const horizontal =
    name(layout.properties.FillDirection, "Vertical") === "Horizontal";
  if (layout.className === "UIGridLayout") {
    const c = values(layout.properties.CellSize),
      g = values(layout.properties.CellPadding);
    const cw = (c[0] ?? 0) * gapWidth + (c[1] ?? 80),
      ch = (c[2] ?? 0) * gapHeight + (c[3] ?? 80),
      gx = (g[0] ?? 0) * gapWidth + (g[1] ?? 8),
      gy = (g[2] ?? 0) * gapHeight + (g[3] ?? 8);
    const fit = Math.max(
      1,
      Math.floor(
        ((horizontal ? iw : ih) + (horizontal ? gx : gy)) /
          Math.max(1, horizontal ? cw + gx : ch + gy),
      ),
    );
    const cap = Number(layout.properties.FillDirectionMaxCells) || fit,
      count = Math.min(cap, fit),
      rows = Math.ceil(children.length / count);
    const nx = horizontal ? Math.min(count, children.length) : rows,
      ny = horizontal ? rows : Math.min(count, children.length);
    const ax = align(
        name(layout.properties.HorizontalAlignment, "Left"),
        iw - nx * cw - Math.max(0, nx - 1) * gx,
      ),
      ay = align(
        name(layout.properties.VerticalAlignment, "Top"),
        ih - ny * ch - Math.max(0, ny - 1) * gy,
      );
    children.forEach((child, i) =>
      boxes.set(child.id, {
        x:
          left +
          ax +
          (horizontal ? i % count : Math.floor(i / count)) * (cw + gx),
        y:
          top +
          ay +
          (horizontal ? Math.floor(i / count) : i % count) * (ch + gy),
        w: cw,
        h: ch,
      }),
    );
  } else {
    const major = horizontal ? iw : ih,
      cross = horizontal ? ih : iw,
      g = values(layout.properties.Padding),
      gap = (g[0] ?? 0) * (horizontal ? gapWidth : gapHeight) + (g[1] ?? 0);
    const wrap = layout.properties.Wraps === true,
      flex = name(
        layout.properties[horizontal ? "HorizontalFlex" : "VerticalFlex"],
        "None",
      );
    const entries = children.map((child) => {
      const [w, h] = previewSize(child, iw, ih),
        item = child.children.find((n) => n.className === "UIFlexItem"),
        mode = name(
          item?.properties.FlexMode,
          item ? "None" : flex === "Fill" ? "Fill" : "None",
        );
      return {
        child,
        w,
        h,
        base: horizontal ? w : h,
        cross: horizontal ? h : w,
        grow: ["Grow", "Fill", "Custom"].includes(mode)
          ? Number(item?.properties.GrowRatio ?? 1)
          : 0,
        item,
      };
    });
    const lines: (typeof entries)[] = [];
    let line: typeof entries = [],
      used = 0;
    for (const entry of entries) {
      if (wrap && line.length && used + gap + entry.base > major) {
        lines.push(line);
        line = [];
        used = 0;
      }
      used += (line.length ? gap : 0) + entry.base;
      line.push(entry);
    }
    if (line.length) lines.push(line);
    const extents = lines.map((items) =>
      wrap ? Math.max(0, ...items.map((e) => e.cross)) : cross,
    );
    const crossTotal =
      extents.reduce((a, b) => a + b, 0) + Math.max(0, lines.length - 1) * gap;
    let crossOffset = align(
      name(
        layout.properties[
          horizontal ? "VerticalAlignment" : "HorizontalAlignment"
        ],
        horizontal ? "Top" : "Left",
      ),
      cross - crossTotal,
    );
    lines.forEach((items, index) => {
      const remaining =
          major -
          items.reduce((sum, e) => sum + e.base, 0) -
          Math.max(0, items.length - 1) * gap,
        totalGrow = items.reduce((sum, e) => sum + e.grow, 0);
      let between = gap,
        offset = 0;
      if (!totalGrow) {
        if (flex === "SpaceBetween" && items.length > 1)
          between += remaining / (items.length - 1);
        else if (flex === "SpaceAround") {
          between += remaining / items.length;
          offset = remaining / items.length / 2;
        } else if (flex === "SpaceEvenly") {
          between += remaining / (items.length + 1);
          offset = remaining / (items.length + 1);
        } else
          offset = align(
            name(
              layout.properties[
                horizontal ? "HorizontalAlignment" : "VerticalAlignment"
              ],
              horizontal ? "Left" : "Top",
            ),
            remaining,
          );
      }
      for (const entry of items) {
        const majorSize =
            entry.base +
            (totalGrow ? (Math.max(0, remaining) * entry.grow) / totalGrow : 0),
          crossMode = name(
            entry.item?.properties.ItemLineAlignment,
            name(layout.properties.ItemLineAlignment, "Start"),
          );
        const crossSize =
          crossMode === "Stretch" ? extents[index] : entry.cross;
        const shift = align(crossMode, extents[index] - crossSize);
        boxes.set(entry.child.id, {
          x: left + (horizontal ? offset : crossOffset + shift),
          y: top + (horizontal ? crossOffset + shift : offset),
          w: horizontal ? majorSize : crossSize,
          h: horizontal ? crossSize : majorSize,
        });
        offset += majorSize + between;
      }
      crossOffset += extents[index] + gap;
    });
  }
  return {
    children,
    boxes,
    width: iw,
    height: ih,
    left,
    top,
    ownsPosition: true,
  };
}
