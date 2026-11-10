import { describe, expect, it } from "vitest";
import type { Issue } from "../packages/core/src/types";
import { groupConversionNotes } from "../plugins/figma/src/conversion-notes";

const imageNotes = (count: number): Issue[] =>
  Array.from({ length: count }, (_, i) => [
    {
      nodeId: String(i),
      nodeName: `Artwork ${i}`,
      code: "asset-required",
      message: "Upload this image.",
      severity: "warning" as const,
    },
    {
      nodeId: String(i),
      nodeName: `Artwork ${i}`,
      code: "raster-fallback",
      message: "Exported as an image to preserve image fill.",
      severity: "info" as const,
    },
  ]).flat();

describe("conversion note triage", () => {
  it("reduces repeated image findings without losing a layer or the original counts", () => {
    const notes = imageNotes(37);
    const groups = groupConversionNotes(notes);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => [g.count, g.layers.length, g.action])).toEqual([
      [37, 37, "images"],
      [37, 37, "layer"],
    ]);
    expect(groups[0].layers.map((l) => l.id)).toEqual(
      Array.from({ length: 37 }, (_, i) => String(i)),
    );
    expect(notes).toHaveLength(74);
  });
  it("keeps different conversion reasons and severity levels separate, with errors first", () => {
    const issues: Issue[] = [
      ...imageNotes(1),
      {
        nodeId: "blur",
        nodeName: "Blur",
        code: "raster-fallback",
        message: "Exported as an image to preserve blur.",
        severity: "info",
      },
      {
        nodeId: "button",
        nodeName: "Button",
        code: "behavior-raster",
        message: "An interaction would be flattened.",
        severity: "error",
      },
    ];
    const groups = groupConversionNotes(issues);
    expect(groups.map((g) => g.severity)).toEqual([
      "error",
      "warning",
      "info",
      "info",
    ]);
    expect(
      groups.filter((g) => g.code === "raster-fallback").map((g) => g.message),
    ).toEqual([
      "Exported as an image to preserve image fill.",
      "Exported as an image to preserve blur.",
    ]);
    expect(
      groupConversionNotes(issues, "attention").map((g) => g.severity),
    ).toEqual(["error", "warning"]);
    expect(groupConversionNotes(issues, "info")).toHaveLength(2);
  });
  it("searches within affected layers instead of showing every layer in a matched group", () => {
    const groups = groupConversionNotes(
      imageNotes(37),
      "all",
      "  artwork 36  ",
    );
    expect(groups).toHaveLength(2);
    expect(
      groups.every((g) => g.layers.length === 1 && g.layers[0].id === "36"),
    ).toBe(true);
    expect(
      groupConversionNotes(imageNotes(2), "attention", "images need linking")[0]
        .layers,
    ).toHaveLength(2);
    expect(groupConversionNotes(imageNotes(2), "all", "not found")).toEqual([]);
  });
  it("distinguishes layers with identical names and only removes duplicate layer links", () => {
    const [issue] = imageNotes(1);
    const [group] = groupConversionNotes([
      issue,
      { ...issue },
      { ...issue, nodeId: "another" },
    ]);
    expect(group.count).toBe(3);
    expect(group.layers.map((l) => l.id)).toEqual(["0", "another"]);
  });
  it("routes substituted fonts to settings and keeps unfamiliar note types visible", () => {
    const [image] = imageNotes(1);
    const groups = groupConversionNotes([
      { ...image, code: "font-substitution", message: "Map this font." },
      {
        ...image,
        code: "new-conversion-feature",
        message: "A future converter diagnostic.",
      },
    ]);
    expect(groups[0].action).toBe("fonts");
    expect(groups[1]).toMatchObject({
      title: "New conversion feature",
      action: "layer",
      message: "A future converter diagnostic.",
    });
    expect(groupConversionNotes([])).toEqual([]);
  });
});
