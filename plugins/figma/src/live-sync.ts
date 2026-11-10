export type SyncTarget = { ids: string[]; names: string[] };
export type SyncState = {
  enabled: boolean;
  phase:
    | "off"
    | "waiting"
    | "idle"
    | "scheduled"
    | "analyzing"
    | "sending"
    | "paused";
  target?: SyncTarget;
  message: string;
  lastSync?: number;
};
export type SyncRun = {
  target: SyncTarget;
  signal: AbortSignal;
  sending(): void;
  publishing(): void;
};

/** One pipeline at a time. Once publication starts, finish its receipt before sending a newer edit. */
export function createLiveSync(
  run: (job: SyncRun) => Promise<string>,
  changed: (state: SyncState) => void,
  watch: (target?: SyncTarget) => void,
  delay = 1000,
) {
  let state: SyncState = {
    enabled: false,
    phase: "off",
    message: "Automatic sync is off.",
  };
  let dirty = false,
    held = false,
    disposed = false,
    epoch = 0,
    lastStart = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: { abort: AbortController; publishing: boolean } | undefined;
  const emit = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    if (!disposed) changed({ ...state });
  };
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  function schedule() {
    clear();
    if (
      disposed ||
      !state.enabled ||
      !state.target ||
      !dirty ||
      held ||
      flight ||
      state.phase === "paused"
    )
      return;
    emit({ phase: "scheduled", message: "Waiting for edits to settle…" });
    timer = setTimeout(
      () => void execute(),
      Math.max(delay, 2500 - (Date.now() - lastStart)),
    );
  }
  async function execute() {
    timer = undefined;
    if (disposed || held || flight || !state.enabled || !state.target || !dirty)
      return;
    dirty = false;
    lastStart = Date.now();
    const atEpoch = epoch;
    const job = { abort: new AbortController(), publishing: false };
    flight = job;
    emit({ phase: "analyzing", message: "Preparing the linked frames…" });
    try {
      const message = await run({
        target: state.target,
        signal: job.abort.signal,
        sending() {
          if (atEpoch === epoch && state.enabled)
            emit({ phase: "sending", message: "Sending changes to Studio…" });
        },
        publishing() {
          job.publishing = true;
        },
      });
      if (atEpoch === epoch && state.enabled && !job.abort.signal.aborted)
        emit({ phase: "idle", message, lastSync: Date.now() });
    } catch (error) {
      if (atEpoch === epoch && state.enabled && !job.abort.signal.aborted) {
        dirty = true;
        emit({
          phase: "paused",
          message:
            error instanceof Error
              ? error.message
              : "Sync failed. Review the design, then resume.",
        });
      }
    } finally {
      if (flight === job) flight = undefined;
      schedule();
    }
  }
  return {
    state: () => state,
    setEnabled(enabled: boolean) {
      epoch++;
      clear();
      // Turning off prevents future exports; an accepted package may already be in Studio.
      flight?.abort.abort();
      emit({
        enabled,
        phase: enabled ? (state.target ? "idle" : "waiting") : "off",
        message: enabled
          ? "Send a reviewed design to choose the frames to sync."
          : "Automatic sync is off.",
      });
      watch(enabled ? state.target : undefined);
      dirty = enabled && !!state.target;
      schedule();
    },
    delivered(target: SyncTarget, message: string) {
      epoch++;
      clear();
      flight?.abort.abort();
      dirty = false;
      emit({
        target: { ids: [...target.ids], names: [...target.names] },
        phase: state.enabled ? "idle" : "off",
        message,
        lastSync: Date.now(),
      });
      watch(state.enabled ? state.target : undefined);
    },
    edited() {
      if (!state.enabled || !state.target || disposed) return;
      dirty = true;
      if (flight && !flight.publishing) flight.abort.abort();
      schedule();
    },
    hold(value: boolean) {
      held = value;
      if (value) clear();
      else schedule();
    },
    pause(message: string) {
      epoch++;
      clear();
      flight?.abort.abort();
      emit({ phase: "paused", message });
      watch(undefined);
    },
    resume() {
      if (!state.enabled) return;
      epoch++;
      emit({
        phase: state.target ? "idle" : "waiting",
        message: "Checking the linked frames…",
      });
      watch(state.target);
      dirty = !!state.target;
      schedule();
    },
    reset(message = "Send a reviewed design to choose the frames to sync.") {
      epoch++;
      clear();
      flight?.abort.abort();
      dirty = false;
      emit({
        target: undefined,
        lastSync: undefined,
        phase: state.enabled ? "waiting" : "off",
        message,
      });
      watch(undefined);
    },
    dispose() {
      disposed = true;
      epoch++;
      clear();
      flight?.abort.abort();
      watch(undefined);
    },
  };
}
