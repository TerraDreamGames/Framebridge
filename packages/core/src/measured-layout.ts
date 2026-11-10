import type { DesignNode } from "./types";

export const axisAligned = (node: DesignNode) =>
  Math.abs(node.transform[0][1]) < 0.001 &&
  Math.abs(node.transform[1][0]) < 0.001 &&
  Math.abs(node.transform[0][0] - 1) < 0.001 &&
  Math.abs(node.transform[1][1] - 1) < 0.001;
const close = (a: number, b: number) => Math.abs(a - b) < 0.5;

/** Shared evidence for automatic conversion and the structure review. Never changes the source. */
export function measureLayout(
  source: DesignNode,
  nodes = source.children.filter((child) => child.visible),
) {
  const measurable =
    nodes.length >= 3 &&
    nodes.every(
      (n) =>
        !n.absolute &&
        axisAligned(n) &&
        [n.width, n.height, n.transform[0][2], n.transform[1][2]].every(
          Number.isFinite,
        ) &&
        n.width > 0 &&
        n.height > 0,
    );
  const line = (axis: 0 | 1) => {
    if (!measurable) return;
    const sorted = [...nodes].sort(
      (a, b) => a.transform[axis][2] - b.transform[axis][2],
    );
    const size = (n: DesignNode) => (axis === 0 ? n.width : n.height);
    const crossSize = (n: DesignNode) => (axis === 0 ? n.height : n.width);
    const gaps = sorted
      .slice(1)
      .map(
        (n, i) =>
          n.transform[axis][2] - sorted[i].transform[axis][2] - size(sorted[i]),
      );
    const alignment = ([0, 0.5, 1] as const).find((factor) =>
      sorted.every((n) =>
        close(
          n.transform[1 - axis][2] + crossSize(n) * factor,
          sorted[0].transform[1 - axis][2] + crossSize(sorted[0]) * factor,
        ),
      ),
    );
    return alignment !== undefined &&
      gaps.every((gap) => gap >= 0 && close(gap, gaps[0]))
      ? {
          sorted,
          spacing: gaps[0],
          alignment:
            alignment === 0 ? "MIN" : alignment === 0.5 ? "CENTER" : "MAX",
        }
      : undefined;
  };
  let grid:
    | {
        sorted: DesignNode[];
        width: number;
        height: number;
        gapX: number;
        gapY: number;
        columns: number;
        rows: number;
      }
    | undefined;
  if (
    measurable &&
    nodes.length >= 4 &&
    nodes.every(
      (n) => close(n.width, nodes[0].width) && close(n.height, nodes[0].height),
    )
  ) {
    const positions = (axis: 0 | 1) => {
      const values: number[] = [];
      for (const value of nodes
        .map((n) => n.transform[axis][2])
        .sort((a, b) => a - b))
        if (!values.length || !close(value, values[values.length - 1]))
          values.push(value);
      return values;
    };
    const xs = positions(0),
      ys = positions(1);
    const dx = xs[1] - xs[0],
      dy = ys[1] - ys[0];
    const width = nodes[0].width,
      height = nodes[0].height;
    const index = (n: DesignNode) =>
      Math.round((n.transform[1][2] - ys[0]) / dy) * xs.length +
      Math.round((n.transform[0][2] - xs[0]) / dx);
    const sorted = [...nodes].sort((a, b) => index(a) - index(b));
    if (
      xs.length >= 2 &&
      ys.length >= 2 &&
      dx >= width &&
      dy >= height &&
      xs.every((x, i) => close(x, xs[0] + i * dx)) &&
      ys.every((y, i) => close(y, ys[0] + i * dy)) &&
      // Native grids pack entries. Duplicate cells and holes would move artwork.
      sorted.every((n, i) => index(n) === i)
    )
      grid = {
        sorted,
        width,
        height,
        gapX: dx - width,
        gapY: dy - height,
        columns: xs.length,
        rows: ys.length,
      };
  }
  return { nodes, vertical: line(1), horizontal: line(0), grid };
}
