import { ROBLOX_OAUTH_SCOPES } from "../../../packages/relay/src/oauth-protocol";
export const ROBLOX_ACCOUNT_STORAGE_KEY = "framebridge-roblox-account-v1";
const capability = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export type RobloxLoginStart = {
  loginToken: string;
  authorizationUrl: string;
  expiresAt: number;
  /** Public callback route, separate from the relay that holds capabilities. */
  callbackOrigin?: string;
};
export type SavedRobloxAccount = {
  origin: string;
  accountToken?: string;
  pending?: RobloxLoginStart & { previousToken?: string };
};
// This module also runs in Figma's sandbox, which does not supply browser URL APIs.
export function relayOrigin(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 256 &&
    (/^https:\/\/[a-z\d](?:[a-z\d.-]*[a-z\d])?(?::[1-9]\d{0,4})?$/i.test(
      value,
    ) ||
      /^http:\/\/localhost(?::[1-9]\d{0,4})?$/.test(value))
  );
}
export function robloxAuthorizationUrl(
  value: unknown,
  origin: string,
  callbackOrigin = origin,
): value is string {
  const prefix = "https://apis.roblox.com/oauth/v1/authorize?";
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !value.startsWith(prefix) ||
    /[\r\n#]/.test(value) ||
    !relayOrigin(origin) ||
    !relayOrigin(callbackOrigin)
  )
    return false;
  try {
    const parameters = new Map<string, string>();
    for (const field of value.slice(prefix.length).split("&")) {
      const split = field.indexOf("=");
      if (split < 1) return false;
      const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, " "));
      const key = decode(field.slice(0, split));
      if (parameters.has(key)) return false;
      parameters.set(key, decode(field.slice(split + 1)));
    }
    const scope = parameters.get("scope")?.split(" ") ?? [];
    return (
      /^\d{1,40}$/.test(parameters.get("client_id") ?? "") &&
      capability(parameters.get("state")) &&
      parameters.get("response_type") === "code" &&
      parameters.get("redirect_uri") ===
        callbackOrigin + "/oauth/roblox/callback" &&
      parameters.get("code_challenge_method") === "S256" &&
      /^[a-z\d_-]{43}$/i.test(parameters.get("code_challenge") ?? "") &&
      scope.length === ROBLOX_OAUTH_SCOPES.length &&
      ROBLOX_OAUTH_SCOPES.every((s) => scope.includes(s)) &&
      [...parameters.keys()].every((key) =>
        [
          "client_id",
          "state",
          "response_type",
          "redirect_uri",
          "code_challenge",
          "code_challenge_method",
          "scope",
        ].includes(key),
      )
    );
  } catch {
    return false;
  }
}
export function readRobloxLogin(
  value: unknown,
  origin: string,
  callbackOrigin = origin,
): RobloxLoginStart | undefined {
  const v = value as Partial<RobloxLoginStart> | null;
  if (
    !v ||
    !capability(v.loginToken) ||
    !robloxAuthorizationUrl(v.authorizationUrl, origin, callbackOrigin) ||
    (v.callbackOrigin !== undefined && v.callbackOrigin !== callbackOrigin) ||
    !Number.isSafeInteger(v.expiresAt) ||
    v.expiresAt! <= 0
  )
    return;
  return {
    loginToken: v.loginToken,
    authorizationUrl: v.authorizationUrl,
    expiresAt: v.expiresAt!,
    ...(callbackOrigin !== origin ? { callbackOrigin } : {}),
  };
}
export function readRobloxAccountSettings(
  value: unknown,
): SavedRobloxAccount | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as SavedRobloxAccount;
  if (!relayOrigin(v.origin)) return;
  const accountToken = capability(v.accountToken) ? v.accountToken : undefined;
  const login = readRobloxLogin(
    v.pending,
    v.origin,
    v.pending?.callbackOrigin ?? v.origin,
  );
  if (!accountToken && !login) return;
  return {
    origin: v.origin,
    ...(accountToken ? { accountToken } : {}),
    ...(login
      ? {
          pending: {
            ...login,
            ...(capability(v.pending?.previousToken)
              ? { previousToken: v.pending!.previousToken }
              : {}),
          },
        }
      : {}),
  };
}
export function createRobloxAccountStorage(storage: {
  getAsync(key: string): Promise<unknown>;
  setAsync(key: string, value: unknown): Promise<void>;
}) {
  let pending = Promise.resolve();
  return {
    async load() {
      await pending;
      return readRobloxAccountSettings(
        await storage.getAsync(ROBLOX_ACCOUNT_STORAGE_KEY),
      );
    },
    save(value: unknown) {
      const record = readRobloxAccountSettings(value) ?? null;
      const write = pending.then(() =>
        storage.setAsync(ROBLOX_ACCOUNT_STORAGE_KEY, record),
      );
      pending = write.catch(() => {});
      return write;
    },
    flush: () => pending,
  };
}
