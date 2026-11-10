// Local developer QA only. All provider responses and identities are simulated.
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { oauthConfig, tokenResponse } from "../tests/roblox-oauth-fixture";
const origin = "http://localhost:5262",
  output = ".artifacts/review-sync";
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import worker,{RelayRoom} from "./packages/relay/cloudflare/worker.ts";
  export {RelayRoom};export default {async fetch(r,e){
    const url=new URL(r.url);
    if(url.pathname==='/v1/roblox/config'&&r.method==='GET')return Response.json({available:true,simulation:true},{headers:{'Access-Control-Allow-Origin':'*'}});
    const response=await worker.fetch(r,e);
    if(url.pathname==='/v1/roblox/login'&&r.method==='POST'&&response.ok){
      const login=await response.clone().json(),state=new URL(login.authorizationUrl).searchParams.get('state');
      const callback=await worker.fetch(new Request('http://localhost:5262/oauth/roblox/callback?code=local-qa-code&state='+encodeURIComponent(state)),e);
      console.log('QA callback status',callback.status);
    }
    console.log('QA route',r.method,url.pathname,response.status);
    return response;
  }};`,
    resolveDir: process.cwd(),
    sourcefile: "review-qa.ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["node:*", "cloudflare:workers"],
  write: false,
  logLevel: "silent",
});
let number = 0;
const access = "local-review-qa-private-invitation-1234567890123456";
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "review-qa",
    modules: true,
    script: bundle.outputFiles[0].text,
    port: 5262,
    host: "127.0.0.1",
    compatibilityDate: "2026-10-01",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: { RELAY: { className: "RelayRoom", useSQLite: true } },
    resourcePersistencePath: output + "/worker-state-" + Date.now(),
    telemetry: { enabled: false },
    bindings: {
      BETA_ACCESS_HASHES: createHash("sha256").update(access).digest("hex"),
      ROBLOX_OAUTH_CLIENT_ID: oauthConfig.clientId,
      ROBLOX_OAUTH_CLIENT_SECRET: oauthConfig.clientSecret,
      ROBLOX_OAUTH_REDIRECT_URI: origin + "/oauth/roblox/callback",
      ROBLOX_OAUTH_SEALING_KEY: oauthConfig.sealingKey,
    },
    outboundService: async (request) => {
      const p = new URL(request.url).pathname.split("/oauth/v1/")[1];
      if (p === "token") return Response.json(tokenResponse(++number));
      if (p === "userinfo")
        return Response.json({
          sub: "123",
          preferred_username: "SimulatedCreator",
          name: "Simulated Creator",
        });
      if (p === "token/resources")
        return Response.json({
          resource_infos: [
            {
              owner: { id: "123", type: "User" },
              resources: { creator: { ids: ["U", "G456"] } },
            },
          ],
        });
      if (p === "token/revoke") return new Response(null, { status: 204 });
      throw new Error("Unexpected QA outbound request");
    },
  }),
);
await runtime.ready;
const call = async (path: string, token = "", body?: unknown) => {
  const response = await runtime.dispatchFetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      "X-Framebridge-Beta": access,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error("QA bootstrap failed " + response.status);
  return response.headers.get("Content-Type")?.includes("json")
    ? response.json()
    : response.text();
};
const accounts = [];
// Keep one of the beta's two OAuth slots free for visible browser sign-in.
for (let i = 0; i < 1; i++) {
  const login = (await call("/v1/roblox/login", "", {})) as any;
  const ready = (await call("/v1/roblox/login", login.loginToken)) as any;
  if (ready.status !== "ready")
    throw new Error("Simulated identity did not connect");
  await call("/v1/roblox/login/complete", login.loginToken, {});
  accounts.push({ origin, accountToken: ready.accountToken });
}
await writeFile(
  output + "/session.json",
  JSON.stringify({ simulation: true, accounts }),
  { mode: 0o600 },
);
console.log(
  "Local simulated review service ready at " +
    origin +
    "; one QA peer capability saved privately in " +
    output +
    "/session.json.",
);
const stop = async () => {
  await runtime.dispose();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
await new Promise(() => {});
