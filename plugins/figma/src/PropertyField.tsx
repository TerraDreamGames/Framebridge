import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "./components/Glyph";
import { Field, FieldLabel } from "./components/ui/field";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Checkbox } from "./components/ui/checkbox";
import { SelectControl } from "./components/SelectControl";
import { PropertyName } from "./components/PropertyName";
import {
  propertyLabel,
  propertyDescription,
  propertyUnit,
  propertyValueSummary,
} from "./property-presentation";
import type { PropertySpec } from "../../../packages/core/src/editor";
import type { Value } from "../../../packages/core/src/types";
import type { PropertyDraftReport } from "./property-drafts";

export function PropertyField({
  name,
  spec,
  value,
  onChange,
  overridden,
  onReset,
  ownerLabel,
  validate,
  onDraftValidity,
  friendly = false,
}: {
  name: string;
  spec: PropertySpec;
  value: Value;
  onChange: (value: Value) => void;
  overridden: boolean;
  onReset: () => void;
  ownerLabel?: string;
  validate?: (value: Value) => boolean;
  onDraftValidity?: PropertyDraftReport;
  friendly?: boolean;
}) {
  const owner = useRef({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const errorsRef = useRef(errors);
  const error = Object.values(errors).join(" ");
  const [expanded, setExpanded] = useState(false);
  const label = propertyLabel(name);
  const description = propertyDescription(name);
  const hintId = `prop-${name}-hint`;
  const help = `${name}${description ? ` — ${description}` : ""}`;
  const unit = propertyUnit(name);
  const controlDescription =
    [description ? hintId : "", error ? `prop-${name}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const vector =
    typeof value === "object" && "value" in value && Array.isArray(value.value)
      ? (value.value as number[])
      : [];
  const [draft, setDraft] = useState(String(value));
  const draftRef = useRef(draft);
  const [vectorDrafts, setVectorDrafts] = useState(vector.map(String));
  const vectorDraftsRef = useRef(vectorDrafts);
  const report = (next: Record<string, string>) => {
    errorsRef.current = next;
    setErrors(next);
    const message = Object.values(next).join(" ");
    onDraftValidity?.(
      owner.current,
      message
        ? { label: `${ownerLabel ? ownerLabel + " · " : ""}${label}`, message }
        : undefined,
    );
  };
  useEffect(
    () => () => onDraftValidity?.(owner.current, undefined),
    [onDraftValidity],
  );
  const restoreDraft = () => {
    draftRef.current =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    vectorDraftsRef.current = vector.map(String);
    setDraft(draftRef.current);
    setVectorDrafts(vectorDraftsRef.current);
    report({});
  };
  useEffect(() => {
    // Analysis and artwork updates must not discard a rejected field draft.
    if (Object.keys(errorsRef.current).length) return;
    draftRef.current =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    vectorDraftsRef.current = vector.map(String);
    setDraft(draftRef.current);
    setVectorDrafts(vectorDraftsRef.current);
  }, [JSON.stringify(value)]);
  const number = (text: string) => {
    if (!text.trim()) throw new Error("Enter a number.");
    const next = Number(text);
    const min = spec.min ?? -1e6,
      max = spec.max ?? 1e6;
    if (!Number.isFinite(next)) throw new Error("Enter a finite number.");
    if (next < min || next > max) throw new Error(`Use ${min}–${max}.`);
    return next;
  };
  const accept = (next: Value, save: boolean) => {
    if (validate && !validate(next))
      throw new Error(`Enter a valid ${label.toLowerCase()}.`);
    if (save && JSON.stringify(next) !== JSON.stringify(value)) onChange(next);
  };
  const commit = (next: Value) => {
    try {
      accept(next, true);
      report({});
    } catch (e) {
      report({ value: e instanceof Error ? e.message : "Invalid value." });
    }
  };
  const scalar = (text: string, save: boolean, badInput = false) => {
    try {
      if (badInput) throw new Error("Enter a number.");
      accept(spec.kind === "string" ? text : number(text), save);
      report({});
    } catch (e) {
      report({ value: e instanceof Error ? e.message : "Invalid value." });
    }
  };
  const compound = (texts: string[], save: boolean, badInputIndex = -1) => {
    const nextErrors: Record<string, string> = {};
    const values = texts.map((text, index) => {
      try {
        if (index === badInputIndex) throw new Error("Enter a number.");
        return number(text);
      } catch (e) {
        nextErrors[String(index)] =
          e instanceof Error ? e.message : "Invalid value.";
        return 0;
      }
    });
    if (!Object.keys(nextErrors).length) {
      try {
        accept(
          {
            type: spec.kind as
              "UDim2" | "UDim" | "Vector2" | "Vector3" | "Rect",
            value: values,
          },
          save,
        );
      } catch (e) {
        nextErrors.value = e instanceof Error ? e.message : "Invalid value.";
      }
    }
    report(nextErrors);
  };
  const keyboard = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      restoreDraft();
      event.currentTarget.blur();
    } else if (event.key === "Enter" && spec.kind !== "string")
      event.currentTarget.blur();
  };
  const reset = () => {
    restoreDraft();
    onReset();
  };
  const revert = error && (
    <Button variant="ghost" size="sm" onClick={restoreDraft}>
      Revert {label.toLowerCase()}
    </Button>
  );
  if (
    ["UDim2", "UDim", "Vector2", "Vector3", "Rect", "Font"].includes(spec.kind)
  ) {
    const open = expanded || !!error;
    const summary = propertyValueSummary(value);
    return (
      <Field
        className={`property-compound ${overridden ? "overridden" : ""}`}
        data-invalid={!!error}
      >
        <div className="compound-heading">
          <button
            type="button"
            className="compound-toggle"
            aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
            title={help}
            aria-expanded={open}
            aria-controls={`prop-${name}-details`}
            aria-describedby={`prop-${name}-summary${description ? ` ${hintId}` : ""}`}
            onClick={() => setExpanded(error ? true : !open)}
          >
            <span className="compound-name">
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {friendly ? label : <PropertyName name={name} />}
            </span>
            <span
              className="compound-summary"
              id={`prop-${name}-summary`}
              title={summary}
            >
              {summary}
            </span>
          </button>
          {overridden && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="compound-reset"
              title={`Reset ${name}`}
              aria-label={`Reset ${name}`}
              onClick={reset}
            >
              <RotateCcw size={11} />
            </Button>
          )}
        </div>
        {description && (
          <span id={hintId} className="sr-only">
            {description}
          </span>
        )}
        {open && (
          <div className="compound-details" id={`prop-${name}-details`}>
            {["UDim2", "UDim"].includes(spec.kind) && (
              <p className="compound-guidance sr-only">
                Scale is a fraction (0.5 = 50%). Offset adds pixels.
              </p>
            )}
            {name === "AnchorPoint" && (
              <p className="compound-guidance sr-only">
                0, 0 = top-left · 0.5, 0.5 = center
              </p>
            )}
            {spec.kind === "Rect" && (
              <p className="compound-guidance sr-only">
                Source texture coordinates in pixels. Right and bottom locate
                the center's far edge.
              </p>
            )}
            {["MinSize", "MaxSize"].includes(name) && (
              <p className="compound-guidance sr-only">
                Width and height in pixels.
              </p>
            )}
            {spec.kind === "Font" ? (
              <div className="font-property">
                <div className="compound-component">
                  <span>Family</span>
                  <SelectControl
                    id={`prop-${name}`}
                    aria-invalid={!!error}
                    aria-label="Font family"
                    value={(value as any).family}
                    onChange={(e) =>
                      commit({ ...(value as any), family: e.target.value })
                    }
                  >
                    {[
                      "SourceSansPro",
                      "Roboto",
                      "Arial",
                      "GothamSSm",
                      "Montserrat",
                      "Nunito",
                      "FredokaOne",
                      "Bangers",
                      "Ubuntu",
                      "RobotoMono",
                    ].map((f) => (
                      <option
                        key={f}
                        value={`rbxasset://fonts/families/${f}.json`}
                      >
                        {f}
                      </option>
                    ))}
                    {![
                      "SourceSansPro",
                      "Roboto",
                      "Arial",
                      "GothamSSm",
                      "Montserrat",
                      "Nunito",
                      "FredokaOne",
                      "Bangers",
                      "Ubuntu",
                      "RobotoMono",
                    ].some(
                      (f) =>
                        (value as any).family ===
                        `rbxasset://fonts/families/${f}.json`,
                    ) && (
                      <option value={(value as any).family}>
                        {(value as any).family
                          .split("/")
                          .pop()
                          ?.replace(".json", "") || "Custom family"}
                      </option>
                    )}
                  </SelectControl>
                </div>
                <div className="compound-component">
                  <span>Weight</span>
                  <SelectControl
                    aria-label="Font weight"
                    value={(value as any).weight}
                    onChange={(e) =>
                      commit({ ...(value as any), weight: e.target.value })
                    }
                  >
                    {[
                      "Thin",
                      "ExtraLight",
                      "Light",
                      "Regular",
                      "Medium",
                      "SemiBold",
                      "Bold",
                      "ExtraBold",
                      "Heavy",
                    ].map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </SelectControl>
                </div>
                <div className="compound-component">
                  <span>Style</span>
                  <SelectControl
                    aria-label="Font style"
                    value={(value as any).style}
                    onChange={(e) =>
                      commit({ ...(value as any), style: e.target.value })
                    }
                  >
                    <option>Normal</option>
                    <option>Italic</option>
                  </SelectControl>
                </div>
              </div>
            ) : (
              <div className="vector-property" data-components={vector.length}>
                {vector.map((n, i) => (
                  <label key={i}>
                    <span>
                      {spec.kind === "UDim2"
                        ? ["X scale", "X offset", "Y scale", "Y offset"][i]
                        : spec.kind === "UDim"
                          ? ["Scale", "Offset"][i]
                          : spec.kind === "Rect"
                            ? ["Left", "Top", "Right", "Bottom"][i]
                            : ["X", "Y", "Z"][i]}
                    </span>
                    <Input
                      aria-invalid={!!error}
                      aria-describedby={
                        error
                          ? `prop-${name}-error`
                          : description
                            ? hintId
                            : undefined
                      }
                      aria-label={`${label} ${spec.kind === "UDim2" ? ["X scale", "X offset", "Y scale", "Y offset"][i] : spec.kind === "UDim" ? ["Scale", "Offset"][i] : spec.kind === "Rect" ? ["Left", "Top", "Right", "Bottom"][i] : ["X", "Y", "Z"][i]}`}
                      type="number"
                      step="any"
                      value={vectorDrafts[i] ?? String(n)}
                      onKeyDown={keyboard}
                      onChange={(e) => {
                        const texts = [...vectorDraftsRef.current];
                        texts[i] = e.currentTarget.value;
                        vectorDraftsRef.current = texts;
                        setVectorDrafts(texts);
                        compound(
                          texts,
                          false,
                          e.currentTarget.validity.badInput ? i : -1,
                        );
                      }}
                      onBlur={() => compound(vectorDraftsRef.current, true)}
                    />
                  </label>
                ))}
              </div>
            )}
            {revert}
            {error && (
              <span
                className="property-error"
                id={`prop-${name}-error`}
                role="alert"
              >
                {error}
              </span>
            )}
          </div>
        )}
      </Field>
    );
  }
  return (
    <Field
      data-invalid={!!error}
      className={`property-row ${overridden ? "overridden" : ""}`}
    >
      <div className="property-label">
        <FieldLabel htmlFor={`prop-${name}`} title={help}>
          {friendly ? label : <PropertyName name={name} />}
        </FieldLabel>
        {overridden && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="icon-button"
            title={`Reset ${name}`}
            aria-label={`Reset ${name}`}
            onClick={reset}
          >
            <RotateCcw size={11} />
          </Button>
        )}
      </div>
      <div className="property-control">
        {description && (
          <span id={hintId} className="sr-only">
            {description}
          </span>
        )}
        {spec.kind === "boolean" ? (
          <Checkbox
            id={`prop-${name}`}
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={controlDescription}
            checked={value === true}
            onCheckedChange={(checked) => commit(checked === true)}
          />
        ) : spec.kind === "Enum" ? (
          <SelectControl
            id={`prop-${name}`}
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={controlDescription}
            value={String(vector[1] ?? (value as any).value?.[1])}
            onChange={(e) =>
              commit({ type: "Enum", value: [spec.enum!, e.target.value] })
            }
          >
            {spec.choices?.map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </SelectControl>
        ) : spec.kind === "Color3" ? (
          <div className="color-property">
            <input
              id={`prop-${name}`}
              aria-label={label}
              aria-invalid={!!error}
              aria-describedby={controlDescription}
              type="color"
              value={
                "#" +
                vector
                  .map((n) =>
                    Math.round(n * 255)
                      .toString(16)
                      .padStart(2, "0"),
                  )
                  .join("")
              }
              onChange={(e) =>
                commit({
                  type: "Color3",
                  value: [1, 3, 5].map(
                    (i) => parseInt(e.target.value.slice(i, i + 2), 16) / 255,
                  ),
                })
              }
            />
            <span>[{vector.map((n) => Math.round(n * 255)).join(", ")}]</span>
          </div>
        ) : spec.kind === "string" && name === "Text" ? (
          <Textarea
            id={`prop-${name}`}
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={controlDescription}
            rows={1}
            value={draft}
            onChange={(e) => {
              draftRef.current = e.currentTarget.value;
              setDraft(draftRef.current);
              scalar(draftRef.current, false);
            }}
            onKeyDown={keyboard}
            onBlur={() => scalar(draftRef.current, true)}
          />
        ) : spec.kind === "string" ? (
          <Input
            id={`prop-${name}`}
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={controlDescription}
            value={draft}
            maxLength={name === "Name" ? 100 : undefined}
            onChange={(e) => {
              draftRef.current = e.currentTarget.value;
              setDraft(draftRef.current);
              scalar(draftRef.current, false);
            }}
            onKeyDown={(e) => {
              keyboard(e);
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            onBlur={() => scalar(draftRef.current, true)}
          />
        ) : (
          <div className="property-number">
            <Input
              id={`prop-${name}`}
              aria-label={label}
              aria-invalid={!!error}
              aria-describedby={controlDescription}
              type="number"
              step="any"
              min={spec.min}
              max={spec.max}
              value={draft}
              onChange={(e) => {
                draftRef.current = e.currentTarget.value;
                setDraft(draftRef.current);
                scalar(
                  draftRef.current,
                  false,
                  e.currentTarget.validity.badInput,
                );
              }}
              onKeyDown={keyboard}
              onBlur={() => scalar(draftRef.current, true)}
            />
            {unit && (
              <span className="property-unit" aria-hidden="true">
                {unit}
              </span>
            )}
          </div>
        )}
        {revert}
        {error && (
          <span
            className="property-error"
            id={`prop-${name}-error`}
            role="alert"
          >
            {error}
          </span>
        )}
      </div>
    </Field>
  );
}
