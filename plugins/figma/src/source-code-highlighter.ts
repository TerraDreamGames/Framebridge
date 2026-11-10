import type { Token, TokenStream } from "prismjs";
import type { SourceFormat } from "../../../packages/core/src/source-code";

export type CodeSegment = { text: string; types: string[] };
export type CodeLine = CodeSegment[];
let grammars: Promise<typeof import("./source-code-grammars")> | undefined;

function loadGrammars() {
  if (!grammars) {
    // Disable Prism's DOM scanner before loading it; React owns all markup.
    const scope = globalThis as typeof globalThis & {
      Prism?: { manual?: boolean; disableWorkerMessageHandler?: boolean };
    };
    scope.Prism = {
      ...scope.Prism,
      manual: true,
      disableWorkerMessageHandler: true,
    };
    grammars = import("./source-code-grammars");
  }
  return grammars;
}

/** Preserve every source character while splitting nested syntax tokens by line. */
export async function highlightSource(
  source: string,
  format: SourceFormat,
): Promise<CodeLine[]> {
  const { Prism } = await loadGrammars();
  const language = format === "tsx" ? "tsx" : "luau";
  const lines: CodeLine[] = [[]];
  const append = (text: string, types: string[]) => {
    const parts = text.split("\n");
    parts.forEach((part, index) => {
      if (index) lines.push([]);
      if (!part) return;
      const line = lines[lines.length - 1];
      const previous = line[line.length - 1];
      if (previous && previous.types.join(" ") === types.join(" "))
        previous.text += part;
      else line.push({ text: part, types });
    });
  };
  const visit = (value: TokenStream, parent: string[] = []) => {
    if (typeof value === "string") append(value, parent);
    else if (Array.isArray(value)) value.forEach((part) => visit(part, parent));
    else {
      const token: Token = value;
      const aliases = token.alias
        ? Array.isArray(token.alias)
          ? token.alias
          : [token.alias]
        : [];
      // Keep the nearest token's style. Embedded JS must not inherit tag/string colors.
      visit(token.content, [...new Set([token.type, ...aliases])]);
    }
  };
  visit(Prism.tokenize(source, Prism.languages[language]));
  return lines;
}
