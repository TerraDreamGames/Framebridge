import { expect, it } from "vitest";
import { PROPERTY_SCHEMAS } from "../packages/core/src/editor";
import { inspectorSection } from "../plugins/figma/src/property-presentation";

it("groups real native properties by layout, appearance and input tasks", () => {
  expect(inspectorSection(PROPERTY_SCHEMAS.Frame.Size.group)).toBe("layout");
  expect(inspectorSection(PROPERTY_SCHEMAS.UIGridLayout.CellSize.group)).toBe(
    "layout",
  );
  expect(inspectorSection(PROPERTY_SCHEMAS.UICorner.CornerRadius.group)).toBe(
    "style",
  );
  expect(inspectorSection(PROPERTY_SCHEMAS.TextLabel.Text.group)).toBe("style");
  expect(inspectorSection(PROPERTY_SCHEMAS.TextBox.PlaceholderText.group)).toBe(
    "behavior",
  );
  expect(inspectorSection(PROPERTY_SCHEMAS.Frame.Active.group)).toBe(
    "behavior",
  );
});
