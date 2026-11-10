import React, { useMemo, useState } from "react";
import { ArrowDownToLine, Copy, TriangleAlert } from "./components/Glyph";
import {
  generateSource,
  SOURCE_FORMATS,
  type SourceFormat,
} from "../../../packages/core/src/source-code";
import { buildSourceExport } from "../../../packages/core/src/source-export";
import type { AnalysisResult } from "../../../packages/core/src/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./components/ui/accordion";
import { Button } from "./components/ui/button";
import { CodePreview } from "./CodePreview";
import { SelectControl } from "./components/SelectControl";

function SourceControls({
  result,
  disabled,
  onDownload,
  onCopyFallback,
  onError,
  beforeExport,
}: Props) {
  const [format, setFormat] = useState<SourceFormat>("react");
  const [copied, setCopied] = useState("");
  const [preview, setPreview] = useState(false);
  const output = useMemo(() => {
    if (!result || disabled) return { source: "", error: "" };
    try {
      return { source: generateSource(result.package, format), error: "" };
    } catch (error) {
      return {
        source: "",
        error:
          error instanceof Error ? error.message : "Could not generate source.",
      };
    }
  }, [result, format, disabled]);
  const unavailable = disabled || !output.source || !!output.error;
  const pending =
    result?.package.assets.filter((asset) => !asset.robloxId).length ?? 0;
  return (
    <div className="source-export-controls">
      {result?.package.roots.some((root) => root.worldUI) && (
        <p className="source-export-notice">
          World UI needs targets supplied by your game: a Part for a surface, a
          Part or Attachment for a billboard, or a Custom-style ProximityPrompt.
          The generated module documents its target argument. Mount world UI
          under PlayerGui so its input and client behavior can run.
        </p>
      )}
      <label className="source-export-format">
        Source format
        <SelectControl
          value={format}
          aria-label="Source format"
          disabled={disabled}
          onChange={(event) => {
            setFormat(event.target.value as SourceFormat);
            setCopied("");
          }}
        >
          {SOURCE_FORMATS.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </SelectControl>
      </label>
      {pending > 0 && (
        <p className="source-export-notice">
          <TriangleAlert size={14} /> {pending} unlinked image
          {pending === 1 ? "" : "s"}. Download includes PNGs and a binding
          manifest.
        </p>
      )}
      {output.error && (
        <p role="alert" className="source-export-notice">
          {output.error}
        </p>
      )}
      <div className="font-form">
        <Button
          variant="outline"
          size="sm"
          disabled={unavailable}
          onClick={() => {
            if (unavailable || !result || beforeExport?.() === false) return;
            try {
              const file = buildSourceExport(result, format);
              onDownload(file.name, file.data, file.mime);
            } catch (error) {
              onError(error instanceof Error ? error.message : String(error));
            }
          }}
        >
          <ArrowDownToLine size={15} /> Download source
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={unavailable}
          onClick={async () => {
            if (unavailable || beforeExport?.() === false) return;
            try {
              await navigator.clipboard.writeText(output.source);
              setCopied(output.source);
            } catch {
              onCopyFallback(output.source);
            }
          }}
        >
          <Copy size={15} />{" "}
          {copied && copied === output.source ? "Copied" : "Copy code"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={unavailable}
          aria-expanded={preview}
          onClick={() => {
            if (!unavailable && beforeExport?.() !== false)
              setPreview(!preview);
          }}
        >
          {preview ? "Hide code" : "Preview code"}
        </Button>
      </div>
      {preview && <CodePreview source={output.source} format={format} />}
    </div>
  );
}
type Props = {
  result?: AnalysisResult;
  disabled: boolean;
  onDownload: (name: string, data: Uint8Array, mime: string) => void;
  onCopyFallback: (source: string) => void;
  onError: (error: string) => void;
  beforeExport?: () => boolean;
};
export function SourceExport(props: Props) {
  return (
    <Accordion
      type="single"
      collapsible
      className="source-export-section export-panel"
    >
      <AccordionItem value="source">
        <AccordionTrigger>Source code</AccordionTrigger>
        <AccordionContent>
          <SourceControls {...props} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
