import { useEffect, useRef, useState } from "react";
import { isHostMessage } from "./bridge";
import {
  EMPTY_REVIEW_PREFERENCES,
  REVIEW_PREFERENCES_KEY,
  readReviewPreferences,
  type ReviewPreferences,
} from "../../../packages/core/src/structure-review";
export function useReviewPreferences() {
  const [preferences, setPreferences] = useState<ReviewPreferences>({
    ...EMPTY_REVIEW_PREFERENCES,
    rules: [],
  });
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const sequence = useRef(0),
    writeBusy = useRef(false),
    requests = useRef(
      new Map<
        number,
        {
          resolve(value: unknown): void;
          reject(error: Error): void;
          timer: ReturnType<typeof setTimeout>;
        }
      >(),
    );
  const request = (type: string, reviewPreferences?: ReviewPreferences) =>
    new Promise<unknown>((resolve, reject) => {
      const revision = ++sequence.current;
      const timer = setTimeout(() => {
        requests.current.delete(revision);
        reject(new Error("Saved review choices did not respond."));
      }, 8000);
      requests.current.set(revision, { resolve, reject, timer });
      parent.postMessage(
        { pluginMessage: { type, revision, reviewPreferences } },
        "*",
      );
    });
  const restore = async () => {
    setLoading(true);
    setError("");
    try {
      const raw = import.meta.env.DEV
        ? JSON.parse(localStorage.getItem(REVIEW_PREFERENCES_KEY) || "null")
        : await request("load-review-preferences");
      setPreferences(readReviewPreferences(raw));
    } catch {
      setError(
        "Could not restore saved review choices. Retry before saving changes.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const message = event.data.pluginMessage;
      if (message?.type !== "review-preferences-response") return;
      const pending = requests.current.get(message.revision);
      if (!pending) return;
      clearTimeout(pending.timer);
      requests.current.delete(message.revision);
      message.error
        ? pending.reject(new Error(message.error))
        : pending.resolve(message.preferences);
    };
    window.addEventListener("message", handler);
    void restore();
    return () => {
      window.removeEventListener("message", handler);
      for (const pending of requests.current.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Plugin closed."));
      }
      requests.current.clear();
    };
  }, []);
  const save = async (next: ReviewPreferences) => {
    if (loading || writeBusy.current || error) return false;
    writeBusy.current = true;
    setSaving(true);
    try {
      const clean = readReviewPreferences(next);
      if (import.meta.env.DEV)
        localStorage.setItem(REVIEW_PREFERENCES_KEY, JSON.stringify(clean));
      else await request("save-review-preferences", clean);
      setPreferences(clean);
      return true;
    } catch {
      setError(
        "Could not save this choice. Your export correction still applies; retry storage to save future preferences.",
      );
      return false;
    } finally {
      writeBusy.current = false;
      setSaving(false);
    }
  };
  return { preferences, loading, saving, error, save, restore };
}
