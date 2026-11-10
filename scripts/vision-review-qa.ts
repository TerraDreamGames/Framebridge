// Local developer QA only: outbound service intercepts every request and never contacts a real provider.
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { oauthConfig, tokenResponse } from "../tests/roblox-oauth-fixture";
import {
  visionEnv,
  simulatedVisionResult,
  providerResponse,
} from "../tests/vision-review-fixtures";
const origin = "http://localhost:5268",
  output = ".artifacts/vision-review";
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import worker,{RelayRoom} from "./packages/relay/cloudflare/worker.ts";export {RelayRoom};export default {async fetch(r,e){
 const url=new URL(r.url);if(url.pathname==='/v1/roblox/config'&&r.method==='GET')return Response.json({available:true,simulation:true},{headers:{'Access-Control-Allow-Origin':'*'}});
 const response=await worker.fetch(r,e);
 if(url.pathname==='/v1/roblox/login'&&r.method==='POST'&&response.ok){const login=await response.clone().json(),state=new URL(login.authorizationUrl).searchParams.get('state');await worker.fetch(new Request('${origin}/oauth/roblox/callback?code=simulated-vision-code&state='+encodeURIComponent(state)),e);}
 if(url.pathname==='/v1/vision-review/config'&&r.method==='GET'&&response.ok)return Response.json({...await response.json(),simulation:true},{headers:{'Access-Control-Allow-Origin':'*'}});
 console.log('Vision QA route',r.method,url.pathname,response.status);return response;
 }};`,
    resolveDir: process.cwd(),
    sourcefile: "vision-qa.ts",
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
  mode = "ok";
const access = "local-vision-qa-private-invitation-1234567890123456";
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "vision-qa",
    modules: true,
    script: bundle.outputFiles[0].text,
    port: 5268,
    host: "127.0.0.1",
    compatibilityDate: "2026-10-01",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: { RELAY: { className: "RelayRoom", useSQLite: true } },
    resourcePersistencePath:
      process.env.FRAMEBRIDGE_VISION_QA_STATE ||
      output + "/worker-state-" + Date.now(),
    telemetry: { enabled: false },
    bindings: {
      BETA_ACCESS_HASHES: createHash("sha256").update(access).digest("hex"),
      ROBLOX_OAUTH_CLIENT_ID: oauthConfig.clientId,
      ROBLOX_OAUTH_CLIENT_SECRET: oauthConfig.clientSecret,
      ROBLOX_OAUTH_REDIRECT_URI: origin + "/oauth/roblox/callback",
      ROBLOX_OAUTH_SEALING_KEY: oauthConfig.sealingKey,
      ...visionEnv,
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (url.origin === "https://api.openai.com") {
        const body = (await request.json()) as any,
          layers = JSON.parse(body.input[0].content[0].text).layers;
        console.log(
          "Simulated vision provider",
          layers.length,
          "layers; no real API request",
        );
        if (mode === "fail")
          return new Response("Simulated provider unavailable", {
            status: 429,
          });
        if (mode === "slow")
          await new Promise((resolve) => setTimeout(resolve, 4000));
        const result = simulatedVisionResult(layers);
        const proposals = [
          { name: "Frame 17", kind: "class", value: "TextButton" },
          { name: "Inventory list", kind: "scroll", value: "Y" },
          { name: "Inventory list", kind: "layout", value: "list-y" },
          { name: "Quick slots", kind: "layout", value: "grid" },
          { name: "Inventory panel", kind: "role", value: "panel" },
        ];
        for (const p of proposals) {
          const l = layers.find((l: any) => l.name === p.name);
          if (l)
            result.suggestions.push({
              layer: l.token,
              kind: p.kind as any,
              value: p.value,
              confidence: 0.65,
              reasons: ["Simulated evidence for explicit local correction QA."],
              related: [],
            });
        }
        return providerResponse(result);
      }
      const path = url.pathname.split("/oauth/v1/")[1];
      if (path === "token") return Response.json(tokenResponse(++number));
      if (path === "userinfo")
        return Response.json({
          sub: "123",
          preferred_username: "SimulatedVisionCreator",
          name: "Simulated Vision Creator",
        });
      if (path === "token/resources")
        return Response.json({
          resource_infos: [
            {
              owner: { id: "123", type: "User" },
              resources: { creator: { ids: ["U"] } },
            },
          ],
        });
      if (path === "token/revoke") return new Response(null, { status: 204 });
      throw new Error("Unexpected simulated outbound request");
    },
  }),
);
await runtime.ready;
for (const path of [
  "/v1/roblox/config",
  "/v1/vision-review/config",
  "/v1/vision-review",
  "/v1/vision-review/cancel",
]) {
  const response = await fetch(origin + path, {
    method: "OPTIONS",
    headers: {
      Origin: "http://127.0.0.1:5198",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  if (
    response.status !== 204 ||
    !response.headers
      .get("Access-Control-Allow-Headers")
      ?.toLowerCase()
      .includes("authorization")
  ) {
    await runtime.dispose();
    throw new Error("Simulator preflight smoke failed: " + path);
  }
}
console.log(
  "Vision QA backend ready at " +
    origin +
    "; invitation " +
    access +
    ". Provider responses and prices are simulated.",
);
// Mode is controlled locally through the terminal, never exposed by the production Worker.
process.stdin.setEncoding("utf8");
process.stdin.on("data", (data) => {
  const next = String(data).trim();
  if (["ok", "fail", "slow"].includes(next)) {
    mode = next;
    console.log("Simulated mode", mode);
  }
});
await writeFile(
  output + "/qa-origin.json",
  JSON.stringify({ origin, simulation: true }),
);
const stop = async () => {
  await runtime.dispose();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
await new Promise(() => {});
