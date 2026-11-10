import { compile } from "../packages/core/src/compiler";
import { node } from "../packages/core/src/demo";
import {
  flatten,
  type AnalysisResult,
  type TextRun,
} from "../packages/core/src/types";
const text = (id: string, y: number, runs: TextRun[], height = 72) =>
  node(id, {
    id,
    type: "TEXT",
    width: 760,
    height,
    transform: [
      [1, 0, 32],
      [0, 1, y],
    ],
    text: {
      characters: runs.map((run) => run.text).join(""),
      runs,
      align: "LEFT",
      verticalAlign: "TOP",
      autoResize: "HEIGHT",
      lineHeight: 42,
    },
  });
export function richPreviewResult(): AnalysisResult {
  const mixed = text("mixed-runs", 35, [
    {
      text: "Roboto bold",
      fontFamily: "Roboto",
      fontStyle: "Bold",
      fontSize: 24,
      color: { r: 0.8, g: 0.1, b: 0.2, a: 0.75 },
    },
    {
      text: " + Source Sans italic",
      fontFamily: "Source Sans Pro",
      fontStyle: "Italic",
      fontSize: 30,
      color: { r: 0.1, g: 0.35, b: 0.9, a: 0.5 },
      underline: true,
      strike: true,
    },
  ]);
  const escaped = text("escaped-runs", 135, [
    {
      text: '<img src="bad" onerror="bad()"> &lt; ',
      fontFamily: "Roboto",
      fontStyle: "Regular",
      fontSize: 24,
      color: { r: 0.3, g: 0.2, b: 0.6 },
      underline: true,
    },
    {
      text: "escaped text",
      fontFamily: "Roboto",
      fontStyle: "Italic",
      fontSize: 24,
      color: { r: 0.1, g: 0.4, b: 0.2 },
    },
  ]);
  const large = text(
    "large-run",
    235,
    [
      {
        text: "Large native run",
        fontFamily: "Roboto",
        fontStyle: "Regular",
        fontSize: 100,
        color: { r: 0.15, g: 0.2, b: 0.25 },
        underline: true,
      },
    ],
    175,
  );
  const scaled = text(
    "scaled-runs",
    440,
    [
      {
        text: "Small",
        fontFamily: "Roboto",
        fontStyle: "Regular",
        fontSize: 24,
        color: { r: 0.2, g: 0.2, b: 0.2 },
      },
      {
        text: " LARGE",
        fontFamily: "Roboto",
        fontStyle: "Bold",
        fontSize: 48,
        color: { r: 0.5, g: 0.1, b: 0.1 },
      },
    ],
    110,
  );
  const pkg = compile(
    [
      node("Rich text preview", {
        id: "rich-screen",
        width: 830,
        height: 600,
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        children: [mixed, escaped, large, scaled],
      }),
    ],
    "rich-preview-fixture",
    {
      layerOverrides: {
        "rich-screen": {
          behavior: {
            rules: [
              {
                id: "preview-text",
                branches: [
                  {
                    when: {
                      mode: "all",
                      predicates: [
                        {
                          source: "attribute",
                          key: "Demo",
                          operator: "eq",
                          value: "plain",
                        },
                      ],
                    },
                    then: [
                      {
                        target: "mixed-runs",
                        property: "Text",
                        value: "<b>literal rule & text</b>",
                      },
                      {
                        target: "mixed-runs",
                        property: "TextTransparency",
                        value: 0.5,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        "mixed-runs": { properties: { TextTransparency: 0.2 } },
        "scaled-runs": {
          properties: { TextScaled: true },
          components: { textSize: { MinTextSize: 1, MaxTextSize: 50 } },
        },
      },
    },
    "2026-10-03T12:00:00Z",
  );
  if (pkg.issues.some((issue) => issue.severity === "error"))
    throw new Error(JSON.stringify(pkg.issues));
  return { package: pkg, assets: {}, previews: {}, revision: 1 };
}
export function richPreviewNode(id: string) {
  return flatten(richPreviewResult().package.roots).find(
    (node) => node.id === id,
  )!;
}

/** The first italic source run previously made the later regular run inherit italic in Studio. */
export function mixedItalicPreviewResult(
  fontOverride?: Extract<
    import("../packages/core/src/types").Value,
    { type: "Font" }
  >,
): AnalysisResult {
  const runs = [
    {
      text: "MMMM\n",
      fontFamily: "Roboto",
      fontStyle: "Italic",
      fontSize: 24,
      color: { r: 0.2, g: 0.2, b: 0.2 },
    },
    {
      text: "MMMM",
      fontFamily: "Roboto",
      fontStyle: "Regular",
      fontSize: 24,
      color: { r: 0.2, g: 0.2, b: 0.2 },
    },
  ];
  const pkg = compile(
    [
      node("Mixed italic then normal", {
        id: "mixed-style-screen",
        width: 420,
        height: 160,
        children: [text("mixed-style-text", 30, runs, 90)],
      }),
    ],
    "mixed-style-fixture",
    fontOverride
      ? {
          layerOverrides: {
            "mixed-style-text": { properties: { FontFace: fontOverride } },
          },
        }
      : {},
    "2026-10-03T12:00:00Z",
  );
  return { package: pkg, assets: {}, previews: {}, revision: 1 };
}
