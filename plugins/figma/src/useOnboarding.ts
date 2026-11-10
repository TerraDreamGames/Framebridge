import { useEffect, useRef, useState } from "react";
import { isHostMessage } from "./bridge";
import {
  createOnboardingSession,
  DEFAULT_ONBOARDING,
  ONBOARDING_KEY,
  readOnboarding,
  type OnboardingState,
} from "./onboarding";

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>({
    preferences: { ...DEFAULT_ONBOARDING },
    loaded: false,
    saving: false,
    error: "",
  });
  const session = useRef<ReturnType<typeof createOnboardingSession> | null>(
    null,
  );
  if (!session.current)
    session.current = createOnboardingSession({
      changed: setState,
      send(type, data) {
        const message = data as { revision: number; onboarding?: unknown };
        if (import.meta.env.DEV) {
          queueMicrotask(() => {
            try {
              if (type === "load-onboarding")
                session.current!.receive({
                  type: "onboarding",
                  revision: message.revision,
                  onboarding:
                    readOnboarding(
                      JSON.parse(
                        localStorage.getItem(ONBOARDING_KEY) ?? "null",
                      ),
                    ) ?? DEFAULT_ONBOARDING,
                });
              else {
                localStorage.setItem(
                  ONBOARDING_KEY,
                  JSON.stringify(message.onboarding),
                );
                session.current!.receive({
                  type: "onboarding-saved",
                  revision: message.revision,
                });
              }
            } catch {
              session.current!.receive({
                type: "onboarding-error",
                revision: message.revision,
                action: type === "load-onboarding" ? "load" : "save",
              });
            }
          });
        } else parent.postMessage({ pluginMessage: { type, ...data } }, "*");
      },
    });
  useEffect(() => {
    const manager = session.current!;
    const receive = (event: MessageEvent) => {
      if (isHostMessage(event.source, parent, top) && event.data?.pluginMessage)
        manager.receive(event.data.pluginMessage);
    };
    window.addEventListener("message", receive);
    manager.load();
    return () => {
      window.removeEventListener("message", receive);
      manager.dispose();
    };
  }, []);
  return {
    ...state,
    choose: session.current.choose,
    retry: session.current.retry,
  };
}
