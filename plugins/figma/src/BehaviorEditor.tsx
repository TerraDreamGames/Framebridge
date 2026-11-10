import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { AdvancedControlEditor } from "./AdvancedControlEditor";
import { ParticleEditor } from "./ParticleEditor";
import { useState } from "react";
import { ChevronRight } from "./components/Glyph";
import {
  layerBehavior,
  validBinding,
} from "../../../packages/core/src/behaviors";
import type {
  DesignNode,
  LayerBehavior,
  LayerOverride,
  RbxNode,
} from "../../../packages/core/src/types";
import { SelectControl } from "./components/SelectControl";
import { Input } from "./components/ui/input";

export function BehaviorEditor({
  source,
  node,
  nodes,
  edit,
  onChange,
}: {
  source: DesignNode;
  node: RbxNode;
  nodes: RbxNode[];
  edit: LayerOverride;
  onChange: (behavior: LayerOverride["behavior"]) => void;
}) {
  const [error, setError] = useState("");
  const mode =
    edit.behavior === false
      ? "off"
      : edit.behavior === undefined
        ? "tags"
        : "custom";
  const value = layerBehavior(source, edit) ?? {};
  const patch = (change: Partial<LayerBehavior>) => {
    setError("");
    onChange({ ...value, ...change });
  };
  const panels = nodes.filter((n) => n.behavior?.role === "panel");
  const tabPanels = panels.filter((p) =>
    nodes.some(
      (g) =>
        g.behavior?.role === "tabGroup" &&
        g.children.some((c) => c.id === p.id),
    ),
  );
  const targets = value.action?.kind === "tab" ? tabPanels : panels;
  const binding = value.binding;
  return (
    <Disclosure
      className="export-setup behavior-setup editor-section"
      data-tour="interaction-tools"
      key={node.id}
    >
      <DisclosureSummary>
        <span>Interactions</span>
        <span className="export-setup-summary">
          {mode === "off"
            ? "Off"
            : (value.control?.kind ??
              value.action?.kind ??
              value.state ??
              (binding ? "Live text" : (value.role ?? "Optional")))}
        </span>
      </DisclosureSummary>
      <p className="property-note">
        Configure actions or use layer tags such as [panel] and [open:Shop].
      </p>
      <div className="property-row">
        <label htmlFor="behavior-mode">Configure</label>
        <SelectControl
          id="behavior-mode"
          value={mode}
          onChange={(e) => {
            setError("");
            onChange(
              e.target.value === "off"
                ? false
                : e.target.value === "tags"
                  ? undefined
                  : {
                      ...value,
                      ...(value.action?.target && node.behavior?.action
                        ? {
                            action: {
                              ...value.action,
                              target: node.behavior.action.target,
                            },
                          }
                        : {}),
                    },
            );
          }}
        >
          <option value="tags">Use layer tags</option>
          <option value="custom">Custom settings</option>
          <option value="off">Off for this layer</option>
        </SelectControl>
      </div>
      {mode === "tags" && (
        <p className="property-note">
          {Object.keys(value).length
            ? "Detected settings are shown in the exported layer. Choose Custom settings to edit them here."
            : "No interaction tag on this layer. Choose Custom settings to add one."}
        </p>
      )}
      {mode === "custom" && (
        <>
          <AdvancedControlEditor
            value={value.control}
            nodes={nodes}
            node={node}
            onChange={(control) => patch({ control })}
            onError={setError}
          />
          <ParticleEditor
            value={value.particles}
            onChange={(particles) => patch({ particles })}
            onError={setError}
          />
          <div className="property-row">
            <label htmlFor="behavior-role">Container role</label>
            <SelectControl
              id="behavior-role"
              value={value.role ?? "none"}
              onChange={(e) =>
                patch({
                  role:
                    e.target.value === "none"
                      ? undefined
                      : (e.target.value as LayerBehavior["role"]),
                  initialVisible: undefined,
                })
              }
            >
              <option value="none">None</option>
              <option value="panel">Panel</option>
              <option value="tabGroup">Tab group</option>
            </SelectControl>
          </div>
          {value.role && (
            <div className="property-row">
              <label htmlFor="behavior-visible">Starts</label>
              <SelectControl
                id="behavior-visible"
                value={
                  value.initialVisible === undefined
                    ? "design"
                    : String(value.initialVisible)
                }
                onChange={(e) =>
                  patch({
                    initialVisible:
                      e.target.value === "design"
                        ? undefined
                        : e.target.value === "true",
                  })
                }
              >
                <option value="design">Use design visibility</option>
                <option value="true">Visible</option>
                <option value="false">Hidden</option>
              </SelectControl>
            </div>
          )}
          {value.role === "tabGroup" && (
            <p className="property-note">
              Put panels directly inside this group. Selecting a tab shows its
              panel and hides the others.
            </p>
          )}
          <div className="property-row">
            <label htmlFor="behavior-action">On activate</label>
            <SelectControl
              id="behavior-action"
              value={value.action?.kind ?? "none"}
              onChange={(e) => {
                const kind = e.target.value;
                const available = kind === "tab" ? tabPanels : panels;
                patch({
                  action:
                    kind === "none"
                      ? undefined
                      : {
                          kind: kind as NonNullable<
                            LayerBehavior["action"]
                          >["kind"],
                          ...(kind !== "close"
                            ? {
                                target:
                                  available.find(
                                    (p) => p.id === value.action?.target,
                                  )?.id ?? available[0]?.id,
                              }
                            : {}),
                        },
                });
              }}
            >
              <option value="none">None</option>
              <option value="open" disabled={!panels.length}>
                Open panel
              </option>
              <option value="close">Close panel</option>
              <option value="toggle" disabled={!panels.length}>
                Toggle panel
              </option>
              <option value="tab" disabled={!tabPanels.length}>
                Select tab
              </option>
            </SelectControl>
          </div>
          {value.action && (
            <>
              <div className="property-row">
                <label htmlFor="behavior-target">Target panel</label>
                <SelectControl
                  id="behavior-target"
                  value={value.action.target ?? "nearest"}
                  onChange={(e) =>
                    patch({
                      action: {
                        kind: value.action!.kind,
                        ...(e.target.value !== "nearest"
                          ? { target: e.target.value }
                          : {}),
                      },
                    })
                  }
                >
                  {value.action.kind === "close" && (
                    <option value="nearest">Nearest parent panel</option>
                  )}
                  {value.action.target &&
                    !targets.some((p) => p.id === value.action!.target) && (
                      <option value={value.action.target}>
                        {value.action.target} — check target
                      </option>
                    )}
                  {targets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.id}
                    </option>
                  ))}
                </SelectControl>
              </div>
              {!node.className.endsWith("Button") && (
                <p className="property-note">
                  This action needs a button. Automatic instance selection
                  creates one; if you chose a class manually, select TextButton
                  or ImageButton in Export setup.
                </p>
              )}
            </>
          )}
          {!panels.length && (
            <p className="property-note">
              Mark a layer as Panel to make it available as an action target.
            </p>
          )}
          <div className="property-row">
            <label htmlFor="behavior-state">State visual</label>
            <SelectControl
              id="behavior-state"
              value={value.state ?? "none"}
              onChange={(e) =>
                patch({
                  state:
                    e.target.value === "none"
                      ? undefined
                      : (e.target.value as LayerBehavior["state"]),
                })
              }
            >
              <option value="none">None</option>
              {["default", "hover", "pressed", "disabled", "selected"].map(
                (state) => (
                  <option key={state} value={state}>
                    {state[0].toUpperCase() + state.slice(1)}
                  </option>
                ),
              )}
            </SelectControl>
          </div>
          {value.state && (
            <p className="property-note">
              Place this visual inside its button. Use one group per state.
              Disabled follows Active / Interactable; selected follows tabs or
              the FramebridgeSelected attribute.
            </p>
          )}
          {source.text && (
            <>
              <div className="property-row">
                <label htmlFor="behavior-data">Live text</label>
                <SelectControl
                  id="behavior-data"
                  value={binding?.source ?? "none"}
                  onChange={(e) =>
                    patch({
                      binding:
                        e.target.value === "none"
                          ? undefined
                          : {
                              source: e.target.value as
                                "attribute" | "leaderstats",
                              key: binding?.key ?? "Coins",
                              template: binding?.template ?? "{value}",
                            },
                    })
                  }
                >
                  <option value="none">None</option>
                  <option value="attribute">Player attribute</option>
                  <option value="leaderstats">Leaderstats value</option>
                </SelectControl>
              </div>
              {binding && (
                <>
                  <div className="property-row">
                    <label htmlFor="behavior-key">Data key</label>
                    <Input
                      id="behavior-key"
                      defaultValue={binding.key}
                      key={node.id + binding.key}
                      maxLength={128}
                      onBlur={(e) => {
                        const next = { ...binding, key: e.target.value };
                        if (validBinding(next)) patch({ binding: next });
                        else
                          setError(
                            "Use a key such as Coins or Gems, without a path or spaces.",
                          );
                      }}
                    />
                  </div>
                  <div className="property-row">
                    <label htmlFor="behavior-template">Label template</label>
                    <Input
                      id="behavior-template"
                      defaultValue={binding.template}
                      key={node.id + binding.template}
                      maxLength={4096}
                      onBlur={(e) => {
                        const next = { ...binding, template: e.target.value };
                        if (validBinding(next)) patch({ binding: next });
                        else
                          setError(
                            "Include {value}, for example Coins: {value}.",
                          );
                      }}
                    />
                  </div>
                  <p className="property-note">
                    Your game supplies this value. Missing data displays — until
                    it becomes available. Text formatting is escaped when
                    RichText is enabled.
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p className="property-error" role="alert">
          {error}
        </p>
      )}
    </Disclosure>
  );
}
