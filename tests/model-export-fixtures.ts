import { scrollbarResult } from "./scrollbar-fixtures";
import { motionExportPackage } from "./motion-fixtures";
import { compile } from "../packages/core/src/compiler";
import { node, demoDesign } from "../packages/core/src/demo";
import { PROPERTY_SCHEMAS } from "../packages/core/src/editor";
import { responsivePackages } from "./responsive-layout-fixtures";
import { viewportPackage } from "./viewport-fixtures";
import { imageToolsResult } from "./image-tools-fixtures";
import { imageScalingResult } from "./image-scaling-fixtures";
import type { TransferPackage, RbxNode } from "../packages/core/src/types";
import { behaviorPackage } from "./behavior-fixtures";
import { extractComponent } from "../packages/core/src/reusable-components";
import { componentResult, stateComponentResult } from "./components-fixtures";
import { repeatPackages } from "./repeat-fixtures";
import { maskPackages } from "./mask-fixtures";
import {
  maskResizePackage,
  automaticMaskPackages,
} from "./mask-resize-fixtures";
import { decorationPackage } from "./decoration-fixtures";
import { effectPackage } from "./effect-decoration-fixtures";
import { styleSizingPackages } from "./style-sizing-fixtures";
import { conditionalExamplePackage } from "../packages/core/src/conditional-examples";

export function modelPackages(): Record<string, TransferPackage> {
  const cases: Record<string, TransferPackage> = {
    conditionalRules: conditionalExamplePackage(),
    ...styleSizingPackages(),
    decoration: decorationPackage(),
    effects: effectPackage(),
    ...repeatPackages(),
    ...maskPackages(),
    maskResponsive: maskResizePackage(),
    maskResponsiveStretch: maskResizePackage("CENTER", "STRETCH"),
    ...automaticMaskPackages(),
    componentCard: extractComponent(componentResult(), "repeat:card-a").package,
    componentStates: extractComponent(
      stateComponentResult(true),
      "states:button-set",
    ).package,
    scrollbars: scrollbarResult(undefined, true).package,
    motion: motionExportPackage(),
    behaviors: behaviorPackage(),
    imageScaling: imageScalingResult().package,
    demo: compile(
      demoDesign(),
      "model-demo",
      { layout: "responsive" },
      "fixed",
    ),
    inset: compile(
      demoDesign(),
      "model-inset",
      { ignoreGuiInset: false },
      "fixed",
    ),
    viewport: viewportPackage(),
    ...responsivePackages(),
    preparedImage: imageToolsResult({ whiteMask: true, edgeCleanup: true })
      .package,
    styling: compile(
      [
        node("Styled panel", {
          id: "styled",
          radius: 4,
          corners: [4, 16, 8, 24],
          fills: [
            { type: "SOLID", color: { r: 0.2, g: 0.3, b: 0.5 } },
            { type: "SOLID", color: { r: 0.5, g: 0.2, b: 0.3 }, opacity: 0.5 },
          ],
          strokes: [
            { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
            { type: "SOLID", color: { r: 0, g: 1, b: 0 } },
          ],
          strokeWeight: 2,
          effects: ["DROP_SHADOW"],
          shadows: [
            {
              type: "DROP_SHADOW",
              radius: 12,
              spread: 3,
              offset: { x: 2, y: 5 },
              color: { r: 0.1, g: 0.1, b: 0.2, a: 0.6 },
              blendMode: "NORMAL",
            },
          ],
          children: [node("Close button", { id: "close", type: "VECTOR" })],
        }),
      ],
      "model-styling",
      { layout: "responsive" },
      "fixed",
    ),
  };
  const schema = compile(
    [node("All properties", { id: "properties" })],
    "model-properties",
    {},
    "fixed",
  );
  const children: RbxNode[] = [];
  for (const [className, properties] of Object.entries(PROPERTY_SCHEMAS)) {
    // World collectors require authored canvas/configuration; dedicated world fixtures cover them.
    if (className === "SurfaceGui" || className === "BillboardGui") continue;
    const base = {
      id: className,
      name: className,
      className,
      properties: Object.fromEntries(
        Object.entries(properties).map(([name, spec]) => [
          name,
          structuredClone(spec.default),
        ]),
      ),
      children: [] as RbxNode[],
    };
    if (className === "ScreenGui")
      Object.assign(schema.roots[0].properties, base.properties);
    else if (className.startsWith("UI"))
      children.push({
        id: `${className}-holder`,
        name: `${className} Holder`,
        className: "Frame",
        properties: {},
        children: [base],
      });
    else children.push(base);
  }
  children.push({
    id: "sequences",
    name: "Gradient",
    className: "UIGradient",
    properties: {
      Rotation: 23.5,
      Color: {
        type: "ColorSequence",
        value: [
          [0, 0.1, 0.2, 0.3],
          [0.4, 0.9, 0.7, 0.4],
          [1, 0.5, 0.6, 0.7],
        ],
      },
      Transparency: {
        type: "NumberSequence",
        value: [
          [0, 0.25],
          [0.6, 0.5],
          [1, 0.75],
        ],
      },
    },
    children: [],
  });
  // Exercise non-defaults, XML escaping, float text sizes, and native int coercion.
  const label = children.find((child) => child.className === "TextLabel")!;
  label.name = `Text & <"quoted"> '☃🙂'`;
  label.properties.Text = "  <b>Keep & escape</b>\r\nSecond\tline 🙂  ";
  label.properties.TextSize = 18.75;
  label.properties.FontFace = {
    type: "Font",
    family: "rbxasset://fonts/families/Roboto.json",
    weight: "Bold",
    style: "Italic",
  };
  label.properties.Position = { type: "UDim2", value: [0.1, 12.9, 0.3, -12.9] };
  label.properties.LayoutOrder = 7.9;
  schema.roots[0].children = children;
  cases.properties = schema;
  const enums = compile(
    [node("Enum choices", { id: "enum-choices" })],
    "model-enums",
    {},
    "fixed",
  );
  for (const [className, specs] of Object.entries(PROPERTY_SCHEMAS)) {
    if (className === "SurfaceGui" || className === "BillboardGui") continue;
    for (const [key, spec] of Object.entries(specs)) {
      if (spec.kind !== "Enum") continue;
      for (const choice of spec.choices!) {
        const id = `${className}/${key}/${choice}`;
        const instance: RbxNode = {
          id,
          name: id,
          className,
          properties: { [key]: { type: "Enum", value: [spec.enum!, choice] } },
          children: [],
        };
        if (className === "ScreenGui") enums.roots.push(instance);
        else
          enums.roots[0].children.push({
            id: `${id}/holder`,
            name: `${id} Holder`,
            className: "Frame",
            properties: {},
            children: [instance],
          });
      }
    }
  }
  cases.enums = enums;
  for (const pkg of Object.values(cases))
    for (const asset of pkg.assets) asset.robloxId = "rbxassetid://123456789";
  return cases;
}
