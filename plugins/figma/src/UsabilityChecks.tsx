import { useState } from "react";
import { Checkbox } from "./components/ui/checkbox";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { SelectControl } from "./components/SelectControl";
import {
  ArrowDownToLine,
  ArrowRight,
  Focus,
  Info,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "./components/Glyph";
import {
  CHECK_LABELS,
  checkUsability,
  type CheckCategory,
  type CheckSettings,
  type Finding,
  type UsabilityReport,
} from "./usability";
import type { AnalysisResult } from "../../../packages/core/src/types";
import { Button } from "./components/ui/button";
import {
  ReviewEmpty,
  ReviewFilters,
  ReviewPagination,
  ReviewSearch,
} from "./ReviewPage";

export type SavedCheckReport = {
  source: AnalysisResult;
  settingsKey: string;
  data: UsabilityReport;
};
const checkDescriptions: Record<CheckCategory, string> = {
  names: "Descriptive, distinct layer names",
  contrast: "Text against a known background",
  targets: "Button and input hit areas",
  text: "Small text, clipping and scaling",
  cues: "States that rely on color alone",
};
const findingTitles: Record<string, string> = {
  "generated-name": "Use a descriptive name",
  "awkward-name": "Check name punctuation",
  "duplicate-sibling": "Sibling names are repeated",
  "small-target": "Touch target may be too small",
  "baked-text-review": "Check text inside artwork",
  "contrast-unverified": "Contrast needs visual review",
  "low-contrast": "Text contrast may be too low",
  "small-text": "Text may be hard to read",
  "scaled-text-size-unverified": "Verify the smallest text size",
  "unbounded-text-scaling": "Text can shrink too far",
  "text-height-risk": "Text may be clipped",
  "wrapped-text-review": "Check wrapped text height",
  "color-only-state": "Add a cue beyond color",
  "state-artwork-review": "Compare state artwork",
};

export function UsabilityChecks(props: {
  result?: AnalysisResult;
  settings: CheckSettings;
  report?: SavedCheckReport;
  disabled: boolean;
  configure(settings: CheckSettings): void;
  record(report: SavedCheckReport): void;
  inspect(id: string): void;
  focus(id: string): void;
  download(report: UsabilityReport): void;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const categories = Object.keys(CHECK_LABELS) as CheckCategory[];
  const enabled = categories.filter((c) => props.settings[c]);
  const key = JSON.stringify(props.settings);
  const outdated =
    !!props.report &&
    (props.report.source !== props.result ||
      props.report.settingsKey !== key ||
      props.disabled);
  const ready =
    !!props.result?.designs?.length && !props.disabled && enabled.length > 0;
  const report = props.report?.data;
  const findings = (
    report?.findings.filter(
      (f) =>
        (view === "all" || f.severity === view) &&
        (category === "all" || f.category === category) &&
        `${f.nodeName} ${f.message} ${f.suggestion} ${CHECK_LABELS[f.category]} ${findingTitles[f.code] ?? f.code}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    ) ?? []
  ).sort(
    (a, b) => Number(a.severity === "info") - Number(b.severity === "info"),
  );
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(findings.length / 20) - 1),
  );
  const changeFilter = (change: () => void) => {
    change();
    setPage(0);
  };
  const run = () => {
    if (!ready) return;
    props.record({
      source: props.result!,
      settingsKey: key,
      data: checkUsability(props.result!, props.settings),
    });
    setPage(0);
  };
  return (
    <section
      className="usability-checks editor-review review-panel"
      aria-label="Usability checks"
    >
      <header className="review-intro">
        <p>
          Checks readability, touch targets and naming. Findings are advisory;
          no layers are changed.
        </p>
        <div className="review-intro-actions">
          <Button
            className="review-primary"
            size="sm"
            disabled={!ready}
            onClick={run}
          >
            <ShieldCheck size={15} />
            {report ? "Run again" : "Run checks"}
          </Button>
          {report && (
            <Button
              variant="outline"
              size="sm"
              disabled={outdated}
              onClick={() => props.download(report)}
            >
              <ArrowDownToLine size={14} />
              Download report
            </Button>
          )}
        </div>
      </header>
      <div className="review-panel-body">
        <Disclosure className="review-options">
          <DisclosureSummary>
            Check settings{" "}
            <span className="review-meta">
              {enabled.length} checks · {props.settings.targetSize} ×{" "}
              {props.settings.targetSize} targets
            </span>
          </DisclosureSummary>
          <div className="review-check-choices">
            {categories.map((c) => (
              <label key={c}>
                <Checkbox
                  aria-label={CHECK_LABELS[c]}
                  checked={props.settings[c]}
                  onCheckedChange={(checked) =>
                    props.configure({
                      ...props.settings,
                      [c]: checked === true,
                    })
                  }
                />
                <span>
                  <strong>{CHECK_LABELS[c]}</strong>
                  <small>{checkDescriptions[c]}</small>
                </span>
              </label>
            ))}
          </div>
          <label className="review-target-reference">
            Target size reference{" "}
            <SelectControl
              aria-label="Target size reference"
              value={props.settings.targetSize}
              onChange={(e) =>
                props.configure({
                  ...props.settings,
                  targetSize: Number(e.target.value) as 24 | 44,
                })
              }
            >
              <option value="44">44 × 44 · touch review</option>
              <option value="24">24 × 24 · minimum-size review</option>
            </SelectControl>
          </label>
        </Disclosure>
        {!enabled.length && (
          <p className="review-status" role="status">
            <Info size={15} />
            Enable a check in Check settings.
          </p>
        )}
        {outdated && (
          <p className="review-status" role="status">
            <Info size={15} />
            These findings are out of date. Analyze changed artwork, then run
            checks again.
          </p>
        )}
        {report ? (
          <>
            <div className="review-result-meta" role="status">
              <ShieldCheck size={15} />
              {report.checkedLayers} layers checked
              {report.omitted > 0 &&
                ` · ${report.omitted} additional findings omitted; analyze a smaller selection`}
            </div>
            <div className="review-toolbar">
              <ReviewFilters
                label="Usability finding view"
                value={view}
                change={(value) => changeFilter(() => setView(value))}
                options={[
                  { value: "all", label: "All", count: report.findings.length },
                  {
                    value: "warning",
                    label: "Warnings",
                    count: report.findings.filter(
                      (f) => f.severity === "warning",
                    ).length,
                  },
                  {
                    value: "info",
                    label: "Visual review",
                    count: report.findings.filter((f) => f.severity === "info")
                      .length,
                  },
                ]}
              />
              <ReviewSearch
                label="Search usability findings"
                value={search}
                change={(value) => changeFilter(() => setSearch(value))}
              />
              <SelectControl
                className="review-category-filter"
                aria-label="Usability check category"
                value={category}
                onChange={(e) =>
                  changeFilter(() => setCategory(e.target.value))
                }
              >
                <option value="all">All checks</option>
                {categories
                  .filter((c) => report.settings[c])
                  .map((c) => (
                    <option key={c} value={c}>
                      {CHECK_LABELS[c]}
                    </option>
                  ))}
              </SelectControl>
            </div>
            <div className="review-findings" aria-label="Usability findings">
              {findings.slice(safePage * 20, safePage * 20 + 20).map((f) => (
                <UsabilityFinding
                  key={f.id}
                  finding={f}
                  inspect={props.inspect}
                  focus={props.focus}
                />
              ))}
              {!findings.length && (
                <ReviewEmpty
                  title={
                    report.findings.length
                      ? "No findings match this view"
                      : "No findings from the enabled checks"
                  }
                  icon={
                    report.findings.length ? <Search size={24} /> : undefined
                  }
                >
                  {report.findings.length ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch("");
                        setView("all");
                        setCategory("all");
                        setPage(0);
                      }}
                    >
                      Reset filters
                    </Button>
                  ) : (
                    <p>
                      Some checks may still need visual verification. Review
                      coverage below.
                    </p>
                  )}
                </ReviewEmpty>
              )}
            </div>
            <ReviewPagination
              page={safePage}
              total={findings.length}
              change={setPage}
            />
            <Disclosure className="review-coverage">
              <DisclosureSummary>Coverage & limitations</DisclosureSummary>
              <dl className="review-coverage-list">
                {categories
                  .filter((c) => report.settings[c])
                  .map((c) => (
                    <div key={c}>
                      <dt>{CHECK_LABELS[c]}</dt>
                      <dd>
                        {report.coverage[c].examined} examined
                        {report.coverage[c].unverified > 0
                          ? ` · ${report.coverage[c].unverified} unverified`
                          : ""}
                      </dd>
                    </div>
                  ))}
              </dl>
              <p>{report.scope}</p>
            </Disclosure>
          </>
        ) : (
          <ReviewEmpty
            title={
              props.result?.designs?.length
                ? "Ready to check your design"
                : "Analyze a design to run usability checks"
            }
            icon={<ShieldCheck size={28} />}
          >
            <p>Review contrast, hit areas, text fit, names and color cues.</p>
          </ReviewEmpty>
        )}
      </div>
      <footer className="review-footnote">
        <Info size={13} />
        Visual review means the check couldn’t be verified automatically.
        Confirm the final UI in Studio.
      </footer>
    </section>
  );
}

function UsabilityFinding({
  finding: f,
  inspect,
  focus,
}: {
  finding: Finding;
  inspect(id: string): void;
  focus(id: string): void;
}) {
  return (
    <Disclosure className="review-finding" data-severity={f.severity}>
      <DisclosureSummary aria-label={`Review ${f.nodeName}: ${f.message}`}>
        <span className="review-row-symbol">
          {f.severity === "warning" ? (
            <TriangleAlert size={17} />
          ) : (
            <Info size={17} />
          )}
        </span>
        <span className="review-row-copy">
          <strong>{findingTitles[f.code] ?? CHECK_LABELS[f.category]}</strong>
          <small>{f.nodeName}</small>
        </span>
        <span className="review-row-tag">{CHECK_LABELS[f.category]}</span>
      </DisclosureSummary>
      <div className="review-finding-detail">
        <span className="review-finding-kind">
          {f.severity === "warning" ? "Warning" : "Needs visual review"}
        </span>
        <p>{f.message}</p>
        <div className="review-recommendation">
          <strong>What to check</strong>
          <p>{f.suggestion}</p>
        </div>
        <div className="review-row-actions">
          <Button size="sm" variant="outline" onClick={() => inspect(f.nodeId)}>
            Edit properties <ArrowRight size={13} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => focus(f.nodeId)}>
            <Focus size={14} />
            Find in Figma
          </Button>
        </div>
        {!!f.related?.length && (
          <div className="review-related">
            <span>Compare with</span>
            {f.related.map((r) => (
              <Button
                key={r.id}
                size="sm"
                variant="ghost"
                onClick={() => inspect(r.id)}
              >
                {r.name}
                <ArrowRight size={13} />
              </Button>
            ))}
          </div>
        )}
      </div>
    </Disclosure>
  );
}
