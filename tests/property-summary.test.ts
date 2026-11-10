import { expect, it } from "vitest";
import { propertyValueSummary } from "../plugins/figma/src/property-presentation";
import type { Value } from "../packages/core/src/types";

it("keeps scaled summaries compact without changing full-precision export values", () => {
  const value: Value = {
    type: "UDim2",
    value: [0.28125, 12345, 0.3314814814814815, 0],
  };
  const before = structuredClone(value);
  expect(propertyValueSummary(value)).toBe("{0.2813, 12345}, {0.3315, 0}");
  expect(value).toEqual(before);
  expect(propertyValueSummary({ type: "UDim", value: [0.0000001, -24] })).toBe(
    "{1.00e-7, -24}",
  );
});
