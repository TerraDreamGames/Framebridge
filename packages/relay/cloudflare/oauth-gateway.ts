import { oauthPage, validatedOAuthCallback } from "../src/oauth-callback";

export type GatewayEnv = {
  FRAMEBRIDGE_RELAY_ORIGIN?: string;
  ROBLOX_OAUTH_REDIRECT_URI?: string;
  ROBLOX_OAUTH_GATEWAY_SECRET?: string;
};
function configuration(env: GatewayEnv) {
  try {
    const relay = new URL(env.FRAMEBRIDGE_RELAY_ORIGIN ?? ""),
      callback = new URL(env.ROBLOX_OAUTH_REDIRECT_URI ?? "");
    if (
      relay.protocol !== "https:" ||
      relay.username ||
      relay.password ||
      relay.pathname !== "/" ||
      relay.search ||
      relay.hash ||
      callback.protocol !== "https:" ||
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash ||
      callback.pathname !== "/oauth/roblox/callback" ||
      callback.origin === relay.origin ||
      !/^[a-f0-9]{64}$/.test(env.ROBLOX_OAUTH_GATEWAY_SECRET ?? "")
    )
      return undefined;
    return { relay: relay.origin, callback };
  } catch {
    return undefined;
  }
}

/** A scoped OAuth route: no sessions, uploads, provider tokens or general proxy. */
export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const config = configuration(env),
      url = new URL(request.url);
    if (!config || url.origin !== config.callback.origin)
      return oauthPage("Roblox authorization could not finish", 503);
    if (url.pathname === "/oauth/roblox/health" && request.method === "GET")
      return Response.json(
        { ok: true, access: "callback-only" },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (request.method !== "GET")
      return oauthPage("Roblox authorization could not finish", 405);
    if (url.pathname === "/oauth/roblox/complete") return oauthPage();
    if (url.pathname !== "/oauth/roblox/callback")
      return oauthPage("Roblox authorization could not finish", 404);
    const callback = validatedOAuthCallback(
      request.url,
      env.ROBLOX_OAUTH_REDIRECT_URI,
    );
    if (!callback)
      return oauthPage("Roblox authorization could not finish", 400);
    try {
      const response = await fetch(
        config.relay + "/v1/roblox/callback-forward",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + env.ROBLOX_OAUTH_GATEWAY_SECRET,
          },
          body: JSON.stringify({ callbackUrl: callback.href }),
          redirect: "manual",
          signal: AbortSignal.timeout(45000),
        },
      );
      // Never relay upstream HTML, cookies, redirect headers or private payloads.
      await response.body?.cancel();
      return response.status === 200
        ? oauthPage()
        : oauthPage(
            "Roblox authorization could not finish",
            [400, 401, 403, 429, 503].includes(response.status)
              ? response.status
              : 502,
          );
    } catch {
      return oauthPage("Roblox authorization could not finish", 502);
    }
  },
};
