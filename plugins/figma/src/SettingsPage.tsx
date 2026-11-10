import { useId, useState, type ReactNode } from "react";
import type { ExportOptions } from "../../../packages/core/src/types";
import { validAssetId } from "../../../packages/core/src/geometry";
import type { PluginTheme } from "./plugin-appearance";
import { DEFAULT_FIGMA_OPTIONS } from "./design-screen";
import { DesignScreenSettings } from "./DesignScreenSettings";
import { ThemeLibraryEditor } from "./ThemeEditor";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { CircleHelp, Moon, RotateCcw, Sun, X } from "./components/Glyph";
import { SelectControl } from "./components/SelectControl";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
import "./settings-page.css";

const sections = ["Workspace", "Layout", "Images", "Fonts", "Themes"] as const;
export type SettingsSection = (typeof sections)[number];

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="preference-row">
      <div className="preference-label">
        <label htmlFor={id}>{label}</label>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="settings-hint"
                aria-label={`About ${label.toLowerCase()}`}
              >
                <CircleHelp size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="settings-hint-content" sideOffset={6}>
              {hint}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="preference-control">{children(id)}</div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      {(id) => (
        <Switch
          id={id}
          aria-label={label}
          checked={checked}
          onCheckedChange={onChange}
        />
      )}
    </SettingRow>
  );
}

/** Focused settings categories share the workspace's control and spacing system. */
export function SettingsPage({
  options,
  onChange,
  appearance,
  disabled = false,
  onRestore,
  initialSection = "Workspace",
}: {
  options: ExportOptions;
  onChange: (patch: Partial<ExportOptions>) => void;
  appearance: {
    theme: PluginTheme;
    choose: (theme: string) => void;
    error: string;
  };
  disabled?: boolean;
  onRestore?: () => void;
  initialSection?: SettingsSection;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [fontFamily, setFontFamily] = useState("");
  const [fontId, setFontId] = useState("");
  const validFont = !!fontFamily.trim() && !!validAssetId(fontId);
  const addFont = () => {
    const id = validAssetId(fontId);
    if (!fontFamily.trim() || !id) return;
    onChange({ fontIds: { ...options.fontIds, [fontFamily.trim()]: id } });
    setFontFamily("");
    setFontId("");
  };
  return (
    <TooltipProvider delayDuration={250}>
      <section
        className="page settings-page preferences-page settings-page-refined"
        aria-label="Plugin settings"
      >
        <nav className="settings-categories" aria-label="Settings categories">
          {sections.map((name) => (
            <Button
              key={name}
              variant="ghost"
              shape="rounded"
              className="settings-category"
              aria-pressed={section === name}
              onClick={() => setSection(name)}
            >
              {name}
            </Button>
          ))}
        </nav>
        <div className="settings-category-content">
          <div
            key={section}
            className="settings-category-panel"
            role="region"
            aria-label={`${section} settings`}
          >
            {section === "Workspace" && (
              <>
                <SettingRow label="Theme">
                  {(id) => (
                    <ToggleGroup
                      id={id}
                      type="single"
                      className="settings-theme-choice"
                      aria-label="Plugin theme"
                      value={appearance.theme}
                      onValueChange={(theme) => {
                        if (theme) appearance.choose(theme);
                      }}
                    >
                      <ToggleGroupItem value="light">
                        <Sun size={15} />
                        Light
                      </ToggleGroupItem>
                      <ToggleGroupItem value="dark">
                        <Moon size={15} />
                        Dark
                      </ToggleGroupItem>
                    </ToggleGroup>
                  )}
                </SettingRow>
                {appearance.error && (
                  <p className="property-error" role="alert">
                    {appearance.error}
                  </p>
                )}
                <fieldset disabled={disabled}>
                  <SettingRow
                    label="ScreenGui name"
                    hint="Leave empty to use each selected Figma frame’s name."
                  >
                    {(id) => (
                      <Input
                        id={id}
                        aria-label="ScreenGui name"
                        placeholder="Use frame name"
                        value={options.rootName}
                        onChange={(e) => onChange({ rootName: e.target.value })}
                      />
                    )}
                  </SettingRow>
                  <ToggleRow
                    label="Detect buttons"
                    hint="Recognize button layer names. Adding interaction scripts stays opt-in in Studio."
                    checked={options.detectButtons}
                    onChange={(detectButtons) => onChange({ detectButtons })}
                  />
                  <ToggleRow
                    label="Include hidden layers"
                    hint="Import hidden layers with Visible turned off."
                    checked={options.includeHidden}
                    onChange={(includeHidden) => onChange({ includeHidden })}
                  />
                </fieldset>
                <Disclosure className="settings-layer-hints">
                  <DisclosureSummary>Layer name shortcuts</DisclosureSummary>
                  <dl>
                    <div>
                      <dt>
                        <code>[button]</code>
                      </dt>
                      <dd>Export as a button</dd>
                    </div>
                    <div>
                      <dt>
                        <code>[raster]</code>
                      </dt>
                      <dd>Render as an image</dd>
                    </div>
                    <div>
                      <dt>
                        <code>[skip]</code>
                      </dt>
                      <dd>Leave out of export</dd>
                    </div>
                  </dl>
                </Disclosure>
              </>
            )}
            {section === "Layout" && (
              <fieldset disabled={disabled}>
                <DesignScreenSettings options={options} onChange={onChange} />
                <SettingRow
                  label="Layout strategy"
                  hint="Responsive layout converts Auto Layout and regular grids to native Roblox layouts. Preserve geometry keeps fixed positions."
                >
                  {(id) => (
                    <SelectControl
                      id={id}
                      aria-label="Layout strategy"
                      value={options.layout}
                      onChange={(e) =>
                        onChange({
                          layout: e.target.value as ExportOptions["layout"],
                        })
                      }
                    >
                      <option value="responsive">Responsive layout</option>
                      <option value="exact">Preserve geometry</option>
                    </SelectControl>
                  )}
                </SettingRow>
                <SettingRow
                  label="Style sizing"
                  hint="Scale borders, corners and spacing with the UI, or retain their pixel values."
                >
                  {(id) => (
                    <SelectControl
                      id={id}
                      aria-label="Style sizing"
                      value={options.styleSizing ?? "pixels"}
                      onChange={(e) =>
                        onChange({
                          styleSizing: e.target
                            .value as ExportOptions["styleSizing"],
                        })
                      }
                    >
                      <option value="pixels">Keep pixels</option>
                      <option value="scale">Scale with UI</option>
                    </SelectControl>
                  )}
                </SettingRow>
                <ToggleRow
                  label="Ignore Roblox top bar inset"
                  hint="Allow exported screens to use the full viewport."
                  checked={options.ignoreGuiInset}
                  onChange={(ignoreGuiInset) => onChange({ ignoreGuiInset })}
                />
              </fieldset>
            )}
            {section === "Images" && (
              <fieldset disabled={disabled}>
                <SettingRow
                  label="Image resolution"
                  hint="Higher resolutions increase artwork size and rendering time."
                >
                  {(id) => (
                    <ToggleGroup
                      id={id}
                      type="single"
                      className="settings-resolution-choice"
                      aria-label="Image resolution"
                      value={String(options.imageScale)}
                      onValueChange={(value) => {
                        if (value)
                          onChange({
                            imageScale: Number(
                              value,
                            ) as ExportOptions["imageScale"],
                          });
                      }}
                    >
                      {[1, 2, 3].map((value) => (
                        <ToggleGroupItem key={value} value={String(value)}>
                          {value}×
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  )}
                </SettingRow>
                <SettingRow
                  label="Appearance priority"
                  hint="Preserve complex effects as images, or prefer native editable layers."
                >
                  {(id) => (
                    <SelectControl
                      id={id}
                      aria-label="Appearance priority"
                      value={options.appearance}
                      onChange={(e) =>
                        onChange({
                          appearance: e.target
                            .value as ExportOptions["appearance"],
                        })
                      }
                    >
                      <option value="faithful">Preserve appearance</option>
                      <option value="editable">Prefer editable</option>
                    </SelectControl>
                  )}
                </SettingRow>
                <ToggleRow
                  label="Keep text editable"
                  hint="Use native text even when it has complex styling."
                  checked={options.preserveText}
                  onChange={(preserveText) => onChange({ preserveText })}
                />
              </fieldset>
            )}
            {section === "Fonts" && (
              <fieldset disabled={disabled} className="settings-fonts">
                <div className="settings-font-entry">
                  <label>
                    <span>Figma family</span>
                    <Input
                      aria-label="Figma font family"
                      placeholder="e.g. Inter"
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addFont();
                        }
                      }}
                    />
                  </label>
                  <label>
                    <span>Roblox family asset ID</span>
                    <Input
                      aria-label="Roblox font family ID"
                      placeholder="Asset ID"
                      inputMode="numeric"
                      value={fontId}
                      onChange={(e) => setFontId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addFont();
                        }
                      }}
                    />
                  </label>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={!validFont}
                    onClick={addFont}
                  >
                    Add
                  </Button>
                </div>
                <p className="settings-font-fallback">
                  Unmapped fonts use Source Sans Pro.
                </p>
                <div className="settings-font-mappings">
                  {Object.entries(options.fontIds).map(([family, id]) => (
                    <div className="settings-font-mapping" key={family}>
                      <span title={family}>{family}</span>
                      <code title={id}>{id}</code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove font mapping ${family}`}
                        onClick={() => {
                          const next = { ...options.fontIds };
                          delete next[family];
                          onChange({ fontIds: next });
                        }}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
            {section === "Themes" && (
              <fieldset disabled={disabled} className="settings-theme-editor">
                <ThemeLibraryEditor
                  defaultOpen
                  value={options.themes}
                  enabled={options.themeEnabled !== false}
                  onEnabledChange={(themeEnabled) => onChange({ themeEnabled })}
                  onChange={(themes) =>
                    onChange({ themes, themeEnabled: true })
                  }
                />
              </fieldset>
            )}
          </div>
          <div className="settings-restore">
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onRestore ? onRestore() : onChange({ ...DEFAULT_FIGMA_OPTIONS })
              }
            >
              <RotateCcw size={14} />
              Restore defaults
            </Button>
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}
