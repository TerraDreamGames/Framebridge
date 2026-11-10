import { describe, expect, it } from "vitest";
import { createPropertyDraftRegistry } from "../plugins/figma/src/property-drafts";

describe("mounted property draft ownership", () => {
  it("keeps other rejected fields blocked after correcting or disposing one field", () => {
    const changes: unknown[] = [];
    const drafts = createPropertyDraftRegistry((issues) =>
      changes.push(issues),
    );
    const rotation = {},
      position = {};
    drafts.report(rotation, {
      label: "Image · Rotation",
      message: "Enter a number.",
    });
    drafts.report(position, {
      label: "Image · Position",
      message: "Enter a number.",
    });
    drafts.report(rotation, undefined);
    expect(drafts.isBlocked()).toBe(true);
    expect(changes[changes.length - 1]).toEqual([
      { label: "Image · Position", message: "Enter a number.", id: 2 },
    ]);
    drafts.report(position, undefined);
    expect(drafts.isBlocked()).toBe(false);
    expect(changes[changes.length - 1]).toEqual([]);
  });

  it("cannot let an old field cleanup remove a replacement field with the same label", () => {
    const changes: { id: number; label: string; message: string }[][] = [];
    const drafts = createPropertyDraftRegistry((issues) =>
      changes.push(issues),
    );
    const old = {},
      replacement = {};
    const issue = { label: "Rotation", message: "Enter a number." };
    drafts.report(old, issue);
    drafts.report(replacement, issue);
    expect(changes[changes.length - 1].map((entry) => entry.id)).toEqual([
      1, 2,
    ]);
    drafts.report(old, undefined);
    expect(drafts.isBlocked()).toBe(true);
    expect(changes[changes.length - 1]).toEqual([{ ...issue, id: 2 }]);
    drafts.report(replacement, undefined);
    expect(drafts.isBlocked()).toBe(false);
  });
});
