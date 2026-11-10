import { compile } from "../packages/core/src/compiler";
import { maskDesign } from "./mask-fixtures";
export const maskConstraintModes = [
  "MIN",
  "MAX",
  "CENTER",
  "SCALE",
  "STRETCH",
] as const;
export function maskResizeDesign(
  maskMode = "MAX",
  contentMode = "SCALE",
  masked = true,
) {
  const design = maskDesign();
  const group = design.children[0],
    mask = group.children[1],
    content = group.children[2];
  group.constraints = { horizontal: "SCALE", vertical: "SCALE" };
  mask.constraints = { horizontal: maskMode, vertical: maskMode };
  content.constraints = { horizontal: contentMode, vertical: contentMode };
  content.width = 100;
  content.height = 70;
  content.transform = [
    [1, 0, 44],
    [0, 1, 35],
  ];
  if (!masked) mask.visible = false;
  return design;
}
export function maskResizePackage(
  maskMode = "MAX",
  contentMode = "SCALE",
  masked = true,
) {
  return compile(
    [maskResizeDesign(maskMode, contentMode, masked)],
    `mask-resize-${maskMode}-${contentMode}`,
    { layout: "responsive" },
    "fixed",
  );
}
export function maskResizePairs() {
  return maskConstraintModes.flatMap((mask) =>
    maskConstraintModes.map((content) => ({
      name: `${mask}/${content}`,
      masked: maskResizePackage(mask, content),
      original: maskResizePackage(mask, content, false),
    })),
  );
}
export function automaticMaskPackages() {
  return Object.fromEntries(
    (["X", "Y", "XY"] as const).map((axis) => {
      const design = maskResizeDesign();
      design.children[0].scrolling =
        axis === "X" ? "HORIZONTAL" : axis === "Y" ? "VERTICAL" : "BOTH";
      return [
        `maskAutomatic${axis}`,
        compile(
          [design],
          `mask-automatic-${axis}`,
          { layout: "responsive" },
          "fixed",
        ),
      ];
    }),
  );
}
