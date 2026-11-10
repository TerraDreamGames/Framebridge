import { describe, expect, it } from "vitest";
import {
  clipSelection,
  selectionQuad,
} from "../plugins/figma/src/preview-selection";

describe("preview selection geometry", () => {
  it("keeps a fractional layer aligned at low zoom", () => {
    const points = selectionQuad(
      { left: 12.5, top: 20.25, width: 25.125, height: 10.0625 },
      100.5,
      40.25,
      0,
    );
    expect(points).toEqual([
      { x: 12.5, y: 20.25 },
      { x: 37.625, y: 20.25 },
      { x: 37.625, y: 30.3125 },
      { x: 12.5, y: 30.3125 },
    ]);
  });
  it("follows rotated corners rather than the axis-aligned browser rectangle", () => {
    const points = selectionQuad(
      { left: 10, top: 20, width: 40, height: 100 },
      100,
      40,
      Math.PI / 2,
    );
    const expected = [
      { x: 50, y: 20 },
      { x: 50, y: 120 },
      { x: 10, y: 120 },
      { x: 10, y: 20 },
    ];
    points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i].x);
      expect(p.y).toBeCloseTo(expected[i].y);
    });
  });
  it("hides layers fully outside a scroller and retains the visible edge of partial layers", () => {
    const clip = selectionQuad(
      { left: 0, top: 0, width: 100, height: 100 },
      100,
      100,
      0,
    );
    const offscreen = selectionQuad(
      { left: 10, top: 120, width: 30, height: 30 },
      30,
      30,
      0,
    );
    expect(clipSelection(offscreen, clip)).toEqual([]);
    const partial = selectionQuad(
      { left: 80, top: 80, width: 30, height: 30 },
      30,
      30,
      0,
    );
    const visible = clipSelection(partial, clip);
    expect(visible).toHaveLength(4);
    expect(visible).toEqual(expect.arrayContaining([
      { x: 100, y: 100 }, { x: 80, y: 100 },
      { x: 80, y: 80 }, { x: 100, y: 80 },
    ]));
  });
  it("rejects zero-sized elements", () => {
    expect(
      selectionQuad({ left: 0, top: 0, width: 0, height: 0 }, 0, 0, 0),
    ).toEqual([]);
  });
});
