import {
  readReviewSnapshot,
  reviewVersion,
  type ReviewSnapshot,
} from "../../../packages/core/src/review-cloud";
import {
  EMPTY_REVIEW_PREFERENCES,
  type ReviewPreferences,
} from "../../../packages/core/src/structure-review";
import {
  readSavedReviewSync,
  type SavedReviewSync,
} from "./review-sync-storage";
export type ReviewSyncState = {
  busy: boolean;
  connected: boolean;
  snapshot?: ReviewSnapshot;
  conflict?: ReviewSnapshot;
  error: string;
  notice: string;
};
export type ReviewSyncApi = (
  path: string,
  token: string,
  grant: string,
  body: unknown,
  method: string,
  signal: AbortSignal,
) => Promise<any>;
/** Network results are applied only to the current account/operation. Local is always retained until an explicit pull. */
export function createReviewSyncManager(
  origin: string,
  storage: {
    load(): Promise<unknown>;
    save(value: SavedReviewSync | null): Promise<void>;
  },
  api: ReviewSyncApi,
  local: {
    get(): ReviewPreferences;
    save(p: ReviewPreferences): Promise<boolean>;
  },
  changed: (state: ReviewSyncState) => void,
) {
  let state: ReviewSyncState = {
    busy: false,
    connected: false,
    error: "",
    notice: "",
  };
  let account: { userId: string; token: string } | undefined,
    saved: SavedReviewSync | undefined;
  let sequence = 0,
    disposed = false,
    request: AbortController | undefined;
  const emit = (patch: Partial<ReviewSyncState>) => {
    if (!disposed) {
      state = { ...state, ...patch };
      changed(state);
    }
  };
  const cancel = () => {
    sequence++;
    request?.abort();
    emit({
      busy: false,
      notice:
        "Cancelled. A sent cloud write may have completed; fetch before retrying.",
    });
  };
  const run = async (
    work: (current: () => boolean, signal: AbortSignal) => Promise<void>,
  ) => {
    if (state.busy || disposed) return;
    const at = ++sequence;
    request = new AbortController();
    const current = () => !disposed && sequence === at;
    emit({ busy: true, error: "", notice: "" });
    try {
      await work(current, request.signal);
    } catch (e) {
      if (current())
        emit({
          error:
            e instanceof Error ? e.message : "Preference sync failed. Retry.",
        });
    } finally {
      if (current()) emit({ busy: false });
    }
  };
  const context = () => {
    if (!account?.token)
      throw new Error("Sign in with Roblox to sync preferences.");
    return account;
  };
  const call = (
    path: string,
    body: unknown,
    method: string,
    signal: AbortSignal,
    grant = saved?.grantToken ?? "",
  ) => api(path, context().token, grant, body, method, signal);
  const check = (raw: unknown) => {
    const next = readReviewSnapshot(raw);
    if (
      saved &&
      (next.scope.kind !== saved.scope.kind || next.scope.id !== saved.scope.id)
    )
      throw new Error("Preference scope changed. Reconnect.");
    if (next.scope.kind === "personal" && next.scope.id !== context().userId)
      throw new Error("Personal preferences belong to another account.");
    return next;
  };
  const fetchRemote = () =>
    run(async (current, signal) => {
      if (!saved) throw new Error("Connect preference sync first.");
      const raw = await call("", undefined, "GET", signal);
      if (!current()) return;
      const snapshot = check(raw);
      emit({
        connected: true,
        snapshot,
        conflict: undefined,
        notice:
          "Cloud choices fetched. Local choices are unchanged until you use the cloud copy.",
      });
    });
  const publish = (overwrite = false, reset = false) =>
    run(async (current, signal) => {
      const snapshot = overwrite ? state.conflict : state.snapshot;
      if (!saved || !snapshot)
        throw new Error("Fetch the cloud version before publishing.");
      if (state.conflict && !overwrite)
        throw new Error("Resolve the cloud conflict before publishing.");
      const result = await call(
        "",
        {
          expected: reviewVersion(snapshot),
          preferences: reset
            ? { ...EMPTY_REVIEW_PREFERENCES, rules: [] }
            : local.get(),
        },
        "POST",
        signal,
      );
      if (!current()) return;
      if (result.conflict === true) {
        emit({
          conflict: check(result.snapshot),
          error:
            "Cloud choices changed in another session. Review the two copies before replacing either.",
        });
        return;
      }
      emit({
        snapshot: check(result.snapshot),
        conflict: undefined,
        notice: reset
          ? "Cloud choices reset. Local choices and peer installations are unchanged."
          : "Local choices published.",
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
        const identity = context();
        const raw = await storage.load();
        if (!current()) return;
        saved = readSavedReviewSync(raw, origin, identity.userId);
        if (!saved) return;
        const result = await call("", undefined, "GET", signal);
        if (current())
          emit({
            snapshot: check(result),
            connected: true,
            notice: "Preference sync restored. Local choices retained.",
          });
      }),
    connect: (scope: "personal" | string) =>
      run(async (current, signal) => {
        const identity = context();
        const result = await call(
          "/connect",
          scope === "personal"
            ? { scope: "personal", consent: true }
            : { scope: "group", groupId: scope, consent: true },
          "POST",
          signal,
          "",
        );
        if (!current()) return;
        const snapshot = readReviewSnapshot(result.snapshot);
        if (
          !/^[a-f0-9]{64}$/.test(result.grantToken) ||
          (scope === "personal"
            ? snapshot.scope.kind !== "personal" ||
              snapshot.scope.id !== identity.userId
            : snapshot.scope.kind !== "group" || snapshot.scope.id !== scope)
        )
          throw new Error("Invalid preference connection.");
        const next: SavedReviewSync = {
          version: 1,
          origin,
          userId: identity.userId,
          grantToken: result.grantToken,
          scope: snapshot.scope,
        };
        try {
          await storage.save(next);
        } catch (e) {
          await call(
            "/grant",
            undefined,
            "DELETE",
            signal,
            result.grantToken,
          ).catch(() => {});
          throw e;
        }
        if (!current()) return;
        saved = next;
        emit({
          connected: true,
          snapshot,
          conflict: undefined,
          notice: "Connected. Fetch/use or publish choices explicitly.",
        });
      }),
    fetch: fetchRemote,
    publish: () => publish(),
    overwrite: () => publish(true),
    resetCloud: () => publish(false, true),
    useCloud: () =>
      run(async (current) => {
        const snapshot = state.conflict ?? state.snapshot;
        if (!snapshot) throw new Error("Fetch choices first.");
        if (!(await local.save(snapshot.preferences)))
          throw new Error(
            "Could not save cloud choices locally. Retry local storage.",
          );
        if (current())
          emit({
            snapshot,
            conflict: undefined,
            notice:
              "Cloud choices saved locally. Review suggestions before applying them.",
          });
      }),
    revoke: () =>
      run(async (current, signal) => {
        if (saved) await call("/grant", undefined, "DELETE", signal);
        if (!current()) return;
        await storage.save(null);
        if (!current()) return;
        saved = undefined;
        emit({
          connected: false,
          snapshot: undefined,
          conflict: undefined,
          notice:
            "Sync access revoked for this connection. Cloud and local choices retained.",
        });
      }),
    forget: () =>
      run(async (current) => {
        await storage.save(null);
        if (!current()) return;
        saved = undefined;
        emit({
          connected: false,
          snapshot: undefined,
          conflict: undefined,
          notice:
            "This installation forgot sync access. Local choices retained; reconnect to manage cloud data.",
        });
      }),
    deleteCloud: () =>
      run(async (current, signal) => {
        const snapshot = state.snapshot;
        if (!saved || !snapshot || state.conflict)
          throw new Error("Fetch the latest cloud version before deleting.");
        const result = await call(
          "",
          { expected: reviewVersion(snapshot) },
          "DELETE",
          signal,
        );
        if (!current()) return;
        if (result.conflict) {
          emit({
            conflict: check(result.snapshot),
            error: "Cloud choices changed. Fetch and review before deleting.",
          });
          return;
        }
        if (result.deleted !== true)
          throw new Error("Cloud deletion could not be confirmed.");
        await storage.save(null);
        if (!current()) return;
        saved = undefined;
        emit({
          connected: false,
          snapshot: undefined,
          conflict: undefined,
          notice:
            "Cloud choices deleted and all access grants revoked. Local choices retained.",
        });
      }),
    cancel,
    dispose() {
      disposed = true;
      sequence++;
      request?.abort();
    },
  };
}
