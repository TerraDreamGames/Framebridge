import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { cloneSettings } from "../../../packages/core/src/clone-settings";
import { useState } from "react";
import { ChevronRight } from "./components/Glyph";
import { layerBehavior } from "../../../packages/core/src/behaviors";
import {
  RULE_LIMITS,
  RULE_PROPERTIES,
  ruleActions,
  ruleTargetProperty,
  validRules,
  type ConditionalRule,
  type RuleAction,
  type RulePredicate,
  type RuleProperty,
} from "../../../packages/core/src/conditional-rules";
import type {
  DesignNode,
  LayerOverride,
  RbxNode,
  Value,
} from "../../../packages/core/src/types";
import { SelectControl } from "./components/SelectControl";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";

export function ConditionalRuleEditor({
  source,
  node,
  nodes,
  edit,
  onChange,
  disabled,
}: {
  source: DesignNode;
  node: RbxNode;
  nodes: RbxNode[];
  edit: LayerOverride;
  onChange: (behavior: LayerOverride["behavior"]) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  const behavior = layerBehavior(source, edit) ?? {};
  const rules = behavior.rules ?? [];
  const save = (next: ConditionalRule[]) => {
    if (next.length && !validRules(next)) {
      setError(
        "Check rule values and limits: 8 rules, 8 branches, 8 tests and 8 actions per group; 12 KB per layer.",
      );
      return;
    }
    setError("");
    onChange({
      ...behavior,
      ...(behavior.action?.target && node.behavior?.action
        ? { action: node.behavior.action }
        : {}),
      rules: next.length ? next : undefined,
    });
  };
  const patch = (index: number, change: Partial<ConditionalRule>) =>
    save(rules.map((r, i) => (i === index ? { ...r, ...change } : r)));
  const defaultPredicate: RulePredicate = {
    source: "leaderstats",
    key: "Coins",
    operator: "gte",
    value: 100,
  };
  const targets = (p: RuleProperty) =>
    nodes.filter((n) => ruleTargetProperty(n, p));
  const defaultValue = (p: RuleProperty): Value =>
    p === "Visible" || p === "Interactable"
      ? true
      : p === "Text"
        ? "Ready"
        : p.endsWith("Transparency")
          ? 0
          : { type: "Color3", value: [1, 1, 1] };
  const nextAction = (items: RuleAction[]) => {
    for (const property of RULE_PROPERTIES) {
      const available = targets(property).sort(
        (a, b) => Number(b.id === node.id) - Number(a.id === node.id),
      );
      for (const target of available)
        if (
          !items.some((a) => a.target === target.id && a.property === property)
        )
          return { target: target.id, property, value: defaultValue(property) };
    }
  };
  function actionGroup(
    items: RuleAction[],
    change: (next: RuleAction[]) => void,
    label: string,
    prefix: string,
  ) {
    return (
      <div className="conditional-actions">
        <strong>{label}</strong>
        {items.map((a, i) => (
          <div className="conditional-action" key={i}>
            <div className="property-row">
              <label htmlFor={prefix + "property" + i}>Set property</label>
              <SelectControl
                id={prefix + "property" + i}
                value={a.property}
                onChange={(e) => {
                  const property = e.target.value as RuleProperty;
                  change(
                    items.map((x, j) =>
                      j === i
                        ? {
                            property,
                            target:
                              targets(property).find((n) => n.id === a.target)
                                ?.id ??
                              targets(property)[0]?.id ??
                              a.target,
                            value: defaultValue(property),
                          }
                        : x,
                    ),
                  );
                }}
              >
                {RULE_PROPERTIES.map((p) => (
                  <option key={p} value={p} disabled={!targets(p).length}>
                    {p}
                  </option>
                ))}
              </SelectControl>
            </div>
            <div className="property-row">
              <label htmlFor={prefix + "target" + i}>On layer</label>
              <SelectControl
                id={prefix + "target" + i}
                value={a.target}
                onChange={(e) =>
                  change(
                    items.map((x, j) =>
                      j === i ? { ...x, target: e.target.value } : x,
                    ),
                  )
                }
              >
                {!targets(a.property).some((n) => n.id === a.target) && (
                  <option value={a.target}>{a.target} — missing target</option>
                )}
                {targets(a.property).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} · {n.id}
                  </option>
                ))}
              </SelectControl>
            </div>
            <div className="property-row">
              <label htmlFor={prefix + "value" + i}>Value</label>
              {typeof a.value === "boolean" ? (
                <SelectControl
                  id={prefix + "value" + i}
                  value={String(a.value)}
                  onChange={(e) =>
                    change(
                      items.map((x, j) =>
                        j === i
                          ? { ...x, value: e.target.value === "true" }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </SelectControl>
              ) : typeof a.value === "object" && a.value.type === "Color3" ? (
                <input
                  aria-label="Action color"
                  id={prefix + "value" + i}
                  type="color"
                  value={
                    "#" +
                    a.value.value
                      .map((n) =>
                        Math.round(n * 255)
                          .toString(16)
                          .padStart(2, "0"),
                      )
                      .join("")
                  }
                  onChange={(e) =>
                    change(
                      items.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              value: {
                                type: "Color3",
                                value: [1, 3, 5].map(
                                  (k) =>
                                    parseInt(
                                      e.target.value.slice(k, k + 2),
                                      16,
                                    ) / 255,
                                ),
                              },
                            }
                          : x,
                      ),
                    )
                  }
                />
              ) : (
                <Input
                  id={prefix + "value" + i}
                  key={String(a.value)}
                  type={typeof a.value === "number" ? "number" : "text"}
                  min={0}
                  max={1}
                  step={0.05}
                  maxLength={4096}
                  defaultValue={String(a.value)}
                  onBlur={(e) =>
                    change(
                      items.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              value:
                                typeof a.value === "number"
                                  ? Number(e.target.value)
                                  : e.target.value,
                            }
                          : x,
                      ),
                    )
                  }
                />
              )}
            </div>
            {items.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => change(items.filter((_, j) => j !== i))}
              >
                Remove action {i + 1}
              </Button>
            )}
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          disabled={items.length >= RULE_LIMITS.actions || !nextAction(items)}
          onClick={() => {
            const a = nextAction(items);
            if (a) change([...items, a]);
          }}
        >
          Add action
        </Button>
      </div>
    );
  }
  return (
    <Disclosure className="export-setup conditional-setup editor-section">
      <DisclosureSummary>
        <span>Conditional rules</span>
        <span className="export-setup-summary">
          {rules.length
            ? `${rules.length} rule${rules.length === 1 ? "" : "s"}`
            : "Optional"}
        </span>
      </DisclosureSummary>
      <p className="property-note">
        The first matching branch runs in Play. Unassigned properties return to
        their design values.
      </p>
      <fieldset disabled={disabled} className="conditional-fields">
        {rules.map((rule, index) => (
          <Disclosure
            key={rule.id}
            role="group"
            aria-label={`Conditional rule ${index + 1}`}
            className="conditional-rule"
          >
            <DisclosureSummary>
              Rule {index + 1} · {rule.id}
            </DisclosureSummary>
            {rule.branches.map((branch, bi) => (
              <div className="conditional-branch" key={bi}>
                <strong>{bi === 0 ? "IF" : "ELSE IF"}</strong>
                <div className="property-row">
                  <label htmlFor={`rule-${node.id}-${index}-${bi}-mode`}>
                    Match
                  </label>
                  <SelectControl
                    id={`rule-${node.id}-${index}-${bi}-mode`}
                    value={branch.when.mode}
                    onChange={(e) =>
                      patch(index, {
                        branches: rule.branches.map((b, j) =>
                          j === bi
                            ? {
                                ...b,
                                when: {
                                  ...b.when,
                                  mode: e.target.value as "all" | "any",
                                },
                              }
                            : b,
                        ),
                      })
                    }
                  >
                    <option value="all">All tests (AND)</option>
                    <option value="any">Any test (OR)</option>
                  </SelectControl>
                </div>
                {branch.when.predicates.map((p, pi) => {
                  const prefix = `rule-${node.id}-${index}-${bi}-${pi}-`;
                  const update = (change: Partial<RulePredicate>) =>
                    patch(index, {
                      branches: rule.branches.map((b, j) =>
                        j === bi
                          ? {
                              ...b,
                              when: {
                                ...b.when,
                                predicates: b.when.predicates.map((x, k) =>
                                  k === pi ? { ...x, ...change } : x,
                                ),
                              },
                            }
                          : b,
                      ),
                    });
                  return (
                    <div key={pi} className="conditional-predicate">
                      <div className="property-row">
                        <label htmlFor={prefix + "source"}>Data source</label>
                        <SelectControl
                          id={prefix + "source"}
                          value={p.source}
                          onChange={(e) =>
                            update({
                              source: e.target.value as RulePredicate["source"],
                              key:
                                e.target.value === "viewport"
                                  ? "width"
                                  : "Coins",
                              value: ["exists", "missing"].includes(p.operator)
                                ? undefined
                                : 100,
                            })
                          }
                        >
                          <option value="attribute">Player attribute</option>
                          <option value="leaderstats">Leaderstats</option>
                          <option value="viewport">Camera viewport</option>
                        </SelectControl>
                      </div>
                      <div className="property-row">
                        <label htmlFor={prefix + "key"}>Key</label>
                        {p.source === "viewport" ? (
                          <SelectControl
                            id={prefix + "key"}
                            value={p.key}
                            onChange={(e) => update({ key: e.target.value })}
                          >
                            <option value="width">Width (pixels)</option>
                            <option value="height">Height (pixels)</option>
                          </SelectControl>
                        ) : (
                          <Input
                            id={prefix + "key"}
                            key={p.key}
                            defaultValue={p.key}
                            maxLength={128}
                            onBlur={(e) => update({ key: e.target.value })}
                          />
                        )}
                      </div>
                      <div className="property-row">
                        <label htmlFor={prefix + "op"}>Test</label>
                        <SelectControl
                          id={prefix + "op"}
                          value={p.operator}
                          onChange={(e) => {
                            const operator = e.target
                              .value as RulePredicate["operator"];
                            update({
                              operator,
                              value: ["exists", "missing"].includes(operator)
                                ? undefined
                                : ["eq", "ne"].includes(operator)
                                  ? (p.value ?? 100)
                                  : 100,
                            });
                          }}
                        >
                          {[
                            ["eq", "Equals"],
                            ["ne", "Does not equal"],
                            ["lt", "Less than"],
                            ["lte", "At most"],
                            ["gt", "Greater than"],
                            ["gte", "At least"],
                            ["exists", "Exists"],
                            ["missing", "Missing"],
                          ].map(([v, n]) => (
                            <option value={v} key={v}>
                              {n}
                            </option>
                          ))}
                        </SelectControl>
                      </div>
                      {!["exists", "missing"].includes(p.operator) && (
                        <>
                          <div className="property-row">
                            <label htmlFor={prefix + "type"}>Value type</label>
                            <SelectControl
                              id={prefix + "type"}
                              value={typeof p.value}
                              disabled={
                                p.source === "viewport" ||
                                !["eq", "ne"].includes(p.operator)
                              }
                              onChange={(e) =>
                                update({
                                  value:
                                    e.target.value === "number"
                                      ? 100
                                      : e.target.value === "boolean"
                                        ? true
                                        : "Ready",
                                })
                              }
                            >
                              <option value="number">Number</option>
                              <option value="string">Text</option>
                              <option value="boolean">Boolean</option>
                            </SelectControl>
                          </div>
                          <div className="property-row">
                            <label htmlFor={prefix + "value"}>
                              Compare with
                            </label>
                            {typeof p.value === "boolean" ? (
                              <SelectControl
                                id={prefix + "value"}
                                value={String(p.value)}
                                onChange={(e) =>
                                  update({ value: e.target.value === "true" })
                                }
                              >
                                <option value="true">True</option>
                                <option value="false">False</option>
                              </SelectControl>
                            ) : (
                              <Input
                                id={prefix + "value"}
                                key={String(p.value)}
                                type={
                                  typeof p.value === "number"
                                    ? "number"
                                    : "text"
                                }
                                defaultValue={String(p.value)}
                                maxLength={4096}
                                onBlur={(e) =>
                                  update({
                                    value:
                                      typeof p.value === "number"
                                        ? Number(e.target.value)
                                        : e.target.value,
                                  })
                                }
                              />
                            )}
                          </div>
                        </>
                      )}
                      {branch.when.predicates.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            patch(index, {
                              branches: rule.branches.map((b, j) =>
                                j === bi
                                  ? {
                                      ...b,
                                      when: {
                                        ...b.when,
                                        predicates: b.when.predicates.filter(
                                          (_, k) => k !== pi,
                                        ),
                                      },
                                    }
                                  : b,
                              ),
                            })
                          }
                        >
                          Remove test {pi + 1}
                        </Button>
                      )}
                    </div>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    branch.when.predicates.length >= RULE_LIMITS.predicates
                  }
                  onClick={() =>
                    patch(index, {
                      branches: rule.branches.map((b, j) =>
                        j === bi
                          ? {
                              ...b,
                              when: {
                                ...b.when,
                                predicates: [
                                  ...b.when.predicates,
                                  { ...defaultPredicate },
                                ],
                              },
                            }
                          : b,
                      ),
                    })
                  }
                >
                  Add test
                </Button>
                {actionGroup(
                  branch.then,
                  (then) =>
                    patch(index, {
                      branches: rule.branches.map((b, j) =>
                        j === bi ? { ...b, then } : b,
                      ),
                    }),
                  "THEN",
                  `action-${node.id}-${index}-${bi}-`,
                )}
                {rule.branches.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patch(index, {
                        branches: rule.branches.filter((_, j) => j !== bi),
                      })
                    }
                  >
                    Remove branch
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              disabled={rule.branches.length >= RULE_LIMITS.branches}
              onClick={() =>
                patch(index, {
                  branches: [
                    ...rule.branches,
                    {
                      when: {
                        mode: "all",
                        predicates: [{ ...defaultPredicate }],
                      },
                      then: cloneSettings(rule.branches[0].then),
                    },
                  ],
                })
              }
            >
              Add ELSE IF
            </Button>
            {rule.else ? (
              actionGroup(
                rule.else,
                (actions) => patch(index, { else: actions }),
                "ELSE",
                `else-${node.id}-${index}-`,
              )
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  patch(index, { else: cloneSettings(rule.branches[0].then) })
                }
              >
                Add ELSE
              </Button>
            )}
            {rule.else && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch(index, { else: undefined })}
              >
                Remove ELSE
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => save(rules.filter((_, j) => j !== index))}
            >
              Remove rule
            </Button>
          </Disclosure>
        ))}
        <Button
          variant="ghost"
          size="sm"
          disabled={
            rules.length >= RULE_LIMITS.perLayer ||
            !nextAction(rules.flatMap(ruleActions))
          }
          onClick={() => {
            let id = 1;
            while (rules.some((r) => r.id === `rule_${id}`)) id++;
            const action = nextAction(rules.flatMap(ruleActions));
            if (action)
              save([
                ...rules,
                {
                  id: `rule_${id}`,
                  branches: [
                    {
                      when: {
                        mode: "all",
                        predicates: [{ ...defaultPredicate }],
                      },
                      then: [action],
                    },
                  ],
                },
              ]);
          }}
        >
          Add conditional rule
        </Button>
      </fieldset>
      {error && (
        <p className="property-error" role="alert">
          {error}
        </p>
      )}
    </Disclosure>
  );
}
