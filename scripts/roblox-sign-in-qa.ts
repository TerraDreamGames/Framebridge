// Local QA only. Every provider response is simulated; outbound network is denied.
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  oauthConfig,
  oauthHash,
  tokenResponse,
} from "../tests/roblox-oauth-fixture";

export const SIGN_IN_QA_INVITATION =
  "local-sign-in-recovery-invitation-1234567890";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const callbackOrigin = "https://framebridge-qa.test";
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Simulated Roblox sign-in QA</title></head><body>
<h1>Simulated Roblox sign-in QA</h1><p>Local workerd only. All accounts, grants and images are fake. No real Roblox requests.</p>
<p>Preview: localhost:5189. Invitation: ${SIGN_IN_QA_INVITATION}. API key: local-qa-api-key. Key creator: group 987.</p>
<div id="actions"></div><pre id="status" aria-live="polite"></pre><script>
const actions=['hold-next','release','deny-next','group-off','group-on','expire-visible','prune','offline-on','offline-off','reset'];
for(const action of actions){const b=document.createElement('button');b.textContent=action;b.onclick=async()=>{const r=await fetch('/__qa/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});document.querySelector('#status').textContent=JSON.stringify(await r.json(),null,2)};document.querySelector('#actions').append(b)}
</script></body></html>`;

export async function createSignInQaService(port: number, directory: string) {
  await mkdir(directory, { recursive: true });
  const bundle = await build({
    stdin: {
      contents: `import {DurableObject} from 'cloudflare:workers'; import {RelayRoom} from './packages/relay/cloudflare/worker.ts'; export {default} from './packages/relay/cloudflare/worker.ts'; export class InspectableRelayRoom extends DurableObject { constructor(ctx,env){super(ctx,env);this.room=new RelayRoom(ctx,env)} fetch(r){return this.room.fetch(r)} alarm(){return this.room.alarm()} }`,
      resolveDir: resolve("."),
      sourcefile: "sign-in-qa-entry.ts",
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    external: ["node:*", "cloudflare:workers"],
    write: false,
    logLevel: "silent",
  });
  let number = 0,
    groups = true,
    offline = false,
    holdNext = false,
    denyNext = false;
  let held: { state: string } | undefined, accountToken: string | undefined;
  const counts = {
    exchange: 0,
    refresh: 0,
    revoke: 0,
    creates: 0,
    polls: 0,
    bearerCreates: 0,
    keyCreates: 0,
  };
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: "sign-in-qa",
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        RELAY: { className: "InspectableRelayRoom", useSQLite: true },
      },
      resourcePersistencePath: directory,
      telemetry: { enabled: false },
      unsafeInspectDurableObjects: true,
      bindings: {
        BETA_ACCESS_HASHES: oauthHash(SIGN_IN_QA_INVITATION),
        ROBLOX_OAUTH_CLIENT_ID: oauthConfig.clientId,
        ROBLOX_OAUTH_CLIENT_SECRET: oauthConfig.clientSecret,
        ROBLOX_OAUTH_REDIRECT_URI: callbackOrigin + "/oauth/roblox/callback",
        ROBLOX_OAUTH_SEALING_KEY: oauthConfig.sealingKey,
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        if (url.hostname !== "apis.roblox.com")
          throw Error("QA denies outbound network");
        const path = url.pathname;
        if (path === "/oauth/v1/token") {
          const body = new URLSearchParams(await request.text());
          if (body.get("grant_type") === "refresh_token") counts.refresh++;
          else counts.exchange++;
          return Response.json(tokenResponse(++number));
        }
        if (path === "/oauth/v1/userinfo")
          return Response.json({
            sub: "123",
            preferred_username: "SimulatedCreator",
            name: "Simulated Creator",
          });
        if (path === "/oauth/v1/token/resources")
          return Response.json({
            resource_infos: [
              {
                owner: { id: "123", type: "User" },
                resources: { creator: { ids: groups ? ["U", "G456"] : ["U"] } },
              },
            ],
          });
        if (path === "/oauth/v1/token/revoke") {
          counts.revoke++;
          return new Response(null, { status: 204 });
        }
        if (path === "/assets/v1/assets") {
          counts.creates++;
          if (request.headers.has("Authorization")) counts.bearerCreates++;
          if (request.headers.has("x-api-key")) counts.keyCreates++;
          return Response.json({ path: "operations/qa-" + counts.creates });
        }
        if (path.startsWith("/assets/v1/operations/")) {
          counts.polls++;
          return Response.json({
            done: true,
            response: {
              assetId: "987654",
              assetType: "Image",
              moderationResult: { moderationState: "Approved" },
            },
          });
        }
        throw Error("QA denies unexpected provider path");
      },
    }),
  );
  await runtime.ready;
  const sql = () =>
    runtime.unsafeGetDurableObjectStorage(
      "sign-in-qa",
      "InspectableRelayRoom",
      { name: "private-beta-v1" },
    );
  const callback = (state: string, denied = false) =>
    runtime.dispatchFetch(
      callbackOrigin +
        "/oauth/roblox/callback?state=" +
        encodeURIComponent(state) +
        (denied ? "&error=access_denied" : "&code=local-qa-code"),
    );
  const mutateAccounts = async (change: (record: any) => void) => {
    const storage = await sql();
    for (const row of await storage.exec(
      "SELECT id,data FROM oauth_accounts",
    )) {
      const record = JSON.parse(String(row.data));
      change(record);
      await storage.exec(
        "UPDATE oauth_accounts SET data=?,expires=? WHERE id=?",
        JSON.stringify(record),
        record.expires,
        row.id,
      );
    }
  };
  const control = async (action: string) => {
    if (action === "offline-on") offline = true;
    else if (action === "offline-off") offline = false;
    else if (action === "hold-next") holdNext = true;
    else if (action === "deny-next") denyNext = true;
    else if (action === "release") {
      if (held) {
        await callback(held.state);
        held = undefined;
      }
    } else if (action === "expire-soon" || action === "expire-visible")
      await mutateAccounts((r) => {
        r.expires = Date.now() + (action === "expire-visible" ? 10000 : 1500);
      });
    else if (action === "prune") {
      const storage = await sql();
      await storage.exec("DELETE FROM oauth_accounts");
      await storage.exec("DELETE FROM oauth_logins");
      accountToken = undefined;
      held = undefined;
    } else if (action === "group-off" || action === "group-on") {
      groups = action === "group-on";
      await mutateAccounts((r) => {
        r.accessExpires = 0;
      });
      if (accountToken) {
        // Exercise the real refresh/grant boundary through a fake image request.
        const response = await runtime.dispatchFetch(
          "https://relay.test/v1/upload-sessions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Framebridge-Beta": SIGN_IN_QA_INVITATION,
            },
            body: "{}",
          },
        );
        if (response.ok) {
          const session = (await response.json()) as { uploadToken: string };
          await runtime.dispatchFetch("https://relay.test/v1/assets", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + session.uploadToken,
              "X-Framebridge-Roblox-Account": accountToken,
            },
            body: JSON.stringify({
              name: "Fake grant refresh",
              owner: { kind: "group", id: "456" },
              png,
            }),
          });
          await runtime.dispatchFetch("https://relay.test/v1/session", {
            method: "DELETE",
            headers: { Authorization: "Bearer " + session.uploadToken },
          });
        }
      }
    } else if (action === "reset") {
      offline = false;
      groups = true;
      holdNext = false;
      denyNext = false;
      held = undefined;
      accountToken = undefined;
      const storage = await sql();
      // This namespace is created exclusively for this simulator.
      for (const table of [
        "oauth_accounts",
        "oauth_logins",
        "sessions",
        "jobs",
        "counters",
        "job_usage",
      ])
        await storage.exec(`DELETE FROM ${table}`);
    } else throw Error("Unknown QA control");
    const storage = await sql();
    const rows = await storage.exec(
      "SELECT (SELECT COUNT(*) FROM oauth_accounts) AS accounts,(SELECT COUNT(*) FROM oauth_logins) AS logins,(SELECT COUNT(*) FROM sessions) AS sessions",
    );
    return {
      simulation: true,
      groups,
      offline,
      held: !!held,
      ...rows[0],
      ...counts,
    };
  };
  const server = createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? "";
      if (!/^localhost:\d+$/.test(host) && !/^127\.0\.0\.1:\d+$/.test(host)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const path = new URL(req.url ?? "/", "http://" + host).pathname;
      if (path === "/__qa" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'unsafe-inline'; connect-src 'self'",
        });
        res.end(html);
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 3 * 1024 * 1024) throw Error("QA body limit");
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      let response: {
        status: number;
        ok: boolean;
        headers: {
          forEach(callback: (value: string, key: string) => void): void;
        };
        json(): Promise<unknown>;
        clone(): { json(): Promise<unknown> };
        arrayBuffer(): Promise<ArrayBuffer>;
      };
      if (path === "/__qa/control" && req.method === "POST") {
        if (req.headers.origin && req.headers.origin !== "http://" + host) {
          res.writeHead(403);
          res.end();
          return;
        }
        response = Response.json(
          await control(JSON.parse(bytes.toString()).action),
        );
      } else if (offline && req.method !== "OPTIONS")
        response = Response.json(
          { error: "Simulated service outage." },
          { status: 503 },
        );
      else {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers))
          if (value)
            headers[key] = Array.isArray(value) ? value.join(",") : value;
        response = await runtime.dispatchFetch(
          "http://" + host + (req.url ?? "/"),
          {
            method: req.method,
            headers,
            ...(bytes.length ? { body: bytes } : {}),
          },
        );
        if (path === "/v1/roblox/config" && req.method === "GET" && response.ok)
          response = Response.json({
            ...((await response.json()) as object),
            simulation: true,
          });
        if (
          path === "/v1/roblox/login" &&
          ["POST", "GET"].includes(req.method ?? "") &&
          response.ok
        ) {
          const result = (await response.clone().json()) as {
            authorizationUrl?: string;
            accountToken?: string;
          };
          if (req.method === "POST" && result.authorizationUrl) {
            const state = new URL(result.authorizationUrl).searchParams.get(
              "state",
            )!;
            if (holdNext) {
              held = { state };
              holdNext = false;
            } else await callback(state, denyNext);
            denyNext = false;
          }
          if (result.accountToken) accountToken = result.accountToken;
        }
        if (
          path === "/v1/roblox/account" &&
          req.method === "GET" &&
          response.ok
        ) {
          const token = req.headers.authorization?.replace(/^Bearer /, "");
          if (token && /^[a-f0-9]{64}$/.test(token)) accountToken = token;
        }
      }
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      responseHeaders["access-control-allow-origin"] = "*";
      responseHeaders["cache-control"] = "no-store";
      res.writeHead(response.status, responseHeaders);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Simulated QA action failed." }));
    }
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", ok);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No QA listener");
  const origin = "http://localhost:" + address.port;
  const preflight = await fetch(origin + "/v1/roblox/config", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5189",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  if (
    preflight.status !== 204 ||
    (await preflight.text()) !== "" ||
    preflight.headers.get("Access-Control-Allow-Origin") !== "*"
  ) {
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
    await runtime.dispose();
    throw Error("QA startup preflight failed");
  }
  return {
    origin,
    counts,
    control,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
      await runtime.dispose();
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const service = await createSignInQaService(
    5265,
    process.env.FRAMEBRIDGE_SIGN_IN_QA_STATE ??
      ".artifacts/sign-in-recovery/worker-state-" + Date.now(),
  );
  console.log(
    "Local simulated sign-in QA ready: " +
      service.origin +
      "/__qa. Provider network is disabled; no credentials are printed.",
  );
  const stop = async () => {
    await service.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}
