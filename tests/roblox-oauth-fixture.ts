import { createHash } from "node:crypto";
import {
  RobloxOAuth,
  type OAuthStore,
  type OAuthAccount,
  type OAuthLogin,
} from "../packages/relay/src/roblox-oauth";
import { PublicError } from "../packages/relay/src/roblox";

export const oauthHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const oauthConfig = {
  clientId: "123456789012345",
  clientSecret: "local-test-client-secret",
  redirectUri: "https://relay.test/oauth/roblox/callback",
  sealingKey: "a".repeat(64),
};
export const oauthProfile = {
  sub: "123",
  preferred_username: "TestCreator",
  name: "Test Creator",
};
export const oauthResources = {
  resource_infos: [
    {
      owner: { id: "123", type: "User" },
      resources: { creator: { ids: ["U", "G456"] } },
    },
  ],
};
export const tokenResponse = (number = 1) => ({
  access_token: "local-access-token-" + number,
  refresh_token: "local-refresh-token-" + number,
  expires_in: 900,
  token_type: "Bearer",
  // Captured shape from a real personal/group grant (no provider tokens).
  scope: "asset:read,write openid profile",
});
export function memoryOAuth() {
  const logins = new Map<string, OAuthLogin>(),
    accounts = new Map<string, OAuthAccount>();
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const store: OAuthStore = {
    login: (id) => (logins.has(id) ? copy(logins.get(id)!) : undefined),
    loginState: (state) => [...logins.values()].find((v) => v.state === state),
    saveLogin: (value) => {
      logins.set(value.id, copy(value));
    },
    removeLogin: (id) => {
      logins.delete(id);
    },
    account: (id) => (accounts.has(id) ? copy(accounts.get(id)!) : undefined),
    saveAccount: (value) => {
      accounts.set(value.id, copy(value));
    },
    removeAccount: (id) => {
      accounts.delete(id);
      for (const login of logins.values())
        if (login.account === id) logins.delete(login.id);
    },
    count: (invite, kind) =>
      [...(kind === "login" ? logins : accounts).values()].filter(
        (v) => invite === "*" || v.invite === invite,
      ).length,
    prune(now, active) {
      for (const login of logins.values())
        if (login.expires <= now || !active(login.invite)) {
          const account = login.account && accounts.get(login.account);
          if (account && account.pendingLogin === login.id)
            accounts.delete(account.id);
          logins.delete(login.id);
        }
      for (const account of accounts.values())
        if (account.expires <= now || !active(account.invite))
          accounts.delete(account.id);
    },
    nextExpiry: () => {
      const values = [...logins.values(), ...accounts.values()].map(
        (v) => v.expires,
      );
      return values.length ? Math.min(...values) : undefined;
    },
  };
  return { store, logins, accounts };
}
export function oauthFixture() {
  const data = memoryOAuth(),
    active = new Set(["invite", "other"]),
    counts = new Map<string, number>();
  let time = 1000000,
    number = 0;
  const calls: { path: string; headers: Headers; body: URLSearchParams }[] = [];
  const provider = async (
    path: string,
    _init: RequestInit,
    _body: URLSearchParams,
  ): Promise<Response> => {
    if (path === "token") return Response.json(tokenResponse(++number));
    if (path === "userinfo") return Response.json(oauthProfile);
    if (path === "token/resources") return Response.json(oauthResources);
    if (path === "token/revoke") return new Response(null, { status: 200 });
    throw new Error("Unexpected provider path");
  };
  const remote = { run: provider };
  const request = (async (
    url: string | URL | Request,
    init: RequestInit = {},
  ) => {
    const path = String(url).replace("https://apis.roblox.com/oauth/v1/", ""),
      body = new URLSearchParams(String(init.body ?? ""));
    calls.push({ path, body, headers: new Headers(init.headers) });
    return remote.run(path, init, body);
  }) as typeof fetch;
  const count = (scope: string, max: number) => {
    const n = (counts.get(scope) ?? 0) + 1;
    counts.set(scope, n);
    if (n > max) throw new PublicError("Quota exceeded", 429);
  };
  const deps = {
    active: (invite: string) => active.has(invite),
    count,
    request,
    now: () => time,
    sleep: async (_ms: number, _signal: AbortSignal) => {},
  };
  const service = new RobloxOAuth(data.store, oauthConfig, deps);
  const callback = (
    login: { authorizationUrl: string },
    code = "local-auth-code",
  ) => {
    const url = new URL(oauthConfig.redirectUri);
    url.searchParams.set(
      "state",
      new URL(login.authorizationUrl).searchParams.get("state")!,
    );
    url.searchParams.set("code", code);
    return url;
  };
  const connect = async (previous?: string) => {
    const login = await service.begin("invite", previous);
    if (!(await service.callback(callback(login))))
      throw new Error("Fixture authorization failed");
    const ready = service.poll(login.loginToken) as {
      accountToken: string;
      account: ReturnType<RobloxOAuth["status"]>;
    };
    await service.acknowledge(login.loginToken);
    return { ...ready, login };
  };
  return {
    ...data,
    service,
    active,
    deps,
    calls,
    remote,
    provider,
    callback,
    connect,
    counts,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
