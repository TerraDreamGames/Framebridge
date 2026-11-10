import { describe, expect, it, vi } from "vitest";
import { oauthConfig, oauthFixture } from "./roblox-oauth-fixture";

describe("Roblox OAuth provider throttling", () => {
  const networkBlock = (retryAfter = "0") =>
    new Response("error code: 1015\n", {
      status: 429,
      headers: {
        Server: "cloudflare",
        "Content-Type": "text/plain; charset=UTF-8",
        "Retry-After": retryAfter,
      },
    });

  it("identifies an edge 1015 block and stops rapid retries across sign-in attempts", async () => {
    const f = oauthFixture();
    f.deps.sleep = vi.fn(async () => {});
    f.remote.run = async () => networkBlock();
    for (let i = 0; i < 2; i++) {
      const login = await f.service.begin("invite");
      expect(await f.service.callback(f.callback(login))).toBe(false);
      expect(f.service.poll(login.loginToken)).toMatchObject({
        status: "failed",
        error: expect.stringContaining(
          "hosting network (Cloudflare error 1015)",
        ),
      });
    }
    expect(f.calls).toHaveLength(1);
    expect(f.deps.sleep).not.toHaveBeenCalled();
    f.advance(15 * 60_000);
    f.remote.run = f.provider;
    expect(await f.connect()).toHaveProperty("accountToken");
  });

  it("honors an edge cooldown longer than the minimum pause", async () => {
    const f = oauthFixture();
    f.remote.run = async () => networkBlock("3600");
    let login = await f.service.begin("invite");
    await f.service.callback(f.callback(login));
    f.advance(15 * 60_000);
    f.remote.run = f.provider;
    login = await f.service.begin("invite");
    expect(await f.service.callback(f.callback(login))).toBe(false);
    expect(f.calls).toHaveLength(1);
    f.advance(45 * 60_000);
    expect(await f.connect()).toHaveProperty("accountToken");
  });

  it("does not discard a refresh credential rejected by the edge network", async () => {
    const f = oauthFixture();
    const ready = await f.connect();
    f.advance(850_000);
    f.remote.run = async () => networkBlock();
    await expect(
      f.service.credential(ready.accountToken, "invite"),
    ).rejects.toMatchObject({ status: 503, providerStatus: 429 });
    expect(f.service.status(ready.accountToken).needsAuthorization).toBe(false);
    f.advance(15 * 60_000);
    f.remote.run = f.provider;
    expect(
      await f.service.credential(ready.accountToken, "invite"),
    ).toMatchObject({ token: "local-access-token-2" });
  });

  it.each([
    ["error code: 1015\nprivate-provider-data", "cloudflare"],
    ["x".repeat(129), "cloudflare"],
    ["error code: 1015", "public-gateway"],
  ])(
    "does not turn arbitrary provider text into a network-block diagnosis",
    async (body, server) => {
      const f = oauthFixture();
      f.remote.run = async () =>
        new Response(body, {
          status: 429,
          headers: { Server: server, "Content-Type": "text/plain" },
        });
      const login = await f.service.begin("invite");
      expect(await f.service.callback(f.callback(login))).toBe(false);
      const result = f.service.poll(login.loginToken);
      expect(result).toMatchObject({ status: "failed" });
      expect(JSON.stringify(result)).not.toContain("Cloudflare error 1015");
      expect(JSON.stringify(result)).not.toContain("private-provider-data");
      expect(f.calls).toHaveLength(4);
    },
  );

  it.each(["token", "userinfo", "token/resources"])(
    "completes the approved login after a temporary %s throttle",
    async (endpoint) => {
      const f = oauthFixture();
      let attempts = 0;
      f.deps.sleep = vi.fn(async () => {});
      f.remote.run = async (path, init, body) => {
        if (path === endpoint && ++attempts === 1)
          return new Response("private-provider-body", {
            status: 429,
            headers: { "Retry-After": "2" },
          });
        return f.provider(path, init, body);
      };
      const login = await f.service.begin("invite");
      expect(await f.service.callback(f.callback(login))).toBe(true);
      expect(f.service.poll(login.loginToken)).toMatchObject({
        status: "ready",
        account: { userId: "123" },
      });
      expect(f.deps.sleep).toHaveBeenCalledWith(2000, expect.any(AbortSignal));
      const calls = f.calls.filter((call) => call.path === endpoint);
      expect(calls).toHaveLength(2);
      expect(calls[1].body.toString()).toBe(calls[0].body.toString());
      expect(calls[1].headers.get("Authorization")).toBe(
        calls[0].headers.get("Authorization"),
      );
      expect(f.calls.some((call) => call.path === "token/revoke")).toBe(false);
    },
  );

  it("uses bounded exponential backoff and never repeats an already successful exchange", async () => {
    const f = oauthFixture();
    let attempts = 0;
    f.deps.sleep = vi.fn(async () => {});
    f.remote.run = async (path, init, body) => {
      if (path === "token/resources" && ++attempts <= 3)
        return new Response(null, { status: 429 });
      return f.provider(path, init, body);
    };
    const login = await f.service.begin("invite");
    expect(await f.service.callback(f.callback(login))).toBe(true);
    expect(vi.mocked(f.deps.sleep).mock.calls.map(([ms]) => ms)).toEqual([
      1000, 2000, 4000,
    ]);
    expect(f.calls.filter((call) => call.path === "token")).toHaveLength(1);
    expect(attempts).toBe(4);
  });

  it("stops persistent throttling and revokes a token whose permissions could not be verified", async () => {
    const f = oauthFixture();
    f.deps.sleep = vi.fn(async () => {});
    f.remote.run = async (path, init, body) =>
      path === "token/resources"
        ? new Response("secret-error-details", { status: 429 })
        : f.provider(path, init, body);
    const login = await f.service.begin("invite");
    expect(await f.service.callback(f.callback(login))).toBe(false);
    expect(f.accounts.size).toBe(0);
    expect(
      f.calls.filter((call) => call.path === "token/resources"),
    ).toHaveLength(4);
    expect(f.calls.filter((call) => call.path === "token")).toHaveLength(1);
    expect(f.calls.at(-1)?.path).toBe("token/revoke");
    const status = f.service.poll(login.loginToken);
    expect(status).toMatchObject({
      status: "failed",
      error: expect.stringContaining("creator permissions"),
    });
    for (const secret of [
      "secret-error-details",
      "local-access-token",
      oauthConfig.clientSecret,
    ])
      expect(JSON.stringify(status)).not.toContain(secret);
  });

  it("honors an HTTP-date Retry-After", async () => {
    const f = oauthFixture();
    let attempts = 0;
    f.deps.sleep = vi.fn(async () => {});
    f.remote.run = async (path, init, body) => {
      if (path === "token" && ++attempts === 1)
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": new Date(1_005_000).toUTCString() },
        });
      return f.provider(path, init, body);
    };
    expect(await f.connect()).toHaveProperty("accountToken");
    expect(f.deps.sleep).toHaveBeenCalledWith(5000, expect.any(AbortSignal));
  });

  it("does not retry sooner than a long provider cooldown", async () => {
    const f = oauthFixture();
    f.deps.sleep = vi.fn(async () => {});
    f.remote.run = async () =>
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "120" },
      });
    const login = await f.service.begin("invite");
    expect(await f.service.callback(f.callback(login))).toBe(false);
    expect(f.calls).toHaveLength(1);
    expect(f.deps.sleep).not.toHaveBeenCalled();
    expect(f.service.poll(login.loginToken)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Wait 120 seconds"),
    });
  });

  it.each(["garbage", "-1"])(
    "uses backoff for an invalid Retry-After: %s",
    async (header) => {
      const f = oauthFixture();
      let attempts = 0;
      f.deps.sleep = vi.fn(async () => {});
      f.remote.run = async (path, init, body) => {
        if (path === "token" && ++attempts === 1)
          return new Response(null, {
            status: 429,
            headers: { "Retry-After": header },
          });
        return f.provider(path, init, body);
      };
      expect(await f.connect()).toHaveProperty("accountToken");
      expect(f.deps.sleep).toHaveBeenCalledWith(1000, expect.any(AbortSignal));
    },
  );

  it.each([401, 500, 302, "timeout"] as const)(
    "never replays an ambiguous or invalid exchange: %s",
    async (failure) => {
      const f = oauthFixture();
      f.deps.sleep = vi.fn(async () => {});
      f.remote.run = async () => {
        if (failure === "timeout") throw new Error("private-timeout-details");
        return new Response(null, { status: failure });
      };
      const login = await f.service.begin("invite");
      expect(await f.service.callback(f.callback(login))).toBe(false);
      expect(f.calls).toHaveLength(1);
      expect(f.deps.sleep).not.toHaveBeenCalled();
      expect(JSON.stringify(f.service.poll(login.loginToken))).not.toContain(
        "private-timeout-details",
      );
    },
  );

  it("keeps one timeout budget across retries", async () => {
    const f = oauthFixture();
    f.remote.run = async () => new Response(null, { status: 429 });
    f.deps.sleep = async () => {
      f.advance(15_000);
    };
    const login = await f.service.begin("invite");
    expect(await f.service.callback(f.callback(login))).toBe(false);
    expect(f.calls).toHaveLength(1);
  });

  it("does not resurrect a login cancelled during a retry wait", async () => {
    const f = oauthFixture();
    let attempts = 0;
    let release!: () => void;
    f.deps.sleep = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    f.remote.run = async (path, init, body) => {
      if (path === "token/resources" && ++attempts === 1)
        return new Response(null, { status: 429 });
      return f.provider(path, init, body);
    };
    const login = await f.service.begin("invite");
    const callback = f.service.callback(f.callback(login));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await f.service.cancel(login.loginToken);
    release();
    expect(await callback).toBe(false);
    expect(f.accounts.size).toBe(0);
    expect(f.logins.size).toBe(0);
    expect(f.calls.at(-1)?.path).toBe("token/revoke");
  });

  it("keeps a definitively rejected refresh recoverable after its cooldown", async () => {
    const f = oauthFixture();
    const ready = await f.connect();
    const before = f.service.status(ready.accountToken);
    f.advance(850_000);
    f.remote.run = async () =>
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "120" },
      });
    await expect(
      f.service.credential(ready.accountToken, "invite"),
    ).rejects.toMatchObject({ status: 429 });
    expect(f.service.status(ready.accountToken)).toMatchObject({
      needsAuthorization: false,
      providerRefreshCount: before.providerRefreshCount,
      providerAccessExpiresAt: before.providerAccessExpiresAt,
    });
    f.remote.run = f.provider;
    expect(
      await f.service.credential(ready.accountToken, "invite"),
    ).toMatchObject({ token: "local-access-token-2" });
    const refreshes = f.calls.filter(
      (c) => c.path === "token" && c.body.get("grant_type") === "refresh_token",
    );
    expect(refreshes.map((c) => c.body.get("refresh_token"))).toEqual([
      "local-refresh-token-1",
      "local-refresh-token-1",
    ]);
    expect(f.calls.some((c) => c.path === "token/revoke")).toBe(false);
  });
});
