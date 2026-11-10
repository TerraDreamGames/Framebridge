import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  parsePreviewRichText,
  previewFontFamily,
  previewRichRunStyle,
} from "../plugins/figma/src/rich-text-preview";
import { RobloxPreview } from "../plugins/figma/src/RobloxPreview";
import { DEFAULT_PREVIEW_VIEWPORT } from "../plugins/figma/src/preview-viewport";
import {
  richPreviewNode,
  mixedItalicPreviewResult,
  richPreviewResult,
} from "./rich-text-preview-fixture";
import { createPreviewUI } from "../plugins/figma/src/preview-interactions";
import type { Value } from "../packages/core/src/types";
const roboto = {
  type: "Font",
  family: "rbxasset://fonts/families/Roboto.json",
  weight: "Regular",
  style: "Normal",
} as const;
const parse = (text: string) => parsePreviewRichText(text, roboto, 28);
const render = (data = richPreviewResult()) =>
  renderToStaticMarkup(
    <RobloxPreview
      result={data}
      active="rich-screen"
      selected=""
      onSelect={() => {}}
      zoom={1}
      viewportChoice={DEFAULT_PREVIEW_VIEWPORT}
      onViewportChange={() => {}}
    />,
  );
describe("typed RichText preview", () => {
  it("renders real compiler runs with each face's native height conversion and decorations", () => {
    const node = richPreviewNode("mixed-runs");
    const parsed = parsePreviewRichText(
      String(node.properties.Text),
      node.properties.FontFace as Extract<Value, { type: "Font" }>,
      Number(node.properties.TextSize),
    );
    expect(parsed.supported).toBe(true);
    expect(parsed.runs.map((run) => run.text)).toEqual([
      "Roboto bold",
      " + Source Sans italic",
    ]);
    const styles = parsed.runs.map((run) => previewRichRunStyle(run, 1.5));
    expect(styles[0].fontSize).toBeCloseTo(28 / (2400 / 2048));
    expect(styles[0]).toMatchObject({
      fontWeight: 700,
      fontStyle: "normal",
      lineHeight: "42px",
      color: "rgba(204,26,51,calc(var(--preview-text-alpha,1) * 0.75))",
    });
    expect(styles[1]).toMatchObject({
      fontFamily: '"Source Sans Pro", sans-serif',
      fontStyle: "italic",
      lineHeight: "55.5px",
      textDecorationLine: "underline line-through",
    });
    expect(styles[1].fontSize).toBeCloseTo(37 / 1.257);
  });
  it("retains tagged sizes above 100 and does not turn them into capped base sizes", () => {
    const runs = parse(
      String(richPreviewNode("large-run").properties.Text),
    ).runs;
    expect(runs[0].size).toBe(117);
    expect(previewRichRunStyle(runs[0], 1).fontSize).toBeCloseTo(99.84);
    expect(previewRichRunStyle(runs[0], 1).lineHeight).toBe("117px");
  });
  it("decodes source escapes exactly once after recognizing structural tags", () => {
    const value = parse(
      "<u>&lt;img onerror=&quot;x&quot;&gt; &amp;lt; &apos; &gt;</u>",
    );
    expect(value.plainText).toBe('<img onerror="x"> &lt; \' >');
    expect(value.runs[0].underline).toBe(true);
    expect(value.supported).toBe(true);
  });
  it("restores inherited family, weight, color, and size after nested tags close", () => {
    const parsed = parse(
      '<font color="#ff0000" size="40"><b>A<i>B</i></b><font weight="200" color="rgb(0, 20, 255)" transparency=".5">C</font>D</font>E',
    );
    expect(parsed.supported).toBe(true);
    expect(
      parsed.runs.map((run) => [
        run.text,
        run.size,
        run.font?.weight,
        run.font?.style,
        run.color,
        run.alpha,
      ]),
    ).toEqual([
      ["A", 40, "Bold", "Normal", [255, 0, 0], 1],
      ["B", 40, "Bold", "Italic", [255, 0, 0], 1],
      ["C", 40, "ExtraLight", "Normal", [0, 20, 255], 0.5],
      ["D", 40, "Regular", "Normal", [255, 0, 0], 1],
      ["E", 28, "Regular", "Normal", undefined, 1],
    ]);
    expect(roboto).toEqual({
      type: "Font",
      family: "rbxasset://fonts/families/Roboto.json",
      weight: "Regular",
      style: "Normal",
    });
  });
  it("preserves whitespace, explicit breaks and documented comments", () => {
    expect(
      parse(" one\n<u> two</u><br />three<!-- hidden --> ").plainText,
    ).toBe(" one\n two\nthree ");
  });
  it("uses a conservative raw-size fallback for custom metrics without deriving a multiplier", () => {
    const parsed = parse(
      '<font family="rbxassetid://123" size="150">Unknown</font>',
    );
    expect(parsed.supported).toBe(true);
    expect(previewRichRunStyle(parsed.runs[0], 2)).toMatchObject({
      fontSize: 150,
      fontFamily: "sans-serif",
      lineHeight: 2.4,
    });
    expect(
      previewFontFamily({
        ...roboto,
        family: "rbxasset://fonts/families/GothamSSm.json",
      }),
    ).toBe('"Montserrat", sans-serif');
  });
  it.each([
    "<b>unclosed",
    "<b><i>bad</b></i>",
    '<font size="28.5">fraction</font>',
    '<font size="0">zero</font>',
    '<font size="1e9">exponent</font>',
    '<font size="99999999999999999">unsafe</font>',
    '<font weight="constructor">bad</font>',
    '<font weight="__proto__">bad</font>',
    '<font color="rgb(256,0,0)">bad</font>',
    '<font transparency="1.1">bad</font>',
    '<font family="https://invalid/font">bad</font>',
    '<font family="rbxasset://fonts/families/Roboto.json" onclick="bad()">bad</font>',
    '<font color="#000000" color="#ffffff">duplicate</font>',
    "<img src=x onerror=bad()>",
    "<script>bad()</script>",
    '<stroke thickness="2">Unsupported stroke</stroke>',
    '<u style="color:red">Unsupported style</u>',
    "<b>dangling<",
  ])("keeps unsupported or invalid input literal and inert: %s", (source) => {
    expect(parse(source)).toMatchObject({
      supported: false,
      plainText: source,
      runs: [{ text: source }],
    });
  });
  it("bounds nested input while preserving the complete source on fallback", () => {
    const text = "<b>".repeat(64) + "deep" + "</b>".repeat(64);
    expect(parse(text).plainText).toBe(text);
    expect(parse(text).supported).toBe(false);
  });
});
describe("mixed source italic inheritance", () => {
  const properties = (result: ReturnType<typeof mixedItalicPreviewResult>) =>
    result.package.roots[0].children
      .flatMap((node) => node.children)
      .find((node) => node.id === "mixed-style-text")!.properties;
  it("uses a neutral generated base so the later source Regular run stays normal natively and in preview", () => {
    const p = properties(mixedItalicPreviewResult());
    expect(p.FontFace).toEqual({ ...roboto, style: "Normal" });
    expect(p.TextSize).toBe(28);
    expect(String(p.Text).match(/<i>/g)).toHaveLength(1);
    const parsed = parsePreviewRichText(
      String(p.Text),
      p.FontFace as typeof roboto,
      Number(p.TextSize),
    );
    expect(parsed.supported).toBe(true);
    expect(
      parsed.runs.map((run) => [run.text, run.font?.style, run.size]),
    ).toEqual([
      ["MMMM\n", "Italic", 28],
      ["MMMM", "Normal", 28],
    ]);
    expect(previewRichRunStyle(parsed.runs[0], 1).fontStyle).toBe("italic");
    expect(previewRichRunStyle(parsed.runs[1], 1).fontStyle).toBe("normal");
  });
  it.each(["Italic", "Normal"])(
    "preserves an explicit native %s FontFace override on the label and every generated run",
    (style) => {
      const override = { ...roboto, style };
      const p = properties(mixedItalicPreviewResult(override));
      expect(p.FontFace).toEqual(override);
      expect(String(p.Text).match(/<i>/g)?.length ?? 0).toBe(
        style === "Italic" ? 2 : 0,
      );
      const parsed = parsePreviewRichText(
        String(p.Text),
        override,
        Number(p.TextSize),
      );
      expect(parsed.runs.map((run) => run.font?.style)).toEqual([style, style]);
    },
  );
});

describe("preview rendering and rule ownership", () => {
  it("keeps all runs inside one inline text flow and safely escapes tag-looking source text", () => {
    const html = render();
    expect(html).toContain('data-preview-rich-text="supported"');
    expect(html).toContain("--preview-text-alpha:0.8");
    expect(html).toContain('data-preview-text-content="true"');
    expect(html).toContain('data-preview-rich-run="0"');
    expect(html).toContain("text-decoration-line:underline line-through");
    expect(html).toContain("font-size:99.84px");
    expect(html).toContain(
      "&lt;img src=&quot;bad&quot; onerror=&quot;bad()&quot;&gt; &amp;lt;",
    );
    expect(html).not.toMatch(/<img|<script|onerror="bad/);
  });
  it("renders relative scaled runs using visible text instead of the markup byte count", () => {
    const html = render();
    const text = html.match(
      /data-preview-text="scaled-runs"[\s\S]*?<\/div><\/div>/,
    )?.[0];
    expect(text).toContain("font-size:42.666666666666664px");
    expect(text).toContain("font-size:85.33333333333333px");
    expect(text).toContain("line-height:150px");
  });
  it("does not alter native exported markup, sizes or font properties during preview rendering", () => {
    const result = richPreviewResult();
    const before = structuredClone(result.package);
    render(result);
    expect(result.package).toEqual(before);
  });
  it("leaves ordinary text and unsupported RichText visible as literal text", () => {
    const result = richPreviewResult();
    const label =
      result.package.roots[0].children
        .flatMap((node) => node.children)
        .find((node) => node.id === "mixed-runs") ??
      result.package.roots[0].children.find(
        (node) => node.id === "mixed-runs",
      )!;
    label.properties.Text = "<script>bad()</script>";
    const html = render(result);
    expect(html).toContain('data-preview-rich-text="literal"');
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    label.properties.RichText = false;
    expect(render(result)).toContain("&lt;script&gt;bad()&lt;/script&gt;");
  });
  it("records active rule Text separately from possible ownership so fallback can restore authored spans", () => {
    const result = richPreviewResult();
    const ui = createPreviewUI(result.package.roots[0]);
    expect(ui.ruleProperties.get("mixed-runs")?.has("Text")).toBe(true);
    expect(ui.ruleBindings.get("mixed-runs")?.has("Text")).toBeFalsy();
    ui.setData({ attribute: { Demo: "plain" } });
    expect(ui.ruleBindings.get("mixed-runs")?.has("Text")).toBe(true);
    expect(ui.properties.get("mixed-runs")?.Text).toBe(
      "<b>literal rule & text</b>",
    );
    ui.setData({ attribute: {} });
    expect(ui.ruleBindings.get("mixed-runs")?.has("Text")).toBeFalsy();
    expect(ui.properties.get("mixed-runs")?.Text).toBe(
      richPreviewNode("mixed-runs").properties.Text,
    );
  });
});
