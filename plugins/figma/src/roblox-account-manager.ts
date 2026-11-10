import {
  readRobloxAccountSettings,
  type SavedRobloxAccount,
} from "./roblox-account-storage";
import type { RobloxAccount, RobloxLoginStatus } from "./roblox-login-api";
import type { RobloxLoginStart } from "./roblox-account-storage";

export type RobloxAccountState = {
  available?: boolean;
  simulation?: boolean;
  callbackOrigin?: string;
  loading: boolean;
  busy: boolean;
  account?: RobloxAccount;
  accountToken?: string;
  pending?: { expiresAt: number };
  retry: boolean;
  error: string;
  notice: string;
};
export type RobloxAccountApi = {
  config(signal: AbortSignal): Promise<{
    available: boolean;
    simulation?: boolean;
    callbackOrigin?: string;
  }>;
  begin(
    beta: string,
    previous: string | undefined,
    signal: AbortSignal,
    callbackOrigin?: string,
  ): Promise<RobloxLoginStart>;
  poll(token: string, signal: AbortSignal): Promise<RobloxLoginStatus>;
  acknowledge(token: string, signal: AbortSignal): Promise<unknown>;
  cancel(token: string, signal: AbortSignal): Promise<unknown>;
  inspect(token: string, signal: AbortSignal): Promise<RobloxAccount>;
  disconnect(
    token: string,
    signal: AbortSignal,
  ): Promise<{ disconnected: boolean; revoked: boolean }>;
};
const unauthorized = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "status" in error &&
  error.status === 401;

/** Save before opening the browser, and save the account before acknowledging the login.
 * A pending replacement retains its previous capability until that acknowledgement succeeds.
 * Provider credentials never enter this manager or Figma storage.
 */
export function createRobloxAccountManager(
  origin: string,
  storage: {
    load(): Promise<unknown>;
    save(value: SavedRobloxAccount | null): Promise<void>;
  },
  api: RobloxAccountApi,
  openAuthorization: (url: string) => Promise<void>,
  changed: (state: RobloxAccountState) => void,
  now = Date.now,
) {
  let saved: SavedRobloxAccount | undefined;
  let state: RobloxAccountState = {
    loading: true,
    busy: false,
    retry: false,
    error: "",
    notice: "",
  };
  let version = 0,
    disposed = false;
  let queue = Promise.resolve();
  let request: AbortController | undefined;
  let retryAction: (() => Promise<void>) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const publish = (patch: Partial<RobloxAccountState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    if ("account" in patch) watchExpiry();
    changed(state);
  };
  // A child countdown cannot update upload authorization in its parent. Expire the
  // public account locally without polling or discarding a recoverable capability.
  const watchExpiry = () => {
    clearTimeout(expiryTimer);
    const account = state.account;
    if (!account || account.needsAuthorization || disposed) return;
    const remaining = account.expiresAt - now();
    if (remaining <= 0) {
      state = { ...state, account: { ...account, needsAuthorization: true } };
      return;
    }
    expiryTimer = setTimeout(
      () => {
        if (disposed || state.account !== account) return;
        watchExpiry();
        changed(state);
      },
      Math.min(remaining, 2147483647),
    );
  };
  const current = (at: number) => !disposed && at === version;
  const stop = () => {
    clearTimeout(timer);
    request?.abort();
  };
  const write = async (next: SavedRobloxAccount | undefined, at: number) => {
    if (!current(at)) return false;
    await storage.save(next ?? null);
    // An in-flight write may finish after closing. The next window recovers that record.
    saved = next;
    return current(at);
  };
  const connected = (account: RobloxAccount, token: string) =>
    publish({ account, accountToken: token });
  const inspect = async (at: number, signal: AbortSignal) => {
    const token = saved?.accountToken;
    if (!token) {
      publish({ account: undefined, accountToken: undefined });
      return;
    }
    try {
      const account = await api.inspect(token, signal);
      if (current(at)) connected(account, token);
    } catch (error) {
      if (!current(at)) return;
      if (!unauthorized(error)) throw error;
      if (
        !(await write(
          saved?.pending ? { origin, pending: saved.pending } : undefined,
          at,
        ))
      )
        return;
      publish({
        account: undefined,
        accountToken: undefined,
        error: "Your Roblox connection ended. Sign in again.",
      });
    }
  };
  const finish = async (
    account: RobloxAccount,
    token: string,
    at: number,
    signal: AbortSignal,
  ) => {
    if (!current(at)) return;
    // The token was already persisted before acknowledgement. If clearing the pending
    // record fails, expose the verified new account rather than the now-revoked old one.
    connected(account, token);
    if (!(await write({ origin, accountToken: token }, at))) return;
    publish({
      pending: undefined,
      retry: false,
      error: "",
      notice: "Roblox connected. Choose who owns your images.",
    });
  };
  const schedule = (at: number, ms: number) => {
    if (!current(at) || !saved?.pending) return;
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        const work = queue.then(async () => {
          if (!current(at)) return;
          request = new AbortController();
          try {
            await poll(at, request.signal);
          } catch {
            if (current(at)) {
              retryAction = () => run(recover, true);
              publish({
                retry: true,
                error:
                  "Sign-in is saved, but could not be checked. Retry when the service is available.",
              });
              if (saved?.pending && saved.pending.expiresAt > now())
                schedule(at, 10000);
            }
          }
        });
        queue = work.catch(() => {});
      },
      Math.max(2000, Math.min(10000, ms)),
    );
  };
  const abandon = async (at: number, signal: AbortSignal, message: string) => {
    const pending = saved?.pending;
    if (!pending) return;
    const nextToken = saved?.accountToken;
    try {
      await api.cancel(pending.loginToken, signal);
    } catch (error) {
      if (!unauthorized(error)) throw error;
      // A lost acknowledgement response looks like a missing login. Prove the saved
      // replacement still exists before accepting it; otherwise restore the old account.
      if (nextToken && nextToken !== pending.previousToken) {
        try {
          const account = await api.inspect(nextToken, signal);
          if (current(at)) await finish(account, nextToken, at, signal);
          return;
        } catch (check) {
          if (!unauthorized(check)) throw check;
        }
      }
    }
    if (!current(at)) return;
    if (
      !(await write(
        pending.previousToken
          ? { origin, accountToken: pending.previousToken }
          : undefined,
        at,
      ))
    )
      return;
    publish({
      pending: undefined,
      account: undefined,
      accountToken: undefined,
      retry: false,
      error: message,
    });
    await inspect(at, signal);
  };
  const poll = async (at: number, signal: AbortSignal) => {
    const pending = saved?.pending;
    if (!pending || !current(at)) return;
    if (pending.expiresAt <= now()) {
      await abandon(
        at,
        signal,
        "The sign-in link expired. Start sign-in again.",
      );
      return;
    }
    let status: RobloxLoginStatus;
    try {
      status = await api.poll(pending.loginToken, signal);
    } catch (error) {
      if (!current(at)) return;
      if (unauthorized(error)) {
        await abandon(at, signal, "The sign-in attempt ended. Start again.");
        return;
      }
      throw error;
    }
    if (!current(at)) return;
    if (status.status === "failed") {
      await abandon(at, signal, status.error);
      return;
    }
    if (status.status === "pending") {
      publish({
        pending: { expiresAt: Math.min(pending.expiresAt, status.expiresAt) },
        retry: false,
        error: "",
      });
      schedule(at, status.pollAfterMs);
      return;
    }
    if (
      !(await write({ origin, accountToken: status.accountToken, pending }, at))
    )
      return;
    try {
      await api.acknowledge(pending.loginToken, signal);
    } catch (error) {
      if (!current(at)) return;
      if (!unauthorized(error)) throw error;
      // Idempotent client recovery when the acknowledgement completed in another window.
      const account = await api.inspect(status.accountToken, signal);
      if (current(at)) await finish(account, status.accountToken, at, signal);
      return;
    }
    if (current(at))
      await finish(status.account, status.accountToken, at, signal);
  };
  const run = (
    action: (at: number, signal: AbortSignal) => Promise<void>,
    loading = false,
  ) => {
    if (disposed) return Promise.resolve();
    const at = ++version;
    retryAction = () => run(action, loading);
    stop();
    const work = queue.then(async () => {
      if (!current(at)) return;
      request = new AbortController();
      publish({ loading, busy: !loading, retry: false, error: "", notice: "" });
      try {
        await action(at, request.signal);
      } catch {
        if (current(at)) {
          const remembered = !!(saved?.accountToken || saved?.pending);
          publish({
            retry: true,
            error: loading
              ? remembered
                ? "Could not restore Roblox sign-in. Your saved connection has been kept. Retry when the service is available."
                : "Could not check Roblox sign-in. Retry when the service is available, or use an API key."
              : remembered
                ? "Could not complete that account action. Your saved sign-in has been kept; retry to recover it."
                : "Could not complete that account action. Retry when the service is available, or use an API key.",
          });
        }
      } finally {
        if (current(at)) publish({ loading: false, busy: false });
      }
    });
    queue = work.catch(() => {});
    return work;
  };
  const recover = async (at: number, signal: AbortSignal) => {
    const record = readRobloxAccountSettings(await storage.load());
    if (!current(at)) return;
    saved = record?.origin === origin ? record : undefined;
    publish({
      account: undefined,
      accountToken: undefined,
      pending: saved?.pending
        ? { expiresAt: saved.pending.expiresAt }
        : undefined,
    });
    try {
      const config = await api.config(signal);
      if (current(at))
        publish({
          available: config.available,
          simulation: config.simulation === true,
          callbackOrigin: config.callbackOrigin ?? origin,
        });
    } catch (error) {
      // The local API-key relay intentionally has no OAuth endpoints.
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 404
      )
        publish({
          available: false,
          simulation: false,
          callbackOrigin: origin,
        });
      else throw error;
    }
    if (!current(at)) return;
    // Only the previous connection is exposed while a replacement is unacknowledged.
    if (
      saved?.pending &&
      saved.accountToken &&
      saved.accountToken !== saved.pending.previousToken
    )
      await poll(at, signal);
    else {
      await inspect(at, signal);
      if (current(at) && saved?.pending) await poll(at, signal);
    }
  };
  const reopen = async (at: number, signal: AbortSignal) => {
    if (!saved?.pending || !current(at)) return;
    if (saved.pending.expiresAt <= now()) {
      await poll(at, signal);
      return;
    }
    await openAuthorization(saved.pending.authorizationUrl);
    schedule(at, 2000);
  };
  return {
    snapshot: () => state,
    restore: () => run(recover, true),
    retry: () => (retryAction ? retryAction() : run(recover, true)),
    recheck: () =>
      run(async (at, signal) => {
        await inspect(at, signal);
        if (current(at) && saved?.pending) await poll(at, signal);
      }),
    start(beta: string) {
      return run(async (at, signal) => {
        if (saved?.pending) {
          publish({ pending: { expiresAt: saved.pending.expiresAt } });
          await poll(at, signal);
          return;
        }
        const config = await api.config(signal);
        if (!current(at)) return;
        publish({
          available: config.available,
          simulation: config.simulation === true,
          callbackOrigin: config.callbackOrigin ?? origin,
        });
        if (!config.available) {
          publish({
            error:
              "Roblox sign-in is not configured on this service. Use an API key.",
          });
          return;
        }
        // An expired/pruned old capability must not prevent a fresh sign-in. Keep it
        // until the service proves it ended; transient failures preserve replacement safety.
        if (saved?.accountToken) await inspect(at, signal);
        if (!current(at)) return;
        const login = await api.begin(
          beta,
          saved?.accountToken,
          signal,
          config.callbackOrigin ?? origin,
        );
        if (!current(at)) {
          await api
            .cancel(login.loginToken, new AbortController().signal)
            .catch(() => {});
          return;
        }
        try {
          if (
            !(await write(
              {
                origin,
                accountToken: saved?.accountToken,
                pending: { ...login, previousToken: saved?.accountToken },
              },
              at,
            ))
          )
            return;
        } catch (error) {
          await api.cancel(login.loginToken, signal).catch(() => {});
          throw error;
        }
        publish({ pending: { expiresAt: login.expiresAt }, error: "" });
        // If opening fails, Retry must reopen this saved link rather than silently
        // polling an approval page the user never saw.
        retryAction = () => run(reopen);
        await openAuthorization(login.authorizationUrl);
        schedule(at, 2000);
      });
    },
    reopen: () => run(reopen),
    cancel: () =>
      run(async (at, signal) => {
        await abandon(at, signal, "");
      }),
    disconnect: () =>
      run(async (at, signal) => {
        const tokens = [
          ...new Set(
            [saved?.accountToken, saved?.pending?.previousToken].filter(
              (v): v is string => !!v,
            ),
          ),
        ];
        let revoked = true;
        if (saved?.pending) {
          try {
            await api.cancel(saved.pending.loginToken, signal);
          } catch (error) {
            if (!unauthorized(error)) throw error;
          }
        }
        for (const token of tokens) {
          try {
            const result = await api.disconnect(token, signal);
            revoked &&= result.revoked;
          } catch (error) {
            if (!unauthorized(error)) throw error;
          }
          if (!current(at)) return;
        }
        if (!(await write(undefined, at))) return;
        publish({
          account: undefined,
          accountToken: undefined,
          pending: undefined,
          retry: false,
          error: "",
          notice: revoked
            ? "Roblox disconnected."
            : "Disconnected from Framebridge. Roblox could not confirm revocation; remove Framebridge in your Roblox connected apps.",
        });
      }),
    dispose() {
      disposed = true;
      ++version;
      stop();
      clearTimeout(expiryTimer);
    },
  };
}
