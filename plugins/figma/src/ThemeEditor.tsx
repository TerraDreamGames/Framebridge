import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { useState } from "react";
import { ChevronRight, CircleHelp } from "./components/Glyph";
import {
  DEFAULT_THEMES,
  resolveThemes,
  type ThemeKind,
  type ThemeLayer,
  type ThemeSettings,
  type ThemeToken,
} from "../../../packages/core/src/theme-tokens";
import type { Value } from "../../../packages/core/src/types";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import { Button } from "./components/ui/button";
import { SelectControl } from "./components/SelectControl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
import "./settings-panels.css";
const kinds: ThemeKind[] = ["color", "background", "font", "shadow", "hover"];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const fieldLabels: Record<string, string> = {
  Color: "Color",
  Transparency: "Transparency",
  FontFace: "Font",
  TextSize: "Text size",
  BlurRadius: "Blur radius",
  Offset: "Offset",
  Spread: "Spread",
  BackgroundColor3: "Background color",
  BackgroundTransparency: "Background transparency",
  TextColor3: "Text color",
  TextTransparency: "Text transparency",
  ImageColor3: "Image tint",
  ImageTransparency: "Image transparency",
};
const numberFields: Record<string, string[]> = {
  UDim: ["Scale", "Pixels"],
  UDim2: ["X scale", "X pixels", "Y scale", "Y pixels"],
};
function TokenValue({
  field,
  value,
  onChange,
}: {
  field: string;
  value: Value;
  onChange: (v: Value) => boolean;
}) {
  if (typeof value === "number")
    return (
      <Input
        aria-label={field}
        type="number"
        defaultValue={value}
        key={value}
        step="any"
        onBlur={(e) => {
          if (!onChange(e.target.value.trim() ? Number(e.target.value) : NaN))
            e.target.value = String(value);
        }}
      />
    );
  if (typeof value !== "object") return null;
  if (value.type === "Color3")
    return (
      <Input
        aria-label={field}
        type="color"
        value={
          "#" +
          value.value
            .map((v) =>
              Math.round(v * 255)
                .toString(16)
                .padStart(2, "0"),
            )
            .join("")
        }
        onChange={(e) =>
          onChange({
            type: "Color3",
            value: [1, 3, 5].map(
              (i) => parseInt(e.target.value.slice(i, i + 2), 16) / 255,
            ),
          })
        }
      />
    );
  if (value.type === "Font")
    return (
      <div className="theme-font-value">
        <Input
          aria-label="Font family asset"
          defaultValue={value.family}
          key={value.family}
          onBlur={(e) => {
            if (!onChange({ ...value, family: e.target.value.trim() }))
              e.target.value = value.family;
          }}
        />
        <SelectControl
          aria-label="Font weight"
          value={value.weight}
          onChange={(e) => onChange({ ...value, weight: e.target.value })}
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
          ].map((weight) => (
            <option key={weight}>{weight}</option>
          ))}
        </SelectControl>
        <SelectControl
          aria-label="Font style"
          value={value.style}
          onChange={(e) => onChange({ ...value, style: e.target.value })}
        >
          <option>Normal</option>
          <option>Italic</option>
        </SelectControl>
      </div>
    );
  if (value.type === "UDim" || value.type === "UDim2")
    return (
      <div className="property-number theme-number-value">
        {value.value.map((n, i) => (
          <Input
            key={`${field}:${i}:${n}`}
            aria-label={`${field} ${numberFields[value.type][i]}`}
            type="number"
            defaultValue={n}
            step="any"
            onBlur={(e) => {
              if (
                !onChange({
                  ...value,
                  value: value.value.map((v, j) =>
                    j === i
                      ? e.target.value.trim()
                        ? Number(e.target.value)
                        : NaN
                      : v,
                  ),
                })
              )
                e.target.value = String(n);
            }}
          />
        ))}
      </div>
    );
  return null;
}
export function ThemeLibraryEditor({
  value,
  onChange,
  enabled = true,
  onEnabledChange,
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  value: ThemeSettings | undefined;
  onChange: (v: ThemeSettings | undefined) => void;
}) {
  const [mode, setMode] = useState(""),
    [error, setError] = useState(""),
    [newName, setNewName] = useState(""),
    [kind, setKind] = useState<ThemeKind>("color");
  let invalid = "";
  try {
    if (value) resolveThemes(value);
  } catch (e) {
    invalid = e instanceof Error ? e.message : "Invalid theme settings";
  }
  if (invalid)
    return (
      <Disclosure
        className="export-setup theme-library"
        open={defaultOpen || undefined}
      >
        <DisclosureSummary>
          <span>Theme tokens</span>
          <span className="export-setup-summary">Needs review</span>
        </DisclosureSummary>
        <p className="property-error" role="alert">
          {invalid} Saved settings are preserved until you replace them.
        </p>
        <Button
          variant="outline"
          onClick={() => onChange(clone(DEFAULT_THEMES))}
        >
          Replace with Light & Dark themes
        </Button>
      </Disclosure>
    );
  const selected =
    value && Object.prototype.hasOwnProperty.call(value.modes, mode)
      ? mode
      : (value?.initial ?? "");
  const patch = (next: ThemeSettings) => {
    try {
      resolveThemes(next);
      onChange(next);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid theme settings");
      return false;
    }
  };
  const token = (id: string, next: ThemeToken) => {
    if (!value) return false;
    return patch({
      ...value,
      modes: {
        ...value.modes,
        [selected]: { ...value.modes[selected], [id]: next },
      },
    });
  };
  return (
    <Disclosure
      className="export-setup theme-library"
      open={defaultOpen || undefined}
    >
      <DisclosureSummary>
        <span>Theme tokens</span>
        <span className="export-setup-summary">
          {value ? `${Object.keys(value.modes).length} themes` : ""}
        </span>
      </DisclosureSummary>
      <div className="theme-library-body">
        {!value ? (
          <Button
            variant="outline"
            onClick={() => onChange(clone(DEFAULT_THEMES))}
          >
            Create Light & Dark themes
          </Button>
        ) : (
          <>
            <div className="property-row theme-export-row">
              <div className="settings-label">
                <label htmlFor="theme-enabled">Themed export</label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="settings-hint"
                        aria-label="About theme tokens"
                      >
                        <CircleHelp size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      className="settings-hint-content"
                      sideOffset={6}
                    >
                      Bind named styles in Properties. Application scripts
                      switch themes through the exported root’s FramebridgeTheme
                      attribute. Turning export off preserves your library and
                      bindings.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Switch
                id="theme-enabled"
                aria-label="Themed export"
                checked={enabled}
                onCheckedChange={onEnabledChange}
              />
            </div>
            <div className="theme-mode-controls">
              <label>
                <span>Editing theme</span>
                <SelectControl
                  aria-label="Editing theme"
                  value={selected}
                  onChange={(e) => setMode(e.target.value)}
                >
                  {Object.keys(value.modes).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </SelectControl>
              </label>
              <label>
                <span>Initial theme</span>
                <SelectControl
                  aria-label="Initial theme"
                  value={value.initial}
                  onChange={(e) => patch({ ...value, initial: e.target.value })}
                >
                  {Object.keys(value.modes).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </SelectControl>
              </label>
            </div>
            <div className="theme-token-list">
              {Object.entries(value.modes[selected]).map(([id, t]) => (
                <Disclosure className="motion-preset theme-token" key={id}>
                  <DisclosureSummary>
                    <span>{id}</span>
                    <span className="export-setup-summary">
                      {"ref" in t ? `Alias of ${t.ref}` : t.kind}
                    </span>
                  </DisclosureSummary>
                  {"ref" in t ? (
                    <Input
                      aria-label={`${id} alias token`}
                      defaultValue={t.ref}
                      key={t.ref}
                      onBlur={(e) => {
                        if (!token(id, { ref: e.target.value.trim() }))
                          e.target.value = t.ref;
                      }}
                    />
                  ) : (
                    Object.entries(t.values).map(([field, v]) => (
                      <div
                        className="property-row"
                        key={`${selected}:${field}`}
                      >
                        <label>{fieldLabels[field] ?? field}</label>
                        <TokenValue
                          field={`${id} ${field}`}
                          value={v}
                          onChange={(next) =>
                            token(id, {
                              ...t,
                              values: { ...t.values, [field]: next },
                            })
                          }
                        />
                      </div>
                    ))
                  )}
                  <div className="property-row">
                    <label>Alias of</label>
                    <SelectControl
                      aria-label={`${id} alias of`}
                      value={"ref" in t ? t.ref : ""}
                      onChange={(e) =>
                        token(
                          id,
                          e.target.value
                            ? { ref: e.target.value }
                            : clone(
                                resolveThemes(value).resolved[selected][id],
                              ),
                        )
                      }
                    >
                      <option value="">Own values</option>
                      {Object.entries(resolveThemes(value).resolved[selected])
                        .filter(
                          ([key, target]) =>
                            key !== id &&
                            target.kind ===
                              resolveThemes(value).resolved[selected][id].kind,
                        )
                        .map(([key]) => (
                          <option key={key}>{key}</option>
                        ))}
                    </SelectControl>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="theme-remove-token"
                    aria-label={`Remove ${id} from all themes`}
                    title="Removes this token from every theme"
                    onClick={() => {
                      const next = clone(value);
                      for (const tokens of Object.values(next.modes))
                        delete tokens[id];
                      patch(next);
                    }}
                  >
                    Remove token
                  </Button>
                </Disclosure>
              ))}
            </div>
            <div className="theme-new-token">
              <Input
                aria-label="New theme or token name"
                placeholder="New name"
                title="Use letters, numbers and dots"
                value={newName}
                maxLength={64}
                onChange={(e) => setNewName(e.target.value)}
              />
              <SelectControl
                aria-label="New token kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ThemeKind)}
              >
                {kinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </SelectControl>
            </div>
            <div className="theme-library-actions">
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    Object.prototype.hasOwnProperty.call(value.modes, newName)
                  ) {
                    setError("That theme name already exists.");
                    return;
                  }
                  if (
                    patch({
                      ...value,
                      modes: {
                        ...value.modes,
                        [newName]: clone(value.modes[selected]),
                      },
                    })
                  ) {
                    setMode(newName);
                    setNewName("");
                  }
                }}
              >
                Duplicate theme
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    Object.prototype.hasOwnProperty.call(
                      value.modes[selected],
                      newName,
                    )
                  ) {
                    setError("That token name already exists.");
                    return;
                  }
                  const next = clone(value);
                  for (const [mode, tokens] of Object.entries(next.modes)) {
                    const preset = Object.values(
                      DEFAULT_THEMES.modes[mode === "Dark" ? "Dark" : "Light"],
                    ).find((t) => "kind" in t && t.kind === kind)!;
                    tokens[newName] = clone(preset);
                  }
                  if (patch(next)) setNewName("");
                }}
              >
                Add token
              </Button>
            </div>
            {Object.keys(value.modes).length > 1 && (
              <Button
                variant="ghost"
                onClick={() => {
                  const next = clone(value);
                  delete next.modes[selected];
                  if (next.initial === selected)
                    next.initial = Object.keys(next.modes)[0];
                  patch(next);
                }}
              >
                Remove theme
              </Button>
            )}
          </>
        )}
        {error && (
          <p className="property-error" role="alert">
            {error} This edit was not saved.
          </p>
        )}
      </div>
    </Disclosure>
  );
}
export function ThemeLayerEditor({
  value,
  themes,
  onChange,
}: {
  value: ThemeLayer | false | undefined;
  themes: ThemeSettings | undefined;
  onChange: (v: ThemeLayer | false | undefined) => void;
}) {
  let tokens: Record<string, Exclude<ThemeToken, { ref: string }>> = {};
  try {
    if (themes) tokens = resolveThemes(themes).resolved[themes.initial];
  } catch {
    /* The library editor displays invalid settings. */
  }
  const selected = value || {};
  return (
    <Disclosure className="export-setup theme-bindings">
      <DisclosureSummary>
        <span>Theme tokens</span>
        <span className="export-setup-summary">
          {Object.keys(selected).length
            ? `${Object.keys(selected).length} bound`
            : ""}
        </span>
      </DisclosureSummary>
      {!themes && (
        <p className="property-note">
          Create theme tokens in Settings to bind styles.
        </p>
      )}
      {kinds.map((kind) => (
        <div className="property-row" key={kind}>
          <label htmlFor={`theme-${kind}`}>
            {kind[0].toUpperCase() + kind.slice(1)}
          </label>
          <SelectControl
            id={`theme-${kind}`}
            disabled={!themes}
            value={selected[kind] ?? ""}
            onChange={(e) => {
              const next = { ...selected };
              if (e.target.value) next[kind] = e.target.value;
              else delete next[kind];
              onChange(Object.keys(next).length ? next : undefined);
            }}
          >
            <option value="">Keep appearance</option>
            {Object.entries(tokens)
              .filter(([, token]) => token.kind === kind)
              .map(([id]) => (
                <option key={id}>{id}</option>
              ))}
          </SelectControl>
        </div>
      ))}
    </Disclosure>
  );
}
