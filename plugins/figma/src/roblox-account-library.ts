import type { RobloxAccountState } from "./roblox-account-manager";
import type { useRobloxAccount as connectedAccount } from "./useRobloxAccount";
const state: RobloxAccountState = {
  available: false,
  loading: false,
  busy: false,
  retry: false,
  error: "",
  notice: "",
};
const unavailable = async () => {
  throw new Error("Roblox sign-in requires the hosted Framebridge build.");
};
/** Offline account-library exports omit authorization, storage and browser-opening code. */
export function useRobloxAccount(
  _enabled: boolean,
): ReturnType<typeof connectedAccount> {
  return {
    state,
    manager: {
      snapshot: () => state,
      restore: unavailable,
      retry: unavailable,
      recheck: unavailable,
      start: unavailable,
      reopen: unavailable,
      cancel: unavailable,
      disconnect: unavailable,
      dispose() {},
    },
  };
}
