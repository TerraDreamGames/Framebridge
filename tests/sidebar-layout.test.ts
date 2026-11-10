import { describe, expect, it } from "vitest";
import {
  PREVIEW_MIN_WIDTH,
  SIDEBAR_DIVIDER_WIDTH,
  fitSidebarLayout,
  readSidebarLayout,
  sidebarRange,
} from "../plugins/figma/src/sidebar-layout";

describe("sidebar layout", () => {
  it("keeps room for the preview when wide saved panels open in a small plugin", () => {
    const preferred = { layers: 480, properties: 700 };
    for (const width of [600, 700, 900, 1360, 1800]) {
      const layout = fitSidebarLayout(preferred, width);
      expect(layout.layers).toBeGreaterThanOrEqual(160);
      expect(layout.properties).toBeGreaterThanOrEqual(260);
      expect(
        width - layout.layers - layout.properties - SIDEBAR_DIVIDER_WIDTH * 2,
      ).toBeGreaterThanOrEqual(PREVIEW_MIN_WIDTH);
    }
    expect(preferred).toEqual({ layers: 480, properties: 700 });
    expect(fitSidebarLayout(preferred, 1800)).toEqual(preferred);
  });

  it("limits each sidebar independently without moving the opposite panel", () => {
    const original = fitSidebarLayout({ layers: 260, properties: 420 }, 1000);
    for (const side of ["layers", "properties"] as const) {
      const opposite = side === "layers" ? "properties" : "layers";
      const { min, max } = sidebarRange(side, original, 1000);
      for (const value of [min, max]) {
        const next = fitSidebarLayout({ ...original, [side]: value }, 1000);
        expect(next[side]).toBe(value);
        expect(next[opposite]).toBe(original[opposite]);
      }
    }
  });

  it("sanitizes device preferences and rejects malformed widths", () => {
    expect(
      readSidebarLayout({ layers: -1, properties: 9000, unrelated: 5 }),
    ).toEqual({ layers: 160, properties: 700 });
    expect(readSidebarLayout({ layers: 250.6 })).toEqual({ layers: 251 });
    expect(readSidebarLayout({})).toEqual({});
    for (const value of [
      null,
      [],
      "wide",
      { layers: NaN },
      { properties: Infinity },
      { layers: "250" },
    ])
      expect(readSidebarLayout(value)).toBeUndefined();
  });

  it("never overflows even in a browser smaller than the plugin's minimum", () => {
    for (const width of [0, 8, 200, 400, 580]) {
      const layout = fitSidebarLayout({ layers: 480, properties: 700 }, width);
      expect(layout.layers).toBeGreaterThanOrEqual(0);
      expect(layout.properties).toBeGreaterThanOrEqual(0);
      expect(layout.layers + layout.properties).toBeLessThanOrEqual(
        Math.max(0, width - SIDEBAR_DIVIDER_WIDTH * 2),
      );
    }
  });
});
