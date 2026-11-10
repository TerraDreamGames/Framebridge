import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "../packages/core/src/compiler";
import { demoDesign } from "../packages/core/src/demo";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { CodePreview } from "../plugins/figma/src/CodePreview";
import {
  highlightSource,
  type CodeLine,
} from "../plugins/figma/src/source-code-highlighter";

const original = (lines: CodeLine[]) =>
  lines.map((line) => line.map((part) => part.text).join("")).join("\n");

describe("highlighted source preview", () => {
  it.each(SOURCE_FORMATS)(
    "preserves the complete $label export, including indentation and blank lines",
    async ({ id }) => {
      const pkg = compile(
        demoDesign(),
        "source-preview",
        { layout: "responsive" },
        "fixed",
      );
      const source = generateSource(pkg, id);
      const lines = await highlightSource(source, id);
      expect(original(lines)).toBe(source);
      expect(lines).toHaveLength(source.split("\n").length);
      expect(lines.flat().some((part) => part.types.includes("keyword"))).toBe(
        true,
      );
      expect(lines.flat().some((part) => part.types.includes("string"))).toBe(
        true,
      );
    },
  );
  it("distinguishes Luau keywords, Roblox types, numbers, booleans, strings and comments", async () => {
    const source =
      '-- a comment\nexport type View = Frame\nlocal size = UDim2.new(0.5, 1_024, 0b10, 0xFF)\nlocal visible = true\ncontinue\nreturn "hello"\n';
    const lines = await highlightSource(source, "luau");
    const parts = lines.flat();
    const has = (type: string, text: string) =>
      parts.some((part) => part.types.includes(type) && part.text === text);
    expect(has("keyword", "export")).toBe(true);
    expect(has("keyword", "continue")).toBe(true);
    expect(has("builtin", "UDim2")).toBe(true);
    expect(has("number", "1_024")).toBe(true);
    expect(has("number", "0b10")).toBe(true);
    expect(has("boolean", "true")).toBe(true);
    expect(has("string", '"hello"')).toBe(true);
    expect(has("comment", "-- a comment")).toBe(true);
    expect(original(lines)).toBe(source);
  });
  it("handles TSX tags and typed expressions with the TSX grammar", async () => {
    const source =
      'const size: UDim2 = new UDim2(1, 0, 1, 0);\nreturn <frame Name="Inventory" Size={size} Visible={true} />;\n';
    const lines = await highlightSource(source, "tsx");
    const parts = lines.flat();
    expect(
      parts.some(
        (part) => part.types.includes("tag") && part.text.trim() === "frame",
      ),
    ).toBe(true);
    expect(
      parts.some(
        (part) => part.types.includes("attr-name") && part.text === "Name",
      ),
    ).toBe(true);
    expect(
      parts.some(
        (part) => part.types.includes("boolean") && part.text === "true",
      ),
    ).toBe(true);
    expect(
      parts
        .filter((part) => part.text.trim() === "size")
        .every((part) => !part.types.includes("tag")),
    ).toBe(true);
    expect(original(lines)).toBe(source);
  });
  it("retains multiline comments, long strings, Unicode, CRLF and trailing blank lines", async () => {
    const source =
      "--[=[A comment\ncontinued]=]\r\nlocal text = [==[A☃\n</code><script>alert(1)</script>]==]\nreturn text\n\n";
    const lines = await highlightSource(source, "fusion");
    expect(original(lines)).toBe(source);
    expect(lines[1][0].types).toContain("comment");
    expect(lines[3][0].types).toContain("string");
    expect(await highlightSource("", "react")).toEqual([[]]);
  });
  it("renders designer-controlled code as text, without interpreting HTML or adding line numbers to it", () => {
    const source =
      '-- </code><img src=x onerror="alert(1)">\nlocal text = "<script>"\n';
    const html = renderToStaticMarkup(
      <CodePreview source={source} format="react" />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain('data-line="1"');
    expect(html).toContain('aria-label="Generated source code"');
  });
});
