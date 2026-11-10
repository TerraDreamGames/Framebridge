import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { componentResult, stateComponentResult } from "./components-fixtures";
import {
  reviewComponents,
  extractComponent,
} from "../packages/core/src/reusable-components";
import { flatten, type AnalysisResult } from "../packages/core/src/types";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { buildSourceExport } from "../packages/core/src/source-export";
import { generateModel } from "../packages/core/src/model-export";
import { validateExportPackage } from "../packages/core/src/export-package";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { validatePackage } from "../packages/relay/src/protocol";
import { DEFAULT_THEMES } from "../packages/core/src/theme-tokens";
import { effectDesign } from "./effect-decoration-fixtures";
import { PARTICLE_DEFAULTS } from "../packages/core/src/particles";
import { KEYFRAME_DEFAULTS } from "../packages/core/src/keyframes";
import { MOTION_DEFAULTS } from "../packages/core/src/motion";

function stateWithNestedButton() {
  const result = stateComponentResult();
  const caption = structuredClone(result.designs![0].children[0].children[0]);
  caption.id = "nested-caption";
  result.designs![0].children[0].children.push(
    node("Independent nested button", {
      id: "nested-button",
      width: 140,
      height: 32,
      children: [caption],
    }),
  );
  return result;
}

function linkArtwork(result: AnalysisResult) {
  for (const asset of result.package.assets) asset.robloxId = "123";
  for (const entry of flatten(result.package.roots))
    if (entry.assetRef) entry.properties.Image = "rbxassetid://123";
  expect(() => validateExportPackage(result.package)).not.toThrow();
  expect(() => validatePackage(result.package)).not.toThrow();
  return result;
}

describe("reusable component review and extraction", () => {
  it("groups equal cards across placement while retaining different text as a separate variant", () => {
    const result = componentResult();
    const groups = reviewComponents(result);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodeIds).toEqual(["card-a", "card-b"]);
    expect(groups[0].kind).toBe("repeated");
  });
  it("finds matching components across independently sized screens", () => {
    const result = componentResult();
    const other = JSON.parse(JSON.stringify(result.designs![0].children[0]));
    other.id = "other-card";
    other.children[0].id = "other-label";
    result.designs!.push(
      node("Other screen", {
        id: "other-screen",
        width: 400,
        height: 700,
        children: [other],
      }),
    );
    result.package = compile(
      result.designs!,
      "cross-screen",
      { detectButtons: false },
      "fixed",
    );
    expect(
      reviewComponents(result).find((g) => g.nodeIds.includes("card-a"))
        ?.nodeIds,
    ).toEqual(["card-a", "card-b", "other-card"]);
  });
  it("compares actual artwork bytes across different source image identities", () => {
    const result = componentResult(true);
    expect(
      reviewComponents(result).some(
        (g) => g.nodeIds.join() === "card-a,card-b",
      ),
    ).toBe(true);
    result.assets["image:card-b/icon:bleed-v2"][6] = 9;
    expect(
      reviewComponents(result).some(
        (g) => g.nodeIds.includes("card-a") && g.nodeIds.includes("card-b"),
      ),
    ).toBe(false);
  });
  it("does not merge unavailable artwork based on a filename or dimensions", () => {
    const result = componentResult(true);
    result.assets = {};
    expect(
      reviewComponents(result).some((g) => g.nodeIds.includes("card-a")),
    ).toBe(false);
  });
  it("uses the exported Roblox link when it overrides otherwise identical Figma artwork", () => {
    const result = componentResult(true);
    result.package.assets.find((a) => a.nodeId === "card-a/icon")!.robloxId =
      "rbxassetid://123";
    result.package.assets.find((a) => a.nodeId === "card-b/icon")!.robloxId =
      "rbxassetid://456";
    expect(
      reviewComponents(result).some(
        (g) => g.nodeIds.includes("card-a") && g.nodeIds.includes("card-b"),
      ),
    ).toBe(false);
    result.package.assets.find((a) => a.nodeId === "card-b/icon")!.robloxId =
      "rbxassetid://123";
    result.assets["image:card-b/icon:bleed-v2"][6] = 9;
    expect(
      reviewComponents(result).some(
        (g) => g.nodeIds.includes("card-a") && g.nodeIds.includes("card-b"),
      ),
    ).toBe(true);
  });
  it("preserves relative stacking and splits a visually different child hierarchy", () => {
    const result = componentResult();
    const a = flatten(result.package.roots).find((n) => n.id === "card-a")!;
    const b = flatten(result.package.roots).find((n) => n.id === "card-b")!;
    a.properties.ZIndex = 2;
    a.children[0].properties.ZIndex = 3;
    b.properties.ZIndex = 8;
    b.children[0].properties.ZIndex = 3;
    expect(reviewComponents(result)).toHaveLength(1);
    b.children[0].properties.ZIndex = 10;
    expect(reviewComponents(result)).toHaveLength(0);
  });
  it("isolates a complete editable template and its required artwork without mutating source", () => {
    const result = componentResult(true),
      before = JSON.stringify(result);
    const group = reviewComponents(result).find(
      (g) => g.nodeIds[0] === "card-a",
    )!;
    const extracted = extractComponent(result, group.key, "Product card");
    expect(JSON.stringify(result)).toBe(before);
    expect(extracted.package.name).toBe("Product card");
    expect(extracted.package.assets.map((a) => a.id)).toEqual([
      "image:card-a/icon:bleed-v2",
    ]);
    expect(Object.keys(extracted.assets)).toEqual([
      "image:card-a/icon:bleed-v2",
    ]);
    expect(extracted.package.roots[0].children[0].properties).toMatchObject({
      Position: { type: "UDim2", value: [0, 0, 0, 0] },
      Size: { type: "UDim2", value: [0, 160, 0, 80] },
    });
    expect(() => validateExportPackage(extracted.package)).not.toThrow();
  });
  it("allows explicit extraction of a single layer with a bounded name and fresh identity", () => {
    const result = componentResult();
    const a = extractComponent(result, "layer:card-c", "Sell card");
    expect(a.package.roots[0].children[0].children[0].properties.Text).toBe(
      "Sell",
    );
    expect(a.package.sourceId).not.toBe(result.package.sourceId);
    expect(() => extractComponent(result, "layer:card-c", " ")).toThrow("name");
    expect(() => extractComponent(result, "repeat:missing")).toThrow("changed");
  });
  it("rejects dependencies outside the extracted subtree instead of dropping interactions", () => {
    const result = componentResult();
    flatten(result.package.roots).find((n) => n.id === "card-a")!.behavior = {
      action: { kind: "open", target: "card-c" },
    };
    expect(() => extractComponent(result, "layer:card-a")).toThrow("outside");
    expect(
      reviewComponents(result).some((g) => g.nodeIds.includes("card-a")),
    ).toBe(false);
  });
  it("keeps self-contained button actions and editable targets in the extracted widget", () => {
    const result = componentResult();
    const card = flatten(result.package.roots).find((n) => n.id === "card-a")!;
    card.className = "TextButton";
    card.properties.Text = "";
    card.behavior = { action: { kind: "toggle", target: card.children[0].id } };
    card.children[0].behavior = { role: "panel" };
    card.children[0].properties.Visible = false;
    const extracted = extractComponent(result, "layer:card-a");
    expect(
      extracted.package.roots[0].children[0].behavior?.action?.target,
    ).toBe("card-a/label");
    expect(() => validateExportPackage(extracted.package)).not.toThrow();
    expect(
      generateSource(extracted.package, "luau", { component: true }),
    ).toContain("FramebridgeBehavior");
  });
  it("groups explicit equal-sized states into one input target with editable state visuals", () => {
    const result = stateComponentResult();
    const group = reviewComponents(result).find((g) => g.kind === "states")!;
    expect(group.states).toEqual({
      default: "variant-Default",
      hover: "variant-Hover",
      pressed: "variant-Pressed",
      disabled: "variant-Disabled",
    });
    const extracted = extractComponent(result, group.key);
    const button = extracted.package.roots[0].children[0];
    expect(button.className).toBe("TextButton");
    expect(button.children).toHaveLength(4);
    expect(button.children.map((n) => n.behavior?.state)).toEqual(
      ["default", "hover", "pressed", "disabled"].map((kind) => ({
        kind,
        owner: button.id,
      })),
    );
    expect(button.children.map((n) => n.properties.Visible)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(
      flatten([button]).filter((n) => n.className.endsWith("Button")),
    ).toHaveLength(1);
    expect(() => validateExportPackage(extracted.package)).not.toThrow();
  });
  it("keeps a baked Default image on its state visual, not the new input wrapper", () => {
    const result = stateComponentResult();
    result.package = compile(
      result.designs!,
      result.package.sourceId,
      {
        detectButtons: false,
        layerOverrides: { "variant-Default": { renderMode: "image" } },
      },
      "fixed",
    );
    linkArtwork(result);
    const before = JSON.stringify(result);
    const original = flatten(result.package.roots).find(
      (entry) => entry.id === "variant-Default",
    )!;
    expect(original.className).toBe("ImageLabel");
    expect(original.assetRef).toBeDefined();
    const extracted = extractComponent(result, "states:button-set");
    const wrapper = extracted.package.roots[0].children[0];
    const visual = wrapper.children[0];
    expect(wrapper.className).toBe("TextButton");
    expect(wrapper.assetRef).toBeUndefined();
    expect(visual.className).toBe("ImageLabel");
    expect(visual.assetRef).toBe(original.assetRef);
    expect(visual.properties.Image).toBe("rbxassetid://123");
    expect(extracted.package.assets).toEqual(result.package.assets);
    expect(() => validateExportPackage(extracted.package)).not.toThrow();
    expect(() => validatePackage(extracted.package)).not.toThrow();
    expect(generateModel(extracted.package)).toContain('class="ImageLabel"');
    expect(JSON.stringify(result)).toBe(before);
  });
  it("keeps scrollbar bindings and canvas layout metadata on the ScrollingFrame visual", () => {
    const result = stateComponentResult();
    result.package = compile(
      result.designs!,
      result.package.sourceId,
      {
        detectButtons: false,
        layerOverrides: {
          "variant-Default": { className: "ScrollingFrame" },
          "variant-Hover": { renderMode: "image" },
        },
      },
      "fixed",
    );
    const original = flatten(result.package.roots).find(
      (entry) => entry.id === "variant-Default",
    )!;
    const image = result.package.assets[0].id;
    original.layoutCanvas = true;
    original.assetBindings = {
      TopImage: image,
      MidImage: image,
      BottomImage: image,
    };
    for (const property of Object.keys(original.assetBindings))
      original.properties[property] = "rbxassetid://123";
    linkArtwork(result);
    const before = JSON.stringify(result);
    const extracted = extractComponent(result, "states:button-set");
    const wrapper = extracted.package.roots[0].children[0];
    const visual = wrapper.children[0];
    expect(wrapper.assetBindings).toBeUndefined();
    expect(wrapper.layoutCanvas).toBeUndefined();
    expect(wrapper.layoutSizing).toBeUndefined();
    expect(visual.className).toBe("ScrollingFrame");
    expect(visual.assetBindings).toEqual(original.assetBindings);
    expect(visual.layoutCanvas).toBe(true);
    expect(visual.layoutSizing).toEqual(original.layoutSizing);
    expect(() => validateExportPackage(extracted.package)).not.toThrow();
    expect(() => validatePackage(extracted.package)).not.toThrow();
    expect(generateModel(extracted.package)).toContain(
      "FramebridgeLayoutCanvas",
    );
    expect(JSON.stringify(result)).toBe(before);
  });
  it("remaps descendant hover owners to the state target while preserving nested buttons", () => {
    const result = stateWithNestedButton();
    result.package = compile(
      result.designs!,
      result.package.sourceId,
      {
        detectButtons: false,
        themes: DEFAULT_THEMES,
        layerOverrides: {
          "variant-Default": { className: "TextButton" },
          "variant-Hover": { className: "TextButton" },
          "Default/label": { theme: { hover: "interactive" } },
          "Hover/label": { theme: { hover: "interactive" } },
          "nested-button": { className: "TextButton" },
          "nested-caption": { theme: { hover: "interactive" } },
        },
      },
      "fixed",
    );
    linkArtwork(result);
    const before = JSON.stringify(result);
    const extracted = extractComponent(result, "states:button-set");
    const wrapper = extracted.package.roots[0].children[0];
    const nodes = flatten([wrapper]);
    for (const state of ["Default", "Hover"]) {
      expect(
        nodes.find((entry) => entry.id === `variant-${state}`)?.className,
      ).toBe("TextLabel");
      expect(
        nodes.find((entry) => entry.id === `${state}/label`)?.theme?.owner,
      ).toBe(wrapper.id);
    }
    expect(nodes.find((entry) => entry.id === "nested-button")?.className).toBe(
      "TextButton",
    );
    expect(
      nodes.find((entry) => entry.id === "nested-caption")?.theme?.owner,
    ).toBe("nested-button");
    expect(() => validateExportPackage(extracted.package)).not.toThrow();
    expect(() => validatePackage(extracted.package)).not.toThrow();
    expect(JSON.stringify(result)).toBe(before);
  });
  it.each(["particles", "keyframes", "motion"] as const)(
    "remaps descendant %s input owners without changing nested owners or slots",
    (kind) => {
      const result = stateWithNestedButton();
      const behavior =
        kind === "particles"
          ? { particles: structuredClone(PARTICLE_DEFAULTS) }
          : kind === "keyframes"
            ? {
                keyframes: {
                  ...structuredClone(KEYFRAME_DEFAULTS),
                  frames: KEYFRAME_DEFAULTS.frames.map((frame, index) => ({
                    ...frame,
                    scale: 1,
                    opacity: index === 1 ? 0.5 : 1,
                  })),
                },
              }
            : { motion: { hover: structuredClone(MOTION_DEFAULTS.hover) } };
      result.package = compile(
        result.designs!,
        result.package.sourceId,
        {
          detectButtons: false,
          layerOverrides: {
            "variant-Default": { className: "TextButton" },
            "variant-Hover": { className: "TextButton" },
            "nested-button": { className: "TextButton" },
            "Default/label": { behavior },
            "Hover/label": { behavior },
            "nested-caption": { behavior },
          },
        },
        "fixed",
      );
      linkArtwork(result);
      const before = JSON.stringify(result);
      const original = new Map(
        flatten(result.package.roots).map((entry) => [entry.id, entry]),
      );
      for (const state of ["Default", "Hover"])
        expect(original.get(`${state}/label`)?.behavior?.[kind]?.owner).toBe(
          `variant-${state}`,
        );
      const extracted = extractComponent(result, "states:button-set");
      const wrapper = extracted.package.roots[0].children[0];
      const nodes = new Map(
        flatten([wrapper]).map((entry) => [entry.id, entry]),
      );
      for (const state of ["Default", "Hover"])
        expect(nodes.get(`${state}/label`)?.behavior?.[kind]).toEqual({
          ...original.get(`${state}/label`)?.behavior?.[kind],
          owner: wrapper.id,
        });
      expect(nodes.get("nested-caption")?.behavior?.[kind]).toEqual(
        original.get("nested-caption")?.behavior?.[kind],
      );
      expect(nodes.get("nested-caption")?.behavior?.[kind]?.owner).toBe(
        "nested-button",
      );
      expect(() => validateExportPackage(extracted.package)).not.toThrow();
      expect(() => validatePackage(extracted.package)).not.toThrow();
      expect(generateModel(extracted.package)).toContain("FramebridgeBehavior");
      expect(JSON.stringify(result)).toBe(before);
    },
  );
  it.each([false, true])(
    "rejects same-input nested states but preserves independent nested button states (independent=%s)",
    (independent) => {
      const result = stateWithNestedButton();
      result.package = compile(
        result.designs!,
        result.package.sourceId,
        {
          detectButtons: false,
          layerOverrides: {
            "variant-Default": { className: "TextButton" },
            "nested-button": { className: "TextButton" },
            [independent ? "nested-caption" : "Default/label"]: {
              behavior: { state: "hover" },
            },
          },
        },
        "fixed",
      );
      linkArtwork(result);
      const before = JSON.stringify(result);
      const family = reviewComponents(result).find(
        (group) => group.key === "states:button-set",
      );
      if (independent) {
        expect(family).toBeDefined();
        const extracted = extractComponent(result, family!.key);
        expect(
          flatten(extracted.package.roots).find(
            (entry) => entry.id === "nested-caption",
          )?.behavior?.state,
        ).toEqual({ kind: "hover", owner: "nested-button" });
        expect(() => validateExportPackage(extracted.package)).not.toThrow();
        expect(() => validatePackage(extracted.package)).not.toThrow();
      } else {
        expect(family).toBeUndefined();
        expect(() => extractComponent(result, "states:button-set")).toThrow(
          "Extract that variant independently",
        );
        expect(() =>
          validateExportPackage(
            extractComponent(result, "layer:variant-Default").package,
          ),
        ).not.toThrow();
      }
      expect(JSON.stringify(result)).toBe(before);
    },
  );
  it.each([false, true])(
    "keeps captured/themed text decoration on its state visual (themed=%s)",
    (themed) => {
      const variants = ["Default", "Hover"].map((state, index) => ({
        ...structuredClone(effectDesign().children[0]),
        id: `variant-${state}`,
        name: `State=${state}`,
        transform: [
          [1, 0, index * 200],
          [0, 1, 0],
        ] as [[number, number, number], [number, number, number]],
      }));
      const designs = [
        node("Decorated text states", {
          id: "decorated-set",
          type: "COMPONENT_SET",
          width: 380,
          height: 40,
          children: variants,
        }),
      ];
      const result = linkArtwork({
        designs,
        package: compile(
          designs,
          "decorated-state-fixture",
          {
            detectButtons: false,
            ...(themed && {
              themes: DEFAULT_THEMES,
              layerOverrides: {
                "variant-Default": {
                  theme: { shadow: "elevated", font: "body", color: "accent" },
                },
              },
            }),
          },
          "fixed",
        ),
        assets: {},
        previews: {},
        revision: 1,
      });
      const before = JSON.stringify(result);
      const original = flatten(result.package.roots).find(
        (entry) => entry.id === "variant-Default",
      )!;
      expect(original.textDecoration).toBeDefined();
      expect(
        themed
          ? original.textDecoration?.themeShadow
          : original.textDecoration?.captured,
      ).toBeDefined();
      const extracted = extractComponent(result, "states:decorated-set");
      const wrapper = extracted.package.roots[0].children[0];
      const visual = wrapper.children[0];
      expect(wrapper.textDecoration).toBeUndefined();
      expect(wrapper.theme).toBeUndefined();
      expect(visual.textDecoration).toEqual(original.textDecoration);
      expect(visual.theme).toEqual(original.theme);
      expect(visual.children).toEqual(original.children);
      expect(() => validateExportPackage(extracted.package)).not.toThrow();
      expect(() => validatePackage(extracted.package)).not.toThrow();
      expect(generateModel(extracted.package)).toContain(
        "FramebridgeTextDecoration",
      );
      expect(
        generateSource(extracted.package, "luau", { component: true }),
      ).toContain("FramebridgeTextDecoration");
      if (themed)
        expect(extracted.package.roots[0].themes).toEqual(
          result.package.roots[0].themes,
        );
      expect(JSON.stringify(result)).toBe(before);
    },
  );
  it("does not infer a state family from unrelated names, duplicate states or incompatible bounds", () => {
    const result = stateComponentResult();
    result.designs![0].children[1].width = 161;
    expect(reviewComponents(result).some((g) => g.kind === "states")).toBe(
      false,
    );
    result.designs![0].children[1].width = 160;
    result.designs![0].children[1].name = "State=Default";
    expect(reviewComponents(result).some((g) => g.kind === "states")).toBe(
      false,
    );
  });
  it.each(SOURCE_FORMATS)(
    "exports a grouped state template through $label with runtime state wiring",
    ({ id }) => {
      const result = stateComponentResult();
      const extracted = extractComponent(result, "states:button-set");
      const source = generateSource(extracted.package, id);
      expect(source).toContain("FramebridgeBehavior");
      expect(source).toContain("variant-Hover");
      const files = unzipSync(buildSourceExport(extracted, id).data);
      expect(strFromU8(files[`Design.${id === "tsx" ? "tsx" : "luau"}`])).toBe(
        source,
      );
      if (id === "tsx")
        expect(files["FramebridgeInteractions.luau"]).toBeDefined();
    },
  );
  it("exports native editable state objects into a model", () => {
    const extracted = extractComponent(
      stateComponentResult(),
      "states:button-set",
    );
    const model = generateModel(extracted.package);
    expect(model).toContain('class="TextButton"');
    expect(model).toContain("FramebridgeBehavior");
    expect(model.includes('<string name="Name">State=Disabled</string>')).toBe(
      true,
    );
  });
  it.each(SOURCE_FORMATS)(
    "exports a reusable $label widget instead of a UI collector",
    ({ id }) => {
      const extracted = extractComponent(
        stateComponentResult(),
        "states:button-set",
      );
      const source = generateSource(extracted.package, id, { component: true });
      expect(
        source.includes('Instance.new("ScreenGui")') ||
          source.includes('createElement("ScreenGui"') ||
          source.includes('scope:New("ScreenGui")') ||
          source.includes("<screengui"),
      ).toBe(false);
      expect(source).toContain(id === "tsx" ? "RootProps" : "rootProps");
      const files = unzipSync(
        buildSourceExport(extracted, id, { component: true }).data,
      );
      expect(strFromU8(files[`Design.${id === "tsx" ? "tsx" : "luau"}`])).toBe(
        source,
      );
      expect(strFromU8(files["READ_ME.txt"])).toContain("one GuiObject");
      expect(() =>
        generateSource(componentResult().package, id, { component: true }),
      ).toThrow("Extract");
    },
  );
  it("finds explicit state fields in any variant property order", () => {
    const result = stateComponentResult();
    result.designs![0].children.forEach((n) => (n.name += ", Theme=Dark"));
    expect(reviewComponents(result).some((g) => g.kind === "states")).toBe(
      true,
    );
    result.designs![0].children[1].name += ", State=Pressed";
    expect(reviewComponents(result).some((g) => g.kind === "states")).toBe(
      false,
    );
  });
  it("keeps template identity bounded independently of long source names", () => {
    const result = componentResult();
    result.package.sourceId = "a".repeat(256);
    expect(
      extractComponent(result, "layer:card-c").package.sourceId.length,
    ).toBeLessThan(128);
  });
});
