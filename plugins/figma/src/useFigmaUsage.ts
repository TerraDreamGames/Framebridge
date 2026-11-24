import { useCallback, useEffect, useRef, useState } from "react";
import {
  FIGMA_USAGE_PATH,
  ONBOARDING_EVENTS,
  readOnboardingUsage,
  utcDay,
  type OnboardingEvent,
} from "../../../packages/core/src/figma-usage";
import { sha256Hex } from "../../../packages/core/src/sha256";
import { isHostMessage } from "./bridge";
import { PRIVATE_BETA, RELAY_URL, relayRequest } from "./transfer";
import {
  readUsagePreferences,
  type UsagePreferences,
} from "./usage-preferences";

const enabled =
  !import.meta.env.DEV && !PRIVATE_BETA && RELAY_URL.startsWith("https://");
const send = (type: string, data = {}) =>
  parent.postMessage({ pluginMessage: { type, ...data } }, "*");

export function useFigmaUsage() {
  const preferences = useRef<UsagePreferences | undefined>(undefined);
  const revision = useRef(0);
  const consentPending = useRef(false);
  const bufferedEvents = useRef<{ event: OnboardingEvent; start: boolean }[]>(
    [],
  );
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState<UsagePreferences>();
  const [failedChoice, setFailedChoice] = useState<boolean>();
  const requestedChoice = useRef<boolean | undefined>(undefined);
  const [day, setDay] = useState(utcDay);
  const delivered = useRef("");
  const track = useCallback((event: OnboardingEvent, start = false) => {
    if (consentPending.current && requestedChoice.current === true) {
      if (bufferedEvents.current.length < 24)
        bufferedEvents.current.push({ event, start });
      return;
    }
    const current = preferences.current;
    if (!current || consentPending.current) return;
    const now = utcDay();
    setDay(now);
    const cohort = readOnboardingUsage(current.onboarding, now);
    // Reopening Tutorial from the sidebar can resume a cohort without creating one.
    if (!cohort && !start) return;
    const events =
      (cohort?.events ?? ONBOARDING_EVENTS.opened) | ONBOARDING_EVENTS[event];
    if (cohort?.events === events) return;
    const onboarding = { day: cohort?.day ?? now, events };
    preferences.current = { ...current, onboarding };
    setRecord(preferences.current);
    send("save-figma-onboarding-usage", { seed: current.seed, onboarding });
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const receive = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const message = event.data?.pluginMessage;
      if (
        message?.type !== "figma-usage-preferences" ||
        message.revision !== revision.current
      )
        return;
      setReady(true);
      setSaving(false);
      consentPending.current = false;
      setFailedChoice(message.error ? requestedChoice.current : undefined);
      setError(
        message.error
          ? requestedChoice.current === false
            ? "Sharing is paused here. Retry to turn it off for future launches."
            : "Could not save or read usage sharing."
          : "",
      );
      preferences.current = message.error
        ? undefined
        : readUsagePreferences(message.preferences);
      setRecord(preferences.current);
      if (!preferences.current) delivered.current = "";
      const buffered = bufferedEvents.current;
      bufferedEvents.current = [];
      if (preferences.current)
        for (const entry of buffered) track(entry.event, entry.start);
    };
    const refreshDay = () => setDay(utcDay());
    window.addEventListener("message", receive);
    window.addEventListener("focus", refreshDay);
    window.addEventListener("pointerdown", refreshDay);
    window.addEventListener("keydown", refreshDay);
    send("load-figma-usage", { revision: ++revision.current });
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("focus", refreshDay);
      window.removeEventListener("pointerdown", refreshDay);
      window.removeEventListener("keydown", refreshDay);
    };
  }, [track]);

  const choose = useCallback(
    (share: boolean, initialEvents: OnboardingEvent[] = []) => {
      if (!enabled || consentPending.current) return;
      setDay(utcDay());
      const seed = share
        ? Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("")
        : undefined;
      consentPending.current = true;
      requestedChoice.current = share;
      bufferedEvents.current = share
        ? initialEvents.map((event, index) => ({ event, start: index === 0 }))
        : [];
      if (!share) {
        preferences.current = undefined;
        setRecord(undefined);
      }
      setSaving(true);
      setError("");
      send("save-figma-usage-choice", { seed, revision: ++revision.current });
    },
    [],
  );

  useEffect(() => {
    if (!record) return;
    const onboarding = readOnboardingUsage(record.onboarding, day);
    const stamp = `${record.seed}:${day}:${onboarding?.day}:${onboarding?.events}`;
    if (delivered.current === stamp) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const report = async () => {
      try {
        const derive = (scope: string, date: number) =>
          sha256Hex(
            new TextEncoder().encode(
              `framebridge:${scope}:${date}:${record.seed}`,
            ),
          );
        const [key, cohortKey] = await Promise.all([
          derive("daily", day),
          onboarding ? derive("onboarding", onboarding.day) : undefined,
        ]);
        if (
          controller.signal.aborted ||
          preferences.current?.seed !== record.seed
        )
          return;
        await relayRequest(
          FIGMA_USAGE_PATH,
          "",
          {
            day,
            key,
            ...(onboarding && {
              onboarding: { ...onboarding, key: cohortKey },
            }),
          },
          controller.signal,
        );
        delivered.current = stamp;
      } catch {
        if (!controller.signal.aborted && ++attempts < 3)
          timer = setTimeout(report, 5000);
      }
    };
    timer = setTimeout(report, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [day, record]);

  return {
    available: enabled && ready,
    checked: !!record,
    saving,
    error,
    failedChoice,
    choose,
    track,
  };
}
