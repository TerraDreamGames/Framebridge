import { useEffect, useRef, useState } from "react";
import { isHostMessage } from "./bridge";
import {
  ROBLOX_ACCOUNT_STORAGE_KEY,
  robloxAuthorizationUrl,
} from "./roblox-account-storage";
import {
  createRobloxAccountManager,
  type RobloxAccountState,
} from "./roblox-account-manager";
import {
  robloxLoginConfig,
  beginRobloxLogin,
  pollRobloxLogin,
  acknowledgeRobloxLogin,
  cancelRobloxLogin,
  inspectRobloxAccount,
  disconnectRobloxAccount,
} from "./roblox-login-api";
import { RELAY_URL } from "./transfer";

export function useRobloxAccount(enabled: boolean) {
  const [state, setState] = useState<RobloxAccountState>({
    loading: enabled,
    busy: false,
    retry: false,
    error: "",
    notice: "",
  });
  const requests = useRef(
    new Map<
      number,
      {
        resolve(value: unknown): void;
        reject(error: Error): void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const revision = useRef(0);
  const bridge = (type: string, data: object = {}) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++revision.current;
      const timer = setTimeout(() => {
        requests.current.delete(id);
        reject(new Error("Roblox connection storage did not respond."));
      }, 8000);
      requests.current.set(id, { resolve, reject, timer });
      parent.postMessage(
        { pluginMessage: { type, ...data, revision: id } },
        "*",
      );
    });
  const manager = useRef<ReturnType<typeof createRobloxAccountManager> | null>(
    null,
  );
  if (!manager.current)
    manager.current = createRobloxAccountManager(
      RELAY_URL,
      {
        async load() {
          return import.meta.env.DEV
            ? JSON.parse(
                localStorage.getItem(ROBLOX_ACCOUNT_STORAGE_KEY) || "null",
              )
            : bridge("load-roblox-account");
        },
        async save(accountSettings) {
          if (import.meta.env.DEV)
            localStorage.setItem(
              ROBLOX_ACCOUNT_STORAGE_KEY,
              JSON.stringify(accountSettings),
            );
          else await bridge("save-roblox-account", { accountSettings });
        },
      },
      {
        config: robloxLoginConfig,
        begin: beginRobloxLogin,
        poll: pollRobloxLogin,
        acknowledge: acknowledgeRobloxLogin,
        cancel: cancelRobloxLogin,
        inspect: inspectRobloxAccount,
        disconnect: disconnectRobloxAccount,
      },
      async (authorizationUrl) => {
        if (manager.current?.snapshot().simulation) {
          if (import.meta.env.DEV) return;
          throw new Error(
            "This is a simulated sign-in service. Use the production service for real authorization.",
          );
        }
        if (
          !robloxAuthorizationUrl(
            authorizationUrl,
            RELAY_URL,
            manager.current?.snapshot().callbackOrigin ?? RELAY_URL,
          )
        )
          throw new Error("Invalid authorization link.");
        if (import.meta.env.DEV) {
          window.open(authorizationUrl, "_blank", "noopener,noreferrer");
        } else
          await bridge("open-roblox-authorization", {
            authorizationUrl,
            origin: RELAY_URL,
          });
      },
      setState,
    );
  useEffect(() => {
    if (!enabled) return;
    const receive = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const m = event.data?.pluginMessage;
      if (m?.type !== "roblox-account-response") return;
      const pending = requests.current.get(m.revision);
      if (!pending) return;
      requests.current.delete(m.revision);
      clearTimeout(pending.timer);
      if (m.error)
        pending.reject(
          new Error("Roblox connection storage or browser action failed."),
        );
      else pending.resolve(m.accountSettings);
    };
    window.addEventListener("message", receive);
    void manager.current!.restore();
    return () => {
      manager.current!.dispose();
      window.removeEventListener("message", receive);
      for (const pending of requests.current.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Plugin closed."));
      }
      requests.current.clear();
    };
  }, [enabled]);
  return { state, manager: manager.current };
}
