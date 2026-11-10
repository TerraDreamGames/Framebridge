import { describe, expect, it } from "vitest";
import {
  applyOverrideChanges,
  classChanges,
  commonClassChoices,
  commonPropertySchema,
  layerPropertyValue,
  propertyChanges,
  sharedValue,
} from "../packages/core/src/bulk-editor";
import { createOverrideHistory } from "../plugins/figma/src/override-history";
import {
  CLASS_SHORTCUTS,
  classShortcut,
  reconcileLayerSelection,
  selectLayers,
} from "../plugins/figma/src/layer-selection";
import {
  flatten,
  type LayerOverride,
  type Value,
} from "../packages/core/src/types";
import { validatePackage } from "../packages/relay/src/protocol";
import { bulkLayers, bulkPackage } from "./bulk-editing-fixtures";

describe("analyzed layer selection", () => {
  const selected = {
    sourceId: "design-a",
    primary: "title-1",
    ids: ["title-0", "title-1"],
    anchor: "title-0",
  };
  const available = ["screen:bulk-demo", "title-0", "title-1"];
  it("retains the group and range anchor through a same-source reanalysis", () => {
    expect(reconcileLayerSelection(selected, "design-a", available)).toBe(
      selected,
    );
  });
  it("filters removed nodes and moves a removed primary to a surviving selection", () => {
    expect(
      reconcileLayerSelection(selected, "design-a", available.slice(0, 2)),
    ).toEqual({
      ...selected,
      ids: ["title-0"],
      primary: "title-0",
    });
    expect(
      reconcileLayerSelection(selected, "design-a", [
        "screen:bulk-demo",
        "title-1",
      ]),
    ).toEqual({
      ...selected,
      ids: ["title-1"],
      anchor: "title-1",
    });
  });
  it("clears selections from another source even when that source reuses node IDs", () => {
    expect(reconcileLayerSelection(selected, "design-b", available)).toEqual({
      sourceId: "design-b",
      primary: "screen:bulk-demo",
      ids: ["screen:bulk-demo"],
      anchor: "screen:bulk-demo",
    });
  });
  it("clears a removed analysis and chooses an available fallback if the whole group disappeared", () => {
    expect(reconcileLayerSelection(selected, undefined, [])).toEqual({
      primary: "",
      ids: [],
      anchor: "",
      sourceId: undefined,
    });
    expect(
      reconcileLayerSelection(selected, "design-a", ["screen:bulk-demo"]),
    ).toEqual({
      sourceId: "design-a",
      primary: "screen:bulk-demo",
      ids: ["screen:bulk-demo"],
      anchor: "screen:bulk-demo",
    });
  });
});

describe("Bulk layer configuration", () => {
  const layers = bulkLayers();
  const pick = (...ids: string[]) =>
    layers.filter((layer) => ids.includes(layer.node.id));
  const panels = pick("panel-0", "panel-1"),
    titles = pick("title-0", "title-1"),
    icons = pick("icon-0", "icon-1");
  it("intersects property kinds and keeps only properties valid on all layers", () => {
    const schema = commonPropertySchema([...panels, ...titles]);
    expect(schema).toHaveProperty("Position");
    expect(schema).toHaveProperty("Visible");
    expect(schema).not.toHaveProperty("Text");
    expect(schema).not.toHaveProperty("AutoButtonColor");
    expect(
      commonPropertySchema([...panels, { ...titles[0], baked: true }]),
    ).toEqual({});
    expect(commonPropertySchema(pick("panel-0/corner", "icon-0"))).toEqual({});
    expect(commonPropertySchema([])).toEqual({});
  });
  it("distinguishes shared false/zero values from mixed values", () => {
    expect(sharedValue([false, false])).toBe(false);
    expect(sharedValue([0, 0])).toBe(0);
    expect(
      sharedValue([
        { type: "Vector2", value: [0, 1] },
        { type: "Vector2", value: [0, 1] },
      ]),
    ).toEqual({ type: "Vector2", value: [0, 1] });
    expect(sharedValue([1, 2])).toBeUndefined();
    expect(sharedValue([])).toBeUndefined();
  });
  it("explicitly clears mixed text and applies the first mixed color without changing other properties", () => {
    const text = bulkPackage(
      applyOverrideChanges({}, propertyChanges(titles, {}, "Text", "")),
    );
    for (const layer of titles)
      expect(
        flatten(text.roots).find((node) => node.id === layer.node.id)
          ?.properties,
      ).toMatchObject({ Text: "", FontFace: layer.node.properties.FontFace });
    const color = panels[0].node.properties.BackgroundColor3;
    const edited = bulkPackage(
      applyOverrideChanges(
        {},
        propertyChanges(panels, {}, "BackgroundColor3", color),
      ),
    );
    for (const layer of panels)
      expect(
        flatten(edited.roots).find((node) => node.id === layer.node.id)
          ?.properties,
      ).toMatchObject({
        BackgroundColor3: color,
        Position: layer.node.properties.Position,
      });
    expect(() => validatePackage(text)).not.toThrow();
    expect(() => validatePackage(edited)).not.toThrow();
  });
  it("changes one mixed coordinate without copying other coordinates from the first layer", () => {
    const before = JSON.stringify(layers);
    const changes = propertyChanges(panels, {}, "Position", 0.5, 0);
    const pkg = bulkPackage(applyOverrideChanges({}, changes));
    for (const layer of panels) {
      const original = layerPropertyValue(layer, "Position") as {
        value: number[];
      };
      const current = flatten(pkg.roots).find(
        (node) => node.id === layer.node.id,
      )!;
      expect(current.properties.Position).toEqual({
        type: "UDim2",
        value: [0.5, ...original.value.slice(1)],
      });
      expect(current.properties.Size).toEqual(layer.node.properties.Size);
    }
    expect(JSON.stringify(layers)).toBe(before);
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("applies a chosen value even when it equals the first layer's mixed coordinate", () => {
    const first = (
      layerPropertyValue(panels[0], "Position") as { value: number[] }
    ).value[1];
    const changes = propertyChanges(panels, {}, "Position", first, 1);
    expect(
      (changes[1].value!.properties!.Position as { value: number[] }).value[1],
    ).toBe(first);
  });
  it("changes a font component without overwriting separate families/styles", () => {
    const changes = propertyChanges(titles, {}, "FontFace", "Bold", "weight");
    for (const [i, change] of changes.entries())
      expect(change.value!.properties!.FontFace).toEqual({
        ...(titles[i].node.properties.FontFace as object),
        weight: "Bold",
      });
    const pkg = bulkPackage(applyOverrideChanges({}, changes));
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("preserves unrelated overrides and restores each source value independently", () => {
    const original: Record<string, LayerOverride> = {
      "panel-0": {
        name: "Custom A",
        properties: { Rotation: 20, Visible: false },
      },
      "panel-1": {
        properties: { Rotation: 40 },
        components: { aspect: { AspectRatio: 2 } },
      },
    };
    const configured = applyOverrideChanges(
      original,
      propertyChanges(panels, original, "Rotation", 90),
    );
    const reset = applyOverrideChanges(
      configured,
      propertyChanges(panels, configured, "Rotation", undefined),
    );
    expect(reset["panel-0"]).toEqual({
      name: "Custom A",
      properties: { Visible: false },
    });
    expect(reset["panel-1"]).toEqual({
      properties: {},
      components: { aspect: { AspectRatio: 2 } },
    });
    const pkg = bulkPackage(reset);
    for (const id of ["panel-0", "panel-1"])
      expect(
        flatten(pkg.roots).find((node) => node.id === id)?.properties.Rotation,
      ).toBe(0);
  });
  it("sets all corner radii deliberately and removes earlier per-corner overrides", () => {
    const corners = pick("panel-0/corner", "panel-1/corner");
    const original: Record<string, LayerOverride> = {
      "panel-0/corner": {
        properties: { TopLeftRadius: { type: "UDim", value: [0, 5] } },
      },
    };
    const changes = propertyChanges(corners, original, "CornerRadius", {
      type: "UDim",
      value: [0, 9],
    });
    expect(changes[0].value!.properties).toEqual({
      CornerRadius: { type: "UDim", value: [0, 9] },
    });
    const pkg = bulkPackage(applyOverrideChanges(original, changes));
    for (const corner of flatten(pkg.roots).filter(
      (node) => node.className === "UICorner",
    ))
      expect(corner.properties.CornerRadius).toEqual({
        type: "UDim",
        value: [0, 9],
      });
  });
  it("offers only compatible classes, retaining separate text and artwork roles", () => {
    expect(commonClassChoices(panels, {})).toContain("ScrollingFrame");
    expect(commonClassChoices([...panels, ...titles], {})).toEqual([
      "TextButton",
    ]);
    expect(commonClassChoices([...panels, ...icons], {})).toEqual([]);
    expect(commonClassChoices(pick("screen:bulk-demo"), {})).toEqual([]);
  });
  it("assigns multiple scrolling containers with native defaults in one package", () => {
    const pkg = bulkPackage(
      applyOverrideChanges({}, classChanges(panels, {}, "ScrollingFrame")),
    );
    for (const id of ["panel-0", "panel-1"]) {
      const node = flatten(pkg.roots).find((node) => node.id === id)!;
      expect(node.className).toBe("ScrollingFrame");
      expect(node.properties.AutomaticCanvasSize).toEqual({
        type: "Enum",
        value: ["AutomaticSize", "Y"],
      });
    }
    expect(() => validatePackage(pkg)).not.toThrow();
  });
  it("assigns image buttons without losing existing image identities", () => {
    const pkg = bulkPackage(
      applyOverrideChanges({}, classChanges(icons, {}, "ImageButton")),
    );
    expect(pkg.assets.map((asset) => asset.nodeId)).toEqual([
      "icon-0",
      "icon-1",
    ]);
    for (const layer of icons) {
      const current = flatten(pkg.roots).find(
        (node) => node.id === layer.node.id,
      )!;
      expect(current.className).toBe("ImageButton");
      expect(current.assetRef).toBe(layer.node.assetRef);
    }
  });
  it("restores automatic classification and keeps inactive properties available for a later type change", () => {
    const overrides = applyOverrideChanges(
      {},
      classChanges(panels, {}, "ScrollingFrame"),
    );
    overrides["panel-0"].properties = { ScrollBarThickness: 12 };
    const automatic = applyOverrideChanges(
      overrides,
      classChanges(panels, overrides, "auto"),
    );
    expect(automatic["panel-0"].properties).toEqual({ ScrollBarThickness: 12 });
    expect(
      flatten(bulkPackage(automatic).roots).find(
        (node) => node.id === "panel-0",
      )!.className,
    ).toBe("Frame");
  });
  it.each(["Script", "ImageButton", "TextLabel"])(
    "rejects incompatible panel class %s before producing changes",
    (cls) => {
      const before = JSON.stringify(layers);
      expect(() => classChanges(panels, {}, cls)).toThrow("compatible");
      expect(JSON.stringify(layers)).toBe(before);
    },
  );
  it.each([NaN, Infinity, -1, 2])(
    "rejects invalid transparency %s for the complete batch",
    (value) => {
      expect(() =>
        propertyChanges(panels, {}, "BackgroundTransparency", value),
      ).toThrow();
    },
  );
  it("rejects incompatible properties, invalid components, duplicate IDs and baked class targets", () => {
    for (const run of [
      () => propertyChanges([...panels, ...titles], {}, "Text", "Oops"),
      () => propertyChanges(panels, {}, "Position", 1, 9),
      () => propertyChanges(panels, {}, "Position", "oops", 0),
      () => propertyChanges(panels, {}, "Position", "Bold", "weight"),
      () => propertyChanges([panels[0], panels[0]], {}, "Visible", true),
      () => classChanges([{ ...panels[0], baked: true }], {}, "Frame"),
    ])
      expect(run).toThrow();
  });
  it("resets selected parent/modifier settings together without changing a neighboring layer", () => {
    const before: Record<string, LayerOverride> = {
      "panel-0": { name: "A" },
      "panel-0/corner": {
        properties: { CornerRadius: { type: "UDim", value: [0, 10] } },
      },
      "panel-1": { name: "B" },
    };
    expect(
      applyOverrideChanges(before, [{ id: "panel-0", value: undefined }]),
    ).toEqual({ "panel-1": { name: "B" } });
    expect(() =>
      applyOverrideChanges(before, [
        { id: "panel-0", value: {} },
        { id: "panel-0", value: undefined },
      ]),
    ).toThrow();
    expect(Object.keys(before)).toHaveLength(3);
  });
});

describe("Batch history and selection", () => {
  it("undoes and redoes a complete two-layer edit as one transaction", () => {
    const history = createOverrideHistory();
    const before = {};
    const layers = bulkLayers().filter((layer) =>
      layer.node.id.startsWith("title-"),
    );
    const after = applyOverrideChanges(
      before,
      propertyChanges(layers, before, "TextSize", 24),
    );
    history.record(before, after);
    expect(history.peekUndo()).toEqual(before);
    expect(history.undo(after)).toEqual(before);
    expect(history.canUndo).toBe(false);
    expect(history.redo(before)).toEqual(after);
    expect(history.canRedo).toBe(false);
  });
  it("keeps isolated bounded snapshots, preserves redo for no-ops and clears redo for new edits", () => {
    const history = createOverrideHistory(2);
    let current: Record<string, LayerOverride> = {};
    for (let i = 0; i < 3; i++) {
      const next = { a: { name: String(i) } };
      history.record(current, next);
      current = next;
    }
    current = history.undo(current)!;
    expect(history.canRedo).toBe(true);
    expect(history.record(current, current)).toBe(false);
    expect(history.canRedo).toBe(true);
    const peek = history.peekRedo()!;
    peek.a.name = "mutated";
    expect(history.peekRedo()!.a.name).toBe("2");
    history.record(current, { b: { name: "new" } });
    expect(history.canRedo).toBe(false);
    history.clear();
    expect(history.canUndo).toBe(false);
  });
  it("selects ranges in visible order and supports additive ranges/toggling", () => {
    const visible = ["a", "b", "c", "d"];
    expect(selectLayers(["a"], visible, "c", "a", { range: true })).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      selectLayers(["d"], visible, "b", "a", { range: true, toggle: true }),
    ).toEqual(["d", "a", "b"]);
    expect(
      selectLayers(["a", "b"], visible, "a", "a", { toggle: true }),
    ).toEqual(["b"]);
    expect(selectLayers(["a"], visible, "a", "a", { toggle: true })).toEqual([
      "a",
    ]);
    expect(selectLayers(["a"], visible, "missing", "a")).toEqual(["a"]);
    expect(
      selectLayers(["a"], visible, "d", "hidden", { range: true }),
    ).toEqual(["d"]);
  });
  it("limits class shortcuts to the documented safe native classes", () => {
    expect(Object.values(CLASS_SHORTCUTS)).toEqual([
      "auto",
      "Frame",
      "TextLabel",
      "ImageLabel",
      "TextButton",
      "ImageButton",
      "ScrollingFrame",
    ]);
  });
  it("uses physical digit keys for macOS Option symbols and ignores ordinary typing", () => {
    const event = {
      key: "¡",
      code: "Digit1",
      altKey: true,
      metaKey: false,
      ctrlKey: false,
    };
    expect(classShortcut(event)).toBe("Frame");
    expect(classShortcut({ ...event, altKey: false })).toBeUndefined();
    expect(classShortcut({ ...event, metaKey: true })).toBeUndefined();
    expect(classShortcut({ ...event, ctrlKey: true })).toBeUndefined();
  });
});
