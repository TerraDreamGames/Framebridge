import { useEffect, useRef, useState } from "react";
import { isHostMessage } from "./bridge";
import { ARTWORK_ACCESS_KEY } from "./artwork-access-storage";
import {
  createCloudArtworkManager,
  type CloudArtworkState,
} from "./cloud-artwork-manager";
import type { RobloxAccountState } from "./roblox-account-manager";
import { RELAY_URL } from "./transfer";
async function body(response: Response, maximum: number) {
  if (Number(response.headers.get("Content-Length")) > maximum)
    throw new Error("Artwork response exceeded its size limit.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Artwork response was empty.");
  let total = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maximum) {
      await reader.cancel();
      throw new Error("Artwork response exceeded its size limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export function useCloudArtwork(account: RobloxAccountState) {
  const [state, setState] = useState<CloudArtworkState>({
    busy: false,
    enabled: false,
    connected: false,
    error: "",
    notice: "",
  });
  const requests = useRef(
      new Map<
        number,
        {
          resolve(v: unknown): void;
          reject(e: Error): void;
          timer: ReturnType<typeof setTimeout>;
        }
      >(),
    ),
    sequence = useRef(0);
  const bridge = (type: string, artworkAccess?: unknown) =>
    new Promise<any>((resolve, reject) => {
      const revision = ++sequence.current,
        timer = setTimeout(() => {
          requests.current.delete(revision);
          reject(new Error("Artwork connection storage did not respond."));
        }, 8000);
      requests.current.set(revision, { resolve, reject, timer });
      parent.postMessage(
        { pluginMessage: { type, revision, artworkAccess } },
        "*",
      );
    });
  const manager = useRef<ReturnType<typeof createCloudArtworkManager> | null>(
    null,
  );
  if (!manager.current)
    manager.current = createCloudArtworkManager(
      RELAY_URL,
      {
        load: () =>
          import.meta.env.DEV
            ? Promise.resolve(
                JSON.parse(localStorage.getItem(ARTWORK_ACCESS_KEY) || "null"),
              )
            : bridge("load-artwork-access"),
        async save(v) {
          if (import.meta.env.DEV)
            localStorage.setItem(ARTWORK_ACCESS_KEY, JSON.stringify(v));
          else await bridge("save-artwork-access", v);
        },
      },
      async (path, token, grant, data, method, signal) => {
        if (!RELAY_URL)
          throw new Error("Cloud artwork requires the hosted private build.");
        const response = await fetch(RELAY_URL + "/v1/artwork" + path, {
          method,
          signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {}),
            ...(grant ? { "X-Framebridge-Artwork-Grant": grant } : {}),
          },
          ...(data === undefined ? {} : { body: JSON.stringify(data) }),
          credentials: "omit",
          redirect: "error",
        });
        const png =
            response.ok &&
            response.headers.get("Content-Type")?.startsWith("image/png"),
          bytes = await body(response, png ? 512 * 1024 : 200000);
        if (png) return bytes;
        if (
          !response.headers.get("Content-Type")?.startsWith("application/json")
        )
          throw new Error("Unexpected artwork service response.");
        const result = JSON.parse(new TextDecoder().decode(bytes));
        if (
          !response.ok &&
          !(response.status === 409 && result.conflict === true)
        )
          throw new Error(result.error || "Cloud artwork failed. Retry.");
        return result;
      },
      setState,
    );
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const m = event.data.pluginMessage;
      if (m?.type !== "artwork-access-response") return;
      const p = requests.current.get(m.revision);
      if (!p) return;
      clearTimeout(p.timer);
      requests.current.delete(m.revision);
      m.error ? p.reject(new Error(m.error)) : p.resolve(m.artworkAccess);
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
      .then(() => void manager.current!.restore());
  }, [account.account?.userId, account.accountToken]);
  return { state, manager: manager.current };
}
