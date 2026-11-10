import type { CloudSettings } from "./cloud-storage";
import type { RobloxAccountState } from "./roblox-account-manager";

/** Validate the selected destination against the latest public grant, without falling
 * back to a retained API key or exposing a capability in persistent settings. */
export function robloxUploadSettings(
  settings: CloudSettings,
  state: RobloxAccountState,
  now = Date.now(),
): CloudSettings {
  if (settings.authMode !== "roblox")
    return {
      ...settings,
      accountToken: undefined,
      authorizationError: undefined,
    };
  const account = state.account;
  const authorizationError = state.simulation
    ? "The sign-in demo cannot upload images. Choose API key to test that separate method."
    : state.loading || state.busy
      ? "Wait for the Roblox connection check to finish before uploading."
      : !account || !state.accountToken
        ? "Sign in with Roblox in Images before uploading."
        : account.needsAuthorization || account.expiresAt <= now
          ? "Your Roblox authorization ended. Reconnect Roblox in Images before uploading."
          : settings.robloxOwner?.userId !== account.userId ||
              !account.owners.some(
                (o) =>
                  o.kind === settings.ownerType && o.id === settings.ownerId,
              )
            ? "Choose an approved Roblox creator in Images before uploading."
            : undefined;
  return {
    ...settings,
    accountToken: authorizationError ? undefined : state.accountToken,
    authorizationError,
  };
}
