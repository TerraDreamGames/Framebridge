import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { useState } from "react";
import { Plus } from "./components/Glyph";
import {
  LAYER_RULE_FIELDS,
  matchLayers,
  type LayerMatchRule,
  type LayerRuleField,
  type LayerRulePredicate,
} from "../../../packages/core/src/layer-rules";
import type { EditableLayer } from "../../../packages/core/src/bulk-editor";
import type { LayerOverride } from "../../../packages/core/src/types";
import { SelectControl } from "./components/SelectControl";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
const initial: LayerRulePredicate = {
  field: "name",
  operator: "contains",
  value: "Button",
};
export function LayerRuleMatcher({
  layers,
  overrides,
  onSelect,
  onSelectFigma,
  disabled,
}: {
  layers: EditableLayer[];
  overrides: Record<string, LayerOverride>;
  onSelect: (ids: string[]) => void;
  onSelectFigma?: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [rule, setRule] = useState<LayerMatchRule>({
    mode: "all",
    predicates: [initial],
  });
  const [error, setError] = useState("");
  let matches: EditableLayer[] = [];
  try {
    matches = matchLayers(layers, overrides, rule);
  } catch {}
  const update = (index: number, change: Partial<LayerRulePredicate>) => {
    setError("");
    setRule({
      ...rule,
      predicates: rule.predicates.map((p, i) =>
        i === index ? { ...p, ...change } : p,
      ),
    });
  };
  const nativeIds = [
    ...new Set(matches.flatMap((m) => (m.source ? [m.source.id] : []))),
  ];
  return (
    <Disclosure className="layer-rule-matcher">
      <DisclosureSummary title="Select matching layers, then edit their shared properties. Changes support Undo and Redo.">
        <span>Select by rule</span>
        <span className="disclosure-count">{matches.length}</span>
      </DisclosureSummary>
      <fieldset disabled={disabled} className="conditional-fields">
        <SelectControl
          aria-label="Layer rule match mode"
          value={rule.mode}
          onChange={(e) =>
            setRule({ ...rule, mode: e.target.value as "all" | "any" })
          }
        >
          <option value="all">All conditions</option>
          <option value="any">Any condition</option>
        </SelectControl>
        {rule.predicates.map((p, i) => {
          const bool = ["visible", "baked", "overridden"].includes(p.field),
            numeric = ["width", "height"].includes(p.field);
          return (
            <div key={i} className="conditional-predicate">
              <SelectControl
                aria-label={`Layer test ${i + 1} field`}
                value={p.field}
                onChange={(e) => {
                  const field = e.target.value as LayerRuleField;
                  update(i, {
                    field,
                    operator: [
                      "visible",
                      "baked",
                      "overridden",
                      "width",
                      "height",
                    ].includes(field)
                      ? "eq"
                      : "contains",
                    value: ["visible", "baked", "overridden"].includes(field)
                      ? true
                      : ["width", "height"].includes(field)
                        ? 100
                        : "",
                  });
                }}
              >
                {LAYER_RULE_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {{
                      name: "Name",
                      exportName: "Export name",
                      sourceType: "Source type",
                      text: "Text",
                      className: "Roblox class",
                      type: "Source type",
                      width: "Width",
                      height: "Height",
                      visible: "Visible",
                      baked: "In image",
                      overridden: "Customized",
                    }[field] ?? field}
                  </option>
                ))}
              </SelectControl>
              <SelectControl
                aria-label={`Layer test ${i + 1} operator`}
                value={p.operator}
                onChange={(e) =>
                  update(i, {
                    operator: e.target.value as LayerRulePredicate["operator"],
                  })
                }
              >
                {[
                  "eq",
                  "ne",
                  ...(bool
                    ? []
                    : numeric
                      ? ["lt", "lte", "gt", "gte"]
                      : ["contains", "notContains"]),
                ].map((op) => (
                  <option key={op} value={op}>
                    {
                      (
                        {
                          eq: "Equals",
                          ne: "Does not equal",
                          contains: "Contains",
                          notContains: "Does not contain",
                          lt: "Less than",
                          lte: "At most",
                          gt: "Greater than",
                          gte: "At least",
                        } as Record<string, string>
                      )[op]
                    }
                  </option>
                ))}
              </SelectControl>
              {bool ? (
                <SelectControl
                  aria-label={`Layer test ${i + 1} value`}
                  value={String(p.value)}
                  onChange={(e) =>
                    update(i, { value: e.target.value === "true" })
                  }
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </SelectControl>
              ) : (
                <Input
                  aria-label={`Layer test ${i + 1} value`}
                  type={numeric ? "number" : "text"}
                  min={0}
                  max={1000000}
                  maxLength={256}
                  value={String(p.value)}
                  onChange={(e) => {
                    if (
                      numeric &&
                      (!Number.isFinite(Number(e.target.value)) ||
                        Number(e.target.value) < 0 ||
                        Number(e.target.value) > 1000000)
                    ) {
                      setError("Use a size from 0 to 1,000,000.");
                      return;
                    }
                    update(i, {
                      value: numeric ? Number(e.target.value) : e.target.value,
                    });
                  }}
                />
              )}
              {rule.predicates.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRule({
                      ...rule,
                      predicates: rule.predicates.filter((_, j) => j !== i),
                    })
                  }
                >
                  Remove test {i + 1}
                </Button>
              )}
            </div>
          );
        })}
        <div className="rule-actions">
          <Button
            variant="outline"
            size="sm"
            aria-label="Add condition"
            disabled={rule.predicates.length >= 8}
            onClick={() =>
              setRule({
                ...rule,
                predicates: [...rule.predicates, { ...initial }],
              })
            }
          >
            <Plus size={13} /> Add
          </Button>
          <Button
            variant="default"
            size="sm"
            aria-label={`Select ${matches.length} in editor`}
            disabled={!matches.length}
            onClick={() => onSelect(matches.map((m) => m.node.id))}
          >
            Select {matches.length}
          </Button>
          {onSelectFigma && (
            <Button
              variant="outline"
              size="sm"
              aria-label={`Select ${nativeIds.length} in Figma`}
              disabled={!nativeIds.length || nativeIds.length > 1000}
              onClick={() => onSelectFigma(nativeIds)}
            >
              In Figma
            </Button>
          )}
        </div>
        {nativeIds.length > 1000 && (
          <p className="property-note">
            Refine the rule to at most 1,000 source layers to select in Figma.
          </p>
        )}
        {error && (
          <p role="alert" className="property-error">
            {error}
          </p>
        )}
      </fieldset>
    </Disclosure>
  );
}
