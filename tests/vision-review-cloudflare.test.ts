import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { oauthConfig, oauthHash, tokenResponse } from "./roblox-oauth-fixture";
import {
  visionEnv,
  visionRequest,
  simulatedVisionResult,
  providerResponse,
} from "./vision-review-fixtures";
const invite = "vision-local-private-invitation-1234567890123456",
  other = "vision-other-private-invitation-1234567890123456";
let script: string, directory: string;
const runtimes = new Set<Miniflare>();
beforeAll(async () => {
  script = (
    await build({
      stdin: {
        // Test-only gates hold an actual HTTP body/alarm boundary; production
        // authorization, provider dispatch and SQLite quota code stay intact.
        contents: `import {DurableObject} from "cloudflare:workers";
          import {RelayRoom} from "./packages/relay/cloudflare/worker.ts";
          export {default} from "./packages/relay/cloudflare/worker.ts";
          export class InspectableRelayRoom extends DurableObject {
            constructor(ctx,env) {
              super(ctx,env); this.room=new RelayRoom(ctx,env); this.storage=ctx.storage;
              this.starts=0; this.cancels=0; this.held=0; this.hold=false; this.release=undefined;
              const schedule=this.room.scheduleAlarm.bind(this.room);
              this.room.scheduleAlarm=async()=>{
                await schedule();
                if(this.hold) {
                  this.hold=false; this.held++;
                  await new Promise(resolve=>this.release=resolve);
                }
              };
            }
            async fetch(r) {
              const url=new URL(r.url);
              if(url.pathname==="/__qa__/vision/state") return Response.json({starts:this.starts,cancels:this.cancels,held:this.held,alarm:await this.storage.getAlarm()});
              if(url.pathname==="/__qa__/vision/cleanup") {await this.room.alarm();return Response.json({ok:true});}
              if(url.pathname==="/__qa__/vision/alarm") {
                if(url.searchParams.get("mode")==="hold") this.hold=true;
                else {this.release?.();this.release=undefined;}
                return Response.json({ok:true});
              }
              if(url.pathname==="/v1/vision-review" && r.method==="POST") this.starts++;
              if(url.pathname==="/v1/vision-review/cancel" && r.method==="POST") this.cancels++;
              return this.room.fetch(r);
            }
            alarm(){return this.room.alarm();}
          }`,
        resolveDir: process.cwd(),
        sourcefile: "vision-test.ts",
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      external: ["node:*", "cloudflare:workers"],
      write: false,
      logLevel: "silent",
    })
  ).outputFiles[0].text;
  directory = await mkdtemp(join(tmpdir(), "framebridge-vision-"));
});
afterAll(async () => {
  await Promise.all([...runtimes].map((r) => r.dispose()));
  await rm(directory, { recursive: true, force: true });
});
type Provider = {
  number: number;
  userId: string;
  users: Map<string, string>;
  requests: any[];
  mode: "ok" | "fail" | "wait";
  waiting: Array<(response: Response) => void>;
  holdRevoke: boolean;
  revokes: Array<() => void>;
};
async function start(
  name: string,
  settings: Record<string, string> = visionEnv,
  provider: Provider = {
    number: 0,
    userId: "123",
    users: new Map(),
    requests: [],
    mode: "ok",
    waiting: [],
    holdRevoke: false,
    revokes: [],
  },
  access = [invite, other],
) {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: "vision-test",
      modules: true,
      script,
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        RELAY: { className: "InspectableRelayRoom", useSQLite: true },
      },
      resourcePersistencePath: join(directory, name),
      telemetry: { enabled: false },
      unsafeInspectDurableObjects: true,
      bindings: {
        BETA_ACCESS_HASHES: access.map(oauthHash).join(","),
        ROBLOX_OAUTH_CLIENT_ID: oauthConfig.clientId,
        ROBLOX_OAUTH_CLIENT_SECRET: oauthConfig.clientSecret,
        ROBLOX_OAUTH_REDIRECT_URI: oauthConfig.redirectUri,
        ROBLOX_OAUTH_SEALING_KEY: oauthConfig.sealingKey,
        ...settings,
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        if (url.origin === "https://api.openai.com") {
          expect(url.pathname).toBe("/v1/responses");
          expect(request.headers.get("Authorization")).toBe(
            "Bearer local-simulated-provider-key",
          );
          const body = (await request.json()) as any;
          provider.requests.push(body);
          if (provider.mode === "wait")
            return new Promise<Response>((resolve) =>
              provider.waiting.push(resolve),
            ) as any;
          if (provider.mode === "fail")
            return new Response("private-image provider-key details", {
              status: 429,
            });
          const layers = JSON.parse(body.input[0].content[0].text).layers;
          return providerResponse(simulatedVisionResult(layers));
        }
        const endpoint = url.pathname.split("/oauth/v1/")[1];
        if (endpoint === "token") {
          const value = tokenResponse(++provider.number);
          provider.users.set(value.access_token, provider.userId);
          return Response.json(value);
        }
        if (endpoint === "userinfo") {
          const id = provider.users.get(
            request.headers.get("Authorization")!.slice(7),
          );
          return Response.json({
            sub: id,
            preferred_username: "Creator" + id,
            name: "Creator " + id,
          });
        }
        if (endpoint === "token/resources") {
          const parameters = new URLSearchParams(await request.text());
          const userId = provider.users.get(parameters.get("token")!);
          return Response.json({
            resource_infos: [
              {
                owner: { id: userId, type: "User" },
                resources: { creator: { ids: ["U"] } },
              },
            ],
          });
        }
        if (endpoint === "token/revoke") {
          if (provider.holdRevoke)
            await new Promise<void>((resolve) =>
              provider.revokes.push(resolve),
            );
          return new Response(null, { status: 204 });
        }
        throw new Error("Unexpected outbound request " + request.url);
      },
    }),
  );
  runtimes.add(runtime);
  const base = (await runtime.ready).origin;
  const call = async (
    path: string,
    token = "",
    body?: unknown,
    method?: string,
    accessCode?: string,
    extraHeaders: Record<string, string> = {},
  ) => {
    const response = await fetch(base + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        Connection: "close",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(accessCode ? { "X-Framebridge-Beta": accessCode } : {}),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: response.headers.get("Content-Type")?.includes("json")
        ? JSON.parse(text)
        : text,
    };
  };
  const login = async (
    userId = "123",
    accessCode = invite,
    previous?: string,
  ) => {
    provider.userId = userId;
    const login = (
      await call(
        "/v1/roblox/login",
        "",
        {},
        undefined,
        accessCode,
        previous ? { "X-Framebridge-Roblox-Account": previous } : {},
      )
    ).body;
    expect(login.authorizationUrl).toBeTypeOf("string");
    const state = new URL(login.authorizationUrl).searchParams.get("state");
    expect(
      (
        await runtime.dispatchFetch(
          "https://relay.test/oauth/roblox/callback?code=local-vision-code&state=" +
            state,
        )
      ).status,
    ).toBe(200);
    const ready = (await call("/v1/roblox/login", login.loginToken)).body;
    expect(ready.status).toBe("ready");
    return {
      loginToken: login.loginToken as string,
      accountToken: ready.accountToken as string,
    };
  };
  const account = async (userId = "123", accessCode = invite) => {
    const ready = await login(userId, accessCode);
    expect(
      (await call("/v1/roblox/login/complete", ready.loginToken, {})).status,
    ).toBe(200);
    return ready.accountToken;
  };
  const delayedBody = (
    token: string,
    body: unknown,
    path = "/v1/vision-review",
  ) => {
    const payload = JSON.stringify(body);
    let outgoing!: ReturnType<typeof httpRequest>;
    const result = new Promise<{ status: number; body: any }>(
      (resolve, reject) => {
        outgoing = httpRequest(
          base + path,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
              Connection: "close",
            },
          },
          (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              text += chunk;
            });
            response.on("end", () =>
              resolve({ status: response.statusCode!, body: JSON.parse(text) }),
            );
            response.on("error", reject);
          },
        );
        outgoing.on("error", reject);
        outgoing.write(payload.slice(0, -1));
      },
    );
    return { result, finish: () => outgoing.end(payload.slice(-1)) };
  };
  const sql = () =>
    runtime.unsafeGetDurableObjectStorage(
      "vision-test",
      "InspectableRelayRoom",
      { name: "private-beta-v1" },
    );
  const close = async () => {
    await runtime.dispose();
    runtimes.delete(runtime);
  };
  return { runtime, provider, call, account, login, delayedBody, sql, close };
}
describe("private vision service through real HTTP and durable SQLite", () => {
  it("requires account authorization, defaults off, and refuses client provider configuration", async () => {
    const r = await start("disabled", { ...visionEnv, VISION_ENABLED: "0" }),
      token = await r.account();
    expect((await r.call("/v1/vision-review/config")).status).toBe(401);
    expect((await r.call("/v1/vision-review/config", token)).body).toEqual({
      available: false,
    });
    expect(
      (await r.call("/v1/vision-review", token, visionRequest())).status,
    ).toBe(503);
    expect(r.provider.requests).toHaveLength(0);
    await r.close();
    const enabled = await start("permissions"),
      auth = await enabled.account();
    expect(
      (
        await enabled.call("/v1/vision-review/cancel", auth, {
          id: [crypto.randomUUID()],
        })
      ).status,
    ).toBe(400);
    expect(
      await (await enabled.sql()).exec("SELECT * FROM vision_cancellations"),
    ).toHaveLength(0);
    const payload: any = visionRequest();
    payload.provider = { url: "https://evil.test", key: "secret" };
    expect(
      (await enabled.call("/v1/vision-review", auth, payload)).status,
    ).toBe(400);
    payload.provider = undefined;
    payload.consent.metadata = false;
    expect(
      (await enabled.call("/v1/vision-review", auth, payload)).status,
    ).toBe(400);
    expect(enabled.provider.requests).toHaveLength(0);
    await enabled.call("/v1/roblox/account", auth, undefined, "DELETE");
    expect((await enabled.call("/v1/vision-review/config", auth)).status).toBe(
      401,
    );
    await enabled.close();
  });
  it("reserves cost atomically, prevents replay, isolates daily user allowances, and retains failed charges", async () => {
    const r = await start("quota", {
        ...visionEnv,
        VISION_DAILY_USER_COST_MICROS: "11060",
      }),
      token = await r.account(),
      peer = await r.account();
    const request = visionRequest();
    request.maxCostMicros = 1;
    expect((await r.call("/v1/vision-review", token, request)).status).toBe(
      403,
    );
    expect(r.provider.requests).toHaveLength(0);
    request.maxCostMicros = 20000;
    const first = await r.call("/v1/vision-review", token, request);
    expect(first.status).toBe(200);
    expect(first.body.reservedCostMicros).toBe(5530);
    expect((await r.call("/v1/vision-review", token, request)).status).toBe(
      409,
    );
    expect(r.provider.requests).toHaveLength(1);
    r.provider.mode = "fail";
    const failed = await r.call("/v1/vision-review", peer, visionRequest());
    expect(failed.status).toBe(429);
    expect(JSON.stringify(failed.body)).not.toMatch(
      /private-image|provider-key/,
    );
    r.provider.mode = "ok";
    expect(
      (await r.call("/v1/vision-review", token, visionRequest())).status,
    ).toBe(429);
    expect(r.provider.requests).toHaveLength(2);
    expect(
      (await r.call("/v1/vision-review/config", token)).body
        .remainingCostMicros,
    ).toBe(0);
    const storage = await r.sql(),
      rows = await storage.exec("SELECT * FROM vision_budget");
    expect(rows).toHaveLength(3);
    expect(
      rows.find((row: any) => row.scope.includes(":user:"))?.scope,
    ).toMatch(/:user:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(
      rows.every((row: any) => row.count === 2 && row.cost === 11060),
    ).toBe(true);
    const attempts = await storage.exec("SELECT * FROM vision_attempts");
    expect(attempts).toHaveLength(2);
    expect(JSON.stringify(attempts)).not.toMatch(
      /screenshot|layers|image|summary|ClaimButton|local-simulated/,
    );
    await r.close();
  });
  it("supports cancellation only by the requesting account, discards late replies and preserves reservation", async () => {
    const r = await start("cancel"),
      token = await r.account(),
      peer = await r.account();
    r.provider.mode = "wait";
    const request = visionRequest(),
      pending = r.call("/v1/vision-review", token, request);
    await expect.poll(() => r.provider.waiting.length).toBe(1);
    expect(
      (await r.call("/v1/vision-review/cancel", peer, { id: request.id }))
        .status,
    ).toBe(200); // A peer can suppress only its own account-scoped copy of this ID.
    expect(
      (await (await r.sql()).exec("SELECT state FROM vision_attempts"))[0]
        .state,
    ).toBe("pending");
    expect(
      (await r.call("/v1/vision-review/cancel", token, { id: request.id })).body
        .cancelled,
    ).toBe(true);
    r.provider.waiting[0](
      providerResponse(simulatedVisionResult(request.layers)),
    );
    expect((await pending).status).not.toBe(200);
    const storage = await r.sql();
    expect(
      (await storage.exec("SELECT state FROM vision_attempts"))[0].state,
    ).toBe("cancelled");
    expect(
      (await r.call("/v1/vision-review/config", token)).body.remainingRequests,
    ).toBe(9);
    const second = visionRequest(),
      disconnected = r.call("/v1/vision-review", peer, second);
    await expect.poll(() => r.provider.waiting.length).toBe(2);
    expect(
      (await r.call("/v1/roblox/account", peer, undefined, "DELETE")).status,
    ).toBe(200);
    r.provider.waiting[1](
      providerResponse(simulatedVisionResult(second.layers)),
    );
    expect((await disconnected).status).not.toBe(200);
    expect((await r.call("/v1/vision-review/config", peer)).status).toBe(401);
    await r.close();
  });
  it("rejects a delayed review and cancellation body after local disconnect while provider revoke is stalled", async () => {
    const r = await start("delayed-disconnect"),
      token = await r.account();
    const review = r.delayedBody(token, visionRequest());
    const cancel = r.delayedBody(
      token,
      { id: crypto.randomUUID() },
      "/v1/vision-review/cancel",
    );
    await expect
      .poll(async () => (await r.call("/__qa__/vision/state")).body.starts)
      .toBe(1);
    await expect
      .poll(async () => (await r.call("/__qa__/vision/state")).body.cancels)
      .toBe(1);
    r.provider.holdRevoke = true;
    const disconnect = r.call("/v1/roblox/account", token, undefined, "DELETE");
    await expect.poll(() => r.provider.revokes.length).toBe(1);
    expect((await r.call("/v1/vision-review/config", token)).status).toBe(401);
    review.finish();
    cancel.finish();
    const rejected = await Promise.all([review.result, cancel.result]);
    expect(rejected.every((v) => v.status === 401 && !v.body.result)).toBe(
      true,
    );
    expect(r.provider.requests).toHaveLength(0);
    const storage = await r.sql();
    expect(await storage.exec("SELECT * FROM vision_budget")).toHaveLength(0);
    expect(await storage.exec("SELECT * FROM vision_attempts")).toHaveLength(0);
    expect(
      await storage.exec("SELECT * FROM vision_cancellations"),
    ).toHaveLength(0);
    r.provider.revokes[0]();
    expect((await disconnect).status).toBe(200);
    await r.close();
  });
  it("aborts owned pending review before a stalled provider revoke returns and retains its reservation", async () => {
    const r = await start("early-disconnect"),
      token = await r.account(),
      request = visionRequest();
    expect(
      (
        await r.call("/v1/review-sync/connect", token, {
          scope: "personal",
          consent: true,
        })
      ).status,
    ).toBe(201);
    r.provider.mode = "wait";
    const pending = r.call("/v1/vision-review", token, request);
    await expect.poll(() => r.provider.waiting.length).toBe(1);
    r.provider.holdRevoke = true;
    const disconnect = r.call("/v1/roblox/account", token, undefined, "DELETE");
    await expect.poll(() => r.provider.revokes.length).toBe(1);
    const storage = await r.sql();
    expect(
      (await storage.exec("SELECT state FROM vision_attempts"))[0].state,
    ).toBe("cancelled");
    expect(await storage.exec("SELECT * FROM review_grants")).toHaveLength(0);
    expect(
      (await storage.exec("SELECT count,cost FROM vision_budget")).every(
        (v: any) => v.count === 1 && v.cost === 5530,
      ),
    ).toBe(true);
    r.provider.waiting[0](
      providerResponse(simulatedVisionResult(request.layers)),
    );
    const rejected = await pending;
    expect(rejected.status).toBe(408);
    expect(rejected.body.result).toBeUndefined();
    expect(rejected.body.error).toMatch(/cancelled/);
    expect(r.provider.requests).toHaveLength(1);
    r.provider.revokes[0]();
    expect((await disconnect).status).toBe(200);
    await r.close();
  });
  it.each(["replacement", "unacknowledged cancellation"] as const)(
    "synchronously clears only the removed account's private work during %s while provider revoke is stalled",
    async (kind) => {
      const r = await start("remove-" + kind),
        original = await r.account();
      const originalGrant = await r.call("/v1/review-sync/connect", original, {
        scope: "personal",
        consent: true,
      });
      expect(originalGrant.status).toBe(201);
      const pendingLogin = await r.login("456", invite, original);
      const newGrant = await r.call(
        "/v1/review-sync/connect",
        pendingLogin.accountToken,
        { scope: "personal", consent: true },
      );
      expect(newGrant.status).toBe(201);
      const removed =
        kind === "replacement" ? original : pendingLogin.accountToken;
      const retained =
        kind === "replacement" ? pendingLogin.accountToken : original;
      const retainedGrant = kind === "replacement" ? newGrant : originalGrant;
      const request = visionRequest();
      r.provider.mode = "wait";
      const review = r.call("/v1/vision-review", removed, request);
      await expect.poll(() => r.provider.waiting.length).toBe(1);
      r.provider.holdRevoke = true;
      const removal =
        kind === "replacement"
          ? r.call("/v1/roblox/login/complete", pendingLogin.loginToken, {})
          : r.call(
              "/v1/roblox/login",
              pendingLogin.loginToken,
              undefined,
              "DELETE",
            );
      await expect.poll(() => r.provider.revokes.length).toBe(1);
      const storage = await r.sql();
      const accountRows = await storage.exec("SELECT id FROM oauth_accounts");
      expect(accountRows.map((row: any) => row.id)).toEqual([
        oauthHash(retained),
      ]);
      const grants = await storage.exec("SELECT account FROM review_grants");
      expect(grants.map((row: any) => row.account)).toEqual([
        oauthHash(retained),
      ]);
      expect(
        (await storage.exec("SELECT state FROM vision_attempts"))[0].state,
      ).toBe("cancelled");
      expect((await r.call("/v1/vision-review/config", removed)).status).toBe(
        401,
      );
      expect((await r.call("/v1/vision-review/config", retained)).status).toBe(
        200,
      );
      expect(
        (
          await r.call(
            "/v1/review-sync",
            retained,
            undefined,
            "GET",
            undefined,
            { "X-Framebridge-Review-Grant": retainedGrant.body.grantToken },
          )
        ).status,
      ).toBe(200);
      r.provider.waiting[0](
        providerResponse(simulatedVisionResult(request.layers)),
      );
      const rejected = await review;
      expect(rejected.status).toBe(408);
      expect(rejected.body.result).toBeUndefined();
      expect(r.provider.requests).toHaveLength(1);
      expect(
        (await storage.exec("SELECT count,cost FROM vision_budget")).every(
          (row: any) => row.count === 1 && row.cost === 5530,
        ),
      ).toBe(true);
      r.provider.revokes[0]();
      expect((await removal).status).toBe(200);
      await r.close();
    },
  );
  it("persists account-scoped cancel-before-body tombstones without charging and cleans their expiry", async () => {
    let r = await start("cancel-before-body"),
      token = await r.account(),
      request = visionRequest();
    const delayed = r.delayedBody(token, request);
    await expect
      .poll(async () => (await r.call("/__qa__/vision/state")).body.starts)
      .toBe(1);
    expect(
      (await r.call("/v1/vision-review/cancel", token, { id: request.id }))
        .status,
    ).toBe(200);
    delayed.finish();
    expect((await delayed.result).status).toBe(409);
    expect(r.provider.requests).toHaveLength(0);
    let storage = await r.sql();
    expect(await storage.exec("SELECT * FROM vision_budget")).toHaveLength(0);
    expect(await storage.exec("SELECT * FROM vision_attempts")).toHaveLength(0);
    const tombstones = await storage.exec("SELECT * FROM vision_cancellations");
    expect(tombstones).toHaveLength(1);
    expect(JSON.stringify(tombstones)).not.toMatch(
      /screenshot|layers|ClaimButton|local-simulated|review-root/,
    );
    expect(Number(tombstones[0].expires)).toBeGreaterThan(
      Date.now() + 86300000,
    );
    expect((await r.call("/__qa__/vision/state")).body.alarm).toBe(
      Number(tombstones[0].expires),
    );
    const provider = r.provider;
    await r.close();
    r = await start("cancel-before-body", visionEnv, provider);
    expect((await r.call("/v1/vision-review", token, request)).status).toBe(
      409,
    );
    const peer = await r.account("456");
    expect((await r.call("/v1/vision-review", peer, request)).status).toBe(200);
    expect(provider.requests).toHaveLength(1);
    storage = await r.sql();
    await storage.exec("UPDATE vision_cancellations SET expires=1");
    // Invoke the production alarm retention path, not a test-only deletion.
    expect((await r.call("/__qa__/vision/cleanup")).status).toBe(200);
    expect(
      await storage.exec("SELECT * FROM vision_cancellations"),
    ).toHaveLength(0);
    expect((await r.call("/v1/vision-review", token, request)).status).toBe(
      200,
    );
    expect(provider.requests).toHaveLength(2);
    await r.close();
  });
  it("cancels after reservation while alarm scheduling is held, before provider dispatch", async () => {
    const r = await start("cancel-during-alarm"),
      token = await r.account(),
      request = visionRequest();
    await r.call("/__qa__/vision/alarm?mode=hold");
    const pending = r.call("/v1/vision-review", token, request);
    await expect
      .poll(async () => (await r.call("/__qa__/vision/state")).body.held)
      .toBe(1);
    expect(
      (await r.call("/v1/vision-review/cancel", token, { id: request.id }))
        .status,
    ).toBe(200);
    expect(r.provider.requests).toHaveLength(0);
    await r.call("/__qa__/vision/alarm?mode=release");
    const cancelled = await pending;
    expect(cancelled.status).toBe(408);
    expect(cancelled.body.result).toBeUndefined();
    expect(
      (await r.call("/v1/vision-review/config", token)).body.remainingRequests,
    ).toBe(9);
    const storage = await r.sql();
    expect(
      (await storage.exec("SELECT state FROM vision_attempts"))[0].state,
    ).toBe("cancelled");
    expect(
      (await storage.exec("SELECT count,cost FROM vision_budget")).every(
        (v: any) => v.count === 1 && v.cost === 5530,
      ),
    ).toBe(true);
    expect(
      await storage.exec("SELECT * FROM vision_cancellations"),
    ).toHaveLength(0);
    expect(r.provider.requests).toHaveLength(0);
    await r.close();
  });
  it("rechecks account expiry after alarm scheduling before provider dispatch", async () => {
    const r = await start("expiry-during-alarm"),
      token = await r.account(),
      request = visionRequest();
    await r.call("/__qa__/vision/alarm?mode=hold");
    const pending = r.call("/v1/vision-review", token, request);
    await expect
      .poll(async () => (await r.call("/__qa__/vision/state")).body.held)
      .toBe(1);
    const storage = await r.sql();
    await storage.exec(
      "UPDATE oauth_accounts SET expires=1,data=json_set(data,'$.expires',1)",
    );
    await r.call("/__qa__/vision/alarm?mode=release");
    const expired = await pending;
    expect(expired.status).toBe(401);
    expect(expired.body.result).toBeUndefined();
    expect(r.provider.requests).toHaveLength(0);
    expect(
      (await storage.exec("SELECT state FROM vision_attempts"))[0].state,
    ).toBe("failed");
    expect(
      (await storage.exec("SELECT count,cost FROM vision_budget")).every(
        (v: any) => v.count === 1 && v.cost === 5530,
      ),
    ).toBe(true);
    await r.close();
  });
  it("bounds unadmitted cancellation records atomically without blocking cancellation of charged work", async () => {
    const r = await start("cancel-bounds"),
      token = await r.account();
    const ids = Array.from({ length: 11 }, () => crypto.randomUUID());
    const results = await Promise.all(
      ids.map((id) => r.call("/v1/vision-review/cancel", token, { id })),
    );
    expect(results.filter((v) => v.status === 200)).toHaveLength(10);
    expect(results.filter((v) => v.status === 429)).toHaveLength(1);
    const storage = await r.sql(),
      rows = await storage.exec("SELECT * FROM vision_cancellations");
    expect(rows).toHaveLength(10);
    expect(await storage.exec("SELECT * FROM vision_budget")).toHaveLength(0);
    const successfulId = ids[results.findIndex((v) => v.status === 200)];
    expect(
      (await r.call("/v1/vision-review/cancel", token, { id: successfulId }))
        .status,
    ).toBe(200);
    const request = visionRequest();
    r.provider.mode = "wait";
    const pending = r.call("/v1/vision-review", token, request);
    await expect.poll(() => r.provider.waiting.length).toBe(1);
    expect(
      (await r.call("/v1/vision-review/cancel", token, { id: request.id }))
        .status,
    ).toBe(200);
    r.provider.waiting[0](
      providerResponse(simulatedVisionResult(request.layers)),
    );
    expect((await pending).status).toBe(408);
    expect(
      await storage.exec("SELECT * FROM vision_cancellations"),
    ).toHaveLength(10);
    // Synthetic opaque rows exercise aggregate limits without bypassing the
    // service's unrelated two-account-per-invitation sign-in capacity.
    await storage.exec(
      "UPDATE vision_cancellations SET user=?",
      oauthHash("other-user"),
    );
    for (let i = 10; i < 50; i++)
      await storage.exec(
        "INSERT INTO vision_cancellations VALUES (?,?,?,?,?)",
        oauthHash("invite-cancel" + i),
        rows[0].account,
        rows[0].invite,
        oauthHash("user" + i),
        Date.now() + 86400000,
      );
    expect(
      (
        await r.call("/v1/vision-review/cancel", token, {
          id: crypto.randomUUID(),
        })
      ).status,
    ).toBe(429);
    await storage.exec(
      "UPDATE vision_cancellations SET invite=?",
      oauthHash(other),
    );
    for (let i = 50; i < 200; i++)
      await storage.exec(
        "INSERT INTO vision_cancellations VALUES (?,?,?,?,?)",
        oauthHash("global-cancel" + i),
        rows[0].account,
        oauthHash(other),
        oauthHash("user" + i),
        Date.now() + 86400000,
      );
    expect(
      (
        await r.call("/v1/vision-review/cancel", token, {
          id: crypto.randomUUID(),
        })
      ).status,
    ).toBe(429);
    expect(
      await storage.exec("SELECT * FROM vision_cancellations"),
    ).toHaveLength(200);
    expect(r.provider.requests).toHaveLength(1);
    await r.close();
  });
  it("persists quotas/replays across restart and rejects revoked private invitations", async () => {
    let r = await start("restart"),
      token = await r.account(),
      request = visionRequest();
    expect((await r.call("/v1/vision-review", token, request)).status).toBe(
      200,
    );
    const provider = r.provider;
    await r.close();
    r = await start("restart", visionEnv, provider);
    expect(
      (await r.call("/v1/vision-review/config", token)).body.remainingRequests,
    ).toBe(9);
    expect((await r.call("/v1/vision-review", token, request)).status).toBe(
      409,
    );
    await r.close();
    r = await start("restart", visionEnv, provider, [other]);
    expect((await r.call("/v1/vision-review/config", token)).status).toBe(401);
    expect(provider.requests).toHaveLength(1);
    await r.close();
  });
  it("bounds request bytes and concurrent admission before any provider work", async () => {
    const r = await start("bounds"),
      token = await r.account();
    expect(
      (
        await r.call("/v1/vision-review", token, {
          ...visionRequest(),
          image: "x".repeat(740001),
        })
      ).status,
    ).toBe(413);
    expect(r.provider.requests).toHaveLength(0);
    r.provider.mode = "wait";
    const requests = Array.from({ length: 3 }, () => visionRequest()),
      pending = requests.map((request) =>
        r.call("/v1/vision-review", token, request),
      );
    await expect.poll(() => r.provider.waiting.length).toBe(3);
    expect(
      (await r.call("/v1/vision-review", token, visionRequest())).status,
    ).toBe(429);
    expect(r.provider.requests).toHaveLength(3);
    r.provider.waiting.forEach((resolve, i) =>
      resolve(providerResponse(simulatedVisionResult(requests[i].layers))),
    );
    expect((await Promise.all(pending)).every((v) => v.status === 200)).toBe(
      true,
    );
    await r.close();
  });
  it("enforces invitation/global cost caps atomically and cleans expired opaque records", async () => {
    const r = await start("aggregate-cost"),
      token = await r.account(),
      request = visionRequest();
    expect((await r.call("/v1/vision-review", token, request)).status).toBe(
      200,
    );
    const storage = await r.sql();
    await storage.exec(
      "UPDATE vision_budget SET cost=500000 WHERE scope LIKE '%:invite:%'",
    );
    expect(
      (await r.call("/v1/vision-review", token, visionRequest())).status,
    ).toBe(429);
    expect(r.provider.requests).toHaveLength(1);
    expect(await storage.exec("SELECT * FROM vision_attempts")).toHaveLength(1);
    await storage.exec(
      "UPDATE vision_budget SET cost=5530 WHERE scope LIKE '%:invite:%'",
    );
    await storage.exec(
      "UPDATE vision_budget SET cost=1000000 WHERE scope LIKE '%:global'",
    );
    expect(
      (await r.call("/v1/vision-review", token, visionRequest())).status,
    ).toBe(429);
    expect(r.provider.requests).toHaveLength(1);
    await storage.exec("UPDATE vision_attempts SET expires=1");
    await storage.exec("UPDATE vision_budget SET expires=1");
    // OAuth admission invokes the production retention path; only quota/opaque records are removed.
    expect(
      (await r.call("/v1/roblox/login", "", {}, undefined, invite)).status,
    ).toBe(201);
    expect(await storage.exec("SELECT * FROM vision_attempts")).toHaveLength(0);
    expect(await storage.exec("SELECT * FROM vision_budget")).toHaveLength(0);
    await r.close();
  });
});
