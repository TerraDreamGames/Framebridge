import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyOverrideChanges } from "../packages/core/src/bulk-editor";
import { layerBehavior } from "../packages/core/src/behaviors";
import { compile } from "../packages/core/src/compiler";
import { flatten, type LayerOverride } from "../packages/core/src/types";
import { validatePackage } from "../packages/relay/src/protocol";
import { BehaviorEditor } from "../plugins/figma/src/BehaviorEditor";
import { createOverrideHistory } from "../plugins/figma/src/override-history";
import { behaviorDesign } from "./behavior-fixtures";
import { bulkLayers, bulkPackage } from "./bulk-editing-fixtures";

describe("custom interaction mode", () => {
  it("keeps Custom settings on an untouched layer and exposes controls for its first interaction", () => {
    const layer = bulkLayers().find((item) => item.node.id === "panel-0")!;
    const render = (edit: LayerOverride) =>
      renderToStaticMarkup(
        <BehaviorEditor
          source={layer.source!}
          node={layer.node}
          nodes={[layer.node]}
          edit={edit}
          onChange={() => {}}
        />,
      );
    expect(render({})).not.toContain('id="control-kind"');
    const custom = applyOverrideChanges({}, [
      { id: layer.node.id, value: { behavior: {} } },
    ]);
    const inspector = render(custom[layer.node.id] ?? {});
    expect(inspector).toContain('id="control-kind"');
    expect(inspector).toContain('id="behavior-role"');
    expect(flatten(bulkPackage(custom).roots)).toEqual(
      flatten(bulkPackage().roots),
    );

    const configured = applyOverrideChanges(custom, [
      {
        id: layer.node.id,
        value: { ...custom[layer.node.id], behavior: { role: "panel" } },
      },
    ]);
    const pkg = bulkPackage(configured);
    expect(
      flatten(pkg.roots).find((item) => item.id === layer.node.id)?.behavior,
    ).toEqual({ role: "panel" });
    expect(() => validatePackage(pkg)).not.toThrow();
  });

  it("keeps explicit empty settings distinct from inherited tag bindings through Undo and Redo", () => {
    const designs = behaviorDesign();
    const source = designs[0].children
      .find((item) => item.id === "shop")!
      .children.find((item) => item.id === "coins")!;
    source.name += " [bind:leaderstats.Coins]";
    const binding = {
      source: "leaderstats",
      key: "Coins",
      template: "Coins: {value}",
    };
    const pkg = (edits: Record<string, LayerOverride>) =>
      compile(designs, "interaction-mode", { layerOverrides: edits });
    const getBinding = (edits: Record<string, LayerOverride>) =>
      flatten(pkg(edits).roots).find((item) => item.id === "coins")?.behavior
        ?.binding;
    const history = createOverrideHistory();
    const before = {};
    const custom = applyOverrideChanges(before, [
      { id: "coins", value: { behavior: {} } },
    ]);
    expect(getBinding(before)).toEqual(binding);
    expect(layerBehavior(source, custom.coins)).toBeUndefined();
    expect(getBinding(custom)).toBeUndefined();
    expect(history.record(before, custom)).toBe(true);
    const undone = history.undo(custom)!;
    expect(getBinding(undone)).toEqual(binding);
    const redone = history.redo(undone)!;
    expect(redone.coins.behavior).toEqual({});
    expect(getBinding(redone)).toBeUndefined();

    const tags = applyOverrideChanges(redone, [
      { id: "coins", value: { ...redone.coins, behavior: undefined } },
    ]);
    expect(tags.coins).toBeUndefined();
    expect(getBinding(tags)).toEqual(binding);
    expect(() => validatePackage(pkg(redone))).not.toThrow();
  });

  it("keeps custom mode when the last property override is cleared", () => {
    const edits = applyOverrideChanges(
      { panel: { behavior: {}, properties: { Visible: false } } },
      [{ id: "panel", value: { behavior: {}, properties: {} } }],
    );
    expect(edits.panel.behavior).toEqual({});
    const reopened = JSON.parse(JSON.stringify(edits));
    expect(reopened.panel.behavior).toEqual({});
    expect(
      applyOverrideChanges(reopened, [{ id: "panel", value: undefined }]),
    ).toEqual({});
  });

  it("still discards empty property and modifier edits while retaining a neighboring custom mode", () => {
    const before = { neighbor: { behavior: {} } };
    for (const value of [
      {},
      { properties: {} },
      { components: {} },
      { behavior: undefined, properties: {}, components: {} },
    ])
      expect(applyOverrideChanges(before, [{ id: "empty", value }])).toEqual(
        before,
      );
    expect(
      applyOverrideChanges({}, [{ id: "off", value: { behavior: false } }]),
    ).toEqual({ off: { behavior: false } });
  });
});
