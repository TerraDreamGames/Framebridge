import { isTourStep, type TourStepId } from "./onboarding-tour";

export const ONBOARDING_KEY = "framebridge-onboarding-v1";
export type OnboardingPreferences = {
  version: 1;
  status: "new" | "active" | "dismissed" | "complete";
  route: "connect" | "download";
  tourStep?: TourStepId;
  tourDone?: boolean;
};
export const DEFAULT_ONBOARDING: OnboardingPreferences = {
  version: 1,
  status: "new",
  route: "connect",
};

export function readOnboarding(
  value: unknown,
): OnboardingPreferences | undefined {
  if (!value || typeof value !== "object") return;
  const saved = value as Partial<OnboardingPreferences>;
  if (
    saved.version !== 1 ||
    !["new", "active", "dismissed", "complete"].includes(saved.status ?? "") ||
    (saved.route !== "connect" && saved.route !== "download")
  )
    return;
  return {
    version: 1,
    status: saved.status!,
    route: saved.route,
    ...(isTourStep(saved.tourStep) ? { tourStep: saved.tourStep } : {}),
    ...(typeof saved.tourDone === "boolean"
      ? { tourDone: saved.tourDone }
      : {}),
  };
}

export function createOnboardingStorage(storage: {
  getAsync(key: string): Promise<unknown>;
  setAsync(key: string, value: unknown): Promise<unknown>;
}) {
  let queue = Promise.resolve();
  return {
    async load() {
      await queue;
      return (
        readOnboarding(await storage.getAsync(ONBOARDING_KEY)) ?? {
          ...DEFAULT_ONBOARDING,
        }
      );
    },
    save(value: unknown) {
      const preferences = readOnboarding(value);
      if (!preferences)
        return Promise.reject(new Error("Invalid onboarding preferences."));
      const write = queue.then(async () => {
        await storage.setAsync(ONBOARDING_KEY, preferences);
      });
      queue = write.catch(() => {});
      return write;
    },
    flush: () => queue,
  };
}

export type OnboardingFacts = {
  analyzed: boolean;
  connected: boolean;
  downloaded: boolean;
  receipt?:
    "pending" | "ready" | "queued" | "imported" | "failed" | "superseded";
};

/** Delivering a package is not proof that Studio imported it. */
export function onboardingStep(
  route: OnboardingPreferences["route"],
  facts: OnboardingFacts,
): 0 | 1 | 2 | 3 {
  if (route === "connect" && facts.receipt === "imported") return 3;
  if (!facts.analyzed) return 0;
  if (route === "download") return facts.downloaded ? 2 : 1;
  return facts.connected ? 2 : 1;
}

export type OnboardingState = {
  preferences: OnboardingPreferences;
  loaded: boolean;
  saving: boolean;
  error: string;
};

export function createOnboardingSession(deps: {
  send(type: string, data: object): void;
  changed(state: OnboardingState): void;
  timeoutMs?: number;
}) {
  let state: OnboardingState = {
    preferences: { ...DEFAULT_ONBOARDING },
    loaded: false,
    saving: false,
    error: "",
  };
  let revision = 0,
    touched = false,
    disposed = false;
  let pending: { revision: number; action: "load" | "save" } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = (next: Partial<OnboardingState>) => {
    state = { ...state, ...next };
    if (!disposed) deps.changed(state);
  };
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  const failed = (action: "load" | "save") => {
    clear();
    publish({
      saving: false,
      error:
        action === "load"
          ? "Your getting started preference could not be restored. Open the guide to continue, or retry."
          : "Your guide preference could not be saved. Retry to remember it next time.",
    });
  };
  const request = (action: "load" | "save") => {
    clear();
    const current = ++revision;
    pending = { revision: current, action };
    publish({ saving: action === "save", error: "" });
    timer = setTimeout(() => failed(action), deps.timeoutMs ?? 8000);
    deps.send(`${action}-onboarding`, {
      revision: current,
      ...(action === "save" ? { onboarding: state.preferences } : {}),
    });
  };
  return {
    snapshot: () => state,
    load() {
      if (!touched && !disposed) request("load");
    },
    choose(change: Partial<Omit<OnboardingPreferences, "version">>) {
      if (disposed) return;
      const preferences = readOnboarding({ ...state.preferences, ...change });
      if (!preferences) return;
      touched = true;
      publish({ preferences, loaded: true });
      request("save");
    },
    retry() {
      if (!disposed) request(touched ? "save" : "load");
    },
    receive(message: {
      type?: string;
      revision?: number;
      onboarding?: unknown;
      action?: string;
    }) {
      if (disposed || !pending || pending.revision !== message.revision) return;
      const action = pending.action;
      if (message.type === "onboarding-error" && message.action === action) {
        failed(action);
        return;
      }
      if (message.type === "onboarding" && action === "load") {
        const preferences = readOnboarding(message.onboarding);
        if (!preferences) {
          failed(action);
          return;
        }
        clear();
        publish({ preferences, loaded: true, error: "" });
      } else if (message.type === "onboarding-saved" && action === "save") {
        clear();
        publish({ saving: false, error: "" });
      }
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
