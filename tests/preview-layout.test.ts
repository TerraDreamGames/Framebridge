import { expect, it } from "vitest";
import { flatten } from "../packages/core/src/types";
import { responsivePackages } from "./responsive-layout-fixtures";
import { previewFlow, previewSize } from "../plugins/figma/src/preview-layout";
const panel = (name: string) =>
  flatten(responsivePackages()[name].roots).find((n) => n.id === "panel")!;
it("previews weighted Fill without enlarging fixed items", () => {
  const row = previewFlow(panel("flex"), 300, 60);
  expect(row.boxes.get("fixed")?.w).toBe(40);
  expect(row.boxes.get("grow1")?.w).toBeCloseTo(220 / 3);
  expect(row.boxes.get("grow2")?.w).toBeCloseTo(440 / 3);
});
it("previews wrap using the available space and the row height", () => {
  const wide = previewFlow(panel("variable"), 300, 150),
    narrow = previewFlow(panel("variable"), 230, 150);
  expect(wide.boxes.get("third")?.y).toBe(wide.boxes.get("first")?.y);
  expect(narrow.boxes.get("third")!.y).toBeGreaterThan(
    narrow.boxes.get("first")!.y,
  );
  const grid = previewFlow(panel("wrap"), 160, 150);
  expect(grid.boxes.get("cell4")!.y - grid.boxes.get("cell0")!.y).toBe(84);
});
it("previews grid proportions after subtracting padding and fixed gaps", () => {
  const grid = previewFlow(panel("grid"), 450, 200);
  expect(grid.boxes.get("cell0")!.w).toBeCloseTo(410 / 3, 1);
  expect(grid.boxes.get("cell3")!.y - grid.boxes.get("cell0")!.y).toBe(58);
});
it("uses authored Hug measurements for the browser approximation", () => {
  expect(previewSize(panel("hug"), 400, 400)).toEqual([128, 66]);
});
