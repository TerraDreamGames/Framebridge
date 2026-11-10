import { FilePicker } from "./components/FilePicker";
import { Checkbox } from "./components/ui/checkbox";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { SelectControl } from "./components/SelectControl";
import { useId, useState, type ReactNode } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import {
  ArrowRight,
  ArrowLeft,
  ArrowDownToLine,
  Check,
  Copy,
  Image,
  Layers,
  X,
} from "./components/Glyph";
import {
  FEEDBACK_CATEGORIES,
  feedbackDiagnostics,
  feedbackScreenshot,
  normalizeFeedback,
  type FeedbackReport,
} from "../../../packages/core/src/feedback";
import type { TransferPackage } from "../../../packages/core/src/types";
import { pngPixelSize } from "../../../packages/core/src/image-scaling";
import "./report-feedback.css";

const categories: Record<FeedbackReport["category"], string> = {
  conversion: "Conversion & layout",
  images: "Images & uploads",
  connection: "Studio connection",
  interface: "Plugin interface",
  other: "Other",
};
export function ReportFeedback(props: {
  pkg?: TransferPackage;
  knownSecrets: readonly string[];
  onExport(report: FeedbackReport): void;
  renderPrivate?(
    report: FeedbackReport | undefined,
    reviewed: boolean,
    onReview: (report: FeedbackReport) => void,
    localActions?: ReactNode,
  ): ReactNode;
}) {
  const formId = useId();
  const [draft, setDraft] = useState({
    category: "conversion" as FeedbackReport["category"],
    title: "",
    steps: "",
    expected: "",
    actual: "",
  });
  const [layout, setLayout] = useState(false);
  const [screenshot, setScreenshot] = useState<FeedbackReport["screenshot"]>();
  const [screenshotName, setScreenshotName] = useState("");
  const [report, setReport] = useState<FeedbackReport>();
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [copyText, setCopyText] = useState("");
  const [reading, setReading] = useState(false);
  const review = (value: FeedbackReport) => {
    setReport(normalizeFeedback(value, props.knownSecrets));
    setReviewed(false);
    setError("");
    setCopyStatus("");
    setCopyText("");
  };
  const edit = () => {
    if (!report) return;
    setDraft({
      category: report.category,
      title: report.title,
      steps: report.steps,
      expected: report.expected,
      actual: report.actual,
    });
    setScreenshot(report.screenshot);
    setLayout(!!report.diagnostics);
    setReport(undefined);
    setReviewed(false);
    setCopyStatus("");
    setCopyText("");
  };
  const field = (
    key: "title" | "steps" | "expected" | "actual",
    label: string,
    placeholder: string,
    required = false,
  ) => (
    <label className="feedback-field">
      <span>
        {label}
        {required && (
          <span className="report-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </span>
      {key === "title" ? (
        <Input
          aria-label={label}
          value={draft[key]}
          maxLength={120}
          minLength={3}
          required={required}
          placeholder={placeholder}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <Textarea
          aria-label={label}
          value={draft[key]}
          maxLength={4000}
          minLength={required ? 3 : undefined}
          rows={key === "actual" ? 4 : 3}
          required={required}
          placeholder={placeholder}
          className={key === "actual" ? "report-description-field" : undefined}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
    </label>
  );
  const localActions = report ? (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={!reviewed}
        onClick={async () => {
          const text = JSON.stringify(report, null, 2);
          try {
            await navigator.clipboard.writeText(text);
            setCopyText("");
            setCopyStatus("Report copied.");
          } catch {
            setCopyText(text);
            setCopyStatus("Copy the report below.");
          }
        }}
      >
        <Copy size={15} /> Copy JSON
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="report-download"
        disabled={!reviewed}
        onClick={() => props.onExport(report)}
      >
        <ArrowDownToLine size={15} /> Download report
      </Button>
    </>
  ) : undefined;
  return (
    <div className="feedback-panel report-workspace">
      <nav className="report-steps" aria-label="Report steps">
        {report ? (
          <button type="button" onClick={edit}>
            <Check size={13} /> Details
          </button>
        ) : (
          <span aria-current="step">Details</span>
        )}
        <ArrowRight size={12} aria-hidden="true" />
        <span aria-current={report ? "step" : undefined}>Review</span>
      </nav>
      <div className="report-body">
        {!report ? (
          <form
            id={formId}
            className="report-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (reading) return;
              try {
                review({
                  format: "framebridge-feedback",
                  version: 1,
                  clientVersion: "0.1.0",
                  ...draft,
                  ...(layout && props.pkg
                    ? { diagnostics: feedbackDiagnostics(props.pkg) }
                    : {}),
                  ...(screenshot ? { screenshot } : {}),
                });
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not prepare the report.",
                );
              }
            }}
          >
            <div className="report-overview-fields">
              <label className="feedback-field">
                <span>Issue type</span>
                <SelectControl
                  aria-label="Issue type"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as FeedbackReport["category"],
                    })
                  }
                >
                  {FEEDBACK_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {categories[category]}
                    </option>
                  ))}
                </SelectControl>
              </label>
              {field("title", "Summary", "What isn’t working?", true)}
            </div>
            {field(
              "actual",
              "What happened?",
              "Describe the problem and where you noticed it.",
              true,
            )}
            <Disclosure
              className="report-extra-details"
              open={!!draft.steps || !!draft.expected || undefined}
            >
              <DisclosureSummary>
                Steps & expected result{" "}
                <span className="report-optional">Optional</span>
              </DisclosureSummary>
              <div className="report-extra-fields">
                {field(
                  "steps",
                  "Steps to reproduce",
                  "1. Select a frame\n2. Analyze…",
                )}
                {field(
                  "expected",
                  "Expected result",
                  "What should have happened?",
                )}
              </div>
            </Disclosure>
            <div className="report-attachments">
              <div className="report-section-label">
                Attachments <span>Optional</span>
              </div>
              <div className="report-screenshot-row">
                {screenshot ? (
                  <img
                    className="report-attachment-thumb"
                    src={"data:image/png;base64," + screenshot.data}
                    alt="Selected report screenshot"
                    onError={() => {
                      setScreenshot(undefined);
                      setScreenshotName("");
                      setError(
                        "This PNG could not be displayed. Choose another screenshot.",
                      );
                    }}
                  />
                ) : (
                  <span className="report-attachment-icon">
                    <Image size={19} />
                  </span>
                )}
                <div className="report-attachment-info">
                  <strong>
                    {screenshot
                      ? screenshotName || "Screenshot.png"
                      : "Screenshot"}
                  </strong>
                  <span>
                    {screenshot
                      ? `${screenshot.width} × ${screenshot.height} · PNG`
                      : "PNG · up to 512 KB"}
                  </span>
                </div>
                <FilePicker
                  aria-label="Feedback screenshot PNG"
                  buttonLabel={
                    reading ? "Reading…" : screenshot ? "Replace" : "Attach"
                  }
                  showFilename={false}
                  accept="image/png,.png"
                  disabled={reading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setReading(true);
                    setError("");
                    try {
                      if (file.size > 512 * 1024)
                        throw new Error(
                          "Crop the screenshot to 512 KB or less.",
                        );
                      const bytes = new Uint8Array(await file.arrayBuffer());
                      if (!pngPixelSize(bytes))
                        throw new Error("Choose a valid PNG screenshot.");
                      setScreenshot(feedbackScreenshot(bytes));
                      setScreenshotName(file.name);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not read this PNG.",
                      );
                    } finally {
                      setReading(false);
                    }
                  }}
                />
                {screenshot && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove screenshot"
                    disabled={reading}
                    onClick={() => {
                      setScreenshot(undefined);
                      setScreenshotName("");
                    }}
                  >
                    <X size={15} />
                  </Button>
                )}
              </div>
              <p className="report-attachment-note">
                Crop out private information. Visible text in screenshots isn’t
                redacted.
              </p>
              <label className="feedback-check report-layout-option">
                <Checkbox
                  aria-label="Include layout diagnostics"
                  checked={layout}
                  disabled={!props.pkg}
                  onCheckedChange={(checked) => setLayout(checked === true)}
                />
                <span>
                  <strong>Include layout diagnostics</strong>
                  <small>
                    {props.pkg
                      ? "Geometry and classes only. No layer names, text, image IDs or document IDs."
                      : "Analyze a selection to include diagnostics."}
                  </small>
                </span>
                <Layers size={16} aria-hidden="true" />
              </label>
            </div>
          </form>
        ) : (
          <section className="report-review" aria-label="Report review">
            <div className="report-review-heading">
              <span className="report-category">
                {categories[report.category]}
              </span>
              <Button size="sm" variant="ghost" onClick={edit}>
                <ArrowLeft size={13} /> Edit report
              </Button>
            </div>
            <h3 className="report-summary-title selectable-text">
              {report.title}
            </h3>
            <div className="report-review-field">
              <span>What happened</span>
              <p className="selectable-text">{report.actual}</p>
            </div>
            {(report.steps || report.expected) && (
              <div className="report-review-details">
                {report.steps && (
                  <div className="report-review-field">
                    <span>Steps to reproduce</span>
                    <p className="selectable-text">{report.steps}</p>
                  </div>
                )}
                {report.expected && (
                  <div className="report-review-field">
                    <span>Expected result</span>
                    <p className="selectable-text">{report.expected}</p>
                  </div>
                )}
              </div>
            )}
            {(report.diagnostics || report.screenshot) && (
              <div className="report-included">
                {report.diagnostics && (
                  <span>
                    <Layers size={14} /> {report.diagnostics.nodes.length}
                    {report.diagnostics.truncated ? "+" : ""} instances
                  </span>
                )}
                {report.screenshot && (
                  <span>
                    <Image size={14} /> Screenshot · {report.screenshot.width} ×{" "}
                    {report.screenshot.height}
                  </span>
                )}
              </div>
            )}
            {report.screenshot && (
              <img
                className="feedback-screenshot report-review-screenshot"
                src={"data:image/png;base64," + report.screenshot.data}
                alt="Screenshot included in report"
              />
            )}
            <Disclosure className="report-data">
              <DisclosureSummary>
                Report data{" "}
                <span className="report-optional">
                  {Math.ceil(
                    new TextEncoder().encode(JSON.stringify(report)).length /
                      1024,
                  )}{" "}
                  KB
                </span>
              </DisclosureSummary>
              <pre>
                {JSON.stringify(
                  {
                    ...report,
                    ...(report.screenshot
                      ? {
                          screenshot: {
                            ...report.screenshot,
                            data: "[PNG pixels shown above]",
                          },
                        }
                      : {}),
                  },
                  null,
                  2,
                )}
              </pre>
            </Disclosure>
          </section>
        )}
        {error && (
          <p role="alert" className="report-error">
            {error}
          </p>
        )}
        {copyStatus && (
          <p role="status" className="report-copy-status">
            {copyStatus}
          </p>
        )}
        {copyText && (
          <Textarea
            aria-label="Report JSON to copy"
            className="report-copy-fallback"
            readOnly
            value={copyText}
            rows={4}
            onFocus={(e) => e.target.select()}
          />
        )}
      </div>
      <div className="report-footer">
        {report ? (
          <label className="feedback-check report-review-check">
            <Checkbox
              aria-label="I reviewed this report for private information"
              checked={reviewed}
              onCheckedChange={(checked) => setReviewed(checked === true)}
            />
            <span>
              I checked this report for private information.
              <small>
                Credentials are redacted from notes. Check screenshot content
                yourself.
              </small>
            </span>
          </label>
        ) : (
          <div className="report-draft-actions">
            <span>Nothing is sent until you review it.</span>
            <Button type="submit" form={formId} disabled={reading}>
              Review report <ArrowRight size={15} />
            </Button>
          </div>
        )}
        <div className="report-delivery">
          {props.renderPrivate
            ? props.renderPrivate(report, reviewed, review, localActions)
            : report && (
                <div className="report-share-actions" data-online="false">
                  {localActions}
                </div>
              )}
        </div>
      </div>
    </div>
  );
}
