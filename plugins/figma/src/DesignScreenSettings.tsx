import React, { useEffect, useId, useState } from "react";
import type { ExportOptions } from "../../../packages/core/src/types";
import { SelectControl } from "./components/SelectControl";
import { Input } from "./components/ui/input";
import { PREVIEW_PRESETS, parsePreviewDimension } from "./preview-viewport";
import { CircleHelp } from "./components/Glyph";
import { Button } from "./components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
import "./settings-panels.css";

function ScreenHint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="settings-hint"
            aria-label={label}
          >
            <CircleHelp size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          className="settings-hint-content"
          side="top"
          sideOffset={6}
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ScreenDimension({
  value,
  axis,
  onCommit,
}: {
  value: number;
  axis: "width" | "height";
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);
  return (
    <label className="design-screen-field">
      <span>
        {axis === "width" ? "Width" : "Height"}
        <small>px</small>
      </span>
      <Input
        aria-label={`Design screen ${axis}`}
        inputMode="numeric"
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={(event) => {
          const next = parsePreviewDimension(event.target.value);
          setDraft(String(next ?? value));
          setInvalid(next === undefined);
          if (next !== undefined && next !== value) onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.currentTarget.value = String(value);
            setDraft(String(value));
            setInvalid(false);
            event.currentTarget.blur();
          }
        }}
      />
      {invalid && (
        <span id={errorId} className="property-error" role="alert">
          Use 64–8192 whole pixels. Previous size kept.
        </span>
      )}
    </label>
  );
}

export function DesignScreenSettings({
  options,
  onChange,
}: {
  options: ExportOptions;
  onChange: (patch: Partial<ExportOptions>) => void;
}) {
  const size = options.screenSize;
  const [customMode, setCustomMode] = useState(false);
  const preset = !size
    ? "selected"
    : customMode
      ? "custom"
      : (Object.entries(PREVIEW_PRESETS).find(
          ([, value]) => value.size[0] === size[0] && value.size[1] === size[1],
        )?.[0] ?? "custom");
  return (
    <div className="design-screen-settings">
      <div className="setting settings-screen-preset">
        <div className="settings-label">
          <strong>Design screen</strong>
          <ScreenHint label="About design screen">
            The screen your UI was designed for. An 800 px panel on a 1920 px
            screen exports at 0.417 scale.
          </ScreenHint>
        </div>
        <SelectControl
          aria-label="Design screen"
          value={preset}
          onChange={(event) => {
            const next = event.target.value;
            setCustomMode(next === "custom");
            if (next === "selected") onChange({ screenSize: null });
            else if (next === "custom")
              onChange({ screenSize: size ?? [1920, 1080] });
            else {
              const value =
                PREVIEW_PRESETS[next as keyof typeof PREVIEW_PRESETS];
              if (value) onChange({ screenSize: [...value.size] });
            }
          }}
        >
          <option value="desktop">Desktop · 1920 × 1080</option>
          <option value="tablet">Tablet · 1024 × 768</option>
          <option value="phone">Phone · 390 × 844</option>
          <option value="selected">Use selected frame</option>
          <option value="custom">Custom</option>
        </SelectControl>
        {size && (
          <div className="design-screen-dimensions">
            <ScreenDimension
              axis="width"
              value={size[0]}
              onCommit={(value) => onChange({ screenSize: [value, size[1]] })}
            />
            <ScreenDimension
              axis="height"
              value={size[1]}
              onCommit={(value) => onChange({ screenSize: [size[0], value] })}
            />
          </div>
        )}
      </div>
      {size && (
        <div className="setting settings-screen-placement">
          <div className="settings-label">
            <strong>Placement</strong>
            <ScreenHint label="About main frame placement">
              Positions the main frame on the design screen, independently of
              its location on the Figma page.
            </ScreenHint>
          </div>
          <SelectControl
            aria-label="Main frame placement"
            value={options.rootPlacement ?? "center"}
            onChange={(event) =>
              onChange({
                rootPlacement: event.target.value as "center" | "top-left",
              })
            }
          >
            <option value="center">Center on screen</option>
            <option value="top-left">Top-left of screen</option>
          </SelectControl>
        </div>
      )}
    </div>
  );
}
