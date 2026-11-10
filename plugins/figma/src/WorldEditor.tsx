import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { useState } from "react";
import { ChevronRight } from "./components/Glyph";
import {
  defaultWorldSettings,
  validWorldSettings,
  worldProperties,
  type WorldSettings,
} from "../../../packages/core/src/world-space";
import { flatten, type RbxNode } from "../../../packages/core/src/types";
import { SelectControl } from "./components/SelectControl";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";

export function WorldEditor({
  root,
  value,
  onChange,
}: {
  root: RbxNode;
  value: WorldSettings | false | undefined;
  onChange: (value: WorldSettings | false) => void;
}) {
  const [error, setError] = useState("");
  const nodes = flatten([root]);
  const parents = new Map(
    nodes.flatMap((n) => n.children.map((child) => [child.id, n] as const)),
  );
  const settings = value === false ? undefined : value || root.worldUI;
  const commit = (next: WorldSettings) => {
    if (!validWorldSettings(next)) {
      setError(
        "Check the world size, distance, timing and input settings. This edit was not saved.",
      );
      return false;
    }
    const roles = Object.values(next.prompt?.labels ?? {});
    if (new Set(roles).size !== roles.length) {
      setError(
        "Choose a different layer for each prompt role. This edit was not saved.",
      );
      return false;
    }
    if (
      next.kind === "surface" &&
      nodes.some((n) => n.className === "CanvasGroup")
    ) {
      setError(
        "SurfaceGui cannot render CanvasGroup. Change those containers to Frame before choosing a Part surface.",
      );
      return false;
    }
    try {
      worldProperties(next, root.referenceSize ?? [0, 0]);
    } catch (cause) {
      setError(
        (cause instanceof Error
          ? cause.message
          : "Check the world dimensions.") + " This edit was not saved.",
      );
      return false;
    }
    setError("");
    onChange(next);
    return true;
  };
  const update = (patch: Partial<WorldSettings>) =>
    settings && commit({ ...settings, ...patch });
  const numeric = (
    label: string,
    value: number,
    min: number,
    max: number,
    save: (v: number) => boolean | false | undefined,
  ) => (
    <div className="property-row" key={label}>
      <label>{label}</label>
      <Input
        aria-label={label}
        type="number"
        step="any"
        min={min}
        max={max}
        key={label + value}
        defaultValue={value}
        onBlur={(e) => {
          const number = Number(e.currentTarget.value);
          if (
            !e.currentTarget.value.trim() ||
            !Number.isFinite(number) ||
            number < min ||
            number > max
          ) {
            setError(
              `${label} must be between ${min} and ${max}. This edit was not saved.`,
            );
            e.currentTarget.value = String(value);
            return;
          }
          if (!save(number)) e.currentTarget.value = String(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            e.currentTarget.value = String(value);
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
  const boolean = (
    label: string,
    value: boolean,
    save: (v: boolean) => void,
  ) => (
    <div className="property-row">
      <label>{label}</label>
      <Switch aria-label={label} checked={value} onCheckedChange={save} />
    </div>
  );
  const prompt = settings?.prompt;
  const changePrompt = (patch: Partial<NonNullable<WorldSettings["prompt"]>>) =>
    prompt && update({ prompt: { ...prompt, ...patch } });
  return (
    <Disclosure className="export-setup world-setup editor-section">
      <DisclosureSummary>
        <span>Output location</span>
        <span className="export-setup-summary">
          {settings
            ? settings.kind === "surface"
              ? "Part surface"
              : settings.kind === "billboard"
                ? "Billboard"
                : "Proximity prompt"
            : "Player screen"}
        </span>
      </DisclosureSummary>
      <div className="property-row">
        <label>Display as</label>
        <SelectControl
          aria-label="UI output location"
          value={settings?.kind ?? "screen"}
          onChange={(e) => {
            setError("");
            if (e.target.value === "screen") onChange(false);
            else
              commit(
                defaultWorldSettings(e.target.value as WorldSettings["kind"]),
              );
          }}
        >
          <option value="screen">Player screen</option>
          <option value="surface">Part surface</option>
          <option value="billboard">World label</option>
          <option value="prompt">Proximity prompt</option>
        </SelectControl>
      </div>
      {settings && (
        <>
          <p className="property-note">
            Select{" "}
            {settings.kind === "surface" ? "a Part" : "a Part or Attachment"} in
            Studio before the first import. Updates reuse that target. The
            preview shows the authored artwork; test distance and world
            interaction in Studio.
          </p>
          {settings.kind === "surface" ? (
            <div className="property-row">
              <label>Part face</label>
              <SelectControl
                aria-label="Part face"
                value={settings.face}
                onChange={(e) =>
                  update({ face: e.target.value as WorldSettings["face"] })
                }
              >
                {["Front", "Back", "Left", "Right", "Top", "Bottom"].map(
                  (face) => (
                    <option key={face}>{face}</option>
                  ),
                )}
              </SelectControl>
            </div>
          ) : (
            <>
              {numeric("Width · studs", settings.widthStuds!, 0.01, 1000, (v) =>
                update({ widthStuds: v }),
              )}
              {settings.offset!.map((v, i) =>
                numeric(
                  "World offset " + ["X", "Y", "Z"][i] + " · studs",
                  v,
                  -1000,
                  1000,
                  (next) => {
                    const offset = [...settings.offset!] as [
                      number,
                      number,
                      number,
                    ];
                    offset[i] = next;
                    return update({ offset });
                  },
                ),
              )}
            </>
          )}
          {boolean("Show through walls", settings.alwaysOnTop, (v) =>
            update({ alwaysOnTop: v }),
          )}
          {numeric(
            "Render distance · studs",
            settings.maxDistance,
            0,
            10000,
            (v) => update({ maxDistance: v }),
          )}
          <Disclosure>
            <DisclosureSummary>World lighting</DisclosureSummary>
            {numeric("Lighting influence", settings.lightInfluence, 0, 1, (v) =>
              update({ lightInfluence: v }),
            )}
          </Disclosure>
          {prompt && (
            <>
              {(["actionText", "objectText"] as const).map((key) => (
                <div className="property-row" key={key}>
                  <label>
                    {key === "actionText" ? "Action text" : "Object text"}
                  </label>
                  <Input
                    aria-label={
                      key === "actionText"
                        ? "Prompt action text"
                        : "Prompt object text"
                    }
                    key={key + prompt[key]}
                    defaultValue={prompt[key]}
                    maxLength={200}
                    onBlur={(e) => {
                      if (!changePrompt({ [key]: e.currentTarget.value }))
                        e.currentTarget.value = prompt[key];
                    }}
                  />
                </div>
              ))}
              {numeric("Hold time · seconds", prompt.holdDuration, 0, 60, (v) =>
                changePrompt({ holdDuration: v }),
              )}
              {numeric(
                "Activation distance · studs",
                prompt.activationDistance,
                0.1,
                1000,
                (v) => changePrompt({ activationDistance: v }),
              )}
              <div className="property-row">
                <label>Keyboard key</label>
                <SelectControl
                  aria-label="Prompt keyboard key"
                  value={prompt.keyboardKey}
                  onChange={(e) =>
                    changePrompt({
                      keyboardKey: e.target.value as typeof prompt.keyboardKey,
                    })
                  }
                >
                  {["E", "F", "Q", "R", "T"].map((key) => (
                    <option key={key}>{key}</option>
                  ))}
                </SelectControl>
              </div>
              <div className="property-row">
                <label>Gamepad button</label>
                <SelectControl
                  aria-label="Prompt gamepad button"
                  value={prompt.gamepadKey}
                  onChange={(e) =>
                    changePrompt({
                      gamepadKey: e.target.value as typeof prompt.gamepadKey,
                    })
                  }
                >
                  {["ButtonX", "ButtonY", "ButtonA", "ButtonB"].map((key) => (
                    <option key={key}>{key}</option>
                  ))}
                </SelectControl>
              </div>
              {boolean(
                "Require clear line of sight",
                prompt.requiresLineOfSight,
                (v) => changePrompt({ requiresLineOfSight: v }),
              )}
              {boolean("Allow mouse clicks", prompt.clickable, (v) =>
                changePrompt({ clickable: v }),
              )}
              <Disclosure>
                <DisclosureSummary>
                  Prompt text and hold progress
                </DisclosureSummary>
                <p className="property-note">
                  Choose layers to update from the prompt. Hold progress resizes
                  a fixed Frame or ImageLabel. Connect the prompt’s Triggered
                  event in your game for the action.
                </p>
                {(["action", "object", "input", "hold"] as const).map(
                  (role) => (
                    <div className="property-row" key={role}>
                      <label>
                        {role === "hold"
                          ? "Hold progress"
                          : role === "input"
                            ? "Input hint"
                            : role === "action"
                              ? "Action label"
                              : "Object label"}
                      </label>
                      <SelectControl
                        aria-label={"Prompt " + role + " layer"}
                        value={prompt.labels?.[role] ?? ""}
                        onChange={(e) => {
                          const labels = { ...prompt.labels };
                          if (e.target.value) labels[role] = e.target.value;
                          else delete labels[role];
                          changePrompt({ labels });
                        }}
                      >
                        <option value="">Keep authored appearance</option>
                        {nodes
                          .filter((n) =>
                            role === "hold"
                              ? ["Frame", "ImageLabel"].includes(n.className) &&
                                n.sourceType !== "WORLD_CANVAS" &&
                                !n.behavior?.motion &&
                                (!n.properties.AutomaticSize ||
                                  (
                                    n.properties.AutomaticSize as {
                                      value?: string[];
                                    }
                                  ).value?.[1] === "None") &&
                                !n.children.some((child) =>
                                  [
                                    "UIAspectRatioConstraint",
                                    "UISizeConstraint",
                                  ].includes(child.className),
                                ) &&
                                !parents
                                  .get(n.id)
                                  ?.children.some((child) =>
                                    [
                                      "UIListLayout",
                                      "UIGridLayout",
                                      "UITableLayout",
                                      "UIPageLayout",
                                    ].includes(child.className),
                                  )
                              : n.className.startsWith("Text"),
                          )
                          .map((n) => (
                            <option
                              key={n.id}
                              value={n.id}
                              disabled={Object.entries(
                                prompt.labels ?? {},
                              ).some(
                                ([other, id]) => other !== role && id === n.id,
                              )}
                            >
                              {n.name}
                            </option>
                          ))}
                      </SelectControl>
                    </div>
                  ),
                )}
              </Disclosure>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="property-note">
          {error}
        </p>
      )}
    </Disclosure>
  );
}
