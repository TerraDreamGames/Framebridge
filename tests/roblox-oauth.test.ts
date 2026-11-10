import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  RobloxOAuth,
  grantedCreators,
} from "../packages/relay/src/roblox-oauth";
import {
  createImageOperation,
  readImageOperation,
} from "../packages/relay/src/roblox";
import {
  oauthFixture,
  oauthConfig,
  oauthHash,
  oauthProfile,
  oauthResources,
  tokenResponse,
} from "./roblox-oauth-fixture";

describe("private Roblox authorization lifecycle", () => {
  it.each([
    ["openid profile asset:read asset:write", true],
    ["asset:read,write openid profile", true],
    ["openid asset:write,read profile", true],
    ["openid profile asset:read", false],
    ["openid profile asset:read,read", false],
    ["openid profile asset:read,writeX", false],
    ["openid profile asset:read,*", false],
    ["openid asset:read,write,profile", false],
    ["openid profile other:read,write", false],
  ])(
    "checks complete permissions in provider scope %s",
    async (scope, accepted) => {
      const f = oauthFixture(),
        provider = f.remote.run;
      f.remote.run = (path, init, body) =>
        path === "token"
          ? Promise.resolve(Response.json({ ...tokenResponse(), scope }))
          : provider(path, init, body);
      const login = await f.service.begin("invite");
      expect(await f.service.callback(f.callback(login))).toBe(accepted);
      expect(f.accounts.size).toBe(accepted ? 1 : 0);
      if (!accepted)
        expect(f.calls.some((call) => call.path === "token/revoke")).toBe(true);
    },
  );
  it.each(["bearer", "BEARER", "bEaReR"])(
    "accepts case-insensitive Bearer token types per OAuth: %s",
    async (tokenType) => {
      const f = oauthFixture(),
        provider = f.remote.run;
      f.remote.run = (path, init, body) =>
        path === "token"
          ? Promise.resolve(
              Response.json({ ...tokenResponse(), token_type: tokenType }),
            )
          : provider(path, init, body);
      const login = await f.service.begin("invite");
      expect(await f.service.callback(f.callback(login))).toBe(true);
      expect(f.service.poll(login.loginToken)).toMatchObject({
        status: "ready",
        account: { userId: "123" },
      });
    },
  );
  it.each(["MAC", " Bearer", undefined])(
    "rejects unsupported or malformed token types: %s",
    async (tokenType) => {
      const f = oauthFixture(),
        provider = f.remote.run;
      f.remote.run = (path, init, body) =>
        path === "token"
          ? Promise.resolve(
              Response.json({ ...tokenResponse(), token_type: tokenType }),
            )
          : provider(path, init, body);
      const login = await f.service.begin("invite");
      expect(await f.service.callback(f.callback(login))).toBe(false);
      expect(f.accounts.size).toBe(0);
      expect(f.calls.some((call) => call.path === "token/revoke")).toBe(true);
    },
  );
  it("uses a hashed one-use state, encrypted PKCE verifier and provider credentials", async () => {
    const f = oauthFixture(),
      login = await f.service.begin("invite"),
      url = new URL(login.authorizationUrl);
    expect(url.origin + url.pathname).toBe(
      "https://apis.roblox.com/oauth/v1/authorize",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_secret")).toBeNull();
    const row = f.logins.get(oauthHash(login.loginToken))!;
    expect(row.state).toBe(oauthHash(url.searchParams.get("state")!));
    expect(JSON.stringify(row)).not.toContain(login.loginToken);
    expect(f.service.poll(login.loginToken)).toMatchObject({
      status: "pending",
      pollAfterMs: 2000,
    });
    expect(await f.service.callback(f.callback(login))).toBe(true);
    const exchange = f.calls.find((c) => c.path === "token")!;
    expect(exchange.body.get("client_secret")).toBe(oauthConfig.clientSecret);
    expect(
      createHash("sha256")
        .update(exchange.body.get("code_verifier")!)
        .digest("base64url"),
    ).toBe(url.searchParams.get("code_challenge"));
    const ready = f.service.poll(login.loginToken) as any;
    expect(ready.account.owners).toEqual([
      { kind: "user", id: "123", label: "TestCreator" },
      { kind: "group", id: "456", label: "Group 456" },
    ]);
    const records = JSON.stringify([
      ...f.logins.values(),
      ...f.accounts.values(),
    ]);
    for (const value of [
      "local-access-token-1",
      "local-refresh-token-1",
      ready.accountToken,
      exchange.body.get("code_verifier")!,
    ])
      expect(records).not.toContain(value);
    expect(JSON.stringify(ready)).not.toContain("local-access");
    await expect(f.service.callback(f.callback(login))).rejects.toMatchObject({
      status: 401,
    });
    expect(f.calls.filter((c) => c.path === "token")).toHaveLength(1);
    await f.service.acknowledge(login.loginToken);
    expect(f.logins.size).toBe(0);
    expect(f.service.status(ready.accountToken)).toMatchObject({
      userId: "123",
      needsAuthorization: false,
    });
  });
  it.each([
    { redirectUri: "http://remote.test/oauth/roblox/callback" },
    { redirectUri: "https://relay.test/other" },
    { redirectUri: "https://relay.test/oauth/roblox/callback?code=x" },
    { sealingKey: "missing" },
    { clientId: "bad" },
    { clientSecret: "short" },
  ])(
    "fails closed when backend OAuth configuration is invalid: %j",
    async (patch) => {
      const f = oauthFixture(),
        service = new RobloxOAuth(
          f.store,
          { ...oauthConfig, ...patch },
          f.deps,
        );
      expect(service.available()).toBe(false);
      await expect(service.begin("invite")).rejects.toMatchObject({
        status: 503,
      });
      expect(f.calls).toHaveLength(0);
    },
  );
  it("ignores unapproved or ambiguously owned creator grants", () => {
    const value = {
      resource_infos: [
        {
          owner: { type: "User", id: "123" },
          resources: { creator: { ids: ["456"] } },
        },
        {
          owner: { type: "User", id: "999" },
          resources: { creator: { ids: ["U", "G456"] } },
        },
        {
          owner: { type: "Group", id: "456" },
          resources: { creator: { ids: ["999"] } },
        },
      ],
    };
    expect(grantedCreators(value, "123", "Test")).toEqual([]);
    expect(grantedCreators(null, "123", "Test")).toEqual([]);
  });
  it("reads actual G-prefixed group grants only from the authenticated resource owner", () => {
    expect(
      grantedCreators(
        {
          resource_infos: [
            {
              owner: { type: "User", id: "123" },
              resources: {
                creator: {
                  ids: [
                    "U",
                    "G456",
                    "G456",
                    "456",
                    "G0",
                    "G001",
                    "G-7",
                    "G7x",
                    "G" + "1".repeat(21),
                    null,
                  ],
                },
              },
            },
          ],
        },
        "123",
        "Test",
      ),
    ).toEqual([
      { kind: "user", id: "123", label: "Test" },
      { kind: "group", id: "456", label: "Group 456" },
    ]);
  });
  it("binds uploads to the private invitation and approved creator", async () => {
    const f = oauthFixture(),
      ready = await f.connect();
    await expect(
      f.service.credential(ready.accountToken, "other", {
        kind: "user",
        id: "123",
      }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      f.service.credential(ready.accountToken, "invite", {
        kind: "group",
        id: "999",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await f.service.credential(ready.accountToken, "invite", {
        kind: "group",
        id: "456",
      }),
    ).toMatchObject({
      token: "local-access-token-1",
      identity: "oauth:" + oauthHash(ready.accountToken),
    });
    f.active.delete("invite");
    await expect(
      f.service.credential(ready.accountToken, "invite"),
    ).rejects.toMatchObject({ status: 401 });
    f.service.prune();
    expect(f.accounts.size).toBe(0);
  });
  it("keeps the previous connection until the replacement is acknowledged", async () => {
    const f = oauthFixture(),
      old = await f.connect(),
      login = await f.service.begin("invite", old.accountToken);
    await f.service.callback(f.callback(login));
    const next = f.service.poll(login.loginToken) as any;
    expect(f.service.status(old.accountToken).userId).toBe("123");
    await f.service.acknowledge(login.loginToken);
    expect(() => f.service.status(old.accountToken)).toThrow(
      "connection ended",
    );
    expect(f.service.status(next.accountToken).userId).toBe("123");
    expect(f.accounts.size).toBe(1);
    expect(
      f.calls
        .filter((c) => c.path === "token/revoke")
        .map((c) => c.body.get("token")),
    ).toEqual(["local-refresh-token-1"]);
  });
  it("cancels a ready replacement without losing the previous connection", async () => {
    const f = oauthFixture(),
      old = await f.connect(),
      login = await f.service.begin("invite", old.accountToken);
    await f.service.callback(f.callback(login));
    const next = f.service.poll(login.loginToken) as any;
    await f.service.cancel(login.loginToken);
    expect(f.accounts.size).toBe(1);
    expect(f.service.status(old.accountToken).userId).toBe("123");
    expect(() => f.service.status(next.accountToken)).toThrow();
    expect(f.calls.at(-1)?.body.get("token")).toBe("local-refresh-token-2");
  });
  it.each([
    "disconnect",
    "replacement",
    "unacknowledged cancellation",
  ] as const)(
    "runs optional local cleanup after forgetting the account and before provider I/O for %s",
    async (kind) => {
      const f = oauthFixture(),
        old = await f.connect();
      const order: string[] = [],
        removed: string[] = [];
      let finishRevoke!: (response: Response) => void;
      f.remote.run = async (path, init, body) => {
        if (path === "token/revoke") {
          order.push("provider");
          return new Promise<Response>((resolve) => {
            finishRevoke = resolve;
          });
        }
        return f.provider(path, init, body);
      };
      const service = new RobloxOAuth(f.store, oauthConfig, {
        ...f.deps,
        accountRemoved: (id) => {
          expect(f.store.account(id)).toBeUndefined();
          expect(f.calls.some((call) => call.path === "token/revoke")).toBe(
            false,
          );
          order.push("local");
          removed.push(id);
        },
      });
      let expected = oauthHash(old.accountToken);
      let removal: Promise<unknown>;
      if (kind === "disconnect") removal = service.disconnect(old.accountToken);
      else {
        const login = await service.begin("invite", old.accountToken);
        expect(await service.callback(f.callback(login))).toBe(true);
        const ready = service.poll(login.loginToken) as {
          accountToken: string;
        };
        if (kind === "replacement")
          removal = service.acknowledge(login.loginToken);
        else {
          expected = oauthHash(ready.accountToken);
          removal = service.cancel(login.loginToken);
        }
      }
      // The callback and provider request start before these async methods yield.
      expect(removed).toEqual([expected]);
      expect(order).toEqual(["local", "provider"]);
      finishRevoke(new Response(null, { status: 204 }));
      await removal;
      expect(removed).toEqual([expected]);
    },
  );
  it("does not restore an account when cancellation occurs during token exchange", async () => {
    const f = oauthFixture(),
      login = await f.service.begin("invite");
    let finish!: (value: Response) => void;
    f.remote.run = async (path, init, body) =>
      path === "token"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : f.provider(path, init, body);
    const callback = f.service.callback(f.callback(login));
    await vi.waitFor(() => expect(finish).toBeDefined());
    await f.service.cancel(login.loginToken);
    finish(Response.json(tokenResponse()));
    expect(await callback).toBe(false);
    expect(f.accounts.size).toBe(0);
    expect(f.logins.size).toBe(0);
    expect(f.calls.at(-1)?.path).toBe("token/revoke");
  });
  it("expires unacknowledged accounts while keeping acknowledged accounts", async () => {
    const f = oauthFixture(),
      old = await f.connect(),
      login = await f.service.begin("invite", old.accountToken);
    await f.service.callback(f.callback(login));
    expect(f.accounts.size).toBe(2);
    f.advance(600001);
    f.service.prune();
    expect(f.logins.size).toBe(0);
    expect(f.accounts.size).toBe(1);
    expect(f.service.status(old.accountToken).userId).toBe("123");
  });
  it("coalesces refreshes, stores rotated tokens and preserves upload identity", async () => {
    const f = oauthFixture(),
      account = await f.connect();
    const before = await f.service.credential(account.accountToken, "invite");
    expect(f.service.status(account.accountToken)).toMatchObject({
      providerAccessExpiresAt: 1900000,
      providerRefreshCount: 0,
      providerRefreshedAt: null,
    });
    f.advance(850000);
    const results = await Promise.all([
      f.service.credential(account.accountToken, "invite"),
      f.service.credential(account.accountToken, "invite"),
    ]);
    expect(results).toEqual([
      { token: "local-access-token-2", identity: before.identity },
      { token: "local-access-token-2", identity: before.identity },
    ]);
    expect(f.service.status(account.accountToken)).toMatchObject({
      providerAccessExpiresAt: 2750000,
      providerRefreshCount: 1,
      providerRefreshedAt: 1850000,
    });
    expect(f.store.account(oauthHash(account.accountToken))).toMatchObject({
      providerRefreshCount: 1,
      providerRefreshedAt: 1850000,
    });
    expect(
      f.calls
        .filter(
          (c) =>
            c.path === "token" && c.body.get("grant_type") === "refresh_token",
        )
        .map((c) => c.body.get("refresh_token")),
    ).toEqual(["local-refresh-token-1"]);
    f.advance(850000);
    await f.service.credential(account.accountToken, "invite");
    expect(f.service.status(account.accountToken)).toMatchObject({
      providerRefreshCount: 2,
      providerRefreshedAt: 2700000,
    });
    expect(
      f.calls
        .filter(
          (c) =>
            c.path === "token" && c.body.get("grant_type") === "refresh_token",
        )
        .at(-1)
        ?.body.get("refresh_token"),
    ).toBe("local-refresh-token-2");
  });
  it("defaults legacy JSON accounts to zero and persists the first successful refresh across restart", async () => {
    const f = oauthFixture(),
      ready = await f.connect(),
      id = oauthHash(ready.accountToken);
    const legacy = f.store.account(id)!;
    delete legacy.providerRefreshCount;
    delete legacy.providerRefreshedAt;
    f.store.saveAccount(legacy);
    const restarted = new RobloxOAuth(f.store, oauthConfig, f.deps);
    expect(restarted.status(ready.accountToken)).toMatchObject({
      providerRefreshCount: 0,
      providerRefreshedAt: null,
      providerAccessExpiresAt: legacy.accessExpires,
    });
    f.advance(850000);
    await restarted.credential(ready.accountToken, "invite");
    const again = new RobloxOAuth(f.store, oauthConfig, f.deps);
    expect(again.status(ready.accountToken)).toMatchObject({
      providerRefreshCount: 1,
      providerRefreshedAt: 1850000,
    });
    const status = JSON.stringify(again.status(ready.accountToken));
    for (const secret of [
      "local-access-token-2",
      "local-refresh-token-2",
      ready.accountToken,
      oauthConfig.clientSecret,
    ])
      expect(status).not.toContain(secret);
  });
  it.each(["token", "userinfo", "token/resources"])(
    "does not attest a refresh when provider %s fails",
    async (failure) => {
      const f = oauthFixture(),
        ready = await f.connect(),
        initial = f.service.status(ready.accountToken);
      f.remote.run = (path, init, body) =>
        path === failure
          ? Promise.resolve(
              Response.json({ error: "invalid_grant" }, { status: 401 }),
            )
          : f.provider(path, init, body);
      f.advance(850000);
      await expect(
        f.service.credential(ready.accountToken, "invite"),
      ).rejects.toMatchObject({ status: 401 });
      expect(f.service.status(ready.accountToken)).toMatchObject({
        providerRefreshCount: initial.providerRefreshCount,
        providerRefreshedAt: initial.providerRefreshedAt,
        providerAccessExpiresAt: initial.providerAccessExpiresAt,
        needsAuthorization: true,
      });
    },
  );
  it("does not publish an increment if persisting the rotated credential fails", async () => {
    const f = oauthFixture(),
      ready = await f.connect(),
      save = f.store.saveAccount;
    vi.spyOn(f.store, "saveAccount").mockImplementation((value) => {
      if (value.state === "active" && value.providerRefreshCount === 1)
        throw new Error("Local persistence failed");
      save(value);
    });
    f.advance(850000);
    await expect(
      f.service.credential(ready.accountToken, "invite"),
    ).rejects.toMatchObject({ status: 401 });
    expect(f.service.status(ready.accountToken)).toMatchObject({
      providerRefreshCount: 0,
      providerRefreshedAt: null,
      needsAuthorization: true,
    });
    expect(f.calls.some((call) => call.path === "token/revoke")).toBe(true);
  });
  it("requires reauthorization after an interrupted one-use refresh", async () => {
    const f = oauthFixture(),
      ready = await f.connect(),
      row = f.accounts.get(oauthHash(ready.accountToken))!;
    f.store.saveAccount({ ...row, state: "refreshing" });
    const restarted = new RobloxOAuth(f.store, oauthConfig, f.deps);
    expect(restarted.status(ready.accountToken).needsAuthorization).toBe(true);
    await expect(
      restarted.credential(ready.accountToken, "invite"),
    ).rejects.toThrow("interrupted");
    expect(f.calls.filter((c) => c.path === "token")).toHaveLength(1);
  });
  it("does not invalidate a refreshed token when an older concurrent upload returns unauthorized", async () => {
    const f = oauthFixture(),
      ready = await f.connect();
    const before = await f.service.credential(ready.accountToken, "invite");
    f.advance(850000);
    const after = await f.service.credential(ready.accountToken, "invite");
    expect(after.token).not.toBe(before.token);
    f.service.invalidate(ready.accountToken, before.token);
    expect(f.service.status(ready.accountToken).needsAuthorization).toBe(false);
    f.service.invalidate(ready.accountToken, after.token);
    expect(f.service.status(ready.accountToken).needsAuthorization).toBe(true);
  });
  it("bounds streamed provider responses and sanitizes malformed JSON without keeping an account", async () => {
    for (const body of [
      "x".repeat(131073),
      '{"secret":"provider-private-data"',
    ]) {
      const f = oauthFixture(),
        login = await f.service.begin("invite");
      f.remote.run = async (path, init, data) =>
        path === "userinfo"
          ? new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode(body));
                  controller.close();
                },
              }),
            )
          : f.provider(path, init, data);
      expect(await f.service.callback(f.callback(login))).toBe(false);
      expect(f.accounts.size).toBe(0);
      const result = f.service.poll(login.loginToken);
      expect(result.status).toBe("failed");
      expect(JSON.stringify(result)).not.toContain("provider-private-data");
      expect(JSON.stringify(result)).not.toContain("local-refresh-token");
    }
  });
  it("does not resurrect an account disconnected during refresh", async () => {
    const f = oauthFixture(),
      ready = await f.connect();
    f.advance(850000);
    let finish!: (value: Response) => void;
    f.remote.run = async (path, init, body) =>
      path === "token"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : f.provider(path, init, body);
    const refresh = f.service.credential(ready.accountToken, "invite");
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(await f.service.disconnect(ready.accountToken)).toEqual({
      disconnected: true,
      revoked: true,
    });
    finish(Response.json(tokenResponse(2)));
    await expect(refresh).rejects.toThrow("connection ended");
    expect(f.accounts.size).toBe(0);
    expect(
      f.calls
        .filter((c) => c.path === "token/revoke")
        .map((c) => c.body.get("token")),
    ).toEqual(["local-refresh-token-1", "local-refresh-token-2"]);
  });
  it("rejects a changed provider identity and marks failed refreshes for reconnect", async () => {
    const f = oauthFixture(),
      ready = await f.connect();
    f.advance(850000);
    f.remote.run = async (path, init, body) =>
      path === "userinfo"
        ? Response.json({ ...oauthProfile, sub: "999" })
        : path === "token/resources"
          ? Response.json({
              resource_infos: [
                {
                  owner: { type: "User", id: "999" },
                  resources: { creator: { ids: ["U"] } },
                },
              ],
            })
          : f.provider(path, init, body);
    await expect(
      f.service.credential(ready.accountToken, "invite"),
    ).rejects.toThrow("different account");
    expect(f.service.status(ready.accountToken).needsAuthorization).toBe(true);
    expect(f.calls.at(-1)?.body.get("token")).toBe("local-refresh-token-2");
  });
  it("can disconnect after a sealing-key rotation and reports failed remote revocation", async () => {
    const f = oauthFixture(),
      ready = await f.connect(),
      rotated = new RobloxOAuth(
        f.store,
        { ...oauthConfig, sealingKey: "b".repeat(64) },
        f.deps,
      );
    expect(await rotated.disconnect(ready.accountToken)).toEqual({
      disconnected: true,
      revoked: false,
    });
    expect(f.accounts.size).toBe(0);
    expect(f.calls.filter((c) => c.path === "token/revoke")).toHaveLength(0);
  });
  it("cleans returned tokens when scopes are missing and reports provider denial safely", async () => {
    const f = oauthFixture(),
      login = await f.service.begin("invite");
    f.remote.run = async (path, init, body) =>
      path === "token"
        ? Response.json({ ...tokenResponse(), scope: "openid profile" })
        : f.provider(path, init, body);
    expect(await f.service.callback(f.callback(login))).toBe(false);
    expect(f.service.poll(login.loginToken)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("permissions"),
    });
    expect(f.accounts.size).toBe(0);
    expect(f.calls.at(-1)?.path).toBe("token/revoke");
    await f.service.cancel(login.loginToken);
    const declined = await f.service.begin("invite"),
      url = f.callback(declined);
    url.searchParams.set("error", "private-provider-error");
    await f.service.callback(url);
    expect(JSON.stringify(f.service.poll(declined.loginToken))).not.toContain(
      "private-provider-error",
    );
  });
  it("bounds private login attempts and callback-created accounts", async () => {
    const f = oauthFixture();
    await expect(f.service.begin("invalid")).rejects.toMatchObject({
      status: 403,
    });
    const a = await f.service.begin("invite"),
      b = await f.service.begin("invite");
    await expect(f.service.begin("invite")).rejects.toMatchObject({
      status: 429,
    });
    await f.service.callback(f.callback(a));
    await f.service.callback(f.callback(b));
    expect(f.accounts.size).toBe(2);
    await f.service.cancel(a.loginToken);
    await f.service.cancel(b.loginToken);
    for (let i = 0; i < 12; i++) {
      const pending = await f.service.begin("invite");
      await f.service.cancel(pending.loginToken);
    }
    await expect(f.service.begin("invite")).rejects.toMatchObject({
      status: 429,
    });
  });
});

it("uses OAuth Bearer credentials for both image create and poll, with accurate errors", async () => {
  const mock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ path: "operations/test" }))
    .mockResolvedValueOnce(
      Response.json({
        done: true,
        response: { assetId: "999", assetType: "Image" },
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  await createImageOperation(
    { owner: { kind: "user", id: "123" }, name: "Test", png: "" },
    Buffer.alloc(0),
    { oauthToken: "fixture-token" },
    mock,
  );
  await readImageOperation(
    "operations/test",
    { oauthToken: "fixture-token" },
    mock,
  );
  for (const call of mock.mock.calls.slice(0, 2)) {
    const headers = new Headers(call[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer fixture-token");
    expect(headers.has("x-api-key")).toBe(false);
  }
  await expect(
    readImageOperation(
      "operations/test",
      { oauthToken: "fixture-token" },
      mock,
    ),
  ).rejects.toThrow("authorization ended");
});
