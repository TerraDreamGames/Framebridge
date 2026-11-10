import { Checkbox } from "./components/ui/checkbox";
import { cloneSettings } from "../../../packages/core/src/clone-settings";
import type { AdvancedControl } from "../../../packages/core/src/advanced-controls";
import { validControl } from "../../../packages/core/src/advanced-controls";
import type { RbxNode } from "../../../packages/core/src/types";
import { SelectControl } from "./components/SelectControl";
import { Input } from "./components/ui/input";

const defaults: Record<AdvancedControl["kind"], AdvancedControl> = {
  progress: {
    kind: "progress",
    min: 0,
    max: 100,
    value: 50,
    axis: "X",
    fill: "Fill",
  },
  toggle: { kind: "toggle", value: false },
  slider: { kind: "slider", min: 0, max: 100, value: 50, step: 1, axis: "X" },
  cooldown: { kind: "cooldown", duration: 3 },
  tooltip: { kind: "tooltip", target: "Tooltip", delay: 0.3 },
  window: { kind: "window", constrain: true },
  skill: { kind: "skill", requires: [], unlocked: false },
  roulette: {
    kind: "roulette",
    items: ["Coins", "Gems", "Boost"],
    duration: 3,
  },
};
export function AdvancedControlEditor({
  value,
  nodes,
  node,
  onChange,
  onError,
}: {
  value?: AdvancedControl;
  nodes: RbxNode[];
  node: RbxNode;
  onChange: (v?: AdvancedControl) => void;
  onError: (text: string) => void;
}) {
  const patch = (change: Record<string, unknown>) => {
    const next = { ...value, ...change };
    if (validControl(next)) {
      onError("");
      onChange(next);
    } else
      onError(
        "Check the control range, duration, artwork and data key. Changes were not saved.",
      );
  };
  const descendants = (parent: RbxNode): RbxNode[] =>
    parent.children.flatMap((n) => [n, ...descendants(n)]);
  const content = descendants(node).filter(
    (n) => !n.className.startsWith("UI"),
  );
  const skills = nodes.filter(
    (n) => n.id !== node.id && n.behavior?.control?.kind === "skill",
  );
  const prerequisiteChoices =
    value?.kind === "skill"
      ? [
          ...skills.map((n) => ({ id: n.id, name: n.name })),
          ...value.requires
            .filter((id) => !skills.some((n) => n.id === id))
            .map((id) => ({ id, name: `Missing skill · ${id}` })),
        ]
      : [];
  const target = (
    key: "fill" | "thumb" | "target" | "handle",
    choices: RbxNode[],
    required = false,
  ) => (
    <div className="property-row" key={key}>
      <label htmlFor={`control-${key}`}>
        {key === "target"
          ? "Tooltip panel"
          : key[0].toUpperCase() + key.slice(1)}
      </label>
      <SelectControl
        id={`control-${key}`}
        value={(value as any)?.[key] ?? ""}
        onChange={(e) => patch({ [key]: e.target.value || undefined })}
      >
        <option value="" disabled={required}>
          {required ? "Choose artwork" : "None"}
        </option>
        {(value as any)?.[key] &&
          !choices.some((n) => n.id === (value as any)[key]) && (
            <option value={(value as any)[key]}>
              {(value as any)[key]} · check target
            </option>
          )}
        {choices.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </SelectControl>
    </div>
  );
  const number = (key: string, label = key) => (
    <div className="property-row" key={key}>
      <label htmlFor={`control-${key}`}>
        {label[0].toUpperCase() + label.slice(1)}
      </label>
      <Input
        id={`control-${key}`}
        type="number"
        defaultValue={(value as any)[key]}
        key={String((value as any)[key])}
        onBlur={(e) => patch({ [key]: Number(e.target.value) })}
      />
    </div>
  );
  return (
    <>
      <div className="property-row">
        <label htmlFor="control-kind">Advanced control</label>
        <SelectControl
          id="control-kind"
          value={value?.kind ?? "none"}
          onChange={(e) => {
            onError("");
            const kind = e.target.value as AdvancedControl["kind"];
            const next = defaults[kind]
              ? cloneSettings(defaults[kind])
              : undefined;
            if (next?.kind === "progress")
              next.fill =
                node.children.find((n) => !n.className.startsWith("UI"))?.id ??
                "Fill";
            if (next?.kind === "tooltip")
              next.target =
                nodes.find(
                  (n) => n.behavior?.role === "panel" && !content.includes(n),
                )?.id ?? "Tooltip";
            onChange(next);
          }}
        >
          <option value="none">None</option>
          {Object.keys(defaults).map((kind) => (
            <option key={kind} value={kind}>
              {kind[0].toUpperCase() + kind.slice(1)}
            </option>
          ))}
        </SelectControl>
      </div>
      {value && (
        <p className="property-note">
          Runs in Play. Player data is read only; style the control with native
          Properties.
        </p>
      )}
      {value && (value.kind === "progress" || value.kind === "slider") && (
        <>
          {number("min")}
          {number("max")}
          {number("value", "Initial value")}
          {value.kind === "slider" && number("step")}
          <div className="property-row">
            <label htmlFor="control-axis">Direction</label>
            <SelectControl
              id="control-axis"
              value={value.axis}
              onChange={(e) => patch({ axis: e.target.value })}
            >
              <option value="X">Horizontal</option>
              <option value="Y">Vertical</option>
            </SelectControl>
          </div>
          {target(
            "fill",
            node.children.filter((n) => !n.className.startsWith("UI")),
            value.kind === "progress",
          )}
          {value.kind === "slider" &&
            target(
              "thumb",
              node.children.filter((n) => !n.className.startsWith("UI")),
            )}
        </>
      )}
      {value?.kind === "cooldown" && (
        <>
          {number("duration", "Seconds")}
          {target(
            "fill",
            node.children.filter((n) => !n.className.startsWith("UI")),
          )}
        </>
      )}
      {value?.kind === "tooltip" && (
        <>
          {target(
            "target",
            nodes.filter((n) => n.behavior?.role === "panel"),
            true,
          )}
          {number("delay", "Delay seconds")}
        </>
      )}
      {value?.kind === "window" && (
        <>
          {target("handle", content)}
          <div className="property-row">
            <label htmlFor="control-constrain">Drag bounds</label>
            <SelectControl
              id="control-constrain"
              value={String(value.constrain)}
              onChange={(e) => patch({ constrain: e.target.value === "true" })}
            >
              <option value="true">Keep in parent</option>
              <option value="false">Unrestricted</option>
            </SelectControl>
          </div>
        </>
      )}
      {(value?.kind === "toggle" || value?.kind === "skill") && (
        <div className="property-row">
          <label htmlFor="control-initial">Starts</label>
          <SelectControl
            id="control-initial"
            value={String(
              value.kind === "toggle" ? value.value : value.unlocked,
            )}
            onChange={(e) =>
              patch({
                [value.kind === "toggle" ? "value" : "unlocked"]:
                  e.target.value === "true",
              })
            }
          >
            <option value="false">
              {value.kind === "toggle" ? "Off" : "Locked"}
            </option>
            <option value="true">
              {value.kind === "toggle" ? "On" : "Unlocked"}
            </option>
          </SelectControl>
        </div>
      )}
      {value?.kind === "skill" && (
        <fieldset className="control-prerequisites">
          <legend>Prerequisite skills · {value.requires.length}/16</legend>
          <div className="control-prerequisite-choices">
            {prerequisiteChoices.map((choice) => (
              <label className="control-prerequisite-choice" key={choice.id}>
                <Checkbox
                  aria-label={`Prerequisite: ${choice.name}`}
                  checked={value.requires.includes(choice.id)}
                  disabled={
                    !value.requires.includes(choice.id) &&
                    value.requires.length >= 16
                  }
                  onCheckedChange={(checked) =>
                    patch({
                      requires:
                        checked === true
                          ? [...value.requires, choice.id]
                          : value.requires.filter((id) => id !== choice.id),
                    })
                  }
                />
                <span>{choice.name}</span>
              </label>
            ))}
            {!prerequisiteChoices.length && (
              <p className="property-note">
                Add another skill in this screen to choose a prerequisite.
              </p>
            )}
          </div>
        </fieldset>
      )}
      {value?.kind === "roulette" && (
        <>
          {number("duration", "Spin seconds")}
          <label className="property-note" htmlFor="control-items">
            2–64 display items, one per line
          </label>
          <textarea
            id="control-items"
            defaultValue={value.items.join("\n")}
            key={value.items.join("\n")}
            maxLength={8256}
            rows={4}
            onBlur={(e) =>
              patch({
                items: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
          <p className="property-note">
            Local visual result only. Your server owns rewards and odds.
          </p>
        </>
      )}
      {value &&
        (value.kind === "progress" ||
          value.kind === "slider" ||
          value.kind === "toggle" ||
          value.kind === "skill") && (
          <>
            <div className="property-row">
              <label htmlFor="control-data">Value source</label>
              <SelectControl
                id="control-data"
                value={value.data?.source ?? "local"}
                onChange={(e) =>
                  patch({
                    data:
                      e.target.value === "local"
                        ? undefined
                        : {
                            source: e.target.value,
                            key: value.data?.key ?? "Coins",
                          },
                  })
                }
              >
                <option value="local">Control attribute</option>
                <option value="attribute">Player attribute</option>
                <option value="leaderstats">Leaderstats value</option>
              </SelectControl>
            </div>
            {value.data && (
              <div className="property-row">
                <label htmlFor="control-key">Data key</label>
                <Input
                  id="control-key"
                  maxLength={128}
                  defaultValue={value.data.key}
                  key={value.data.key}
                  onBlur={(e) =>
                    patch({ data: { ...value.data, key: e.target.value } })
                  }
                />
              </div>
            )}
          </>
        )}
    </>
  );
}
