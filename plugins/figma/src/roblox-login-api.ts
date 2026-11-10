import { RELAY_URL, relayRequest } from "./transfer";
import {
  readProviderRefreshDiagnostics,
  type ProviderRefreshDiagnostics,
} from "../../../packages/core/src/provider-refresh";
import {
  readRobloxLogin,
  relayOrigin,
  type RobloxLoginStart,
} from "./roblox-account-storage";
export type RobloxAccount = Partial<ProviderRefreshDiagnostics> & {
  userId: string;
  username: string;
  displayName: string;
  owners: { kind: "user" | "group"; id: string; label: string }[];
  expiresAt: number;
  needsAuthorization: boolean;
};
export type RobloxLoginStatus =
  | { status: "pending"; expiresAt: number; pollAfterMs: number }
  | { status: "failed"; error: string }
  | { status: "ready"; accountToken: string; account: RobloxAccount };
function account(value: unknown): RobloxAccount {
  const v = value as RobloxAccount;
  const id = (s: unknown) => typeof s === "string" && /^[1-9]\d{0,19}$/.test(s);
  const name = (s: unknown) =>
    typeof s === "string" && s.length > 0 && s.length <= 100;
  if (
    !v ||
    !id(v.userId) ||
    !name(v.username) ||
    !name(v.displayName) ||
    !Number.isSafeInteger(v.expiresAt) ||
    v.expiresAt <= 0 ||
    typeof v.needsAuthorization !== "boolean" ||
    !Array.isArray(v.owners) ||
    !v.owners.length ||
    v.owners.length > 200 ||
    v.owners.some(
      (o) =>
        !o ||
        !["user", "group"].includes(o.kind) ||
        !id(o.id) ||
        !name(o.label),
    ) ||
    v.owners.some((o) => o.kind === "user" && o.id !== v.userId) ||
    new Set(v.owners.map((o) => `${o.kind}:${o.id}`)).size !== v.owners.length
  )
    throw new Error(
      "The sign-in service returned an invalid account. Sign in again.",
    );
  return {
    userId: v.userId,
    username: v.username,
    displayName: v.displayName,
    owners: v.owners.map((o) => ({ kind: o.kind, id: o.id, label: o.label })),
    expiresAt: v.expiresAt,
    needsAuthorization: v.needsAuthorization,
    ...readProviderRefreshDiagnostics(v),
  };
}
export async function robloxLoginConfig(signal?: AbortSignal) {
  const value = await relayRequest<{
    available: boolean;
    simulation?: boolean;
    callbackOrigin?: string;
  }>("/v1/roblox/config", "", undefined, signal);
  if (
    typeof value.available !== "boolean" ||
    (value.simulation !== undefined && typeof value.simulation !== "boolean") ||
    (value.callbackOrigin !== undefined && !relayOrigin(value.callbackOrigin))
  )
    throw new Error("Roblox sign-in availability could not be checked.");
  return {
    available: value.available,
    simulation: value.simulation === true,
    ...(value.callbackOrigin ? { callbackOrigin: value.callbackOrigin } : {}),
  };
}
export async function beginRobloxLogin(
  betaAccess: string,
  previousToken?: string,
  signal?: AbortSignal,
  callbackOrigin = RELAY_URL,
): Promise<RobloxLoginStart> {
  const value = await relayRequest(
    "/v1/roblox/login",
    "",
    {},
    signal,
    undefined,
    undefined,
    betaAccess,
    previousToken,
  );
  const login = readRobloxLogin(value, RELAY_URL, callbackOrigin);
  if (!login)
    throw new Error(
      "The service returned an invalid Roblox authorization link.",
    );
  return login;
}
export async function pollRobloxLogin(
  token: string,
  signal?: AbortSignal,
): Promise<RobloxLoginStatus> {
  const value = await relayRequest<RobloxLoginStatus>(
    "/v1/roblox/login",
    token,
    undefined,
    signal,
  );
  if (value.status === "ready" && /^[a-f0-9]{64}$/.test(value.accountToken))
    return {
      status: "ready",
      accountToken: value.accountToken,
      account: account(value.account),
    };
  if (
    value.status === "pending" &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > 0
  )
    return {
      status: "pending",
      expiresAt: value.expiresAt,
      pollAfterMs: Math.max(
        2000,
        Math.min(10000, Number(value.pollAfterMs) || 2000),
      ),
    };
  if (
    value.status === "failed" &&
    typeof value.error === "string" &&
    value.error.length <= 1000
  )
    return { status: "failed", error: value.error };
  throw new Error(
    "The service returned an invalid sign-in result. Start again.",
  );
}
export const acknowledgeRobloxLogin = (token: string, signal?: AbortSignal) =>
  relayRequest("/v1/roblox/login/complete", token, {}, signal);
export const cancelRobloxLogin = (token: string, signal?: AbortSignal) =>
  relayRequest(
    "/v1/roblox/login",
    token,
    undefined,
    signal,
    undefined,
    "DELETE",
  );
export async function inspectRobloxAccount(
  token: string,
  signal?: AbortSignal,
) {
  return account(
    await relayRequest("/v1/roblox/account", token, undefined, signal),
  );
}
export async function disconnectRobloxAccount(
  token: string,
  signal?: AbortSignal,
) {
  const value = await relayRequest<{ disconnected: boolean; revoked: boolean }>(
    "/v1/roblox/account",
    token,
    undefined,
    signal,
    undefined,
    "DELETE",
  );
  if (value.disconnected !== true || typeof value.revoked !== "boolean")
    throw new Error("Could not confirm the Roblox disconnect. Try again.");
  return value;
}
