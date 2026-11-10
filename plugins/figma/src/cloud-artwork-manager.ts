import {
  ARTWORK_LIMITS as L,
  artworkId,
  readArtworkSnapshot,
  type ArtworkSnapshot,
  type ArtworkItem,
} from "../../../packages/core/src/cloud-artwork";
import { libraryPng } from "../../../packages/core/src/image-processing";
import { sha256Hex } from "../../../packages/core/src/sha256";
import { reviewVersion } from "../../../packages/core/src/review-cloud";
import {
  readArtworkAccess,
  type SavedArtworkAccess,
} from "./artwork-access-storage";
export type CloudArtworkState = {
  busy: boolean;
  enabled: boolean;
  connected: boolean;
  snapshot?: ArtworkSnapshot;
  conflict?: ArtworkSnapshot;
  error: string;
  notice: string;
};
export type ArtworkApi = (
  path: string,
  token: string,
  grant: string,
  body: unknown,
  method: string,
  signal: AbortSignal,
) => Promise<any>;
export function createCloudArtworkManager(
  origin: string,
  storage: {
    load(): Promise<unknown>;
    save(v: SavedArtworkAccess | null): Promise<void>;
  },
  api: ArtworkApi,
  changed: (s: CloudArtworkState) => void,
) {
  let state: CloudArtworkState = {
      busy: false,
      enabled: false,
      connected: false,
      error: "",
      notice: "",
    },
    account: { userId: string; token: string } | undefined,
    saved: SavedArtworkAccess | undefined,
    sequence = 0,
    disposed = false,
    request: AbortController | undefined;
  let storageWork = Promise.resolve();
  const ordered = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = storageWork.then(fn);
    storageWork = p.then(
      () => {},
      () => {},
    );
    return p;
  };
  const load = () => ordered(() => storage.load()),
    save = (v: SavedArtworkAccess | null) => ordered(() => storage.save(v));
  let connecting:
    | {
        identity: { userId: string; token: string };
        proposal: SavedArtworkAccess;
      }
    | undefined;
  const rollback = async (p: NonNullable<typeof connecting>) => {
    await api(
      "/grant",
      p.identity.token,
      p.proposal.grantToken,
      undefined,
      "DELETE",
      AbortSignal.timeout(5000),
    ).catch(() => {});
    await ordered(async () => {
      const current = readArtworkAccess(await storage.load());
      if (
        current?.grantToken === p.proposal.grantToken &&
        current.origin === origin &&
        current.userId === p.identity.userId
      )
        await storage.save(null);
    }).catch(() => {});
  };
  const emit = (patch: Partial<CloudArtworkState>) => {
    if (!disposed) {
      state = { ...state, ...patch };
      changed(state);
    }
  };
  const cancel = () => {
    sequence++;
    request?.abort();
    if (connecting) void rollback(connecting);
    emit({
      busy: false,
      notice:
        "Cancelled. A sent upload or edit may have completed; fetch before retrying.",
    });
  };
  const context = () => {
    if (!account)
      throw new Error(
        "Sign in through Images → Roblox sign-in to use cloud artwork.",
      );
    return account;
  };
  const call = (
    path: string,
    body: unknown,
    method: string,
    signal: AbortSignal,
    grant = saved?.grantToken ?? "",
  ) => api(path, context().token, grant, body, method, signal);
  const run = async (
    fn: (current: () => boolean, signal: AbortSignal) => Promise<void>,
  ) => {
    if (disposed || state.busy) return;
    const at = ++sequence;
    request = new AbortController();
    const current = () => !disposed && sequence === at;
    emit({ busy: true, error: "", notice: "" });
    try {
      await fn(current, request.signal);
    } catch (e) {
      if (current())
        emit({
          error:
            e instanceof Error ? e.message : "Cloud artwork failed. Retry.",
        });
    } finally {
      if (current()) emit({ busy: false });
    }
  };
  const check = (raw: unknown) => {
    const s = readArtworkSnapshot(raw);
    if (
      saved &&
      (saved.scope.kind !== s.scope.kind || saved.scope.id !== s.scope.id)
    )
      throw new Error("Artwork scope changed. Reconnect.");
    if (s.scope.kind === "personal" && s.scope.id !== context().userId)
      throw new Error("This artwork belongs to another account.");
    return s;
  };
  const fetchLibrary = () =>
    run(async (current, signal) => {
      if (!saved) throw new Error("Connect the private artwork library first.");
      const raw = await call("", undefined, "GET", signal);
      if (current())
        emit({
          connected: true,
          snapshot: check(raw),
          conflict: undefined,
          notice: "Private artwork refreshed.",
        });
    });
  return {
    snapshot: () => state,
    async setAccount(next: typeof account) {
      cancel();
      account = next;
      saved = undefined;
      emit({
        connected: false,
        snapshot: undefined,
        conflict: undefined,
        error: "",
        notice: "",
      });
    },
    restore: () =>
      run(async (current, signal) => {
        const config = await api("/config", "", "", undefined, "GET", signal);
        if (!current()) return;
        if (typeof config.enabled !== "boolean")
          throw new Error("Could not check cloud artwork availability.");
        emit({ enabled: config.enabled });
        if (!account) return;
        const restored = readArtworkAccess(
          await load(),
          origin,
          account.userId,
        );
        if (!current() || !restored) return;
        saved = restored;
        if (!config.enabled)
          throw new Error(
            "Cloud artwork is disabled on this service. Local PNG import and saved image links remain available.",
          );
        let result;
        if (restored.pending) {
          const pending = { identity: context(), proposal: restored };
          connecting = pending;
          try {
            const reply = await call(
              "/connect",
              restored.scope.kind === "personal"
                ? { scope: "personal", consent: true }
                : { scope: "group", groupId: restored.scope.id, consent: true },
              "POST",
              signal,
            );
            if (!current()) {
              await rollback(pending);
              return;
            }
            if (reply.grantToken !== restored.grantToken)
              throw Error("Artwork recovery returned another connection.");
            result = reply.snapshot;
            const snapshot = check(result);
            saved = { ...restored, scope: snapshot.scope };
            delete saved.pending;
            await save(saved);
            if (!current()) {
              await rollback(pending);
              return;
            }
          } finally {
            if (connecting === pending) connecting = undefined;
          }
        } else result = await call("", undefined, "GET", signal);
        if (current())
          emit({
            connected: true,
            snapshot: check(result),
            conflict: undefined,
            notice: "Private artwork connection restored.",
          });
      }),
    connect: (scope: string) =>
      run(async (current, signal) => {
        const identity = context();
        if (!state.enabled)
          throw new Error("Cloud artwork is disabled on this service.");
        const previous = readArtworkAccess(
          await load(),
          origin,
          identity.userId,
        );
        if (!current()) return;
        const same =
          previous?.pending &&
          previous.scope.kind ===
            (scope === "personal" ? "personal" : "group") &&
          previous.scope.id ===
            (scope === "personal" ? identity.userId : scope);
        if (previous?.pending && !same)
          await rollback({ identity, proposal: previous });
        if (!current()) return;
        const proposal: SavedArtworkAccess = same
          ? previous
          : {
              version: 1,
              origin,
              userId: identity.userId,
              grantToken: Array.from(
                crypto.getRandomValues(new Uint8Array(32)),
                (n) => n.toString(16).padStart(2, "0"),
              ).join(""),
              scope:
                scope === "personal"
                  ? {
                      kind: "personal",
                      id: identity.userId,
                      label: "Personal Roblox account",
                    }
                  : {
                      kind: "group",
                      id: scope,
                      label: "Roblox group " + scope,
                    },
              pending: true,
            };
        const pending = { identity, proposal };
        connecting = pending;
        try {
          await save(proposal);
          if (!current()) {
            await rollback(pending);
            return;
          }
          const result = await call(
            "/connect",
            scope === "personal"
              ? { scope: "personal", consent: true }
              : { scope: "group", groupId: scope, consent: true },
            "POST",
            signal,
            proposal.grantToken,
          );
          if (!current()) {
            await rollback(pending);
            return;
          }
          const snapshot = readArtworkSnapshot(result.snapshot);
          if (
            result.grantToken !== proposal.grantToken ||
            (scope === "personal"
              ? snapshot.scope.kind !== "personal" ||
                snapshot.scope.id !== identity.userId
              : snapshot.scope.kind !== "group" || snapshot.scope.id !== scope)
          )
            throw new Error("Invalid private artwork connection.");
          const next: SavedArtworkAccess = {
            version: 1,
            origin,
            userId: identity.userId,
            grantToken: result.grantToken,
            scope: snapshot.scope,
          };
          try {
            await save(next);
          } catch (e) {
            await rollback(pending);
            throw e;
          }
          if (!current()) {
            await rollback(pending);
            return;
          }
          saved = next;
          emit({
            connected: true,
            snapshot,
            conflict: undefined,
            notice:
              "Connected. Only PNGs you explicitly save will be uploaded.",
          });
        } finally {
          if (connecting === pending) connecting = undefined;
        }
      }),
    fetch: fetchLibrary,
    upload: (input: {
      name: string;
      folder: string | null;
      bytes: Uint8Array;
    }) =>
      run(async (current, signal) => {
        if (!saved || !state.connected || state.conflict)
          throw new Error(
            "Fetch and review this connected library before saving.",
          );
        const png = libraryPng(input.bytes);
        let binary = "";
        for (let offset = 0; offset < png.bytes.length; offset += 8192)
          binary += String.fromCharCode(
            ...png.bytes.subarray(offset, offset + 8192),
          );
        const result = await call(
          "/images",
          { name: input.name, folder: input.folder, png: btoa(binary) },
          "POST",
          signal,
        );
        if (current())
          emit({
            snapshot: check(result.snapshot),
            conflict: undefined,
            notice: result.reused
              ? "This identical PNG is already saved. Its existing name and folder were retained."
              : "PNG saved privately. Roblox publication still uses the normal upload workflow.",
          });
      }),
    edit: (action: string, fields: Record<string, unknown> = {}) =>
      run(async (current, signal) => {
        if (!saved || !state.snapshot || state.conflict)
          throw new Error(
            "Fetch and review the latest artwork version before editing.",
          );
        const result = await call(
          "/edit",
          { action, ...fields, expected: reviewVersion(state.snapshot) },
          "POST",
          signal,
        );
        if (!current()) return;
        if (result.conflict) {
          emit({
            conflict: check(result.snapshot),
            error:
              "The cloud library changed in another session. Fetch and review it before editing again.",
          });
          return;
        }
        if (result.deleted === true) {
          await save(null);
          if (!current()) return;
          saved = undefined;
          emit({
            connected: false,
            snapshot: undefined,
            conflict: undefined,
            notice: result.pendingCleanup
              ? "Cloud library access revoked. PNG deletion is awaiting storage cleanup; reconnect to retry when storage recovers."
              : "Cloud library deleted and every connection revoked. Imported/local copies remain.",
          });
        } else
          emit({
            snapshot: check(result.snapshot),
            conflict: undefined,
            notice: result.snapshot.usage.cleanup
              ? "Cloud metadata updated; deleted PNGs are awaiting storage cleanup."
              : "Private artwork updated.",
          });
      }),
    cleanup: () =>
      run(async (current, signal) => {
        const result = await call("/cleanup", {}, "POST", signal);
        if (current())
          emit({
            snapshot: check(result.snapshot),
            conflict: undefined,
            notice: result.snapshot.usage.cleanup
              ? "Storage cleanup is still pending. Retry later."
              : "Pending storage cleanup completed.",
          });
      }),
    async download(image: string) {
      let result: { item: ArtworkItem; bytes: Uint8Array } | undefined;
      await run(async (current, signal) => {
        const item = state.snapshot?.items.find((i) => i.id === image);
        if (!saved || !item || !artworkId(image))
          throw new Error("Fetch this image in the current library first.");
        const raw = await call("/images/" + image, undefined, "GET", signal);
        if (!current()) return;
        if (
          !(raw instanceof Uint8Array) ||
          raw.length !== item.bytes ||
          raw.length > L.pngBytes
        )
          throw new Error(
            "Cloud PNG dimensions/size changed. Fetch the library again.",
          );
        const png = libraryPng(raw),
          sha = await sha256Hex(raw);
        if (!current()) return;
        if (
          sha !== item.sha256 ||
          png.width !== item.width ||
          png.height !== item.height ||
          png.bytes.length !== raw.length
        )
          throw new Error("Cloud artwork failed integrity checks.");
        result = { item, bytes: png.bytes };
        emit({
          notice:
            "Validated private PNG ready. Imported copies remain local if cloud access ends.",
        });
      });
      return result;
    },
    revoke: () =>
      run(async (current, signal) => {
        if (saved) await call("/grant", undefined, "DELETE", signal);
        if (!current()) return;
        await save(null);
        if (!current()) return;
        saved = undefined;
        emit({
          connected: false,
          snapshot: undefined,
          conflict: undefined,
          notice:
            "This artwork connection was revoked. Cloud and imported copies remain.",
        });
      }),
    forget: () =>
      run(async (current) => {
        await save(null);
        if (!current()) return;
        saved = undefined;
        emit({
          connected: false,
          snapshot: undefined,
          conflict: undefined,
          notice:
            "This installation forgot its artwork access. Local copies remain; reconnect to manage cloud storage.",
        });
      }),
    cancel,
    dispose() {
      if (connecting) void rollback(connecting);
      disposed = true;
      sequence++;
      request?.abort();
    },
  };
}
