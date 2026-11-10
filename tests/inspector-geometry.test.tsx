import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node as designNode } from "../packages/core/src/demo";
import {
  flatten,
  type LayerOverride,
  type RbxNode,
  type Value,
} from "../packages/core/src/types";
import { validProperty } from "../packages/core/src/editor";
import { DEFAULT_FIGMA_OPTIONS } from "../plugins/figma/src/design-screen";
import {
  anchoredProperties,
  convertedSize,
  geometryNumbers,
  inferredSizeUnit,
  inspectorGeometry,
  sizePixels,
} from "../plugins/figma/src/inspector-geometry";
import { createOverrideHistory } from "../plugins/figma/src/override-history";
import { previewConstrainedSize } from "../plugins/figma/src/preview-layout";

const dim = (...value: number[]): Value => ({ type: "UDim2", value });
const vec = (...value: number[]): Value => ({ type: "Vector2", value });
const en = (family: string, value: string): Value => ({
  type: "Enum",
  value: [family, value],
});
const frame = (
  id: string,
  properties: Record<string, Value> = {},
  children: RbxNode[] = [],
): RbxNode => ({
  id,
  name: id,
  className: "Frame",
  properties: {
    Size: dim(0, 200, 0, 100),
    Position: dim(0.5, 0, 0.5, 0),
    AnchorPoint: vec(0.5, 0.5),
    ...properties,
  },
  children,
});
const screen = (
  children: RbxNode[],
  size: [number, number] = [1920, 1080],
): RbxNode => ({
  id: "screen",
  name: "screen",
  className: "ScreenGui",
  referenceSize: size,
  properties: {},
  children,
});
const component = (
  className: string,
  properties: Record<string, Value>,
): RbxNode => ({
  id: className,
  name: className,
  className,
  properties,
  children: [],
});

describe("inspector size units", () => {
  it("converts a standalone 800px panel against its 1920px design screen", () => {
    const panel = frame("panel", { Size: dim(0, 800, 0, 600) }),
      root = screen([panel]);
    const context = inspectorGeometry(panel, [root]);
    expect(context.parent).toEqual([1920, 1080]);
    const scale = convertedSize(panel.properties.Size, context.parent, "scale");
    expect(geometryNumbers(scale)).toEqual([800 / 1920, 0, 600 / 1080, 0]);
    expect(sizePixels(scale, context.parent)).toEqual([800, 600]);
    expect(convertedSize(scale, context.parent, "offset")).toEqual(
      panel.properties.Size,
    );
  });
  it("combines mixed scale/offset values before converting either axis", () => {
    const mixed = dim(0.25, 20, 0.5, -30);
    expect(inferredSizeUnit(mixed)).toBeUndefined();
    const offset = convertedSize(mixed, [1000, 600], "offset");
    expect(offset).toEqual(dim(0, 270, 0, 270));
    expect(convertedSize(offset, [1000, 600], "scale")).toEqual(
      dim(0.27, 0, 0.45, 0),
    );
    expect(mixed).toEqual(dim(0.25, 20, 0.5, -30));
  });
  it("uses the effective nested parent size and its padding rather than stale Figma measurements", () => {
    const child = frame("child", { Size: dim(0.5, 0, 0.5, 0) });
    const parent = frame("parent", { Size: dim(0, 900, 0, 600) }, [
      child,
      component("UIPadding", {
        PaddingLeft: { type: "UDim", value: [0.1, 0] },
        PaddingRight: { type: "UDim", value: [0, 10] },
        PaddingTop: { type: "UDim", value: [0, 20] },
      }),
    ]);
    parent.referenceSize = [500, 400];
    const context = inspectorGeometry(child, [screen([parent]), parent]);
    expect(context.parent).toEqual([800, 580]);
    expect(context.size).toEqual([400, 290]);
    expect(
      convertedSize(child.properties.Size, context.parent, "offset"),
    ).toEqual(dim(0, 400, 0, 290));
  });
  it("uses the scrollable parent's actual canvas basis", () => {
    const child = frame("child", { Size: dim(0.5, 0, 0.5, 0) });
    const scroll = {
      ...frame(
        "scroll",
        { Size: dim(0, 500, 0, 200), CanvasSize: dim(0, 0, 0, 800) },
        [child],
      ),
      className: "ScrollingFrame",
    };
    const context = inspectorGeometry(child, [screen([scroll]), scroll]);
    expect(context.parent).toEqual([500, 800]);
    expect(context.size).toEqual([250, 400]);
  });
  it("does not erase grid-owned size values when changing the display units", () => {
    const child = frame("child");
    const parent = frame("grid", { Size: dim(0, 500, 0, 400) }, [
      child,
      component("UIGridLayout", { CellSize: dim(0, 80, 0, 60) }),
    ]);
    const context = inspectorGeometry(child, [screen([parent]), parent]);
    expect(context.size).toEqual([80, 60]);
    expect(context.controlled.every(Boolean)).toBe(true);
    expect(
      convertedSize(
        child.properties.Size,
        context.parent,
        "scale",
        context.controlled,
      ),
    ).toEqual(child.properties.Size);
  });
  it("preserves the content-owned axis while converting the editable axis", () => {
    const child = frame("hug", {
      Size: dim(0, 0, 0, 60),
      AutomaticSize: en("AutomaticSize", "X"),
    });
    child.referenceSize = [128, 60];
    const context = inspectorGeometry(child, [screen([child])]);
    expect(context.size).toEqual([128, 60]);
    expect(context.controlled[0]).toBeTruthy();
    expect(context.controlled[1]).toBeUndefined();
    expect(
      convertedSize(
        child.properties.Size,
        context.parent,
        "scale",
        context.controlled,
      ),
    ).toEqual(dim(0, 0, 60 / 1080, 0));
  });
  it("does not convert unknown parent dimensions into zero-sized exports", () => {
    expect(() => convertedSize(dim(1, 0, 1, 0), [0, 0], "offset")).toThrow(
      /measurable/,
    );
    expect(() => convertedSize(dim(0, 800, 0, 600), [0, 0], "scale")).toThrow(
      /measurable/,
    );
    expect(inferredSizeUnit(dim(0, 800, 0, 600))).toBe("offset");
    expect(inferredSizeUnit(dim(0.5, 0, 0.2, 0))).toBe("scale");
  });
});

describe("anchor preservation", () => {
  it("matches native aspect constraints for fit, parent scaling and minimum sizes", () => {
    const fit = frame("fit", { Size: dim(0, 600, 0, 100) }, [
      component("UIAspectRatioConstraint", { AspectRatio: 2 }),
    ]);
    expect(previewConstrainedSize(fit, 1920, 1080).size).toEqual([200, 100]);
    fit.properties.Size = dim(0, 3000, 0, 100);
    fit.children[0].properties.AspectType = en(
      "AspectType",
      "ScaleWithParentSize",
    );
    expect(previewConstrainedSize(fit, 1920, 1080).size).toEqual([1920, 960]);
    fit.properties.Size = dim(0, 100, 0, 50);
    fit.children[0].properties.AspectType = en(
      "AspectType",
      "FitWithinMaxSize",
    );
    fit.children.push(
      component("UISizeConstraint", { MinSize: vec(400, 400) }),
    );
    expect(previewConstrainedSize(fit, 1920, 1080).size).toEqual([400, 200]);
  });
  it("keeps a centered panel visually fixed and retains pure scale positioning", () => {
    const panel = frame("panel", { Size: dim(0, 800, 0, 600) }),
      root = screen([panel]);
    const changes = anchoredProperties(
      panel,
      inspectorGeometry(panel, [root]),
      [0, 0],
    );
    const position = geometryNumbers(changes.Position);
    expect(position[0] * 1920).toBeCloseTo(560);
    expect(position[2] * 1080).toBeCloseTo(240);
    expect(position[1]).toBe(0);
    expect(position[3]).toBe(0);
    expect(changes.AnchorPoint).toEqual(vec(0, 0));
  });
  it("preserves existing offset positioning, rotation and UIScale", () => {
    const panel = frame(
      "panel",
      { Position: dim(0, 100, 0, 100), AnchorPoint: vec(0, 0), Rotation: 90 },
      [component("UIScale", { Scale: 2 })],
    );
    const changes = anchoredProperties(
      panel,
      inspectorGeometry(panel, [screen([panel])]),
      [1, 1],
    );
    const p = geometryNumbers(changes.Position);
    expect(p[1]).toBeCloseTo(500);
    expect(p[3]).toBeCloseTo(300);
  });
  it("uses constrained rendered dimensions when compensating the pivot", () => {
    const panel = frame("panel", { Size: dim(0, 600, 0, 600) }, [
      component("UIAspectRatioConstraint", { AspectRatio: 2 }),
      component("UISizeConstraint", { MaxSize: vec(400, 400) }),
    ]);
    const context = inspectorGeometry(panel, [screen([panel])]);
    expect(context.size).toEqual([400, 200]);
    expect(context.controlled[1]).toMatch(/aspect/);
    const p = geometryNumbers(
      anchoredProperties(panel, context, [0, 0]).Position,
    );
    expect(p[0] * 1920).toBeCloseTo(760);
    expect(p[2] * 1080).toBeCloseTo(440);
  });
  it("lets a layout keep owning Position instead of writing an ignored compensating override", () => {
    const child = frame("child"),
      parent = frame("list", {}, [child, component("UIListLayout", {})]);
    const context = inspectorGeometry(child, [screen([parent]), parent]);
    expect(context.ownsPosition).toBe(true);
    expect(anchoredProperties(child, context, [0, 0])).toEqual({
      AnchorPoint: vec(0, 0),
    });
  });
  it("rejects invalid custom anchors before creating any property changes", () => {
    const panel = frame("panel"),
      context = inspectorGeometry(panel, [screen([panel])]);
    expect(() => anchoredProperties(panel, context, [NaN, 0])).toThrow();
    expect(() => anchoredProperties(panel, context, [-0.1, 1])).toThrow();
    expect(() => anchoredProperties(panel, context, [0, 1.1])).toThrow();
  });
  it("exports anchor and compensated position together and undoes them as one edit", () => {
    const design = designNode("Settings", {
      id: "panel",
      width: 800,
      height: 600,
      transform: [
        [1, 0, 48000],
        [0, 1, -32000],
      ],
    });
    const build = (layerOverrides: Record<string, LayerOverride> = {}) =>
      compile(
        [design],
        "inspector-qa",
        { ...DEFAULT_FIGMA_OPTIONS, layout: "exact", layerOverrides },
        "fixed",
      );
    const before = build(),
      panel = flatten(before.roots).find((node) => node.id === "panel")!;
    const context = inspectorGeometry(panel, [before.roots[0]]);
    const properties = anchoredProperties(panel, context, [0, 0]);
    expect(
      Object.entries(properties).every(([name, value]) =>
        validProperty("Frame", name, value),
      ),
    ).toBe(true);
    const overrides = { panel: { properties } };
    const history = createOverrideHistory();
    history.record({}, overrides);
    const edited = flatten(build(overrides).roots).find(
      (node) => node.id === "panel",
    )!;
    const p = geometryNumbers(edited.properties.Position);
    expect(p[0] * 1920 + p[1]).toBeCloseTo(560);
    expect(p[2] * 1080 + p[3]).toBeCloseTo(240);
    const undone = history.undo(overrides)!;
    expect(undone).toEqual({});
    expect(
      flatten(build(undone).roots).find((node) => node.id === "panel")!
        .properties,
    ).toEqual(panel.properties);
    expect(history.redo(undone)).toEqual(overrides);
  });
});
