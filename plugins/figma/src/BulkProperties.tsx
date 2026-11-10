import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import React, { useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { ChevronDown, ChevronRight, RotateCcw, X } from "./components/Glyph";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { SelectControl } from "./components/SelectControl";
import { PropertyName } from "./components/PropertyName";
import { RobloxClassIcon } from "./components/RobloxClassIcon";
import { Checkbox } from "./components/ui/checkbox";
import { formatShortcut } from "./keyboard-shortcuts";
import {
  commonClassChoices,
  commonPropertySchema,
  classChanges,
  layerPropertyValue,
  propertyChanges,
  sharedValue,
  type EditableLayer,
  type OverrideChange,
  type PropertyPart,
} from "../../../packages/core/src/bulk-editor";
import type { PropertySpec } from "../../../packages/core/src/editor";
import type { LayerOverride, Value } from "../../../packages/core/src/types";
import {
  propertyLabel,
  propertiesForView,
  propertyDescription,
  studioPropertySchema,
  propertyValueSummary,
  type PropertyView,
} from "./property-presentation";

function NumberInput({
  values,
  label,
  spec,
  commit,
}: {
  values: number[];
  label: string;
  spec: PropertySpec;
  commit: (value: Value) => void;
}) {
  const common = sharedValue(values);
  const [draft, setDraft] = useState(
    common === undefined ? "" : String(common),
  );
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft(common === undefined ? "" : String(common));
    setDirty(false);
  }, [JSON.stringify(values)]);
  return (
    <Input
      aria-label={label}
      placeholder={common === undefined ? "Mixed" : undefined}
      type="number"
      step="any"
      min={spec.min}
      max={spec.max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        setDirty(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={() => {
        if (!dirty) return;
        if (!draft.trim()) {
          commit(NaN);
          return;
        }
        commit(Number(draft));
      }}
    />
  );
}

function BulkField({
  name,
  spec,
  values,
  overridden,
  commit,
  reset,
}: {
  name: string;
  spec: PropertySpec;
  values: Value[];
  overridden: boolean;
  commit: (value: Value, part?: PropertyPart) => void;
  reset: () => void;
}) {
  const common = sharedValue(values),
    label = propertyLabel(name);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(typeof common === "string" ? common : "");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft(typeof common === "string" ? common : "");
    setDirty(false);
    setError("");
  }, [JSON.stringify(values)]);
  const change = (value: Value, part?: PropertyPart) => {
    try {
      commit(value, part);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Invalid value.");
    }
  };
  const resetButton = overridden && (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Reset ${name} on selected layers`}
      title="Restore each layer's source value"
      onClick={reset}
    >
      <RotateCcw size={11} />
    </Button>
  );
  const compound = [
    "UDim2",
    "UDim",
    "Vector2",
    "Vector3",
    "Rect",
    "Font",
  ].includes(spec.kind);
  const numeric = (nums: number[], field: string, part?: PropertyPart) => (
    <NumberInput
      key={field + JSON.stringify(nums)}
      values={nums}
      spec={spec}
      label={field}
      commit={(value) => change(value, part)}
    />
  );
  return (
    <div className={`bulk-property ${overridden ? "overridden" : ""}`}>
      {compound ? (
        <Disclosure className="bulk-compound">
          <DisclosureSummary title={propertyDescription(name)}>
            <span className="compound-name">
              <ChevronRight size={12} />
              <PropertyName name={name} />
            </span>
            <span className="compound-summary">
              {common === undefined ? "Mixed" : propertyValueSummary(common)}
            </span>
          </DisclosureSummary>
          <div className="bulk-compound-fields">
            {spec.kind === "Font"
              ? (["family", "weight", "style"] as const).map((part) => {
                  const fonts = values as Extract<Value, { type: "Font" }>[];
                  const options =
                    part === "family"
                      ? [
                          ...new Set([
                            ...fonts.map((font) => font.family),
                            ...[
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
                            ].map(
                              (family) =>
                                `rbxasset://fonts/families/${family}.json`,
                            ),
                          ]),
                        ]
                      : part === "weight"
                        ? [
                            "Thin",
                            "ExtraLight",
                            "Light",
                            "Regular",
                            "Medium",
                            "SemiBold",
                            "Bold",
                            "ExtraBold",
                            "Heavy",
                          ]
                        : ["Normal", "Italic"];
                  return (
                    <label key={part}>
                      <span>Font {part}</span>
                      <SelectControl
                        aria-label={`Selected layers font ${part}`}
                        value={
                          sharedValue(fonts.map((font) => font[part])) ??
                          "mixed"
                        }
                        onChange={(e) => change(e.target.value, part)}
                      >
                        <option value="mixed" disabled>
                          Mixed
                        </option>
                        {options.map((value) => (
                          <option key={value} value={value}>
                            {part === "family"
                              ? value.split("/").pop()?.replace(".json", "")
                              : value}
                          </option>
                        ))}
                      </SelectControl>
                    </label>
                  );
                })
              : (
                  {
                    UDim2: ["X scale", "X offset", "Y scale", "Y offset"],
                    UDim: ["Scale", "Offset"],
                    Vector2: ["X", "Y"],
                    Vector3: ["X", "Y", "Z"],
                    Rect: ["Left", "Top", "Right", "Bottom"],
                  } as Record<string, string[]>
                )[spec.kind].map((part, index) => (
                  <label key={part}>
                    <span>{part}</span>
                    {numeric(
                      values.map(
                        (value) => (value as { value: number[] }).value[index],
                      ),
                      `Selected layers ${name} ${part}`,
                      index,
                    )}
                  </label>
                ))}
          </div>
          {["UDim", "UDim2"].includes(spec.kind) && (
            <p className="property-note">
              Scale is a fraction; offset adds pixels. Each field changes only
              that coordinate.
            </p>
          )}
        </Disclosure>
      ) : (
        <div className="property-row">
          <span
            className="property-label"
            title={`${label}${propertyDescription(name) ? ` — ${propertyDescription(name)}` : ""}`}
          >
            <PropertyName name={name} />
          </span>
          <div className="property-control">
            {spec.kind === "number" ? (
              numeric(values as number[], `Selected layers ${name}`)
            ) : spec.kind === "boolean" ? (
              <Checkbox
                aria-label={`Selected layers ${name}`}
                checked={
                  common === undefined ? "indeterminate" : common === true
                }
                onCheckedChange={(checked) => change(checked === true)}
              />
            ) : spec.kind === "Enum" ? (
              <SelectControl
                aria-label={`Selected layers ${name}`}
                value={
                  common === undefined
                    ? "mixed"
                    : (common as { value: string[] }).value[1]
                }
                onChange={(e) =>
                  change({ type: "Enum", value: [spec.enum!, e.target.value] })
                }
              >
                <option value="mixed" disabled>
                  Mixed
                </option>
                {spec.choices?.map((choice) => (
                  <option key={choice}>{choice}</option>
                ))}
              </SelectControl>
            ) : spec.kind === "Color3" ? (
              <div className="color-property">
                <input
                  type="color"
                  aria-label={`Selected layers ${name}`}
                  value={
                    "#" +
                    (values[0] as { value: number[] }).value
                      .map((value) =>
                        Math.round(value * 255)
                          .toString(16)
                          .padStart(2, "0"),
                      )
                      .join("")
                  }
                  onChange={(e) =>
                    change({
                      type: "Color3",
                      value: [1, 3, 5].map(
                        (i) =>
                          parseInt(e.target.value.slice(i, i + 2), 16) / 255,
                      ),
                    })
                  }
                />
                <span>
                  {common === undefined
                    ? "Mixed"
                    : "[" +
                      (common as { value: number[] }).value
                        .map((value) => Math.round(value * 255))
                        .join(", ") +
                      "]"}
                </span>
                {common === undefined && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Apply the shown color to all selected layers"
                    aria-label={`Apply shown ${name} to selected layers`}
                    onClick={() => change(values[0])}
                  >
                    Use
                  </Button>
                )}
              </div>
            ) : (
              <div className="bulk-string-control">
                <Textarea
                  aria-label={`Selected layers ${name}`}
                  rows={1}
                  placeholder={common === undefined ? "Mixed" : undefined}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setDirty(true);
                  }}
                  onBlur={() => {
                    if (dirty) change(draft);
                  }}
                />
                {common === undefined && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={`Clear ${label} on selected layers`}
                    aria-label={`Clear ${name} on selected layers`}
                    onClick={() => change("")}
                  >
                    <X size={12} />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {resetButton}
      {error && (
        <p className="property-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function BulkProperties({
  layers,
  overrides,
  disabled,
  onChange,
}: {
  layers: EditableLayer[];
  overrides: Record<string, LayerOverride>;
  disabled: boolean;
  onChange: (changes: OverrideChange[]) => void;
}) {
  const [filter, setFilter] = useState(""),
    [view, setView] = useState<PropertyView>("all"),
    [error, setError] = useState("");
  const schema = studioPropertySchema(commonPropertySchema(layers));
  const classes = commonClassChoices(layers, overrides);
  const allSources = layers.every((layer) => layer.source && !layer.baked);
  const changed = Object.assign(
    {},
    ...layers.map((layer) => overrides[layer.node.id]?.properties),
  );
  const scaleType = sharedValue(
    layers.map((layer) => layerPropertyValue(layer, "ScaleType")),
  );
  const fields = propertiesForView(
    schema,
    view,
    filter,
    changed,
    scaleType === undefined ? undefined : { ScaleType: scaleType },
  );
  const groups = [...new Set(fields.map(([, spec]) => spec.group))].sort(
    (a, b) => {
      const order = ["Appearance", "Data", "Behavior"];
      const rank = (group: string) =>
        order.includes(group) ? order.indexOf(group) : order.length;
      return rank(a) - rank(b) || a.localeCompare(b);
    },
  );
  return (
    <fieldset
      className="property-fields bulk-properties studio-property-table"
      disabled={disabled}
    >
      <p className="property-note">
        Only shared properties are shown. “Mixed” means values differ; editing
        applies to all selected layers.
      </p>
      <div className="property-search-control">
        <Input
          aria-label="Search shared properties"
          className="property-search"
          placeholder="Filter Properties…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setFilter("");
          }}
        />
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Shared property filter options"
            >
              <ChevronDown size={12} />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="property-help-tooltip"
              side="bottom"
              align="end"
              sideOffset={4}
            >
              <div
                className="property-filter-menu"
                role="group"
                aria-label="Shared property view"
              >
                {(["all", "common", "changed"] as const).map((value) => (
                  <Popover.Close key={value} asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-pressed={view === value}
                      onClick={() => setView(value)}
                    >
                      {value === "all"
                        ? "All properties"
                        : value === "common"
                          ? "Common properties"
                          : "Changed properties"}
                    </Button>
                  </Popover.Close>
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {!fields.length && (
        <p className="property-note" role="status">
          {filter
            ? "No shared properties match this search."
            : view === "changed"
              ? "No shared property overrides."
              : "These layers have no compatible shared properties. Select layers of similar types."}
        </p>
      )}
      {groups.map((group) => (
        <Disclosure
          className="bulk-property-group"
          key={group + ":" + view + ":" + Boolean(filter)}
          open
        >
          <DisclosureSummary>{group}</DisclosureSummary>
          {fields
            .filter(([, spec]) => spec.group === group)
            .map(([name, spec]) => {
              const values = layers.map((layer) =>
                layerPropertyValue(layer, name),
              );
              return (
                <BulkField
                  key={name + ":" + spec.kind}
                  name={name}
                  spec={spec}
                  values={values}
                  overridden={layers.some(
                    (layer) =>
                      overrides[layer.node.id]?.properties?.[name] !==
                      undefined,
                  )}
                  commit={(value, part) =>
                    onChange(
                      propertyChanges(layers, overrides, name, value, part),
                    )
                  }
                  reset={() =>
                    onChange(
                      propertyChanges(layers, overrides, name, undefined),
                    )
                  }
                />
              );
            })}
        </Disclosure>
      ))}{" "}
      <Disclosure className="export-setup">
        <DisclosureSummary>
          <span>Export setup</span>
        </DisclosureSummary>
        {allSources ? (
          <div className="property-row">
            <label htmlFor="bulk-class">Instance type</label>
            <SelectControl
              id="bulk-class"
              aria-label="Selected layers instance type"
              value={
                sharedValue(
                  layers.map(
                    (layer) => overrides[layer.node.id]?.className ?? "auto",
                  ),
                ) ?? "mixed"
              }
              renderOption={(_value, label) => (
                <span className="roblox-class-option">
                  {!["Mixed", "Automatic"].includes(label) && (
                    <RobloxClassIcon className={label} />
                  )}
                  <span>{label}</span>
                </span>
              )}
              onChange={(e) => {
                try {
                  onChange(classChanges(layers, overrides, e.target.value));
                  setError("");
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Could not assign the class.",
                  );
                }
              }}
            >
              <option value="mixed" disabled>
                Mixed
              </option>
              <option value="auto">Automatic</option>
              {classes.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </SelectControl>
          </div>
        ) : (
          <p className="property-note">
            Class assignment requires source layers outside baked images.
            Generated screens and modifiers keep their instance type.
          </p>
        )}
        <p className="property-note">
          Class changes may need New copy in Studio. In the Layers tree,{" "}
          {formatShortcut("Alt+0")} restores Automatic;{" "}
          {formatShortcut("Alt+1–6")} assigns Frame, TextLabel, ImageLabel,
          TextButton, ImageButton or ScrollingFrame when compatible.
        </p>
        {error && (
          <p className="property-error" role="alert">
            {error}
          </p>
        )}
      </Disclosure>
    </fieldset>
  );
}
