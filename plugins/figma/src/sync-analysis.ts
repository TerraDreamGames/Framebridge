import type {
  AnalysisResult,
  ExportOptions,
} from "../../../packages/core/src/types";

/** Cancellation drains the controller's current renderer before another analysis may start. */
export function createSyncAnalysis(
  send: (type: string, value: object) => void,
  busy: (value: boolean) => void,
  progress: (label: string, percent: number) => void,
) {
  let serial = 0;
  let pending:
    | {
        id: string;
        result?: AnalysisResult;
        error?: Error;
        resolve(value: AnalysisResult): void;
        reject(error: Error): void;
        clean(): void;
      }
    | undefined;
  return {
    request(
      options: ExportOptions,
      rootIds: string[],
      signal: AbortSignal,
    ): Promise<AnalysisResult> {
      signal.throwIfAborted();
      if (pending)
        return Promise.reject(new Error("An analysis is still finishing."));
      const id = `sync-${++serial}`;
      return new Promise((resolve, reject) => {
        const abort = () => {
          if (pending?.id !== id) return;
          pending.error = new DOMException("Export cancelled.", "AbortError");
          send("cancel", { jobId: id });
        };
        pending = {
          id,
          resolve,
          reject,
          clean: () => signal.removeEventListener("abort", abort),
        };
        signal.addEventListener("abort", abort, { once: true });
        busy(true);
        send("analyze", { options, rootIds, jobId: id });
      });
    },
    receive(message: {
      type: string;
      jobId?: string;
      result?: AnalysisResult;
      message?: string;
      label?: string;
      progress?: number;
    }) {
      if (!message.jobId?.startsWith("sync-")) return false;
      if (!pending || pending.id !== message.jobId) return true;
      if (message.type === "progress")
        progress(message.label ?? "Preparing…", message.progress ?? 0);
      if (message.type === "result") pending.result = message.result;
      if (message.type === "error")
        pending.error ??= new Error(message.message ?? "Analysis failed.");
      if (message.type === "idle") {
        const done = pending;
        pending = undefined;
        done.clean();
        busy(false);
        if (done.error) done.reject(done.error);
        else if (done.result) done.resolve(done.result);
        else done.reject(new Error("Analysis finished without a result."));
      }
      return true;
    },
    dispose() {
      if (!pending) return;
      pending.clean();
      pending.reject(new Error("Plugin closed."));
      pending = undefined;
    },
  };
}
