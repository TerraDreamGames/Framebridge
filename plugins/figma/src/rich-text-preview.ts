import type { CSSProperties } from "react";
import type { Value } from "../../../packages/core/src/types";
import { richFontEmSize } from "../../../packages/core/src/font-size-metrics";

type FontFace = Extract<Value, { type: "Font" }>;
type Tag = "font" | "b" | "i" | "u" | "s";
export type RichPreviewRun = {
  text: string;
  font?: FontFace;
  size: number;
  color?: readonly [number, number, number];
  alpha: number;
  underline: boolean;
  strike: boolean;
};
export type RichPreviewText = {
  runs: RichPreviewRun[];
  plainText: string;
  supported: boolean;
};
const weights: Record<string, FontFace["weight"]> = {
  thin: "Thin",
  extralight: "ExtraLight",
  light: "Light",
  regular: "Regular",
  medium: "Medium",
  semibold: "SemiBold",
  bold: "Bold",
  extrabold: "ExtraBold",
  heavy: "Heavy",
};
const numericWeights = Object.values(weights);
const entities: Record<string, string> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
};
/** Decode once, after tokenization: escaped tag-looking text never becomes a tag. */
function unescape(text: string) {
  return text.replace(
    /&(lt|gt|quot|apos|amp);/g,
    (_, name: string) => entities[name],
  );
}
function attributes(raw: string) {
  const out = new Map<string, string>();
  let rest = raw;
  while (rest.trim()) {
    const match = /^\s+([a-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(rest);
    if (!match || out.size >= 5) return undefined;
    const key = match[1].toLowerCase();
    if (out.has(key)) return undefined;
    out.set(key, unescape(match[2] ?? match[3]));
    rest = rest.slice(match[0].length);
  }
  return out;
}
function rgb(raw: string) {
  const hex = /^#([0-9a-f]{6})$/i.exec(raw);
  if (hex)
    return [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16)) as [
      number,
      number,
      number,
    ];
  const match = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(raw);
  const channels = match?.slice(1).map(Number);
  return channels?.every((n) => n <= 255)
    ? (channels as [number, number, number])
    : undefined;
}
function fontAttributes(base: RichPreviewRun, attrs: Map<string, string>) {
  const next = { ...base, font: base.font && { ...base.font } };
  for (const [key, value] of attrs) {
    if (key === "family") {
      if (
        !/^(?:rbxasset:\/\/fonts\/families\/[A-Za-z0-9_]+\.json|rbxassetid:\/\/[1-9]\d{0,19})$/.test(
          value,
        )
      )
        return undefined;
      next.font = {
        type: "Font",
        family: value,
        weight: next.font?.weight ?? "Regular",
        style: next.font?.style ?? "Normal",
      };
    } else if (key === "weight") {
      const key = value.toLowerCase();
      const named = Object.prototype.hasOwnProperty.call(weights, key)
        ? weights[key]
        : undefined;
      const numeric = /^[1-9]00$/.test(value)
        ? numericWeights[Number(value) / 100 - 1]
        : undefined;
      const weight = named ?? numeric;
      if (!weight) return undefined;
      next.font = {
        type: "Font",
        family:
          next.font?.family ?? "rbxasset://fonts/families/SourceSansPro.json",
        weight,
        style: next.font?.style ?? "Normal",
      };
    } else if (key === "size") {
      const size = /^\d+$/.test(value) ? Number(value) : NaN;
      if (!Number.isSafeInteger(size) || size < 1) return undefined;
      next.size = size;
    } else if (key === "color") {
      const color = rgb(value);
      if (!color) return undefined;
      next.color = color;
    } else if (key === "transparency") {
      const transparency = /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)
        ? Number(value)
        : NaN;
      if (
        !Number.isFinite(transparency) ||
        transparency < 0 ||
        transparency > 1
      )
        return undefined;
      next.alpha = 1 - transparency;
    } else return undefined;
  }
  return next;
}
/** A closed RichText subset; unsupported/malformed input remains literal text. No HTML parser, URLs, or source attributes enter the DOM. */
export function parsePreviewRichText(
  text: string,
  font: FontFace | undefined,
  size: number,
): RichPreviewText {
  const base: RichPreviewRun = {
    text: "",
    font,
    size,
    alpha: 1,
    underline: false,
    strike: false,
  };
  const literal = (): RichPreviewText => ({
    runs: [{ ...base, text }],
    plainText: text,
    supported: false,
  });
  // Bounds protect the interactive preview; the complete source remains visible on fallback.
  if (text.length > 1_000_000) return literal();
  const stack: { tag?: Tag; run: RichPreviewRun }[] = [{ run: base }];
  const runs: RichPreviewRun[] = [];
  const append = (value: string) => {
    if (value) runs.push({ ...stack[stack.length - 1].run, text: value });
  };
  let at = 0,
    tokens = 0;
  while (at < text.length) {
    const open = text.indexOf("<", at);
    if (open < 0) {
      append(unescape(text.slice(at)));
      break;
    }
    append(unescape(text.slice(at, open)));
    if (++tokens > 10_000) return literal();
    if (text.startsWith("<!--", open)) {
      const end = text.indexOf("-->", open + 4);
      if (end < 0) return literal();
      at = end + 3;
      continue;
    }
    // Scan quoted values as data, including > inside an invalid family value.
    let end = open + 1,
      quote = "";
    for (; end < text.length; end++) {
      const char = text[end];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end >= text.length) return literal();
    const token = text.slice(open + 1, end);
    at = end + 1;
    if (/^br\s*\/\s*$/i.test(token)) {
      append("\n");
      continue;
    }
    const closing = /^\/(font|b|i|u|s)\s*$/i.exec(token);
    if (closing) {
      if (
        stack.length === 1 ||
        stack[stack.length - 1].tag !== closing[1].toLowerCase()
      )
        return literal();
      stack.pop();
      continue;
    }
    const opening = /^(font|b|i|u|s)(\s[\s\S]*)?$/i.exec(token);
    if (!opening || stack.length >= 64) return literal();
    const tag = opening[1].toLowerCase() as Tag;
    let next = { ...stack[stack.length - 1].run };
    if (tag === "font") {
      const attrs = attributes(opening[2] ?? "");
      const value = attrs && fontAttributes(next, attrs);
      if (!value) return literal();
      next = value;
    } else {
      if (opening[2]?.trim()) return literal();
      if (tag === "b" || tag === "i")
        next.font = {
          type: "Font",
          family:
            next.font?.family ?? "rbxasset://fonts/families/SourceSansPro.json",
          weight: tag === "b" ? "Bold" : (next.font?.weight ?? "Regular"),
          style: tag === "i" ? "Italic" : (next.font?.style ?? "Normal"),
        };
      if (tag === "u") next.underline = true;
      if (tag === "s") next.strike = true;
    }
    stack.push({ tag, run: next });
  }
  if (stack.length !== 1) return literal();
  return {
    runs,
    plainText: runs.map((run) => run.text).join(""),
    supported: true,
  };
}
const browserFamilies: Record<string, string> = {
  Arial: "Arimo",
  GothamSSm: "Montserrat",
  SourceSansPro: "Source Sans Pro",
  RobotoMono: "Roboto Mono",
  RobotoCondensed: "Roboto Condensed",
  FredokaOne: "Fredoka One",
};
export function previewFontFamily(font?: FontFace) {
  const name =
    font &&
    /^rbxasset:\/\/fonts\/families\/([A-Za-z0-9_]+)\.json$/.exec(
      font.family,
    )?.[1];
  return name
    ? `"${Object.prototype.hasOwnProperty.call(browserFamilies, name) ? browserFamilies[name] : name}", sans-serif`
    : "sans-serif";
}
export function previewFontWeight(font?: FontFace) {
  return font ? (numericWeights.indexOf(font.weight) + 1) * 100 || 400 : 400;
}
export function previewRichRunStyle(
  run: RichPreviewRun,
  lineHeight: number,
): CSSProperties {
  const em = richFontEmSize(run.size, run.font);
  return {
    fontFamily: previewFontFamily(run.font),
    fontWeight: previewFontWeight(run.font),
    fontStyle: run.font?.style === "Italic" ? "italic" : "normal",
    fontSize: em ?? run.size,
    lineHeight:
      em === undefined ? lineHeight * 1.2 : `${run.size * lineHeight}px`,
    // Label transparency composes with run transparency, without changing explicit run colors.
    color: run.color
      ? `rgba(${run.color.join(",")},calc(var(--preview-text-alpha,1) * ${run.alpha}))`
      : undefined,
    opacity: run.color ? undefined : run.alpha,
    textDecorationLine:
      [run.underline && "underline", run.strike && "line-through"]
        .filter(Boolean)
        .join(" ") || undefined,
  };
}
