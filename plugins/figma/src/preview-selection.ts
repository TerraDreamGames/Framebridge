export type SelectionPoint = { x: number; y: number };
export type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Recover the rotated rectangle from its browser bounds without rounding authored sizes. */
export function selectionQuad(
  rect: SelectionRect,
  width: number,
  height: number,
  angle: number,
): SelectionPoint[] {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const projectedWidth = Math.abs(width * cos) + Math.abs(height * sin);
  const projectedHeight = Math.abs(width * sin) + Math.abs(height * cos);
  const divisor = projectedWidth ** 2 + projectedHeight ** 2;
  if (!divisor || width <= 0 || height <= 0) return [];
  const scale =
    (rect.width * projectedWidth + rect.height * projectedHeight) / divisor;
  const points = [
    { x: 0, y: 0 },
    { x: width * scale * cos, y: width * scale * sin },
    {
      x: scale * (width * cos - height * sin),
      y: scale * (width * sin + height * cos),
    },
    { x: -height * scale * sin, y: height * scale * cos },
  ];
  const x = rect.left - Math.min(...points.map((p) => p.x));
  const y = rect.top - Math.min(...points.map((p) => p.y));
  return points.map((p) => ({ x: p.x + x, y: p.y + y }));
}

/** Convex clipping keeps selection labels attached to the visible part of a scrolled layer. */
export function clipSelection(
  points: SelectionPoint[],
  clip: SelectionPoint[],
) {
  let result = points;
  for (let i = 0; i < clip.length && result.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length];
    const side = (p: SelectionPoint) =>
      (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const output: SelectionPoint[] = [];
    for (let j = 0; j < result.length; j++) {
      const p = result[j],
        q = result[(j + 1) % result.length];
      const sp = side(p),
        sq = side(q);
      if (sp >= 0) output.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        output.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
    result = output;
  }
  return result;
}
