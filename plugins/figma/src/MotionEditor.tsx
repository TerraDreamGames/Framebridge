import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { cloneSettings } from "../../../packages/core/src/clone-settings";
import { useState } from "react";
import { ChevronRight } from "./components/Glyph";
import {
  MOTION_DEFAULTS,
  MOTION_FIELDS,
  validMotion,
  type MotionSettings,
} from "../../../packages/core/src/motion";
import { layerBehavior } from "../../../packages/core/src/behaviors";
import type {
  DesignNode,
  LayerOverride,
  RbxNode,
} from "../../../packages/core/src/types";
import { SelectControl } from "./components/SelectControl";
import { Switch } from "./components/ui/switch";
import { Input } from "./components/ui/input";
const labels: Record<keyof typeof MOTION_DEFAULTS, string> = {
  hover: "Hover response",
  press: "Press response",
  float: "Float",
  spin: "Spin",
  pulse: "Pulse",
  blink: "Blink",
  enter: "Entrance",
  shine: "Shine",
  magnet: "Cursor magnet",
  drift: "Texture drift",
  sounds: "Sounds",
};
const descriptions: Partial<Record<keyof typeof MOTION_DEFAULTS, string>> = {
  hover: "Responds to this button or the nearest parent button.",
  blink: "Fades the whole element while keeping its layout space.",
  enter: "Replays whenever this element or its panel becomes visible.",
  magnet: "Mouse only. Touch and gamepad keep the normal button response.",
  drift: "Requires an image with Tile image fit.",
  sounds: "Plays in Roblox. Audio must be permitted for your experience.",
};
const fieldLabels: Record<string, string> = {
  scale: "Scale multiplier",
  rotation: "Rotation · °",
  lift: "Lift · px",
  duration: "Time · seconds",
  distance: "Travel · px",
  period: "Cycle · seconds",
  direction: "Direction · °",
  speed: "Speed",
  visible: "Visible · seconds",
  hidden: "Hidden · seconds",
  fade: "Fade · seconds",
  delay: "Delay · seconds",
  width: "Band width",
  opacity: "Opacity",
  radius: "Radius · px",
  pull: "Pull · px",
  volume: "Volume",
};
export function MotionEditor({
  source,
  node,
  edit,
  onChange,
}: {
  source: DesignNode;
  node: RbxNode;
  edit: LayerOverride;
  onChange: (behavior: LayerOverride["behavior"]) => void;
}) {
  const [error, setError] = useState("");
  const behavior = layerBehavior(source, edit) ?? {};
  const value = behavior.motion ?? {};
  const count = Object.keys(MOTION_DEFAULTS).filter(
    (key) => value[key as keyof MotionSettings] !== undefined,
  ).length;
  const patch = (next: MotionSettings) => {
    const clean = JSON.parse(JSON.stringify(next)) as MotionSettings;
    const active = Object.keys(MOTION_DEFAULTS).some(
      (key) => clean[key as keyof MotionSettings] !== undefined,
    );
    if (active && !validMotion(clean)) {
      setError(
        "Check the numeric ranges, audio IDs, and blink times. Fade cannot exceed either blink phase. This edit was not saved.",
      );
      return false;
    }
    setError("");
    onChange({
      ...behavior,
      ...(behavior.action?.target && node.behavior?.action
        ? { action: node.behavior.action }
        : {}),
      motion: active ? clean : undefined,
    });
    return true;
  };
  const update = (
    key: keyof typeof MOTION_DEFAULTS,
    field: string,
    entry: unknown,
  ) => patch({ ...value, [key]: { ...value[key], [field]: entry } });
  return (
    <Disclosure className="export-setup motion-setup editor-section">
      <DisclosureSummary>
        <span>Motion & sound</span>
        <span className="export-setup-summary">
          {count ? `${count} enabled` : "Optional"}
        </span>
      </DisclosureSummary>
      <p className="property-note">
        Try effects with Test UI. Exported effects run in Roblox Play.
      </p>
      {edit.behavior === false && (
        <p className="property-note">
          Adding an effect enables custom settings for this layer.
        </p>
      )}
      {Object.entries(labels).map(([raw, label]) => {
        const key = raw as keyof typeof MOTION_DEFAULTS;
        const setting = value[key];
        const data = setting as Record<string, unknown> | undefined;
        return (
          <Disclosure className="motion-preset" key={key}>
            <DisclosureSummary>
              <span>{label}</span>
              <Switch
                id={`motion-${key}`}
                aria-label={`Enable ${label}`}
                checked={!!setting}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={(enabled) =>
                  patch({
                    ...value,
                    [key]: enabled
                      ? cloneSettings(MOTION_DEFAULTS[key])
                      : undefined,
                  })
                }
              />
            </DisclosureSummary>
            {setting ? (
              <>
                {descriptions[key] && (
                  <p className="property-note">{descriptions[key]}</p>
                )}
                {key === "enter" && (
                  <div className="property-row">
                    <label htmlFor="motion-enter-kind">Style</label>
                    <SelectControl
                      id="motion-enter-kind"
                      value={String(data!.kind)}
                      onChange={(e) => update(key, "kind", e.target.value)}
                    >
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                      <option value="pop">Pop</option>
                    </SelectControl>
                  </div>
                )}
                {key === "shine" && (
                  <div className="property-row">
                    <label htmlFor="motion-shine-trigger">When</label>
                    <SelectControl
                      id="motion-shine-trigger"
                      value={String(data!.trigger)}
                      onChange={(e) => update(key, "trigger", e.target.value)}
                    >
                      <option value="loop">Repeat</option>
                      <option value="hover">Once on hover / focus</option>
                    </SelectControl>
                  </div>
                )}
                {Object.entries(MOTION_FIELDS[key]).map(([field, bounds]) => (
                  <div className="property-row" key={field}>
                    <label htmlFor={`motion-${key}-${field}`}>
                      {fieldLabels[field] ?? field}
                      {field === "speed"
                        ? key === "spin"
                          ? " · °/sec"
                          : " · px/sec"
                        : ""}
                    </label>
                    <Input
                      id={`motion-${key}-${field}`}
                      type="number"
                      defaultValue={Number(data![field])}
                      key={`${key}:${field}:${data![field]}`}
                      min={bounds[0]}
                      max={bounds[1]}
                      step={
                        [
                          "scale",
                          "duration",
                          "period",
                          "fade",
                          "delay",
                          "width",
                          "opacity",
                          "volume",
                        ].includes(field)
                          ? 0.01
                          : 1
                      }
                      onBlur={(e) => {
                        const n = e.target.value.trim()
                          ? Number(e.target.value)
                          : NaN;
                        if (!Number.isFinite(n) || !update(key, field, n)) {
                          e.target.value = String(data![field]);
                          if (!Number.isFinite(n))
                            setError(
                              "Enter a finite number within the field range. This edit was not saved.",
                            );
                        }
                      }}
                    />
                  </div>
                ))}
                {(key === "hover" || key === "shine") && (
                  <div className="property-row">
                    <label htmlFor={`motion-${key}-color`}>
                      {key === "hover" ? "Hover tint" : "Band color"}
                    </label>
                    <div className="motion-color-field">
                      {key === "hover" && (
                        <Switch
                          aria-label="Enable hover tint"
                          checked={!!data!.tint}
                          onCheckedChange={(on) =>
                            update(key, "tint", on ? [1, 1, 1] : undefined)
                          }
                        />
                      )}
                      <Input
                        id={`motion-${key}-color`}
                        type="color"
                        disabled={key === "hover" && !data!.tint}
                        value={
                          "#" +
                          (
                            (data![key === "hover" ? "tint" : "color"] as
                              number[] | undefined) ?? [1, 1, 1]
                          )
                            .map((v) =>
                              Math.round(v * 255)
                                .toString(16)
                                .padStart(2, "0"),
                            )
                            .join("")
                        }
                        onChange={(e) =>
                          update(
                            key,
                            key === "hover" ? "tint" : "color",
                            [1, 3, 5].map(
                              (start) =>
                                parseInt(
                                  e.target.value.slice(start, start + 2),
                                  16,
                                ) / 255,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                )}
                {key === "sounds" &&
                  (["hover", "press"] as const).map((kind) => (
                    <div className="property-row" key={kind}>
                      <label htmlFor={`motion-sound-${kind}`}>
                        {kind === "hover" ? "Hover sound" : "Press sound"}
                      </label>
                      <Input
                        id={`motion-sound-${kind}`}
                        placeholder="Roblox audio asset ID"
                        defaultValue={String(data![kind] ?? "")}
                        key={String(data![kind])}
                        maxLength={33}
                        onBlur={(e) => {
                          if (
                            !update(
                              key,
                              kind,
                              e.target.value.trim() || undefined,
                            )
                          )
                            e.target.value = String(data![kind] ?? "");
                        }}
                      />
                    </div>
                  ))}
              </>
            ) : (
              <p className="property-note">
                Enable this effect to configure it.
              </p>
            )}
          </Disclosure>
        );
      })}
      {count > 0 && (
        <div className="property-row">
          <label htmlFor="motion-owner">Input response</label>
          <SelectControl
            id="motion-owner"
            value={value.input ?? "auto"}
            onChange={(e) =>
              patch({
                ...value,
                input: e.target.value as MotionSettings["input"],
              })
            }
          >
            <option value="auto">This button or nearest parent</option>
            <option value="parent">Nearest parent button only</option>
          </SelectControl>
        </div>
      )}
      {error && (
        <p className="property-error" role="alert">
          {error}
        </p>
      )}
    </Disclosure>
  );
}
