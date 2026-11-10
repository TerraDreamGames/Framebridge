import { afterEach, describe, expect, it, vi } from "vitest";
import gateway, {
  type GatewayEnv,
} from "../packages/relay/cloudflare/oauth-gateway";
import { validatedOAuthCallback } from "../packages/relay/src/oauth-callback";
import { readFile } from "node:fs/promises";
import { unstable_readConfig } from "wrangler";

const callbackUri = "https://framebridge.test/oauth/roblox/callback",
  state = "a".repeat(64),
  callback = callbackUri + "?state=" + state + "&code=local-code",
  key = "b".repeat(64),
  env: GatewayEnv = {
    FRAMEBRIDGE_RELAY_ORIGIN: "https://relay.test",
    ROBLOX_OAUTH_REDIRECT_URI: callbackUri,
    ROBLOX_OAUTH_GATEWAY_SECRET: key,
  };
afterEach(() => vi.unstubAllGlobals());

describe("callback-only OAuth gateway", () => {
  it("forwards only canonical code/state to the fixed backend with a private server capability", async () => {
    const upstream = vi.fn(
      async () =>
        new Response("private upstream body", {
          headers: {
            "Set-Cookie": "private-cookie",
            Location: "https://evil.test",
          },
        }),
    );
    vi.stubGlobal("fetch", upstream);
    const response = await gateway.fetch(
      new Request(callback + "&ignored=private-query", {
        headers: {
          Authorization: "Bearer client-token",
          Cookie: "client-cookie",
          "X-Framebridge-Beta": "private-invitation",
          "X-Framebridge-Roblox-Account": "private-account",
        },
      }),
      env,
    );
    expect(upstream).toHaveBeenCalledOnce();
    const [url, init] = upstream.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://relay.test/v1/roblox/callback-forward");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    });
    expect(JSON.parse(String(init.body))).toEqual({ callbackUrl: callback });
    const html = await response.text();
    for (const secret of [state, "local-code", key, "private", "evil.test"])
      expect(html).not.toContain(secret);
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(response.headers.has("Location")).toBe(false);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(html).toContain("history.replaceState");
  });
  it.each([
    ["POST", callback, 405],
    ["GET", "https://framebridge.test/v1/sessions", 404],
    ["GET", "https://framebridge.test/v1/assets", 404],
    ["GET", "https://framebridge.test/", 404],
    ["GET", "https://framebridge.test/health", 404],
    ["GET", "https://framebridge.test/assets/website.js", 404],
    [
      "GET",
      "https://framebridge.test/oauth/roblox/callback-extra?state=" +
        state +
        "&code=x",
      404,
    ],
    ["GET", "https://framebridge.test/oauth/roblox/callback?code=x", 400],
    [
      "GET",
      "https://other.test/oauth/roblox/callback?state=" + state + "&code=x",
      503,
    ],
  ])("rejects %s %s without a subrequest", async (method, url, status) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect(
      (await gateway.fetch(new Request(url, { method }), env)).status,
    ).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    { FRAMEBRIDGE_RELAY_ORIGIN: "http://relay.test" },
    { FRAMEBRIDGE_RELAY_ORIGIN: "https://user:password@relay.test" },
    { FRAMEBRIDGE_RELAY_ORIGIN: "https://relay.test/arbitrary/path" },
    { FRAMEBRIDGE_RELAY_ORIGIN: "https://relay.test?token=private" },
    { FRAMEBRIDGE_RELAY_ORIGIN: "https://framebridge.test" },
    {
      ROBLOX_OAUTH_REDIRECT_URI:
        "http://framebridge.test/oauth/roblox/callback",
    },
    { ROBLOX_OAUTH_REDIRECT_URI: callbackUri + "?token=private" },
    { ROBLOX_OAUTH_REDIRECT_URI: callbackUri + "#private" },
    { ROBLOX_OAUTH_GATEWAY_SECRET: "" },
  ])("fails closed for invalid operator configuration %j", async (invalid) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect(
      (await gateway.fetch(new Request(callback), { ...env, ...invalid }))
        .status,
    ).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("serves completion and health locally without contacting the backend", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await gateway.fetch(
      new Request("https://framebridge.test/oauth/roblox/health"),
      env,
    );
    expect(await response.json()).toEqual({
      ok: true,
      access: "callback-only",
    });
    expect(
      (
        await gateway.fetch(
          new Request("https://framebridge.test/oauth/roblox/complete"),
          env,
        )
      ).status,
    ).toBe(200);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("claims only the registered OAuth namespace without changing the website host/DNS", async () => {
    const config = unstable_readConfig({
      config: "wrangler.oauth-gateway.jsonc",
    });
    expect(config.account_id).toBe("565c30419d463aba723dca148503569d");
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.routes).toEqual([
      {
        pattern: "https://framebridge.terradream.games/oauth/roblox/*",
        zone_name: "terradream.games",
      },
    ]);
    expect(config.vars.ROBLOX_OAUTH_REDIRECT_URI).toBe(
      "https://framebridge.terradream.games/oauth/roblox/callback",
    );
    for (const path of ["docs/ROBLOX_SIGN_IN.md", "docs/PRIVATE_BETA.md"])
      expect(await readFile(path, "utf8")).toContain("/oauth/roblox/health");
  });
  it.each([400, 401, 403, 429, 503, 302, 500])(
    "sanitizes upstream status %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("private error", { status })),
      );
      const response = await gateway.fetch(new Request(callback), env);
      expect(response.status).toBe(
        [400, 401, 403, 429, 503].includes(status) ? status : 502,
      );
      expect(await response.text()).not.toContain("private error");
    },
  );
  it("sanitizes network/timeout failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("private network credentials");
      }),
    );
    const response = await gateway.fetch(new Request(callback), env);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("credentials");
  });
});

describe("canonical callback validation", () => {
  it("retains an authorization decline but drops provider descriptions and unrelated fields", () => {
    const result = validatedOAuthCallback(
      callbackUri +
        "?state=" +
        state +
        "&error=access_denied&error_description=private&next=https://evil.test",
      callbackUri,
    );
    expect(result?.href).toBe(
      callbackUri + "?state=" + state + "&error=access_denied",
    );
  });
  it.each([
    callback + "&state=" + state,
    callback + "&code=second-code",
    callback + "&error=access_denied",
    callback + "#private",
    callbackUri + "?state=invalid&code=local-code",
    callbackUri + "?state=" + state + "&code=",
    callbackUri + "?state=" + state + "&code=line%0Abreak",
    callbackUri + "?state=" + state + "&code=" + "x".repeat(4097),
    callbackUri + "?state=" + state + "&error=" + "x".repeat(257),
    callbackUri + "?state=" + state + "&code=x&ignored=" + "x".repeat(16384),
    "https://user:password@framebridge.test/oauth/roblox/callback?state=" +
      state +
      "&code=x",
  ])("rejects ambiguous, malformed or oversized callback %#", (invalid) => {
    expect(validatedOAuthCallback(invalid, callbackUri)).toBeUndefined();
  });
});
