import React, { useMemo, useState } from "react";
import { ArrowDownToLine } from "./components/Glyph";
import {
  extractComponent,
  reviewComponents,
} from "../../../packages/core/src/reusable-components";
import { buildSourceExport } from "../../../packages/core/src/source-export";
import {
  SOURCE_FORMATS,
  type SourceFormat,
} from "../../../packages/core/src/source-code";
import { buildExport } from "../../../packages/core/src/export";
import { flatten, type AnalysisResult } from "../../../packages/core/src/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./components/ui/accordion";
import { SelectControl } from "./components/SelectControl";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

type Props = {
  result?: AnalysisResult;
  selected: string;
  disabled: boolean;
  onDownload: (name: string, data: Uint8Array, mime: string) => void;
  onError: (message: string) => void;
  beforeExport?: () => boolean;
};
function Controls({
  result,
  selected,
  disabled,
  onDownload,
  onError,
  beforeExport,
}: Props) {
  const [choice, setChoice] = useState("");
  const [name, setName] = useState<string>();
  const [format, setFormat] = useState<SourceFormat>("react");
  const [receipt, setReceipt] = useState("");
  const review = useMemo(() => {
    if (!result || disabled) return { groups: [], layer: undefined, error: "" };
    try {
      const layer = flatten(result.package.roots).find(
        (n) =>
          n.id === selected &&
          !n.className.startsWith("UI") &&
          !n.className.endsWith("Gui"),
      );
      return { groups: reviewComponents(result), layer, error: "" };
    } catch (error) {
      return {
        groups: [],
        layer: undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [result, selected, disabled]);
  const layerKey = review.layer ? `layer:${review.layer.id}` : "";
  const key =
    review.groups.some((g) => g.key === choice) ||
    (choice === layerKey && !!layerKey)
      ? choice
      : (review.groups[0]?.key ?? layerKey);
  const group = review.groups.find((g) => g.key === key);
  const defaultName = group?.name ?? review.layer?.name ?? "";
  const output = useMemo(() => {
    if (!result || disabled || !key) return { data: undefined, error: "" };
    try {
      return {
        data: extractComponent(result, key, name ?? defaultName),
        error: "",
      };
    } catch (error) {
      return {
        data: undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [result, disabled, key, name, defaultName]);
  const unavailable = disabled || !output.data;
  const download = (module: boolean) => {
    if (!output.data || disabled || beforeExport?.() === false) return;
    try {
      const file = module
        ? buildSourceExport(output.data, format, { component: true })
        : buildExport(output.data);
      onDownload(file.name, file.data, file.mime);
      setReceipt(`Downloaded ${file.name}`);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="source-export-controls">
      <label className="source-export-format">
        Component
        <SelectControl
          aria-label="Component to extract"
          value={key}
          disabled={disabled || !key}
          onChange={(event) => {
            setChoice(event.target.value);
            setName(undefined);
            setReceipt("");
          }}
        >
          {!key && <option value="">Select a layer in the preview</option>}
          {review.groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name} —{" "}
              {g.kind === "states"
                ? `${g.nodeIds.length} states`
                : `${g.nodeIds.length} matching copies`}
            </option>
          ))}
          {review.layer && (
            <option value={layerKey}>
              Selected layer: {review.layer.name}
            </option>
          )}
        </SelectControl>
      </label>
      {group && (
        <p className="muted">
          {group.reason}{" "}
          {group.states && `Included: ${Object.keys(group.states).join(", ")}.`}
        </p>
      )}
      {!key && !review.error && (
        <p className="muted">
          No matching groups found. Select a native layer to extract it, or use
          an equal-sized Figma component set with a Default state and named
          Hover, Pressed, Disabled or Selected variants.
        </p>
      )}
      <label className="source-export-format">
        Component name
        <Input
          aria-label="Component name"
          value={name ?? defaultName}
          maxLength={100}
          disabled={disabled || !key}
          onChange={(event) => {
            setName(event.target.value);
            setReceipt("");
          }}
        />
      </label>
      <label className="source-export-format">
        Source format
        <SelectControl
          aria-label="Widget source format"
          value={format}
          disabled={disabled}
          onChange={(event) => {
            setFormat(event.target.value as SourceFormat);
            setReceipt("");
          }}
        >
          {SOURCE_FORMATS.map((f) => (
            <option value={f.id} key={f.id}>
              {f.label}
            </option>
          ))}
        </SelectControl>
      </label>
      {(review.error || output.error) && (
        <p role="alert" className="source-export-notice">
          {review.error || output.error}
        </p>
      )}
      {output.data && (
        <p className="muted">
          {output.data.package.stats.instances - 1} editable instances ·{" "}
          {output.data.package.assets.length} required images.{" "}
          {output.data.package.assets.some((a) => !a.robloxId) &&
            "Unlinked PNGs and an image manifest are included."}
        </p>
      )}
      <div className="font-form">
        <Button
          variant="outline"
          size="sm"
          disabled={unavailable}
          onClick={() => download(true)}
        >
          <ArrowDownToLine size={15} />
          Download module
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={unavailable}
          onClick={() => download(false)}
        >
          <ArrowDownToLine size={15} />
          Studio template
        </Button>
      </div>
      <p className="artwork-hint">
        Modules mount in an existing screen. Studio templates include their own
        ScreenGui.
      </p>
      <p role="status" aria-live="polite">
        {receipt}
      </p>
    </div>
  );
}
export function ComponentExport(props: Props) {
  return (
    <Accordion
      type="single"
      collapsible
      className="source-export-section export-panel"
    >
      <AccordionItem value="components">
        <AccordionTrigger>Reusable component</AccordionTrigger>
        <AccordionContent>
          <Controls {...props} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
