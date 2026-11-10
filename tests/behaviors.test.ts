import { describe, expect, it } from "vitest";
import {
  applyBehaviors,
  layerBehavior,
  validLayerBehavior,
  validateBehaviors,
} from "../packages/core/src/behaviors";
import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import { validateExportPackage } from "../packages/core/src/export-package";
import { flatten } from "../packages/core/src/types";
import { behaviorDesign, behaviorPackage } from "./behavior-fixtures";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { buildSourceExport } from "../packages/core/src/source-export";
import { generateModel } from "../packages/core/src/model-export";
import { unzipSync, strFromU8 } from "fflate";
import {
  BEHAVIOR_RUNTIME,
  BEHAVIOR_VERSION,
  BEHAVIOR_CLIENT_SOURCE,
} from "../packages/core/src/behavior-runtime.mjs";
import { validatePackage } from "../packages/relay/src/protocol";
import { createOverrideHistory } from "../plugins/figma/src/override-history";
const get = (pkg: ReturnType<typeof behaviorPackage>, id: string) =>
  flatten(pkg.roots).find((n) => n.id === id)!;
describe("optional UI interactions", () => {
  it("validates interactions at the relay boundary and rejects executable data", () => {
    const pkg = behaviorPackage();
    expect(() => validatePackage(pkg)).not.toThrow();
    get(pkg, "open").behavior!.action!.target = "missing";
    expect(() => validatePackage(pkg)).toThrow("Invalid UI interaction data");
    const executable = behaviorPackage();
    (get(executable, "open").behavior as any).source = "print('code')";
    expect(() => validatePackage(executable)).toThrow(
      "Invalid UI interaction data",
    );
  });
  it("undoes and redoes nested interaction settings without retaining mutated snapshots", () => {
    const history = createOverrideHistory();
    const before = {
      open: { behavior: { action: { kind: "open" as const, target: "shop" } } },
    };
    const next = {
      open: {
        behavior: { action: { kind: "toggle" as const, target: "shop" } },
      },
    };
    expect(history.record(before, next)).toBe(true);
    before.open.behavior.action.target = "renamed-after-snapshot";
    const undone = history.undo(next)!;
    expect(
      behaviorPackage({ layerOverrides: undone })
        .roots.flatMap((root) => flatten([root]))
        .find((n) => n.id === "open")!.behavior!.action,
    ).toEqual({ kind: "open", target: "shop" });
    expect(history.redo(undone)).toEqual(next);
  });
  it("exports behavior metadata and an owned client runtime across source/model formats", () => {
    const pkg = behaviorPackage();
    for (const format of SOURCE_FORMATS) {
      const source = generateSource(pkg, format.id);
      expect(source).toContain("FramebridgeBehavior");
      expect(source).toContain("FramebridgeSource");
      if (format.id !== "tsx") expect(source).toContain("Runtime.mount");
    }
    const result = {
      package: pkg,
      designs: behaviorDesign(),
      assets: {},
      previews: {},
      revision: 1,
    };
    const files = unzipSync(buildSourceExport(result, "tsx").data);
    expect(strFromU8(files["FramebridgeInteractions.luau"])).toBe(
      BEHAVIOR_RUNTIME + "\n",
    );
    const xml = generateModel(pkg);
    expect(xml).toContain('class="LocalScript"');
    expect(xml).toContain('name="Source"');
    expect(xml.includes(`Framebridge generated interactions v${BEHAVIOR_VERSION}`)).toBe(true);
  });
  it("resolves actions to stable same-screen identities and retains initially hidden panels and states", () => {
    const pkg = behaviorPackage();
    expect(pkg.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(get(pkg, "open").className).toBe("TextButton");
    expect(get(pkg, "open").behavior?.action).toEqual({
      kind: "open",
      target: "shop",
    });
    expect(get(pkg, "close").behavior?.action).toEqual({
      kind: "close",
      target: "shop",
    });
    expect(get(pkg, "shop").properties.Visible).toBe(false);
    expect(get(pkg, "visual-hover").behavior?.state).toEqual({
      kind: "hover",
      owner: "open",
    });
    expect(get(pkg, "open-label").className).toBe("TextLabel");
    expect(get(pkg, "coins").behavior?.binding).toEqual({
      source: "leaderstats",
      key: "Coins",
      template: "Coins: {value}",
    });
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
  it("explicit off and configuration replace naming tags", () => {
    expect(
      layerBehavior(node("Shop [panel]"), { behavior: false }),
    ).toBeUndefined();
    expect(
      layerBehavior(node("Button [open:Shop]"), {
        behavior: { role: "panel" },
      }),
    ).toEqual({ role: "panel" });
    expect(layerBehavior(node("Button_open"))).toBeUndefined();
    const pkg = behaviorPackage({
      layerOverrides: { open: { behavior: false } },
    });
    expect(get(pkg, "open").behavior).toBeUndefined();
  });
  it("keeps name-tag actions wired when only the exported panel name changes", () => {
    const pkg = behaviorPackage({
      layerOverrides: { shop: { name: "Renamed export" } },
    });
    expect(pkg.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(get(pkg, "open").behavior?.action?.target).toBe("shop");
  });
  it("configured targets survive source renaming and use initial visibility", () => {
    const pkg = behaviorPackage({
      layerOverrides: {
        open: { behavior: { action: { kind: "open", target: "shop" } } },
        shop: {
          name: "Store",
          behavior: { role: "panel", initialVisible: true },
        },
      },
    });
    expect(get(pkg, "open").behavior?.action?.target).toBe("shop");
    expect(get(pkg, "shop").name).toBe("Store");
    expect(get(pkg, "shop").properties.Visible).toBe(true);
  });
  it("blocks missing, ambiguous, excluded and cross-screen targets", () => {
    for (const target of ["Missing", "screen:screen"]) {
      const pkg = behaviorPackage({
        layerOverrides: {
          open: { behavior: { action: { kind: "open", target } } },
        },
      });
      expect(
        pkg.issues.some((i) => i.nodeId === "open" && i.severity === "error"),
      ).toBe(true);
    }
    const designs = behaviorDesign();
    designs[0].children.push(node("Shop [panel]", { id: "duplicate" }));
    expect(
      compile(designs, "test").issues.some(
        (i) => i.nodeId === "open" && i.severity === "error",
      ),
    ).toBe(true);
    const pkg = behaviorPackage({
      layerOverrides: { shop: { renderMode: "skip" } },
    });
    expect(
      pkg.issues.some((i) => i.nodeId === "open" && i.severity === "error"),
    ).toBe(true);
  });
  it("requires one visual per state and an ancestor button", () => {
    const designs = behaviorDesign();
    designs[0].children
      .find((n) => n.id === "open")!
      .children.push(node("Extra [state:hover]", { id: "extra" }));
    const pkg = compile(designs, "test");
    expect(pkg.issues.some((i) => i.message.includes("one visual"))).toBe(true);
    const orphan = compile([node("Orphan [state:hover]")], "test");
    expect(orphan.issues.some((i) => i.message.includes("owning button"))).toBe(
      true,
    );
  });
  it("rejects explicit non-button actions and rasterized interaction hierarchies", () => {
    const pkg = behaviorPackage({
      layerOverrides: { open: { className: "Frame" } },
    });
    expect(pkg.issues.some((i) => i.message.includes("action needs"))).toBe(
      true,
    );
    const raster = behaviorPackage({
      layerOverrides: { screen: { renderMode: "image" } },
    });
    expect(
      raster.issues.some(
        (i) => i.code === "behavior-raster" && i.severity === "error",
      ),
    ).toBe(true);
  });
  it("only wires tab panels directly inside a tab group", () => {
    const pkg = behaviorPackage({
      layerOverrides: { tabs: { behavior: false } },
    });
    expect(pkg.issues.some((i) => i.message.includes("tab group"))).toBe(true);
  });
  it("does not bake a container carrying configured interactions", () => {
    const designs = behaviorDesign();
    designs[0].effects = ["LAYER_BLUR"];
    const pkg = compile(designs, "test");
    expect(get(pkg, "screen").assetRef).toBeUndefined();
    expect(get(pkg, "open").behavior?.action?.target).toBe("shop");
  });
  it.each([
    null,
    false,
    [],
    { state: ["hover"] },
    { binding: { source: ["attribute"], key: "Coins", template: "{value}" } },
    { action: { kind: "open" } },
    { action: { kind: "close", target: "" } },
    { source: "return code" },
    {
      binding: {
        source: "attribute",
        key: "Parent.Source",
        template: "{value}",
      },
    },
  ])("rejects malformed author settings %j", (value) => {
    expect(validLayerBehavior(value)).toBe(false);
  });
  it("validates transfer ownership and unknown executable fields", () => {
    const pkg = behaviorPackage();
    get(pkg, "open").behavior!.action!.target = "other-root";
    expect(() => validateBehaviors(pkg.roots)).toThrow("same screen");
    const other = behaviorPackage();
    (get(other, "open").behavior as any).source = "print('code')";
    expect(() => validateBehaviors(other.roots)).toThrow("Invalid interaction");
    get(other, "open").behavior = { state: { kind: "hover", owner: "open" } };
    expect(() => validateBehaviors(other.roots)).toThrow("state visual");
  });
  it("does not infer application behavior from ordinary layer names", () => {
    expect(
      compile([node("Open shop")], "test").roots[0].children[0].behavior,
    ).toBeUndefined();
    expect(layerBehavior(node("Panel"))).toBeUndefined();
  });
});
