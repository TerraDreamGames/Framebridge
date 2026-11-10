import { describe, expect, it } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import {
  flatten,
  type DesignNode,
  type ExportOptions,
} from "../packages/core/src/types";
const text = () =>
  node("Label", {
    id: "label",
    type: "TEXT",
    text: {
      characters: "Buy now",
      align: "CENTER",
      verticalAlign: "CENTER",
      runs: [
        {
          text: "Buy now",
          fontFamily: "Roboto",
          fontStyle: "Regular",
          fontSize: 16,
        },
      ],
    },
  });
function convert(
  name: string,
  props: Partial<DesignNode> = {},
  options: Partial<ExportOptions> = {},
) {
  const result = compile(
    [
      node("Shop panel", {
        id: "root",
        children: [node(name, { id: "control", children: [text()], ...props })],
      }),
    ],
    "buttons",
    options,
  );
  return {
    result,
    control: flatten(result.roots).find((n) => n.id === "control")!,
    nodes: flatten(result.roots),
  };
}
describe("intelligent button classification", () => {
  it("reevaluates the same source after hierarchy and visibility edits", () => {
    const control = node("Buy now", { id: "control", children: [text()] });
    const design = [node("Shop panel", { id: "root", children: [control] })];
    const className = () =>
      flatten(compile(design, "editable-buttons").roots).find(
        (layer) => layer.id === control.id,
      )!.className;
    expect(className()).toBe("TextButton");
    const content = node("Complex content", { children: [text()] });
    control.children.push(content);
    expect(className()).toBe("Frame");
    content.visible = false;
    expect(className()).toBe("TextButton");
  });
  it("keeps configured text-card controls native instead of treating them as image artwork", () => {
    const { result, control, nodes } = convert("Quest 01", {}, {
      layerOverrides: { control: { behavior: { control: { kind: "toggle", value: false } } } },
    });
    expect(control.className).toBe("TextButton");
    expect(control.assetRef).toBeUndefined();
    expect(result.assets).toHaveLength(0);
    expect(control.behavior?.control).toEqual({ kind: "toggle", value: false });
    expect(nodes.find(n => n.id === "label")?.className).toBe("TextLabel");
    expect(result.issues.filter(i => i.severity === "error")).toHaveLength(0);
  });
  it("keeps an icon-only configured control as an image button with separate icon artwork", () => {
    const { control, nodes } = convert("Quest 01", {
      children: [node("Path", { id: "icon", type: "VECTOR" })],
    }, { layerOverrides: { control: { behavior: { control: { kind: "toggle", value: false } } } } });
    expect(control.className).toBe("ImageButton");
    expect(control.assetRef).toBeUndefined();
    expect(nodes.find(n => n.id === "icon")?.assetRef).toBeDefined();
    expect(nodes.find(n => n.id === "icon")?.className).toBe("ImageLabel");
  });
  it.each([
    "Buy now",
    "Play",
    "Confirm",
    "Purchase button",
    "CTA Purchase",
    "Buy_btn",
  ])("recognizes %s with content", (name) => {
    const { control, nodes } = convert(name);
    expect(control.className).toBe("TextButton");
    expect(control.properties.Active).toBe(true);
    expect(control.properties.Selectable).toBe(true);
    expect(nodes.find((n) => n.id === "label")!.className).toBe("TextLabel");
  });
  it("keeps a native image button with its separate editable icon", () => {
    const { control, nodes } = convert("Close", {
      children: [node("Path", { id: "icon", type: "VECTOR" })],
    });
    expect(control.className).toBe("ImageButton");
    expect(control.properties.Image).toBe("");
    expect(nodes.find((n) => n.id === "icon")!.className).toBe("ImageLabel");
  });
  it.each([
    "Buttons",
    "Button container",
    "Button label",
    "Toolbar",
    "Purchase details",
    "Shop panel",
    "Inventory",
  ])("does not mistake %s for a button", (name) => {
    expect(convert(name).control.className).toBe("Frame");
  });
  it("does not infer a button for a selected screen or complex panel", () => {
    const pkg = compile(
      [node("Buy", { id: "root", children: [text()] })],
      "buttons",
    );
    expect(flatten(pkg.roots).find((n) => n.id === "root")!.className).toBe(
      "Frame",
    );
    expect(
      convert("CTA Purchase", {
        children: [node("Content", { children: [text()] })],
      }).control.className,
    ).toBe("Frame");
  });
  it("supports an explicit opt-out and keeps explicit hints", () => {
    expect(
      convert("Buy now", {}, { detectButtons: false }).control.className,
    ).toBe("Frame");
    expect(
      convert("Buy [button]", {}, { detectButtons: false }).control.className,
    ).toBe("TextButton");
    expect(
      convert(
        "Buy now",
        {},
        { layerOverrides: { control: { className: "Frame" } } },
      ).control.className,
    ).toBe("Frame");
    expect(
      convert(
        "Buy [button]",
        {},
        { layerOverrides: { control: { className: "TextLabel" } } },
      ).control.className,
    ).toBe("TextLabel");
  });
  it("reports automatic decisions and strips explicit hints from exported names", () => {
    const { result } = convert("Play");
    expect(
      result.issues.find((i) => i.code === "button-detected")?.severity,
    ).toBe("info");
    expect(convert("Play_button").control.name).toBe("Play");
  });
  it("does not suppress controls in a larger button-examples panel", () => {
    const result = compile(
      [
        node("Button examples", {
          id: "root",
          children: [node("Buy now", { id: "buy", children: [text()] })],
        }),
      ],
      "buttons",
    );
    expect(flatten(result.roots).find((n) => n.id === "buy")!.className).toBe(
      "TextButton",
    );
  });
});
