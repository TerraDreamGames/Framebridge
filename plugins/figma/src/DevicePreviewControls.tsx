import React, { useEffect, useId, useState } from "react";
import { Monitor, RotateCw } from "./components/Glyph";
import { Popover } from "radix-ui";
import { Button } from "./components/ui/button";
import { SelectControl } from "./components/SelectControl";
import {
  PREVIEW_PRESETS,
  parsePreviewDimension,
  previewViewportSize,
  type PreviewViewport,
} from "./preview-viewport";

function Dimension({
  axis,
  value,
  onCommit,
}: {
  axis: "width" | "height";
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  const message = useId();
  useEffect(() => {
    setDraft(String(value));
    setError(false);
  }, [value]);
  return (
    <label className="preview-dimension">
      <span>{axis === "width" ? "Width" : "Height"}</span>
      <input
        aria-label={`Preview ${axis}`}
        aria-invalid={error}
        aria-describedby={error ? message : undefined}
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(false);
        }}
        onBlur={(event) => {
          const next = parsePreviewDimension(event.target.value);
          setDraft(String(next ?? value));
          setError(next === undefined);
          if (next !== undefined && next !== value) onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.value = String(value);
            setDraft(String(value));
            setError(false);
            event.currentTarget.blur();
          } else if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="preview-dimension-unit" aria-hidden="true">
        px
      </span>
      {error && (
        <span id={message} className="preview-dimension-error" role="alert">
          Use a whole number from 64 to 8192 pixels. Previous size kept.
        </span>
      )}
    </label>
  );
}

export function DevicePreviewControls({
  choice,
  authored,
  onChange,
}: {
  choice: PreviewViewport;
  authored: readonly [number, number];
  onChange: (choice: PreviewViewport) => void;
}) {
  const [width, height] = previewViewportSize(choice, authored);
  const resize = (custom: [number, number]) =>
    onChange({ preset: "custom", rotated: false, custom });
  return (
    <div
      className="device-preview-controls"
      role="group"
      aria-label="UI viewport"
    >
      <SelectControl
        aria-label="Preview device"
        className="preview-device-select"
        renderOption={(_value, label) => (
          <span className="preview-device-label">
            <Monitor size={13} />
            <span>{label}</span>
          </span>
        )}
        value={choice.preset}
        onChange={(event) => {
          onChange({
            ...choice,
            preset: event.target.value as PreviewViewport["preset"],
            rotated: false,
            custom:
              event.target.value === "custom" ? [width, height] : choice.custom,
          });
        }}
      >
        <option value="design">Design</option>
        {Object.entries(PREVIEW_PRESETS).map(([id, preset]) => (
          <option key={id} value={id}>
            {preset.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </SelectControl>
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="sm"
            shape="rounded"
            className="preview-size-trigger"
            aria-label={`Preview size, ${width} by ${height} pixels`}
            title="Edit preview dimensions"
          >
            <span>
              {width} × {height}
            </span>
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="preview-controls-popover"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            aria-label="Preview size"
          >
            <strong>Preview size</strong>
            <div className="preview-dimensions">
              <Dimension
                axis="width"
                value={width}
                onCommit={(next) => resize([next, height])}
              />
              <Dimension
                axis="height"
                value={height}
                onCommit={(next) => resize([width, next])}
              />
            </div>
            <div className="preview-size-actions">
              <Button
                variant="outline"
                size="sm"
                aria-label="Rotate preview"
                onClick={() =>
                  onChange({ ...choice, rotated: !choice.rotated })
                }
              >
                <RotateCw size={14} /> Rotate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({ ...choice, preset: "design", rotated: false })
                }
              >
                Reset to design
              </Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
