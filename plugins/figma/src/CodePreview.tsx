import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import type { SourceFormat } from "../../../packages/core/src/source-code";
import { formatShortcut } from "./keyboard-shortcuts";
import { highlightSource, type CodeLine } from "./source-code-highlighter";
import { Button } from "./components/ui/button";
import "./code-preview.css";

export function CodePreview({
  source,
  format,
}: {
  source: string;
  format: SourceFormat;
}) {
  const [wrapped, setWrapped] = useState(false);
  const [highlighted, setHighlighted] = useState<{
    source: string;
    format: SourceFormat;
    lines: CodeLine[];
  }>();
  const [colorError, setColorError] = useState(false);
  const code = useRef<HTMLElement>(null);
  const descriptionId = useId();
  const plain = useMemo(
    () => source.split("\n").map((text) => (text ? [{ text, types: [] }] : [])),
    [source],
  );
  const lines =
    highlighted?.source === source && highlighted.format === format
      ? highlighted.lines
      : plain;
  useEffect(() => {
    let cancelled = false;
    setColorError(false);
    // Show readable plain text first; loading syntax colors never delays Analyze.
    const task = window.setTimeout(() => {
      void highlightSource(source, format)
        .then((lines) => {
          if (!cancelled) setHighlighted({ source, format, lines });
        })
        .catch(() => {
          if (!cancelled) setColorError(true);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(task);
    };
  }, [source, format]);
  return (
    <div className="source-code-viewer" data-wrapped={wrapped}>
      <div className="source-code-heading">
        <span>{format === "tsx" ? "Design.tsx" : "Design.luau"}</span>
        <span className="source-code-language">
          {format === "tsx" ? "TSX" : "Luau"} · {lines.length.toLocaleString()}{" "}
          lines
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={wrapped}
          onClick={() => setWrapped((value) => !value)}
        >
          Wrap lines
        </Button>
      </div>
      <div
        className="source-code-scroll"
        role="region"
        aria-label="Generated source code"
        aria-describedby={descriptionId}
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            !event.altKey &&
            event.key.toLowerCase() === "a" &&
            code.current
          ) {
            event.preventDefault();
            event.stopPropagation();
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(code.current);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }}
        onCopy={(event) => {
          const selection = window.getSelection();
          if (!code.current || !selection?.rangeCount) return;
          const range = selection.getRangeAt(0);
          if (
            range.startContainer === code.current &&
            range.startOffset === 0 &&
            range.endContainer === code.current &&
            range.endOffset === code.current.childNodes.length
          ) {
            event.clipboardData.setData("text/plain", source);
            event.preventDefault();
          }
        }}
      >
        <pre
          style={
            {
              "--code-gutter-width": `${Math.max(2, String(lines.length).length) + 3}ch`,
            } as React.CSSProperties
          }
        >
          <code ref={code} data-language={format === "tsx" ? "tsx" : "luau"}>
            {lines.map((line, index) => (
              <Fragment key={index}>
                <span className="source-code-line" data-line={index + 1}>
                  <span className="source-code-line-body">
                    {line.map((segment, n) =>
                      segment.types.length ? (
                        <span
                          className={`token ${segment.types.join(" ")}`}
                          key={n}
                        >
                          {segment.text}
                        </span>
                      ) : (
                        segment.text
                      ),
                    )}
                  </span>
                </span>
                {index < lines.length - 1 ? "\n" : null}
              </Fragment>
            ))}
          </code>
        </pre>
      </div>
      <span id={descriptionId} className="sr-only">
        Read-only source. {formatShortcut("A")} selects all code. Copy code and
        Download source include the complete generated module.
      </span>
      {colorError && (
        <p role="status" className="source-code-status">
          Syntax colors couldn’t load. Code is still available to copy or
          download.
        </p>
      )}
    </div>
  );
}
