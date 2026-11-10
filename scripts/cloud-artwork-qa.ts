/** Local synthetic provider + actual workerd SQLite/R2 browser fixture. No live uploads. */
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  artworkScript,
  startArtwork,
  artworkInvite,
} from "../tests/cloud-artwork-fixture";
import { reviewVersion } from "../packages/core/src/review-cloud";
import { readRobloxLogin } from "../plugins/figma/src/roblox-account-storage";
await mkdir(".artifacts/cloud-artwork", { recursive: true });
const r = await startArtwork(
  await artworkScript(),
  resolve(".artifacts/cloud-artwork/browser-state"),
);
// This owned fixture has synthetic identities only. Restart clears their stale
// capabilities, preserving every artwork folder/PNG in the same SQLite/R2 namespace.
const storage = await r.sql();
await storage.exec("DELETE FROM oauth_logins");
await storage.exec("DELETE FROM oauth_accounts");
await storage.exec("DELETE FROM artwork_grants");
// Only synthetic sign-in attempts are reset; artwork admission/storage quotas persist.
await storage.exec("DELETE FROM counters WHERE scope LIKE 'oauth-start:%'");
const peer = await r.account("789"),
  shared = await r.connect(peer, "456");
r.provider.userId = "123";
const server = createServer(async (req, res) => {
  const path = req.url ?? "/",
    origin = req.headers.origin;
  res.setHeader(
    "Access-Control-Allow-Origin",
    origin === "http://localhost:5193" || origin === "http://127.0.0.1:5193"
      ? origin
      : "http://localhost:5193",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-Framebridge-Beta,X-Framebridge-Artwork-Grant,X-Framebridge-Review-Grant",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    let length = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 710000) throw Error("QA request exceeded limit");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks),
      body = raw.length ? JSON.parse(raw.toString()) : undefined;
    let result;
    if (path === "/__qa/peer-edit" && req.method === "POST") {
      const snapshot = (
        await r.call("/v1/artwork", peer, undefined, shared.grantToken)
      ).body;
      result = await r.call(
        "/v1/artwork/edit",
        peer,
        {
          action: "create-folder",
          name:
            typeof body?.name === "string"
              ? body.name
              : "Peer folder " + snapshot.revision,
          expected: reviewVersion(snapshot),
        },
        shared.grantToken,
      );
    } else {
      result = await r.call(
        path,
        typeof req.headers.authorization === "string"
          ? req.headers.authorization.replace(/^Bearer /, "")
          : "",
        body,
        typeof req.headers["x-framebridge-artwork-grant"] === "string"
          ? req.headers["x-framebridge-artwork-grant"]
          : "",
        req.method,
        typeof req.headers["x-framebridge-beta"] === "string"
          ? req.headers["x-framebridge-beta"]
          : "",
      );
      if (path === "/v1/roblox/config")
        result.body = { ...result.body, simulation: true };
      if (
        path === "/v1/roblox/login" &&
        req.method === "POST" &&
        result.status === 201
      ) {
        r.provider.userId = "123";
        const authorization = new URL(result.body.authorizationUrl),
          state = authorization.searchParams.get("state");
        const callback = await r.runtime.dispatchFetch(
          "https://relay.test/oauth/roblox/callback?code=local-auth-code&state=" +
            state,
        );
        if (callback.status !== 200)
          throw Error("Local synthetic callback failed");
        authorization.searchParams.set(
          "redirect_uri",
          "http://localhost:5263/oauth/roblox/callback",
        );
        result.body.authorizationUrl = authorization.toString();
      }
    }
    res.setHeader(
      "Content-Type",
      result.body instanceof Uint8Array ? "image/png" : "application/json",
    );
    res.writeHead(result.status);
    res.end(
      result.body instanceof Uint8Array
        ? Buffer.from(result.body)
        : JSON.stringify(result.body),
    );
    process.stdout.write(
      `${req.method} ${path.split("?")[0]} ${result.status}\n`,
    );
  } catch {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "Local synthetic artwork service failed." }),
    );
    process.stdout.write(`${req.method} ${path.split("?")[0]} 503\n`);
  }
});
server.listen(5263, "127.0.0.1", async () => {
  const base = "http://127.0.0.1:5263",
    headers = {
      "Content-Type": "application/json",
      "X-Framebridge-Beta": artworkInvite,
    };
  const preflight = await fetch(base + "/v1/artwork/connect", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5193",
        "Access-Control-Request-Headers":
          "Authorization,X-Framebridge-Artwork-Grant",
      },
    }),
    config = await fetch(base + "/v1/roblox/config");
  const begin = await fetch(base + "/v1/roblox/login", {
      method: "POST",
      headers,
      body: "{}",
    }),
    login = await begin.json();
  const authorization = new URL(login.authorizationUrl);
  const ready = await (
    await fetch(base + "/v1/roblox/login", {
      headers: { Authorization: "Bearer " + login.loginToken },
    })
  ).json();
  if (
    preflight.status !== 204 ||
    (await preflight.text()) !== "" ||
    !(await config.json()).simulation ||
    begin.status !== 201 ||
    authorization.searchParams.get("redirect_uri") !==
      "http://localhost:5263/oauth/roblox/callback" ||
    !readRobloxLogin(login, "http://localhost:5263") ||
    ready.status !== "ready"
  )
    throw Error("Synthetic startup HTTP/client parser smoke failed");
  await fetch(base + "/v1/roblox/login", {
    method: "DELETE",
    headers: { Authorization: "Bearer " + login.loginToken },
  });
  process.stdout.write(
    "Actual HTTP config/preflight/callback/poll/cancel smoke passed. Synthetic artwork HTTP ready on 5263. Private access: " +
      artworkInvite +
      "\n",
  );
});
async function stop() {
  server.close();
  await r.close();
  process.exit(0);
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
