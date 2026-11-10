import { describe, expect, it } from "vitest";
import { interactionExamplePackage } from "../packages/core/src/interaction-examples";
import { MOTION_DEFAULTS } from "../packages/core/src/motion";
import { createPreviewUI } from "../plugins/figma/src/preview-interactions";

const preview = () =>
  createPreviewUI(
    interactionExamplePackage({
      layerOverrides: {
        shop: {
          behavior: {
            role: "panel",
            initialVisible: false,
            motion: { enter: { ...MOTION_DEFAULTS.enter, kind: "slide" } },
          },
        },
        inventory: {
          behavior: { role: "panel", motion: { float: MOTION_DEFAULTS.float } },
        },
        settings: {
          behavior: { role: "panel", motion: { pulse: MOTION_DEFAULTS.pulse } },
        },
      },
    }).roots[0],
  );

describe("local UI simulation", () => {
  it("uses the parent button when artwork receives pointer input", () => {
    const ui = preview();
    expect(ui.owner("open-label")).toBe("open");
    expect(ui.owner("coins")).toBe("");
    ui.setHover(ui.owner("open-label"));
    expect(ui.state("open")).toBe("hover");
    expect(ui.visible.get("visual-hover")).toBe(true);
    expect(ui.visible.get("visual-default")).toBe(false);
  });
  it("gives presses priority over hover and keyboard focus and restores the fallback", () => {
    const ui = preview();
    ui.setFocus("open");
    ui.setPress("open");
    expect(ui.state("open")).toBe("pressed");
    expect(ui.visible.get("visual-pressed")).toBe(true);
    ui.setPress("");
    expect(ui.state("open")).toBe("hover");
    ui.setFocus("");
    expect(ui.state("open")).toBe("default");
  });
  it("opens, closes and toggles the real panel and its layout slot together", () => {
    const ui = preview();
    expect(ui.isVisible("coins")).toBe(false);
    expect(ui.activate("open")).toBe(true);
    expect(ui.isVisible("coins")).toBe(true);
    expect(ui.visible.get("shop/motion-slot")).toBe(true);
    expect(ui.activate("close")).toBe(true);
    expect(ui.visible.get("shop/motion-slot")).toBe(false);
    ui.activate("toggle");
    expect(ui.isVisible("coins")).toBe(true);
    ui.activate("toggle");
    expect(ui.isVisible("coins")).toBe(false);
  });
  it("changes tabs through their logical parent and updates selected appearances", () => {
    const ui = preview();
    expect(ui.isVisible("inventory")).toBe(true);
    expect(ui.state("inventory-tab")).toBe("selected");
    ui.activate("settings-tab");
    expect(ui.isVisible("settings")).toBe(true);
    expect(ui.isVisible("inventory")).toBe(false);
    expect(ui.visible.get("settings/motion-slot")).toBe(true);
    expect(ui.visible.get("inventory-selected")).toBe(false);
    expect(ui.visible.get("settings-selected")).toBe(true);
  });
  it("rejects hidden and disabled input while preserving disabled visuals", () => {
    const ui = preview();
    expect(ui.activate("close")).toBe(false);
    ui.byId.get("open")!.properties.Interactable = false;
    ui.setHover("open");
    ui.setPress("open");
    expect(ui.state("open")).toBe("disabled");
    expect(ui.visible.get("visual-disabled")).toBe(true);
    expect(ui.activate("open")).toBe(false);
    ui.byId.get("open")!.properties.Interactable = true;
    expect(ui.state("open")).toBe("default");
  });
});
