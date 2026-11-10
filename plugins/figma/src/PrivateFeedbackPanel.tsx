import { useEffect, useRef, useState, type ReactNode } from "react";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { ArrowRight, Check, LoaderCircle } from "./components/Glyph";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { isHostMessage } from "./bridge";
import { FEEDBACK_STORAGE_KEY, type SavedFeedback } from "./feedback-storage";
import { createFeedbackManager, type FeedbackState } from "./feedback-manager";
import {
  feedbackConfig,
  submitFeedback,
  inspectFeedback,
  withdrawFeedback,
} from "./feedback-api";
import { PRIVATE_BETA, RELAY_URL } from "./transfer";
import type { FeedbackReport } from "../../../packages/core/src/feedback";
export function PrivateFeedbackPanel(props: {
  report?: FeedbackReport;
  reviewed: boolean;
  beta: string;
  onBeta(value: string): void;
  onReview(report: FeedbackReport): void;
  localActions?: ReactNode;
}) {
  const [state, setState] = useState<FeedbackState>({
      loaded: false,
      busy: false,
      records: [],
      error: "",
      notice: "",
    }),
    [available, setAvailable] = useState<boolean>(),
    [configError, setConfigError] = useState(""),
    [confirm, setConfirm] = useState(""),
    [sentSnapshot, setSentSnapshot] = useState(""),
    [tick, setTick] = useState(0);
  const requests = useRef(
      new Map<
        number,
        {
          resolve(value: unknown): void;
          reject(error: Error): void;
          timer: ReturnType<typeof setTimeout>;
        }
      >(),
    ),
    revision = useRef(0);
  const bridge = (type: string, data: object = {}) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++revision.current,
        timer = setTimeout(() => {
          requests.current.delete(id);
          reject(new Error("Report storage did not respond."));
        }, 8000);
      requests.current.set(id, { resolve, reject, timer });
      parent.postMessage(
        { pluginMessage: { type, ...data, revision: id } },
        "*",
      );
    });
  const manager = useRef<ReturnType<typeof createFeedbackManager> | null>(null);
  if (!manager.current)
    manager.current = createFeedbackManager(
      RELAY_URL,
      {
        async load() {
          return import.meta.env.DEV
            ? JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || "null")
            : bridge("load-feedback");
        },
        async save(feedback: SavedFeedback[]) {
          if (import.meta.env.DEV)
            localStorage.setItem(
              FEEDBACK_STORAGE_KEY,
              JSON.stringify(feedback),
            );
          else await bridge("save-feedback", { feedback });
        },
      },
      {
        submit: submitFeedback,
        inspect: inspectFeedback,
        withdraw: withdrawFeedback,
      },
      setState,
    );
  useEffect(() => {
    const abort = new AbortController();
    const receive = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const m = event.data?.pluginMessage;
      if (m?.type !== "feedback-response") return;
      const pending = requests.current.get(m.revision);
      if (!pending) return;
      requests.current.delete(m.revision);
      clearTimeout(pending.timer);
      if (m.error)
        pending.reject(new Error("Saved reports could not be stored or read."));
      else pending.resolve(m.feedback);
    };
    window.addEventListener("message", receive);
    void manager.current!.restore();
    void feedbackConfig(abort.signal)
      .then(setAvailable)
      .catch(() => {
        if (!abort.signal.aborted)
          setConfigError(
            "Online submission could not be checked. You can download a copy.",
          );
      });
    const timer = setInterval(() => setTick((n) => n + 1), 30000);
    return () => {
      abort.abort();
      clearInterval(timer);
      manager.current!.dispose();
      window.removeEventListener("message", receive);
      for (const pending of requests.current.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Report window closed."));
      }
      requests.current.clear();
    };
  }, []);
  void tick;
  const pending = state.records.find(
      (r) => r.report && r.expiresAt > Date.now(),
    ),
    alreadySent =
      !!props.report && sentSnapshot === JSON.stringify(props.report),
    same =
      pending?.report &&
      props.report &&
      JSON.stringify(pending.report) === JSON.stringify(props.report);
  if (!props.report && !state.records.length && !state.error) return null;
  return (
    <section aria-label="Report sharing" className="report-delivery-panel">
      {configError && props.report && (
        <p className="report-service-note" role="status">
          {configError}
        </p>
      )}
      {available && props.report && PRIVATE_BETA && (
        <label className="feedback-field">
          <span>Private beta access</span>
          <Input
            type="password"
            autoComplete="off"
            value={props.beta}
            onChange={(e) => props.onBeta(e.target.value)}
          />
        </label>
      )}
      {props.report && (
        <div className="report-share-actions" data-online={available === true}>
          {props.localActions}
          {available && (
            <>
              <Button
                className="report-send"
                size="sm"
                disabled={
                  alreadySent ||
                  !props.report ||
                  !props.reviewed ||
                  (PRIVATE_BETA && !props.beta) ||
                  !state.loaded ||
                  state.busy ||
                  (!!pending && !same)
                }
                onClick={async () => {
                  if (!props.report) return;
                  const snapshot = JSON.stringify(props.report);
                  await (same
                    ? manager.current!.retry(pending!.reportToken, props.beta)
                    : manager.current!.submit(props.report, props.beta));
                  if (!manager.current!.snapshot().error)
                    setSentSnapshot(snapshot);
                }}
              >
                {state.busy ? (
                  <LoaderCircle size={14} className="spin" />
                ) : alreadySent ? (
                  <Check size={14} />
                ) : (
                  <ArrowRight size={14} />
                )}
                {state.busy
                  ? "Confirming…"
                  : alreadySent
                    ? "Report received"
                    : same
                      ? "Retry same report"
                      : "Send report"}
              </Button>
            </>
          )}
        </div>
      )}
      {available && props.report && (
        <p className="report-service-note">
          Online reports expire after 14 days. Withdraw them from Recent
          reports.
        </p>
      )}
      {!state.loaded && !!state.error && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void manager.current!.restore()}
        >
          Retry report storage
        </Button>
      )}
      {state.error && (
        <p className="report-error" role="alert">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="report-service-note" role="status">
          {state.notice}
        </p>
      )}
      {state.records.length > 0 && (
        <Disclosure className="report-history">
          <DisclosureSummary>
            Recent reports{" "}
            <span className="report-optional">{state.records.length}</span>
          </DisclosureSummary>
          {state.records.map((record) => {
            const expired = record.expiresAt <= Date.now();
            return (
              <article key={record.reportToken} className="feedback-record">
                <strong>{record.receipt?.title || record.report?.title}</strong>
                <p>
                  {record.receipt ? "Received" : "Delivery unconfirmed"} ·{" "}
                  {expired
                    ? "Expired"
                    : `Expires ${new Date(record.expiresAt).toLocaleString()}`}
                </p>
                {record.receipt && (
                  <p className="feedback-hint">Receipt {record.receipt.id}</p>
                )}
                <div className="feedback-actions">
                  {record.report && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => props.onReview(record.report!)}
                    >
                      Review pending report
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={state.busy || expired}
                    onClick={async () => {
                      await manager.current!.inspect(record.reportToken);
                      if (record.report && !manager.current!.snapshot().error)
                        setSentSnapshot(JSON.stringify(record.report));
                    }}
                  >
                    Check status
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={state.busy || expired}
                    onClick={() => setConfirm(record.reportToken)}
                  >
                    Withdraw
                  </Button>
                </div>
                {confirm === record.reportToken && (
                  <div>
                    <p>
                      Remove this report from the service and this device? A
                      pending report will also be cancelled.{" "}
                      {PRIVATE_BETA && record.report
                        ? "Service access is required for cancellation."
                        : ""}
                    </p>
                    <div className="feedback-actions">
                      <Button
                        size="sm"
                        disabled={
                          state.busy ||
                          (PRIVATE_BETA && !!record.report && !props.beta)
                        }
                        onClick={async () => {
                          await manager.current!.withdraw(
                            record.reportToken,
                            props.beta,
                          );
                          if (!manager.current!.snapshot().error)
                            setSentSnapshot("");
                          setConfirm("");
                        }}
                      >
                        Confirm withdrawal
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirm("")}
                      >
                        Keep report
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </Disclosure>
      )}
    </section>
  );
}
