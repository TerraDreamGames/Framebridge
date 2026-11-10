import { useEffect, useRef, useState } from "react";
import { isHostMessage } from "./bridge";
import { RELAY_URL } from "./transfer";
import { REVIEW_SYNC_KEY } from "./review-sync-storage";
import {
  createReviewSyncManager,
  type ReviewSyncState,
} from "./review-sync-manager";
import type { RobloxAccountState } from "./roblox-account-manager";
import type { useReviewPreferences } from "./review-preferences";
export function useReviewSync(
  memory: ReturnType<typeof useReviewPreferences>,
  account: RobloxAccountState,
) {
  const [state, setState] = useState<ReviewSyncState>({
    busy: false,
    connected: false,
    error: "",
    notice: "",
  });
  const latest = useRef(memory);
  latest.current = memory;
  const requests = useRef(
    new Map<
      number,
      {
        resolve(v: unknown): void;
        reject(e: Error): void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const sequence = useRef(0);
  const bridge = (type: string, syncSettings?: unknown) =>
    new Promise<any>((resolve, reject) => {
      const revision = ++sequence.current;
      const timer = setTimeout(() => {
        requests.current.delete(revision);
        reject(new Error("Preference sync storage did not respond."));
      }, 8000);
      requests.current.set(revision, { resolve, reject, timer });
      parent.postMessage(
        { pluginMessage: { type, revision, syncSettings } },
        "*",
      );
    });
  const manager = useRef<ReturnType<typeof createReviewSyncManager> | null>(
    null,
  );
  if (!manager.current)
    manager.current = createReviewSyncManager(
      RELAY_URL,
      {
        load: () =>
          import.meta.env.DEV
            ? Promise.resolve(
                JSON.parse(localStorage.getItem(REVIEW_SYNC_KEY) || "null"),
              )
            : bridge("load-review-sync"),
        async save(syncSettings) {
          if (import.meta.env.DEV)
            localStorage.setItem(REVIEW_SYNC_KEY, JSON.stringify(syncSettings));
          else await bridge("save-review-sync", syncSettings);
        },
      },
      async (path, token, grant, body, method, signal) => {
        if (!RELAY_URL)
          throw new Error(
            "Preference sync is available in the hosted private build.",
          );
        const response = await fetch(RELAY_URL + "/v1/review-sync" + path, {
          method,
          signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
            ...(grant ? { "X-Framebridge-Review-Grant": grant } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          credentials: "omit",
          redirect: "error",
        });
        const value = await response.json();
        if (
          !response.ok &&
          !(response.status === 409 && value.conflict === true)
        )
          throw new Error(value.error || "Preference sync failed. Retry.");
        return value;
      },
      {
        get: () => latest.current.preferences,
        save: (p) => latest.current.save(p),
      },
      setState,
    );
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const m = event.data.pluginMessage;
      if (m?.type !== "review-sync-response") return;
      const p = requests.current.get(m.revision);
      if (!p) return;
      clearTimeout(p.timer);
      requests.current.delete(m.revision);
      m.error ? p.reject(new Error(m.error)) : p.resolve(m.syncSettings);
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      manager.current?.dispose();
      for (const p of requests.current.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Plugin closed."));
      }
      requests.current.clear();
    };
  }, []);
  useEffect(() => {
    void manager
      .current!.setAccount(
        account.account && account.accountToken
          ? { userId: account.account.userId, token: account.accountToken }
          : undefined,
      )
      .then(() => {
        if (account.account && account.accountToken)
          void manager.current!.restore();
      });
  }, [account.account?.userId, account.accountToken]);
  return { state, manager: manager.current };
}
