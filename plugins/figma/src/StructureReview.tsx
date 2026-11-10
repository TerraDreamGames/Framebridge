import { Checkbox } from "./components/ui/checkbox";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { SelectControl } from "./components/SelectControl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  structureReview,
  reviewChanges,
  rememberReview,
  ruleKey,
  EMPTY_REVIEW_PREFERENCES,
  canRememberReview,
  reviewChoiceLabel,
  type ReviewDecision,
  type ReviewLayer,
} from "../../../packages/core/src/structure-review";
import type {
  AnalysisResult,
  LayerOverride,
} from "../../../packages/core/src/types";
import type { OverrideChange } from "../../../packages/core/src/bulk-editor";
import type { useReviewPreferences } from "./review-preferences";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ReviewPreferenceEditor } from "./ReviewPreferenceEditor";
import { RobloxClassIcon } from "./components/RobloxClassIcon";
import { ArrowRight, Info, Layers, Search } from "./components/Glyph";
import {
  ReviewEmpty,
  ReviewFilters,
  ReviewPagination,
  ReviewSearch,
} from "./ReviewPage";
export function StructureReview(props: {
  result?: AnalysisResult;
  overrides: Record<string, LayerOverride>;
  disabled: boolean;
  stale?: boolean;
  analyze?(): void;
  memory: ReturnType<typeof useReviewPreferences>;
  cloudSync?: ReactNode;
  visionReview?: ReactNode;
  apply(changes: OverrideChange[]): boolean;
  inspect(id: string): void;
  canUndo: boolean;
  undoDisabled?: boolean;
  undo(): void;
}) {
  const report = useMemo(
    () =>
      props.result?.designs
        ? structureReview(
            props.result.designs,
            props.result.package,
            props.overrides,
            props.memory.preferences,
          )
        : undefined,
    [props.result, props.overrides, props.memory.preferences],
  );
  const [search, setSearch] = useState(""),
    [view, setView] = useState(() =>
      report?.suggestions ? "suggestions" : "all",
    ),
    [page, setPage] = useState(0),
    [error, setError] = useState("");
  const filtered =
    report?.layers.filter(
      (l) =>
        (view === "all" || l.suggestions.length > 0) &&
        `${l.source.name} ${l.source.type} ${l.node?.name} ${l.node?.className} ${l.reasons.join(" ")} ${l.suggestions.map((s) => s.label + " " + s.effect).join(" ")}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    ) || [];
  const safePage = Math.min(
      page,
      Math.max(0, Math.ceil(filtered.length / 20) - 1),
    ),
    layers = filtered.slice(safePage * 20, safePage * 20 + 20);
  const correct = async (
    layer: ReviewLayer,
    decision: ReviewDecision,
    remember: boolean,
  ) => {
    setError("");
    try {
      const next = remember
        ? rememberReview(props.memory.preferences, layer.source, decision)
        : undefined;
      if (!props.apply(reviewChanges(layer, decision, props.overrides))) return;
      if (next) await props.memory.save(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply this choice.");
    }
  };
  return (
    <section
      className="structure-review editor-review review-panel"
      aria-label="Structure review"
    >
      <header className="review-intro">
        <p>
          Check Roblox classes, layouts and names. You choose which changes to
          apply.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={!props.canUndo || (props.undoDisabled ?? props.disabled)}
          onClick={props.undo}
        >
          Undo correction
        </Button>
      </header>
      <div className="review-panel-body">
        {error && (
          <p className="review-status" role="alert">
            {error}
          </p>
        )}
        {props.memory.error && (
          <p className="review-status" role="alert">
            {props.memory.error} Open Review preferences to retry storage.
          </p>
        )}
        {props.stale && (
          <div className="review-status" role="status">
            <Info size={15} />
            <span>Design changed. Analyze again to update suggestions.</span>
            {props.analyze && (
              <Button
                variant="outline"
                size="sm"
                disabled={props.undoDisabled}
                onClick={props.analyze}
              >
                Analyze again
              </Button>
            )}
          </div>
        )}
        {report && (
          <div className="review-toolbar">
            <ReviewFilters
              label="Structure review filter"
              value={view}
              change={(value) => {
                setView(value);
                setPage(0);
              }}
              options={[
                {
                  value: "suggestions",
                  label: "Suggestions",
                  count: report.layers.filter((l) => l.suggestions.length > 0)
                    .length,
                },
                {
                  value: "all",
                  label: "All layers",
                  count: report.layers.length,
                },
              ]}
            />
            <ReviewSearch
              label="Search structure review"
              placeholder="Find a layer or class…"
              value={search}
              change={(value) => {
                setSearch(value);
                setPage(0);
              }}
            />
          </div>
        )}
        {report?.truncated && (
          <p className="review-status" role="status">
            Showing the first 10,000 source layers. Analyze a smaller selection
            to review the rest.
          </p>
        )}
        {report && layers.length > 0 && (
          <div
            className="review-layer-results"
            aria-label="Structure review layers"
          >
            {layers.map((layer) => (
              <ReviewCard
                key={layer.source.id}
                layer={layer}
                disabled={props.disabled}
                canRemember={
                  !props.memory.loading &&
                  !props.memory.saving &&
                  !props.memory.error
                }
                correct={correct}
                inspect={props.inspect}
              />
            ))}
          </div>
        )}
        {!report ? (
          <ReviewEmpty
            title="Analyze a design to review its structure"
            icon={<Layers size={28} />}
          >
            <p>Check what each Figma layer becomes in Roblox.</p>
          </ReviewEmpty>
        ) : (
          !filtered.length && (
            <ReviewEmpty
              title={search ? "No matching layers" : "No suggested changes"}
              icon={search ? <Search size={24} /> : undefined}
            >
              <p>
                {search
                  ? "Try a layer name, class or layout."
                  : "You can still inspect every detected class in All layers."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setView("all");
                  setSearch("");
                  setPage(0);
                }}
              >
                Show all layers
              </Button>
            </ReviewEmpty>
          )
        )}
        <ReviewPagination
          page={safePage}
          total={filtered.length}
          change={setPage}
        />
        <Disclosure className="review-preferences">
          <DisclosureSummary>
            Review preferences{" "}
            <span className="review-meta">
              {props.memory.preferences.rules.length} saved choices
            </span>
          </DisclosureSummary>
          <ReviewPreferenceEditor memory={props.memory} />
          <Disclosure className="structure-memory">
            <DisclosureSummary>
              Saved choices ({props.memory.preferences.rules.length})
            </DisclosureSummary>
            <p className="review-hint">
              Saved on this device. Matches layer name, type and content.
            </p>
            <label>
              <Checkbox
                checked={props.memory.preferences.enabled}
                disabled={
                  props.memory.loading ||
                  props.memory.saving ||
                  !!props.memory.error
                }
                onCheckedChange={(checked) =>
                  void props.memory.save({
                    ...props.memory.preferences,
                    enabled: checked === true,
                  })
                }
              />
              Suggest my saved choices and conventions
            </label>
            {props.memory.loading && (
              <p role="status">Restoring saved choices…</p>
            )}
            {props.memory.saving && <p role="status">Saving…</p>}
            {props.memory.error && (
              <p role="alert">
                {props.memory.error}{" "}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void props.memory.restore()}
                >
                  Retry storage
                </Button>
              </p>
            )}
            {props.memory.preferences.rules.map((rule) => (
              <div className="structure-memory-rule" key={ruleKey(rule)}>
                <span>
                  {rule.name} · {rule.sourceType} · {rule.family} →{" "}
                  {reviewChoiceLabel(rule.decision)}
                </span>
                <Button
                  aria-label={`Remove saved choice for ${rule.name}`}
                  variant="ghost"
                  size="sm"
                  disabled={
                    props.memory.loading ||
                    props.memory.saving ||
                    !!props.memory.error
                  }
                  onClick={() =>
                    void props.memory.save({
                      ...props.memory.preferences,
                      rules: props.memory.preferences.rules.filter(
                        (r) => ruleKey(r) !== ruleKey(rule),
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={
                (!props.memory.preferences.rules.length &&
                  !props.memory.preferences.hints?.length &&
                  !props.memory.preferences.naming) ||
                props.memory.loading ||
                props.memory.saving ||
                !!props.memory.error
              }
              onClick={() =>
                void props.memory.save({
                  ...EMPTY_REVIEW_PREFERENCES,
                  rules: [],
                })
              }
            >
              Reset local review preferences
            </Button>
          </Disclosure>
          {props.cloudSync}
        </Disclosure>
        {props.visionReview && (
          <Disclosure className="review-optional-tools">
            <DisclosureSummary>Optional review tools</DisclosureSummary>
            {props.visionReview}
          </Disclosure>
        )}
      </div>
      <footer className="review-footnote">
        <Info size={13} />
        Suggestions come from local detection rules and saved choices.
        Corrections use the shared Undo history.
      </footer>
    </section>
  );
}

function ReviewCard(props: {
  layer: ReviewLayer;
  disabled: boolean;
  canRemember: boolean;
  correct(
    layer: ReviewLayer,
    decision: ReviewDecision,
    remember: boolean,
  ): Promise<void>;
  inspect(id: string): void;
}) {
  const { layer } = props,
    [remember, setRemember] = useState(false),
    [name, setName] = useState(layer.node?.name || layer.source.name);
  useEffect(
    () => setName(layer.node?.name || layer.source.name),
    [layer.node?.name, layer.source.name],
  );
  return (
    <Disclosure className="structure-review-card">
      <DisclosureSummary>
        <RobloxClassIcon className={layer.node?.className || "Frame"} />
        <span className="review-layer-name">
          {layer.node?.name || layer.source.name}
        </span>
        <span className="review-current-class">
          {layer.node?.className || "Not exported"}
        </span>
        {layer.suggestions.length > 0 && (
          <span className="structure-review-count">
            {layer.suggestions.length}{" "}
            {layer.suggestions.length === 1 ? "suggestion" : "suggestions"}
          </span>
        )}
      </DisclosureSummary>
      <div className="structure-review-body">
        <div className="review-source-mapping">
          <span>{layer.source.type}</span>
          <ArrowRight size={13} />
          <span>{layer.node?.className || "Not exported"}</span>
        </div>
        {layer.blocked && <p className="review-status">{layer.blocked}</p>}
        <ul>
          {layer.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          onClick={() => props.inspect(layer.source.id)}
        >
          Edit properties <ArrowRight size={13} />
        </Button>
        {!layer.blocked && (
          <>
            <label className="structure-memory-toggle">
              <Checkbox
                checked={remember}
                disabled={
                  !props.canRemember || !canRememberReview(layer.source)
                }
                onCheckedChange={(checked) => setRemember(checked === true)}
              />
              Suggest this choice for matching named layers
            </label>
            {!canRememberReview(layer.source) && (
              <p className="structure-memory-help">
                Give this source layer a meaningful name in Figma before
                remembering a choice.
              </p>
            )}
            {layer.suggestions.map((suggestion) => (
              <div className="structure-suggestion" key={suggestion.category}>
                <strong>{suggestion.label}</strong>
                <span>{suggestion.confidence}</span>
                <ul>
                  {suggestion.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <p>{suggestion.effect}</p>
                <Button
                  size="sm"
                  disabled={props.disabled || (remember && !props.canRemember)}
                  onClick={() =>
                    void props.correct(
                      layer,
                      suggestion.decision,
                      remember && suggestion.category !== "name",
                    )
                  }
                >
                  {decisionButton(suggestion.decision)}
                </Button>
              </div>
            ))}
            <Disclosure className="review-manual-correction">
              <DisclosureSummary>Choose manually</DisclosureSummary>
              <div className="structure-review-fields">
                <label>
                  Export class
                  <SelectControl
                    aria-label={`Export class for ${layer.source.name}`}
                    value=""
                    disabled={
                      props.disabled || (remember && !props.canRemember)
                    }
                    onChange={(e) =>
                      void props.correct(
                        layer,
                        { kind: "class", value: e.target.value as any },
                        remember,
                      )
                    }
                  >
                    <option value="" disabled>
                      Choose a class…
                    </option>
                    {layer.choices.map((choice) => (
                      <option key={choice} value={choice}>
                        {choice === "auto" ? "Automatic" : choice}
                      </option>
                    ))}
                  </SelectControl>
                </label>
                {["Frame", "CanvasGroup", "ScrollingFrame"].includes(
                  layer.node?.className || "",
                ) && (
                  <>
                    <label>
                      Layout
                      <SelectControl
                        aria-label={`Layout for ${layer.source.name}`}
                        value=""
                        disabled={
                          props.disabled || (remember && !props.canRemember)
                        }
                        onChange={(e) =>
                          void props.correct(
                            layer,
                            { kind: "layout", value: e.target.value as any },
                            remember,
                          )
                        }
                      >
                        <option value="" disabled>
                          Choose a layout…
                        </option>
                        <option value="source">Source layout</option>
                        <option value="free">Free positioning</option>
                        <option value="list-y">Vertical list</option>
                        <option value="list-x">Horizontal list</option>
                        <option value="grid">Grid</option>
                      </SelectControl>
                    </label>
                    <label>
                      Action role
                      <SelectControl
                        aria-label={`Action role for ${layer.source.name}`}
                        value=""
                        disabled={
                          props.disabled || (remember && !props.canRemember)
                        }
                        onChange={(e) =>
                          void props.correct(
                            layer,
                            { kind: "role", value: e.target.value as any },
                            remember,
                          )
                        }
                      >
                        <option value="" disabled>
                          Choose a role…
                        </option>
                        <option value="source">Source role</option>
                        <option value="panel">Panel target</option>
                        <option value="tabGroup">Tab group</option>
                      </SelectControl>
                    </label>
                  </>
                )}
                <label>
                  Roblox name
                  <Input
                    aria-label={`Roblox name for ${layer.source.name}`}
                    value={name}
                    disabled={props.disabled}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        void props.correct(
                          layer,
                          { kind: "name", value: name },
                          false,
                        );
                      if (e.key === "Escape")
                        setName(layer.node?.name || layer.source.name);
                    }}
                  />
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    props.disabled ||
                    name === (layer.node?.name || layer.source.name)
                  }
                  onClick={() =>
                    void props.correct(
                      layer,
                      { kind: "name", value: name },
                      false,
                    )
                  }
                >
                  Save name
                </Button>
              </div>
            </Disclosure>
          </>
        )}
      </div>
    </Disclosure>
  );
}
function decisionButton(decision: ReviewDecision) {
  return `Use ${reviewChoiceLabel(decision)}`;
}
