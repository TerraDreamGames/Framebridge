import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import type { RbxNode, Value } from "../../../packages/core/src/types";
import type { PropertyDraftReport } from "./property-drafts";
import {
  anchoredProperties,
  convertedSize,
  geometryNumbers,
  inferredSizeUnit,
  inspectorGeometry,
  sizePixels,
  type SizeUnit,
} from "./inspector-geometry";
import "./size-anchor-editor.css";

const displayNumber = (value: number) =>
  Number.isFinite(value) ? String(Number(value.toPrecision(7))) : "0";

function GeometryNumber({
  label,
  value,
  max = 1e6,
  disabled,
  hint,
  onCommit,
  onDraftValidity,
  onInvalid,
}: {
  label: string;
  value: number;
  max?: number;
  disabled?: boolean;
  hint?: string;
  onCommit: (value: number) => void;
  onDraftValidity?: PropertyDraftReport;
  onInvalid: (label: string, error: boolean) => void;
}) {
  const owner = useRef({});
  const id = useId();
  const [draft, setDraft] = useState(displayNumber(value));
  const [error, setError] = useState("");
  const errorRef = useRef(error),
    dirty = useRef(false),
    focused = useRef(false);
  const callbacks = useRef({ onDraftValidity, onInvalid });
  callbacks.current = { onDraftValidity, onInvalid };
  const report = (message: string) => {
    errorRef.current = message;
    setError(message);
    callbacks.current.onInvalid(label, !!message);
    callbacks.current.onDraftValidity?.(
      owner.current,
      message ? { label, message } : undefined,
    );
  };
  useEffect(
    () => () => {
      callbacks.current.onDraftValidity?.(owner.current, undefined);
      callbacks.current.onInvalid(label, false);
    },
    [label],
  );
  useEffect(() => {
    if (errorRef.current || (focused.current && dirty.current)) return;
    setDraft(displayNumber(value));
    dirty.current = false;
  }, [value]);
  const restore = () => {
    setDraft(displayNumber(value));
    dirty.current = false;
    report("");
  };
  const parse = (text: string, badInput = false) => {
    const number = Number(text);
    if (badInput || !text.trim() || !Number.isFinite(number))
      throw new Error("Enter a number.");
    if (number < 0 || number > max) throw new Error(`Use 0–${max}.`);
    return number;
  };
  return (
    <div className="geometry-number" title={hint}>
      <Input
        type="number"
        step="any"
        min={0}
        max={max}
        aria-label={label}
        disabled={disabled}
        value={draft}
        aria-invalid={!!error}
        aria-describedby={error ? id : undefined}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          dirty.current = true;
          setDraft(event.currentTarget.value);
          try {
            parse(
              event.currentTarget.value,
              event.currentTarget.validity.badInput,
            );
            report("");
          } catch (cause) {
            report((cause as Error).message);
          }
        }}
        onBlur={(event) => {
          focused.current = false;
          if (!dirty.current) return;
          try {
            const next = parse(
              event.currentTarget.value,
              event.currentTarget.validity.badInput,
            );
            if (next !== value) onCommit(next);
            dirty.current = false;
            setDraft(displayNumber(next));
            report("");
          } catch (cause) {
            report((cause as Error).message);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            restore();
            event.currentTarget.blur();
          }
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      {error && (
        <span id={id} className="property-error" role="alert">
          {error}{" "}
          <button type="button" onClick={restore}>
            Revert
          </button>
        </span>
      )}
    </div>
  );
}

const anchorNames = [
  "Top left",
  "Top center",
  "Top right",
  "Middle left",
  "Center",
  "Middle right",
  "Bottom left",
  "Bottom center",
  "Bottom right",
];

/** Compact production controls, backed by the existing property override/history path. */
export function SizeAnchorEditor({
  node,
  ancestors,
  disabled,
  onChange,
  onDraftValidity,
}: {
  node: RbxNode;
  ancestors: readonly RbxNode[];
  disabled: boolean;
  onChange: (properties: Record<string, Value>) => void;
  onDraftValidity?: PropertyDraftReport;
}) {
  const size = node.properties.Size;
  const [unit, setUnit] = useState<SizeUnit>(
    () => inferredSizeUnit(size) ?? "scale",
  );
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState("");
  const sizeKey = JSON.stringify(size);
  useEffect(() => {
    const stored = inferredSizeUnit(size);
    if (stored) setUnit(stored);
  }, [sizeKey]);
  const onInvalid = useCallback((label: string, error: boolean) => {
    setInvalid((before) =>
      before[label] === error ? before : { ...before, [label]: error },
    );
  }, []);
  const hasInvalid = Object.values(invalid).some(Boolean);
  const context = inspectorGeometry(node, ancestors);
  const pixels = sizePixels(size, context.parent);
  const anchor = geometryNumbers(node.properties.AnchorPoint);
  const a: [number, number] = [anchor[0] ?? 0, anchor[1] ?? 0];
  const measurable = context.parent.every(
    (value) => Number.isFinite(value) && value > 0,
  );
  const changeAnchor = (next: [number, number]) => {
    if (next[0] === a[0] && next[1] === a[1]) return;
    onChange(anchoredProperties(node, context, next));
  };
  const pickAnchor = (index: number) => {
    try {
      changeAnchor([(index % 3) / 2, Math.floor(index / 3) / 2]);
      setActionError("");
    } catch (cause) {
      setActionError((cause as Error).message);
    }
  };
  const focusIndex = Math.round(a[1] * 2) * 3 + Math.round(a[0] * 2);
  return (
    <section className="size-anchor-editor" aria-label="Size and anchor">
      <ToggleGroup
        type="single"
        className="geometry-units"
        aria-label="Sizing units"
        value={unit}
        disabled={disabled || hasInvalid || !measurable}
        onValueChange={(next) => {
          if (!next || next === unit) return;
          try {
            if (!context.controlled.every(Boolean))
              onChange({
                Size: convertedSize(
                  size,
                  context.parent,
                  next as SizeUnit,
                  context.controlled,
                ),
              });
            setUnit(next as SizeUnit);
            setActionError("");
          } catch (cause) {
            setActionError((cause as Error).message);
          }
        }}
        title={
          measurable
            ? `Reference parent: ${displayNumber(context.parent[0])} × ${displayNumber(context.parent[1])}`
            : "Scale needs a measurable parent."
        }
      >
        <ToggleGroupItem value="scale" disabled={!measurable}>
          Scale
        </ToggleGroupItem>
        <ToggleGroupItem value="offset">Offset</ToggleGroupItem>
      </ToggleGroup>
      <div className="geometry-dimensions">
        {(["Width", "Height"] as const).map((label, axis) => {
          const physical = context.controlled[axis]
            ? context.size[axis]
            : pixels[axis];
          const value =
            unit === "scale" && context.parent[axis] > 0
              ? physical / context.parent[axis]
              : physical;
          return (
            <label key={axis} className="geometry-dimension">
              <span>{label}</span>
              <GeometryNumber
                label={label}
                value={value}
                disabled={
                  disabled ||
                  !!context.controlled[axis] ||
                  (unit === "scale" && !measurable)
                }
                hint={context.controlled[axis]}
                onDraftValidity={onDraftValidity}
                onInvalid={onInvalid}
                onCommit={(next) => {
                  const values = [...geometryNumbers(size)];
                  values[axis * 2] = unit === "scale" ? next : 0;
                  values[axis * 2 + 1] = unit === "offset" ? next : 0;
                  onChange({ Size: { type: "UDim2", value: values } });
                }}
              />
            </label>
          );
        })}
      </div>
      <div className="geometry-anchor-row">
        <span>Anchor</span>
        <div
          className="geometry-anchor-grid"
          role="radiogroup"
          aria-label="Anchor point"
          title="Change the anchor without moving this layer."
        >
          {anchorNames.map((name, index) => {
            const x = (index % 3) / 2,
              y = Math.floor(index / 3) / 2;
            const checked = a[0] === x && a[1] === y;
            return (
              <button
                key={index}
                type="button"
                role="radio"
                aria-checked={checked}
                data-anchor-index={index}
                aria-label={`${name} anchor (${x}, ${y})`}
                title={`${name} (${x}, ${y})`}
                disabled={
                  disabled ||
                  hasInvalid ||
                  (!measurable && !context.ownsPosition)
                }
                tabIndex={index === focusIndex ? 0 : -1}
                onClick={() => pickAnchor(index)}
                onKeyDown={(event) => {
                  const moves: Record<string, number> = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -3,
                    ArrowDown: 3,
                  };
                  if (
                    !(event.key in moves) &&
                    !["Home", "End"].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 8
                        : Math.max(0, Math.min(8, index + moves[event.key]));
                  pickAnchor(next);
                  event.currentTarget.parentElement
                    ?.querySelector<HTMLButtonElement>(
                      `[data-anchor-index="${next}"]`,
                    )
                    ?.focus();
                }}
              />
            );
          })}
        </div>
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button
              variant="outline"
              shape="rounded"
              size="sm"
              className="geometry-anchor-value"
              aria-label="Custom anchor point"
              disabled={
                disabled || hasInvalid || (!measurable && !context.ownsPosition)
              }
            >
              {displayNumber(a[0])}, {displayNumber(a[1])}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="geometry-anchor-popover"
              aria-label="Custom anchor point"
              align="end"
              sideOffset={8}
              collisionPadding={12}
            >
              {(["X", "Y"] as const).map((label, axis) => (
                <label key={label}>
                  <span>{label}</span>
                  <GeometryNumber
                    label={`Anchor ${label}`}
                    value={a[axis]}
                    max={1}
                    onDraftValidity={onDraftValidity}
                    onInvalid={onInvalid}
                    onCommit={(next) =>
                      changeAnchor(axis === 0 ? [next, a[1]] : [a[0], next])
                    }
                  />
                </label>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {actionError && (
        <p className="property-error" role="alert">
          {actionError}
        </p>
      )}
    </section>
  );
}
