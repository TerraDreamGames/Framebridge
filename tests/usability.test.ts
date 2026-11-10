import { describe, it, expect } from "vitest";
import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import {
  flatten,
  type AnalysisResult,
  type DesignNode,
  type LayerOverride,
  type Paint,
} from "../packages/core/src/types";
import {
  checkUsability,
  contrastRatio,
  DEFAULT_CHECKS,
} from "../plugins/figma/src/usability";
import { usabilityResult } from "./usability-fixtures";
const solid = (r: number, g = r, b = r) => [
  { type: "SOLID", color: { r, g, b } },
];
const label = (
  id = "label",
  color = 0.5,
  size = 16,
  style = "Regular",
  value = "Account",
) =>
  node("Account label", {
    id,
    type: "TEXT",
    width: 120,
    height: 35,
    transform: [
      [1, 0, 10],
      [0, 1, 10],
    ],
    text: {
      characters: value,
      align: "LEFT",
      verticalAlign: "TOP",
      autoResize: "WIDTH_AND_HEIGHT",
      runs: [
        {
          text: value,
          fontFamily: "Roboto",
          fontStyle: style,
          fontSize: size,
          color: { r: color, g: color, b: color },
        },
      ],
    },
  });
function result(
  children: DesignNode[],
  overrides: Record<string, LayerOverride> = {},
  background: Paint[] = solid(1),
): AnalysisResult {
  const designs = [
    node("Account screen", {
      id: "screen",
      width: 600,
      height: 400,
      fills: background,
      children,
    }),
  ];
  return {
    designs,
    package: compile(designs, "usability-qa", { layerOverrides: overrides }),
    assets: {},
    previews: {},
    revision: 1,
  };
}
const codes = (r: AnalysisResult) =>
  checkUsability(r).findings.map((f) => f.code);
describe("local usability review", () => {
  it("exercises all five categories and removes findings after explicit corrections", () => {
    const before = checkUsability(usabilityResult());
    expect(new Set(before.findings.map((f) => f.category))).toEqual(
      new Set(["names", "contrast", "targets", "text", "cues"]),
    );
    expect(checkUsability(usabilityResult(true)).findings).toEqual([]);
  });
  it("measures independent sRGB reference ratios without rounding a threshold", () => {
    expect(contrastRatio([0, 0, 0], [1, 1, 1])).toBe(21);
    expect(contrastRatio([1, 1, 1], [1, 1, 1])).toBe(1);
    const ratio = contrastRatio([119 / 255, 119 / 255, 119 / 255], [1, 1, 1]);
    expect(ratio).toBeCloseTo(4.478089, 5);
    const report = checkUsability(result([label("grey", 119 / 255)]));
    expect(
      report.findings.find((f) => f.code === "low-contrast")?.measurements
        ?.ratio,
    ).toBeCloseTo(ratio, 3);
  });
  it("uses size and bold style for large-text references", () => {
    expect(codes(result([label("normal", 0.5, 20)]))).toContain("low-contrast");
    expect(codes(result([label("bold", 0.5, 20, "Bold")]))).not.toContain(
      "low-contrast",
    );
    expect(codes(result([label("large", 0.5, 25)]))).not.toContain(
      "low-contrast",
    );
  });
  it("composites alpha text and transparent solid parents onto a known backdrop", () => {
    const r = result(
      [
        node("Card", {
          id: "card",
          fills: solid(0),
          children: [{ ...label("inner", 0), width: 80 }],
        }),
      ],
      { card: { properties: { BackgroundTransparency: 0.5 } } },
    );
    expect(
      checkUsability(r).findings.some(
        (f) => f.nodeId === "inner" && f.code === "low-contrast",
      ),
    ).toBe(false);
    expect(checkUsability(r).coverage.contrast.unverified).toBe(0);
    const text = result([label("alpha", 0)], {
      alpha: { properties: { TextTransparency: 0.5 } },
    });
    expect(codes(text)).toContain("low-contrast");
  });
  it("does not invent a white backdrop for transparent roots", () => {
    const r = result([label("unknown", 0.1)], {}, []);
    const report = checkUsability(r);
    expect(report.findings.some((f) => f.code === "contrast-unverified")).toBe(
      true,
    );
    expect(report.findings.some((f) => f.code === "low-contrast")).toBe(false);
    expect(report.coverage.contrast.unverified).toBe(1);
  });
  it("does not certify image, gradient, rotated or composited backgrounds", () => {
    const backgrounds = [
      [{ type: "IMAGE", imageHash: "abc" }],
      [
        {
          type: "GRADIENT_LINEAR",
          gradientStops: [
            { position: 0, color: { r: 1, g: 1, b: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 0 } },
          ],
        },
      ],
    ];
    for (const background of backgrounds)
      expect(codes(result([label()], {}, background))).toContain(
        "contrast-unverified",
      );
    expect(
      codes(result([label()], { label: { properties: { Rotation: 5 } } })),
    ).toContain("contrast-unverified");
    const group = node("Faded group", {
      id: "group",
      type: "GROUP",
      opacity: 0.5,
      children: [
        node("Opaque card", {
          id: "opaque",
          fills: solid(1),
          children: [label()],
        }),
      ],
    });
    expect(codes(result([group]))).toContain("contrast-unverified");
  });
  it("marks overlap uncertainty while allowing separated sibling text", () => {
    const first = label("one", 0),
      second = label("two", 0);
    second.transform[1][2] = 80;
    expect(
      checkUsability(result([first, second])).coverage.contrast.unverified,
    ).toBe(0);
    second.transform[1][2] = 15;
    expect(
      checkUsability(result([first, second])).coverage.contrast.unverified,
    ).toBe(2);
  });
  it("reads each generated RichText run and treats arbitrary RichText as unverified", () => {
    const text = label("rich", 0);
    text.text!.runs.push({
      ...text.text!.runs[0],
      text: " warning",
      color: { r: 0.9, g: 0.9, b: 0.9 },
    });
    text.text!.characters += " warning";
    expect(codes(result([text]))).toContain("low-contrast");
    expect(
      codes(
        result([text], {
          rich: { properties: { Text: "<b>Custom</b>", RichText: true } },
        }),
      ),
    ).toContain("contrast-unverified");
  });
  it("uses effective class, target geometry, scale and name overrides", () => {
    const r = result(
      [node("Frame 9", { id: "control", width: 20, height: 20 })],
      {
        control: {
          className: "TextButton",
          name: "CloseButton",
          properties: { Size: { type: "UDim2", value: [0, 48, 0, 48] } },
        },
      },
    );
    expect(codes(r)).not.toContain("small-target");
    expect(codes(r)).not.toContain("generated-name");
    const small = result(
      [node("Close button", { id: "control", width: 60, height: 60 })],
      {
        control: {
          className: "ImageButton",
          components: { scale: { Scale: 0.5 } },
        },
      },
    );
    const target = checkUsability(small).findings.find(
      (f) => f.code === "small-target",
    );
    expect(target?.measurements?.width).toBe(30);
  });
  it("applies aspect and size constraints outside flow, and grid-owned cell sizes", () => {
    const constrained = result(
      [node("Close button", { id: "control", width: 60, height: 60 })],
      {
        control: {
          components: {
            aspect: { AspectRatio: 2 },
            size: { MaxSize: { type: "Vector2", value: [50, 50] } },
          },
        },
      },
    );
    expect(
      checkUsability(constrained).findings.find(
        (f) => f.code === "small-target",
      )?.measurements,
    ).toMatchObject({ width: 50, height: 30 });
    const grid = node("Choices", {
      id: "grid",
      width: 200,
      height: 100,
      children: [
        node("Choice button", { id: "choice", width: 60, height: 60 }),
      ],
    });
    const r = result([grid], {
      grid: {
        components: {
          grid: { CellSize: { type: "UDim2", value: [0, 20, 0, 20] } },
        },
      },
    });
    expect(
      checkUsability(r).findings.find(
        (f) => f.nodeId === "choice" && f.code === "small-target",
      )?.measurements?.width,
    ).toBe(20);
  });
  it("lets target reference change and ignores deliberately inactive/hidden controls", () => {
    const r = result([
      node("Close button", { id: "button", width: 32, height: 32 }),
    ]);
    expect(codes(r)).toContain("small-target");
    expect(
      checkUsability(r, { ...DEFAULT_CHECKS, targetSize: 24 }).findings.some(
        (f) => f.code === "small-target",
      ),
    ).toBe(false);
    expect(
      codes(
        result(
          [node("Close button", { id: "button", width: 10, height: 10 })],
          { button: { properties: { Visible: false } } },
        ),
      ),
    ).not.toContain("small-target");
    const hidden = node("Hidden button", {
      id: "hidden",
      width: 10,
      height: 10,
      visible: false,
    });
    expect(codes(result([hidden]))).not.toContain("small-target");
  });
  it("reports duplicate native siblings and generated names but ignores raster decoration children", () => {
    const a = node("Frame 1", { id: "a" }),
      b = node("Frame 1", { id: "b" });
    b.transform[0][2] = 150;
    const r = result([
      a,
      b,
      node("Decoration [raster]", {
        id: "art",
        children: [node("Rectangle 1", { id: "hidden-art-child" })],
      }),
    ]);
    const report = checkUsability(r);
    expect(
      report.findings.filter((f) => f.code === "duplicate-sibling"),
    ).toHaveLength(2);
    expect(report.findings.some((f) => f.nodeId === "hidden-art-child")).toBe(
      false,
    );
    expect(
      checkUsability(
        result([a, b], { a: { name: "LeftPanel" }, b: { name: "RightPanel" } }),
      ).findings.some((f) => f.category === "names"),
    ).toBe(false);
  });
  it("flags explicit multiline height risk, unbounded scaling and fixed wrapped review", () => {
    const text = label("clipped", 0, 20, "Regular", "Hello\nWorld");
    text.height = 25;
    expect(codes(result([text]))).toContain("text-height-risk");
    expect(
      codes(
        result([text], {
          clipped: {
            properties: {
              AutomaticSize: { type: "Enum", value: ["AutomaticSize", "Y"] },
            },
          },
        }),
      ),
    ).not.toContain("text-height-risk");
    expect(
      codes(result([text], { clipped: { properties: { TextScaled: true } } })),
    ).toContain("unbounded-text-scaling");
    expect(
      codes(
        result([text], {
          clipped: {
            properties: { TextScaled: true },
            components: { textSize: { MinTextSize: 15, MaxTextSize: 24 } },
          },
        }),
      ),
    ).not.toContain("unbounded-text-scaling");
    const wrapped = label("wrapped", 0);
    wrapped.text!.autoResize = "NONE";
    expect(codes(result([wrapped]))).toContain("wrapped-text-review");
  });
  it("checks configured TextBox placeholders, text/color changes and text size", () => {
    const r = result([label("input", 0)], {
      input: {
        className: "TextBox",
        properties: {
          Text: "",
          PlaceholderText: "Enter\nName",
          TextSize: 30,
          Size: { type: "UDim2", value: [0, 120, 0, 20] },
        },
      },
    });
    expect(codes(r)).toContain("text-height-risk");
    expect(
      codes(
        result([label("fixed", 0.8)], {
          fixed: {
            properties: {
              TextColor3: { type: "Color3", value: [0, 0, 0] },
              TextSize: 10,
            },
          },
        }),
      ),
    ).not.toContain("low-contrast");
    expect(
      codes(
        result([label("fixed", 0.8)], {
          fixed: { properties: { TextSize: 10 } },
        }),
      ),
    ).toContain("small-text");
  });
  it("finds likely red/green states only when non-color content also matches", () => {
    const state = (id: string, name: string, color: number[]) =>
      node(name, {
        id,
        width: 100,
        height: 60,
        fills: solid(...(color as [number, number, number])),
        transform: [
          [1, 0, id === "red" ? 10 : 150],
          [0, 1, 100],
        ],
        children: [{ ...label(`${id}-label`, 1), width: 80 }],
      });
    const red = state("red", "Status error", [1, 0, 0]),
      green = state("green", "Status success", [0, 0.8, 0]);
    expect(codes(result([red, green]))).toContain("color-only-state");
    green.children[0].text!.characters = "Success";
    green.children[0].text!.runs[0].text = "Success";
    expect(codes(result([red, green]))).not.toContain("color-only-state");
  });
  it("honors effective non-color corrections on state variants", () => {
    const red = node("Status error", {
      id: "red",
      fills: solid(1, 0, 0),
      width: 60,
      height: 60,
    });
    const green = node("Status success", {
      id: "green",
      fills: solid(0, 1, 0),
      width: 60,
      height: 60,
      transform: [
        [1, 0, 100],
        [0, 1, 0],
      ],
    });
    expect(codes(result([red, green]))).toContain("color-only-state");
    expect(
      codes(result([red, green], { green: { properties: { Rotation: 10 } } })),
    ).not.toContain("color-only-state");
  });
  it("supports opt-out without conversion mutations or export blockers", () => {
    const r = result([label("poor", 0.95)]),
      before = JSON.stringify(r);
    const report = checkUsability(r, {
      names: false,
      contrast: false,
      targets: false,
      text: false,
      cues: false,
      targetSize: 44,
    });
    expect(report.findings).toEqual([]);
    expect(JSON.stringify(r)).toBe(before);
    expect(report.coverage.contrast.examined).toBe(0);
    checkUsability(r);
    expect(JSON.stringify(r)).toBe(before);
    expect(r.package.issues.some((f) => f.code === "low-contrast")).toBe(false);
  });
  it("requires visual review for baked text and text extending beyond its background", () => {
    expect(
      codes(result([label("baked", 0)], { baked: { renderMode: "image" } })),
    ).toContain("baked-text-review");
    const card = node("Card", {
      id: "card",
      width: 80,
      height: 60,
      fills: solid(0),
      children: [label("overhang", 1)],
    });
    expect(codes(result([card]))).toContain("contrast-unverified");
  });
  it("bounds findings and handles a large selection deterministically", () => {
    const children = Array.from({ length: 800 }, (_, i) =>
      node(`Frame ${i}`, {
        id: `n${i}`,
        width: 10,
        height: 10,
        transform: [
          [1, 0, i * 20],
          [0, 1, 0],
        ],
      }),
    );
    const report = checkUsability(result(children));
    expect(report.findings).toHaveLength(500);
    expect(report.omitted).toBe(300);
    expect(report.checkedLayers).toBe(801);
    expect(flatten(result(children).package.roots)).toHaveLength(802);
  });
  it("pairs a large state sheet by non-color content and preserves bounded related names", () => {
    const states = Array.from({ length: 600 }, (_, i) =>
      node("Status error", {
        id: `red-${i}`,
        fills: solid(1, 0, 0),
        width: 60,
        height: 60,
        children: [label(`red-label-${i}`, 0, 16, "Regular", `State ${i}`)],
      }),
    );
    const counterparts = states
      .map((state, i) => ({
        ...state,
        id: `green-${i}`,
        name: "Status success",
        fills: solid(0, 1, 0),
        children: [{ ...state.children[0], id: `green-label-${i}` }],
      }))
      .reverse();
    const report = checkUsability(result([...states, ...counterparts]), {
      ...DEFAULT_CHECKS,
      names: false,
      contrast: false,
      targets: false,
      text: false,
    });
    expect(report.coverage.cues.examined).toBe(600);
    expect(report.findings).toHaveLength(500);
    expect(report.omitted).toBe(100);
    expect(report.findings.every((f) => f.code === "color-only-state")).toBe(
      true,
    );
    expect(report.findings[0].related).toEqual([
      { id: "green-0", name: "Status success" },
    ]);
    const duplicateReport = checkUsability(result(states), {
      ...DEFAULT_CHECKS,
      cues: false,
      contrast: false,
      targets: false,
      text: false,
    });
    expect(
      duplicateReport.findings.every((f) => (f.related?.length ?? 0) <= 8),
    ).toBe(true);
    expect(
      duplicateReport.findings.every(
        (f) => !f.related?.some((r) => r.id === f.nodeId),
      ),
    ).toBe(true);
  });
});

describe("native font units in text contrast", () => {
  it("does not grant normalized Roboto bold17 a large-text exemption", () => {
    const r = result([label("small-bold", 0.5, 17, "Bold")]);
    expect(
      flatten(r.package.roots).find((n) => n.id === "small-bold")!.properties
        .TextSize,
    ).toBe(19);
    const finding = checkUsability(r).findings.find(
      (f) => f.code === "low-contrast",
    );
    expect(finding?.measurements?.reference).toBe(4.5);
  });
  it("uses the actual truncated em boundary for regular text", () => {
    expect(codes(result([label("near", 0.5, 24)]))).toContain("low-contrast");
    expect(codes(result([label("large", 0.5, 25)]))).not.toContain(
      "low-contrast",
    );
  });
  it("keeps raw Roblox overrides in native units when checking contrast", () => {
    const r = result([label("raw", 0.5, 30, "Bold")], {
      raw: { properties: { TextSize: 19 } },
    });
    expect(
      checkUsability(r).findings.find((f) => f.code === "low-contrast")
        ?.measurements?.reference,
    ).toBe(4.5);
  });
  it("checks every mixed-font span in its destination em units", () => {
    const n = label("mixed", 0.5, 17, "Bold");
    n.text!.characters = "First Second";
    n.text!.runs[0].text = "First";
    n.text!.runs.push({
      ...n.text!.runs[0],
      text: " Second",
      fontFamily: "Source Sans Pro",
      fontStyle: "Regular",
      fontSize: 26,
    });
    const report = checkUsability(result([n]));
    expect(
      report.findings.find((f) => f.code === "low-contrast")?.measurements
        ?.reference,
    ).toBe(4.5);
    expect(report.coverage.contrast.unverified).toBe(0);
  });
  it("discloses unknown metrics and uses normal-text contrast despite a large raw size", () => {
    const r = result([label("custom", 0.5, 60, "Bold")], {
      custom: {
        properties: {
          FontFace: {
            type: "Font",
            family: "rbxassetid://123",
            weight: "Bold",
            style: "Normal",
          },
          TextSize: 60,
        },
      },
    });
    const report = checkUsability(r);
    expect(
      report.findings.find((f) => f.code === "low-contrast")?.measurements
        ?.reference,
    ).toBe(4.5);
    expect(
      report.findings.find((f) => f.code === "contrast-unverified")?.message,
    ).toContain("font metrics");
    expect(report.coverage.contrast.unverified).toBe(1);
  });
  it("checks the em-size readability heuristic without using it for line-fit geometry", () => {
    const r = result([label("small", 0, 11)]);
    expect(
      flatten(r.package.roots).find((n) => n.id === "small")!.properties
        .TextSize,
    ).toBe(12);
    const finding = checkUsability(r).findings.find(
      (f) => f.code === "small-text",
    );
    expect(Number(finding?.measurements?.fontSize)).toBeCloseTo(10.24, 2);
  });
});

describe("unverified rich-text size data", () => {
  it("reports malformed hand-edited sizes without throwing during metric inversion", () => {
    const r = result([label("malformed", 0)], {
      malformed: {
        properties: {
          RichText: true,
          Text: '<font family="rbxasset://fonts/families/Roboto.json" weight="Regular" size="." color="rgb(0,0,0)" transparency="0">Unknown size</font>',
        },
      },
    });
    expect(codes(r)).toContain("contrast-unverified");
  });
});

describe("displayed native text size", () => {
  it("does not exempt text that inherited UIScale shrinks below the large-text boundary", () => {
    const r = result([label("shrunk", 0.5, 48)], {
      screen: { components: { scale: { Scale: 0.5 } } },
    });
    const report = checkUsability(r);
    expect(
      report.findings.find((f) => f.code === "low-contrast")?.measurements
        ?.reference,
    ).toBe(4.5);
    expect(report.coverage.contrast.unverified).toBe(0);
  });
  it("uses the cumulative scale when the parent and text both scale", () => {
    const r = result([label("shrunk", 0.5, 48)], {
      screen: { components: { scale: { Scale: 0.5 } } },
      shrunk: { components: { scale: { Scale: 0.5 } } },
    });
    expect(
      checkUsability(r).findings.find((f) => f.code === "small-text")
        ?.measurements?.fontSize,
    ).toBeCloseTo(11.94667);
  });
  it("withholds a large-text exemption for TextScaled without a measured effective fit", () => {
    const r = result([label("scaled", 0.5, 48)], {
      scaled: {
        properties: { TextScaled: true },
        components: { textSize: { MinTextSize: 1, MaxTextSize: 100 } },
      },
    });
    const report = checkUsability(r);
    expect(
      report.findings.find((f) => f.code === "low-contrast")?.measurements
        ?.reference,
    ).toBe(4.5);
    expect(
      report.findings.find((f) => f.code === "contrast-unverified")?.message,
    ).toContain("Scaled text");
    expect(report.coverage.contrast.unverified).toBe(1);
  });
  it("inverts oversized tagged heights without capping them at the property limit", () => {
    const n = label("oversized", 0, 100);
    n.text!.runs[0].underline = true;
    const r = result([n], {
      oversized: { components: { scale: { Scale: 0.1 } } },
    });
    const report = checkUsability(r);
    expect(
      report.findings.find((f) => f.code === "small-text")?.measurements
        ?.fontSize,
    ).toBeCloseTo(9.984);
  });
});

describe("native minimum text-size readability", () => {
  it.each([
    [14, 1, true],
    [15, 1, false],
    [28, 0.5, true],
    [30, 0.5, false],
  ] as const)(
    "checks native minimum%s atscale%s in displayed em units",
    (minimum, scale, flagged) => {
      const r = result([label("scaled", 0, 48)], {
        screen: { components: { scale: { Scale: scale } } },
        scaled: {
          properties: { TextScaled: true },
          components: { textSize: { MinTextSize: minimum, MaxTextSize: 100 } },
        },
      });
      expect(codes(r).includes("unbounded-text-scaling")).toBe(flagged);
    },
  );
  it("discloses unknown minimum-size metrics rather than claiming a readable bound", () => {
    const r = result([label("scaled", 0, 48)], {
      scaled: {
        properties: {
          TextScaled: true,
          FontFace: {
            type: "Font",
            family: "rbxassetid://123",
            weight: "Regular",
            style: "Normal",
          },
        },
        components: { textSize: { MinTextSize: 14, MaxTextSize: 100 } },
      },
    });
    const report = checkUsability(r, { ...DEFAULT_CHECKS, contrast: false });
    expect(
      report.findings.some((f) => f.code === "scaled-text-size-unverified"),
    ).toBe(true);
    expect(report.coverage.text.unverified).toBe(1);
  });
});
