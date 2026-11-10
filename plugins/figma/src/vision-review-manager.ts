import {
  readVisionResult,
  validateVisionRequest,
  VISION_LIMITS,
  type VisionConfig,
  type VisionRequest,
  type VisionResult,
} from "../../../packages/core/src/vision-review";
export type VisionState = {
  enabled: boolean;
  busy: boolean;
  config?: VisionConfig;
  result?: VisionResult;
  error: string;
  notice: string;
};
export type VisionApi = (
  path: string,
  token: string,
  body: unknown,
  method: string,
  signal: AbortSignal,
) => Promise<any>;
export function createVisionReviewManager(
  api: VisionApi,
  changed: (state: VisionState) => void,
) {
  let state: VisionState = {
      enabled: false,
      busy: false,
      error: "",
      notice: "",
    },
    token = "",
    context = "",
    sequence = 0,
    disposed = false;
  let abort: AbortController | undefined, reviewId: string | undefined;
  const emit = (patch: Partial<VisionState>) => {
    if (!disposed) {
      state = { ...state, ...patch };
      changed(state);
    }
  };
  const cancel = () => {
    sequence++;
    abort?.abort();
    if (reviewId && token)
      void api(
        "/cancel",
        token,
        { id: reviewId },
        "POST",
        AbortSignal.timeout(5000),
      ).catch(() => {});
    reviewId = undefined;
    emit({
      busy: false,
      notice:
        "Cancelled. A sent request may already have incurred its reserved allowance. Local review remains available.",
    });
  };
  const run = async (
    work: (signal: AbortSignal, current: () => boolean) => Promise<void>,
  ) => {
    if (disposed || state.busy) return;
    const at = ++sequence;
    abort = new AbortController();
    const current = () => !disposed && at === sequence;
    emit({ busy: true, error: "", notice: "" });
    try {
      await work(abort.signal, current);
    } catch (e) {
      if (current())
        emit({
          error:
            e instanceof Error
              ? e.message
              : "AI review failed. Review locally or try again.",
        });
    } finally {
      if (current()) {
        reviewId = undefined;
        emit({ busy: false });
      }
    }
  };
  return {
    get state() {
      return state;
    },
    setContext(nextToken: string, nextContext: string) {
      if (nextToken === token && nextContext === context) return;
      cancel();
      const accountChanged = nextToken !== token;
      token = nextToken;
      context = nextContext;
      emit({
        result: undefined,
        error: "",
        notice: "",
        ...(accountChanged ? { enabled: false, config: undefined } : {}),
      });
    },
    enable(value: boolean) {
      cancel();
      emit({
        enabled: value,
        result: undefined,
        error: "",
        notice: "",
        ...(!value ? { config: undefined } : {}),
      });
    },
    configure() {
      return run(async (signal, current) => {
        if (!state.enabled || !token)
          throw new Error(
            "Enable optional AI review and sign in with Roblox first.",
          );
        const value = await api("/config", token, undefined, "GET", signal);
        if (!current()) return;
        if (
          !value ||
          typeof value.available !== "boolean" ||
          (value.available &&
            (value.provider !== "OpenAI" ||
              typeof value.model !== "string" ||
              value.model.length > 80 ||
              !Number.isSafeInteger(value.maxCostMicros) ||
              value.maxCostMicros < 1 ||
              value.maxCostMicros > VISION_LIMITS.allowanceMicros ||
              !Number.isSafeInteger(value.remainingRequests) ||
              value.remainingRequests < 0 ||
              !Number.isSafeInteger(value.remainingCostMicros) ||
              value.remainingCostMicros < 0 ||
              !Number.isSafeInteger(value.resetsAt)))
        )
          throw new Error(
            "AI review service returned an invalid configuration.",
          );
        emit({
          config: value,
          notice: value.available
            ? "Service checked. Preview and approve the data before requesting review."
            : "Optional AI review is disabled. Local review is available below.",
        });
      });
    },
    review(request: VisionRequest) {
      return run(async (signal, current) => {
        if (!state.enabled || !state.config?.available || !token)
          throw new Error("Check the signed-in AI review service first.");
        validateVisionRequest(request);
        if (request.maxCostMicros < state.config.maxCostMicros!)
          throw new Error("Increase the approved allowance or review locally.");
        reviewId = request.id;
        const value = await api("", token, request, "POST", signal);
        if (!current()) return;
        const result = readVisionResult(value?.result, request.layers);
        if (value.reservedCostMicros !== state.config.maxCostMicros)
          throw new Error(
            "The review allowance changed. Check the service before retrying.",
          );
        if (
          !Number.isSafeInteger(value.remainingRequests) ||
          value.remainingRequests < 0 ||
          !Number.isSafeInteger(value.remainingCostMicros) ||
          value.remainingCostMicros < 0 ||
          !Number.isSafeInteger(value.resetsAt)
        )
          throw new Error(
            "The service returned invalid remaining allowances. Check the service before retrying.",
          );
        emit({
          result,
          config: {
            ...state.config,
            remainingRequests: value.remainingRequests,
            remainingCostMicros: value.remainingCostMicros,
            resetsAt: value.resetsAt,
          },
          notice:
            "AI suggestions are ready for review. Nothing has been corrected automatically.",
        });
      });
    },
    cancel,
    dispose() {
      cancel();
      disposed = true;
    },
  };
}
