import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readRobloxLogin,
  robloxAuthorizationUrl,
} from "../plugins/figma/src/roblox-account-storage";
import {
  oauthConfig,
  oauthHash,
  oauthProfile,
  oauthResources,
  tokenResponse,
} from "./roblox-oauth-fixture";
const invite = "oauth-local-invitation-1234567890123456",
  otherInvite = "oauth-other-invitation-1234567890123456";
// Use the existing CRC-validated image fixture from the real relay tests.
const validPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
let script: string, gatewayScript: string, directory: string;
const runtimes = new Set<Miniflare>();
beforeAll(async () => {
  const bundle = await build({
    // The inspection wrapper adds only Miniflare's test RPC capability. Production
    // fetch/alarm methods and SQLite storage are the actual RelayRoom implementation.
    stdin: {
      contents: `import { DurableObject } from "cloudflare:workers";
      import { RelayRoom } from "./packages/relay/cloudflare/worker.ts";
      export { default } from "./packages/relay/cloudflare/worker.ts";
      export class InspectableRelayRoom extends DurableObject {
        constructor(ctx, env) { super(ctx, env); this.room = new RelayRoom(ctx, env); }
        fetch(request) { return this.room.fetch(request); }
        alarm() { return this.room.alarm(); }
      }`,
      resolveDir: process.cwd(),
      sourcefile: "oauth-qa-entry.ts",
    },
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    external: ["node:*", "cloudflare:workers"],
    write: false,
    logLevel: "silent",
  });
  script = bundle.outputFiles[0].text;
  gatewayScript = (
    await build({
      entryPoints: ["packages/relay/cloudflare/oauth-gateway.ts"],
      bundle: true,
      format: "esm",
      target: "es2022",
      platform: "browser",
      external: ["node:*"],
      write: false,
      logLevel: "silent",
    })
  ).outputFiles[0].text;
  directory = await mkdtemp(join(tmpdir(), "framebridge-oauth-"));
});
afterAll(async () => {
  await Promise.all([...runtimes].map((runtime) => runtime.dispose()));
  await rm(directory, { recursive: true, force: true });
});
type Remote = {
  calls: { path: string; headers: Headers; body: URLSearchParams }[];
  number: number;
  creates: number;
  assetStatus: number;
  assetError?: unknown;
  holdAsset?: Promise<void>;
  pollStatus?: number;
  pollError?: unknown;
};
async function start(
  name: string,
  overrides: Record<string, string> = {},
  shared?: Remote,
) {
  const remote = shared ?? {
    calls: [],
    number: 0,
    creates: 0,
    assetStatus: 200,
  };
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: "oauth-test",
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
        BETA_ACCESS_HASHES: [oauthHash(invite), oauthHash(otherInvite)].join(
          ",",
        ),
        ROBLOX_OAUTH_CLIENT_ID: oauthConfig.clientId,
        ROBLOX_OAUTH_CLIENT_SECRET: oauthConfig.clientSecret,
        ROBLOX_OAUTH_REDIRECT_URI: oauthConfig.redirectUri,
        ROBLOX_OAUTH_SEALING_KEY: oauthConfig.sealingKey,
        ...overrides,
      },
      outboundService: async (request) => {
        const path = new URL(request.url).pathname,
          headers = new Headers(request.headers);
        if (path.startsWith("/oauth/v1/")) {
          const endpoint = path.slice("/oauth/v1/".length),
            body = new URLSearchParams(
              request.method === "POST" ? await request.text() : "",
            );
          remote.calls.push({ path: endpoint, headers, body });
          if (endpoint === "token")
            return Response.json(tokenResponse(++remote.number));
          if (endpoint === "userinfo") return Response.json(oauthProfile);
          if (endpoint === "token/resources")
            return Response.json(oauthResources);
          if (endpoint === "token/revoke")
            return new Response(null, { status: 204 });
        }
        if (path === "/assets/v1/assets") {
          remote.creates++;
          if (remote.holdAsset) await remote.holdAsset;
          const form = await request.formData();
          const metadata = JSON.parse(form.get("request") as string);
          remote.calls.push({
            path: "asset-create",
            headers,
            body: new URLSearchParams({ displayName: metadata.displayName }),
          });
          if (remote.assetStatus !== 200)
            return remote.assetError
              ? Response.json(remote.assetError, { status: remote.assetStatus })
              : new Response(null, { status: remote.assetStatus });
          return Response.json({ path: "operations/test-" + remote.creates });
        }
        if (path.startsWith("/assets/v1/operations/")) {
          remote.calls.push({
            path: "asset-poll",
            headers,
            body: new URLSearchParams(),
          });
          if (remote.pollStatus && remote.pollStatus !== 200)
            return Response.json(remote.pollError ?? {}, {
              status: remote.pollStatus,
            });
          return Response.json({
            done: true,
            response: {
              assetId: "987654",
              assetType: "Image",
              moderationResult: { moderationState: "Approved" },
            },
          });
        }
        throw new Error("Unexpected provider URL");
      },
    }),
  );
  runtimes.add(runtime);
  const dispatch = (
    path: string,
    token = "",
    body?: unknown,
    headers: Record<string, string> = {},
    method?: string,
  ) =>
    runtime.dispatchFetch("https://relay.test" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const call = async (...args: Parameters<typeof dispatch>) => {
    const response = await dispatch(...args);
    return {
      status: response.status,
      headers: response.headers,
      body: (await response.json()) as any,
    };
  };
  const sql = () =>
    runtime.unsafeGetDurableObjectStorage(
      "oauth-test",
      "InspectableRelayRoom",
      {
        name: "private-beta-v1",
      },
    );
  const close = async () => {
    await runtime.dispose();
    runtimes.delete(runtime);
  };
  const begin = (previous?: string) =>
    call(
      "/v1/roblox/login",
      "",
      {},
      {
        "X-Framebridge-Beta": invite,
        ...(previous ? { "X-Framebridge-Roblox-Account": previous } : {}),
      },
    );
  const authorize = async (login: any) => {
    const state = new URL(login.authorizationUrl).searchParams.get("state");
    return dispatch("/oauth/roblox/callback?code=local-code&state=" + state);
  };
  const connect = async (previous?: string) => {
    const login = (await begin(previous)).body;
    expect((await authorize(login)).status).toBe(200);
    const ready = (await call("/v1/roblox/login", login.loginToken)).body;
    expect(ready).toMatchObject({ status: "ready" });
    expect(
      (await call("/v1/roblox/login/complete", login.loginToken, {})).status,
    ).toBe(200);
    return { ...ready, login };
  };
  const uploadSession = async (access = invite) =>
    (
      await call(
        "/v1/upload-sessions",
        "",
        {},
        { "X-Framebridge-Beta": access },
      )
    ).body.uploadToken as string;
  return {
    runtime,
    remote,
    call,
    dispatch,
    sql,
    close,
    begin,
    authorize,
    connect,
    uploadSession,
  };
}

describe("Roblox OAuth in real workerd with durable SQLite", () => {
  it("preserves SQLite accounts, pending logins and upload jobs while changing the OAuth app", async () => {
    let host = await start("app-migration");
    const ready = await host.connect();
    const session = await host.uploadSession();
    const headers = { "X-Framebridge-Roblox-Account": ready.accountToken };
    const job = await host.call(
      "/v1/assets",
      session,
      {
        name: "Migration image",
        owner: { kind: "group", id: "456" },
        png: validPng,
      },
      headers,
    );
    expect(job.status).toBe(202);
    const pending = (await host.begin()).body;
    const storage = await host.sql();
    const row = (await storage.exec("SELECT id,data FROM oauth_accounts"))[0];
    const record = JSON.parse(String(row.data));
    record.accessExpires = 0;
    await storage.exec(
      "UPDATE oauth_accounts SET data=? WHERE id=?",
      JSON.stringify(record),
      row.id,
    );
    const remote = host.remote;
    await host.close();
    remote.calls.length = 0;
    host = await start(
      "app-migration",
      {
        ROBLOX_OAUTH_CLIENT_ID: "987654321098765",
        ROBLOX_OAUTH_CLIENT_SECRET: "group-owned-client-secret",
        ROBLOX_OAUTH_LEGACY_CLIENT_ID: oauthConfig.clientId,
        ROBLOX_OAUTH_LEGACY_CLIENT_SECRET: oauthConfig.clientSecret,
      },
      remote,
    );
    expect((await host.authorize(pending)).status).toBe(200);
    expect(
      (await host.call("/v1/roblox/login", pending.loginToken)).body.status,
    ).toBe("ready");
    expect(
      (
        await host.call(
          "/v1/roblox/login",
          pending.loginToken,
          undefined,
          {},
          "DELETE",
        )
      ).status,
    ).toBe(200);
    const completed = await host.call(
      "/v1/assets/" + job.body.id,
      session,
      undefined,
      headers,
    );
    expect(completed.body).toMatchObject({
      state: "done",
      result: { assetId: "987654" },
    });
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).body,
    ).toMatchObject({ needsAuthorization: false, providerRefreshCount: 1 });
    for (const call of remote.calls.filter((c) => c.path.startsWith("token"))) {
      expect(call.body.get("client_id")).toBe(oauthConfig.clientId);
      expect(call.body.get("client_secret")).toBe(oauthConfig.clientSecret);
    }
    const newLogin = (await host.begin()).body;
    expect(
      new URL(newLogin.authorizationUrl).searchParams.get("client_id"),
    ).toBe("987654321098765");
    expect((await host.authorize(newLogin)).status).toBe(200);
    expect(
      remote.calls
        .filter((c) => c.path === "token")
        .at(-1)!
        .body.get("client_secret"),
    ).toBe("group-owned-client-secret");
  });
  it("supports public login, reconnect and authorized uploads across different Figma/Studio networks without an invite", async () => {
    const host = await start("public-oauth", {
      ACCESS_MODE: "public",
      BETA_ACCESS_HASHES: "",
    });
    const login = await host.call(
      "/v1/roblox/login",
      "",
      {},
      { "CF-Connecting-IP": "192.0.2.1" },
    );
    expect(login.status).toBe(201);
    expect((await host.authorize(login.body)).status).toBe(200);
    const ready = await host.call("/v1/roblox/login", login.body.loginToken);
    expect(ready.body.status).toBe("ready");
    const account = ready.body.accountToken;
    expect(
      (await host.call("/v1/roblox/login/complete", login.body.loginToken, {}))
        .status,
    ).toBe(200);
    const session = await host.call(
      "/v1/upload-sessions",
      "",
      {},
      { "CF-Connecting-IP": "192.0.2.2" },
    );
    expect(session.status).toBe(201);
    const headers = { "X-Framebridge-Roblox-Account": account };
    const upload = await host.call(
      "/v1/assets",
      session.body.uploadToken,
      {
        name: "Public image",
        png: validPng,
        owner: { kind: "user", id: oauthProfile.sub },
      },
      headers,
    );
    expect(upload.status).toBe(202);
    expect(host.remote.creates).toBe(1);
    expect(
      (
        await host.call(
          `/v1/assets/${upload.body.id}`,
          session.body.uploadToken,
          undefined,
          headers,
        )
      ).body.state,
    ).toBe("done");
    const rejected = await host.call(
      "/v1/assets",
      session.body.uploadToken,
      {
        name: "Wrong owner",
        png: validPng,
        owner: { kind: "user", id: "9999999999" },
      },
      headers,
    );
    expect(rejected.status).toBe(403);
    expect(host.remote.creates).toBe(1);
    host.remote.assetStatus = 401;
    const revoked = await host.call(
      "/v1/assets",
      session.body.uploadToken,
      {
        name: "Revoked image",
        png: validPng,
        owner: { kind: "group", id: "456" },
      },
      headers,
    );
    expect(revoked.body.state).toBe("failed");
    expect(
      (await host.call("/v1/roblox/account", account)).body.needsAuthorization,
    ).toBe(true);
    const reconnect = await host.call(
      "/v1/roblox/login",
      "",
      {},
      { ...headers, "CF-Connecting-IP": "192.0.2.3" },
    );
    expect(reconnect.status).toBe(201);
    expect((await host.authorize(reconnect.body)).status).toBe(200);
    expect((await host.call("/v1/roblox/account", account)).status).toBe(200);
    const replacement = await host.call(
      "/v1/roblox/login",
      reconnect.body.loginToken,
    );
    expect(replacement.body.status).toBe("ready");
    expect(
      (
        await host.call(
          "/v1/roblox/login/complete",
          reconnect.body.loginToken,
          {},
        )
      ).status,
    ).toBe(200);
    expect((await host.call("/v1/roblox/account", account)).status).toBe(401);
    expect(
      (await host.call("/v1/roblox/account", replacement.body.accountToken))
        .status,
    ).toBe(200);
  });
  it("allows more than twenty public accounts while enforcing the configured global account limit", async () => {
    const host = await start("public-account-capacity", {
      ACCESS_MODE: "public",
      BETA_ACCESS_HASHES: "",
      MAX_ROBLOX_ACCOUNTS: "21",
    });
    for (let i = 1; i <= 21; i++) {
      const login = await host.call(
        "/v1/roblox/login",
        "",
        {},
        { "CF-Connecting-IP": `192.0.2.${i}` },
      );
      expect(login.status).toBe(201);
      expect((await host.authorize(login.body)).status).toBe(200);
      expect(
        (await host.call("/v1/roblox/login", login.body.loginToken)).body
          .status,
      ).toBe("ready");
      expect(
        (
          await host.call(
            "/v1/roblox/login/complete",
            login.body.loginToken,
            {},
          )
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await host.call(
          "/v1/roblox/login",
          "",
          {},
          { "CF-Connecting-IP": "192.0.2.22" },
        )
      ).status,
    ).toBe(429);
  });
  const ageJob = async (
    host: Awaited<ReturnType<typeof start>>,
    id: string,
    changes: Record<string, unknown> = {},
  ) => {
    const sql = await host.sql();
    const stored = (await sql.exec("SELECT data FROM jobs WHERE id=?", id))[0];
    const job = {
      ...JSON.parse(String(stored.data)),
      ...changes,
      created: Date.now() - 11000,
    };
    await sql.exec(
      "UPDATE jobs SET data=?,created=? WHERE id=?",
      JSON.stringify(job),
      job.created,
      id,
    );
  };

  it.each(["oauth", "api-key"])(
    "retries a confirmed rejection through %s with fresh metadata, one job identity and charged attempt quotas",
    async (auth) => {
      const host = await start("confirmed-retry-" + auth),
        ready = await host.connect(),
        session = await host.uploadSession();
      const headers: Record<string, string> =
        auth === "oauth"
          ? { "X-Framebridge-Roblox-Account": ready.accountToken }
          : { "X-Roblox-Api-Key": "local-private-upload-key" };
      const input = {
        name: "Rejected name",
        owner: { kind: "user", id: "123" },
        png: validPng,
      };
      host.remote.assetStatus = 400;
      host.remote.assetError = { message: "The asset name was rejected." };
      const first = await host.call("/v1/assets", session, input, headers);
      expect(first.body.state).toBe("failed");
      expect(
        (await host.call("/v1/assets", session, input, headers)).body.id,
      ).toBe(first.body.id);
      expect(host.remote.creates).toBe(1);
      await ageJob(host, first.body.id);
      host.remote.assetStatus = 200;
      const retried = await host.call(
        "/v1/assets",
        session,
        { ...input, name: "Test image" },
        headers,
      );
      expect(retried.body.id).toBe(first.body.id);
      expect(retried.body.state).toBe("uploading");
      expect(retried.body.error).toBeUndefined();
      expect(
        host.remote.calls
          .filter((call) => call.path === "asset-create")
          .map((call) => call.body.get("displayName")),
      ).toEqual(["Rejected name", "Test image"]);
      const done = await host.call(
        "/v1/assets/" + first.body.id,
        session,
        undefined,
        headers,
      );
      expect(done.body.state).toBe("done");
      expect(host.remote.creates).toBe(2);
      const sql = await host.sql();
      expect(
        Number((await sql.exec("SELECT total FROM job_usage"))[0].total),
      ).toBe(1);
      const count = (
        await sql.exec(
          "SELECT count FROM counters WHERE scope=?",
          Math.floor(Date.now() / 86400000) + ":uploads",
        )
      )[0];
      expect(Number(count.count)).toBe(2);
      expect(
        (await host.call("/v1/assets", session, input, headers)).body.state,
      ).toBe("done");
      expect(host.remote.creates).toBe(2);
    },
  );

  it("migrates the exact legacy rejection and deduplicates overlapping retry requests", async () => {
    const host = await start("legacy-retry"),
      ready = await host.connect(),
      session = await host.uploadSession();
    const headers = { "X-Framebridge-Roblox-Account": ready.accountToken };
    const input = {
      name: "Test image",
      owner: { kind: "user", id: "123" },
      png: validPng,
    };
    host.remote.assetStatus = 400;
    const first = await host.call("/v1/assets", session, input, headers);
    await ageJob(host, first.body.id, {
      retryable: undefined,
      error:
        "Roblox rejected the upload request (HTTP 400). Check asset permissions and Creator Dashboard.",
    });
    let release!: () => void;
    host.remote.holdAsset = new Promise<void>((resolve) => {
      release = resolve;
    });
    host.remote.assetStatus = 200;
    const retry = host.call("/v1/assets", session, input, headers);
    try {
      for (let i = 0; i < 100 && host.remote.creates < 2; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      expect(host.remote.creates).toBe(2);
      const concurrent = await host.call("/v1/assets", session, input, headers);
      expect(concurrent.body.id).toBe(first.body.id);
      expect(concurrent.body.state).toBe("uploading");
      expect(host.remote.creates).toBe(2);
    } finally {
      release();
    }
    expect((await retry).body.id).toBe(first.body.id);
  });

  it.each([
    {
      error: "Upload response was lost. Check Creator Dashboard.",
      retryable: false,
    },
    {
      error:
        "Roblox rejected this image upload (HTTP 400). Roblox reason: Invalid operation.",
      operation: "operations/accepted",
      retryable: true,
    },
  ])(
    "never recreates an uncertain create or a failed accepted operation",
    async (changes) => {
      const host = await start(
          "protected-retry-" + (changes.operation ? "poll" : "lost"),
        ),
        ready = await host.connect(),
        session = await host.uploadSession();
      const headers = { "X-Framebridge-Roblox-Account": ready.accountToken };
      const input = {
        name: "Test image",
        owner: { kind: "user", id: "123" },
        png: validPng,
      };
      host.remote.assetStatus = 400;
      const first = await host.call("/v1/assets", session, input, headers);
      await ageJob(host, first.body.id, changes);
      host.remote.assetStatus = 200;
      expect(
        (await host.call("/v1/assets", session, input, headers)).body.state,
      ).toBe("failed");
      expect(host.remote.creates).toBe(1);
    },
  );

  it.each(["success", "failure"])(
    "rechecks a legacy failed operation without another create: %s",
    async (outcome) => {
      const host = await start("legacy-poll-" + outcome),
        ready = await host.connect(),
        session = await host.uploadSession();
      const headers = { "X-Framebridge-Roblox-Account": ready.accountToken };
      const input = {
        name: "Test image",
        owner: { kind: "user", id: "123" },
        png: validPng,
      };
      const first = await host.call("/v1/assets", session, input, headers);
      const sql = await host.sql();
      await ageJob(host, first.body.id, {
        state: "failed",
        error:
          "Roblox rejected the upload request (HTTP 400). Check asset permissions and Creator Dashboard.",
        retryable: false,
      });
      await sql.exec(
        "UPDATE jobs SET state='failed' WHERE id=?",
        first.body.id,
      );
      host.remote.pollStatus = outcome === "failure" ? 400 : 200;
      host.remote.pollError = {
        message: "Invalid operation request for this creator.",
      };
      const resumed = await host.call("/v1/assets", session, input, headers);
      expect(resumed.body.id).toBe(first.body.id);
      expect(resumed.body.state).toBe("uploading");
      const result = await host.call(
        "/v1/assets/" + first.body.id,
        session,
        undefined,
        headers,
      );
      expect(host.remote.creates).toBe(1);
      expect(
        Number((await sql.exec("SELECT total FROM job_usage"))[0].total),
      ).toBe(1);
      if (outcome === "success") expect(result.body.state).toBe("done");
      else {
        expect(result.body.error).toContain(
          "Invalid operation request for this creator.",
        );
        expect(result.body.diagnostics).toMatchObject({
          stage: "check",
          cached: false,
          providerStatus: 400,
        });
        const cached = await host.call("/v1/assets", session, input, headers);
        expect(cached.body.diagnostics).toMatchObject({
          stage: "check",
          cached: true,
        });
        expect(host.remote.creates).toBe(1);
      }
    },
  );

  it("enforces the daily allowance before resetting a rejected job", async () => {
    const host = await start("retry-quota", { DAILY_UPLOADS_PER_TESTER: "1" }),
      ready = await host.connect(),
      session = await host.uploadSession();
    const headers = { "X-Framebridge-Roblox-Account": ready.accountToken };
    const input = {
      name: "Test image",
      owner: { kind: "user", id: "123" },
      png: validPng,
    };
    host.remote.assetStatus = 400;
    const first = await host.call("/v1/assets", session, input, headers);
    await ageJob(host, first.body.id);
    host.remote.assetStatus = 200;
    expect(
      (await host.call("/v1/assets", session, input, headers)).status,
    ).toBe(429);
    expect(host.remote.creates).toBe(1);
    expect(
      (
        await host.call(
          "/v1/assets/" + first.body.id,
          session,
          undefined,
          headers,
        )
      ).body.state,
    ).toBe("failed");
  });
  it.each(["oauth", "api-key"])(
    "delivers the safe personal-upload rejection to %s clients and retains failed job identity",
    async (auth) => {
      const host = await start("upload-rejection-" + auth),
        ready = await host.connect(),
        session = await host.uploadSession(),
        key = "local-private-upload-key";
      const headers: Record<string, string> =
        auth === "oauth"
          ? { "X-Framebridge-Roblox-Account": ready.accountToken }
          : { "X-Roblox-Api-Key": key };
      host.remote.assetStatus = 400;
      host.remote.assetError = {
        errors: [
          {
            message:
              "Creator is not eligible to upload this asset. " +
              (auth === "oauth" ? "local-access-token-1" : key),
          },
        ],
      };
      const input = {
        name: "Test image",
        owner: { kind: "user", id: "123" },
        png: validPng,
      };
      const job = await host.call("/v1/assets", session, input, headers);
      expect(job.status).toBe(202);
      expect(job.body.state).toBe("failed");
      expect(job.body.error).toContain(
        "Roblox reason: Creator is not eligible",
      );
      expect(job.body.error).not.toContain("local-access-token-1");
      expect(job.body.error).not.toContain(key);
      const poll = await host.call(
        "/v1/assets/" + job.body.id,
        session,
        undefined,
        headers,
      );
      expect(poll.body.error).toBe(job.body.error);
      expect(
        (await host.call("/v1/assets", session, input, headers)).body.id,
      ).toBe(job.body.id);
      expect(host.remote.creates).toBe(1);
      expect(
        (await host.call("/v1/roblox/account", ready.accountToken)).status,
      ).toBe(200);
    },
  );
  it("forwards a cross-origin callback through two real Workers without moving existing sessions", async () => {
    const callbackUri = "https://framebridge.test/oauth/roblox/callback",
      key = "c".repeat(64),
      host = await start("gateway", {
        ROBLOX_OAUTH_REDIRECT_URI: callbackUri,
        ROBLOX_OAUTH_GATEWAY_SECRET: key,
      }),
      session = await host.call(
        "/v1/sessions",
        "",
        {},
        { "X-Framebridge-Beta": invite },
      ),
      login = (await host.begin()).body,
      state = new URL(login.authorizationUrl).searchParams.get("state"),
      callbackUrl = callbackUri + "?state=" + state + "&code=local-code";
    expect(session.status).toBe(201);
    const config = (await host.call("/v1/roblox/config")).body;
    expect(config.callbackOrigin).toBe("https://framebridge.test");
    expect(Object.keys(config).sort()).toEqual([
      "available",
      "callbackOrigin",
      "scopes",
    ]);
    const parsed = readRobloxLogin(
      login,
      "https://relay.test",
      config.callbackOrigin,
    )!;
    expect(parsed.callbackOrigin).toBe(config.callbackOrigin);
    expect(
      robloxAuthorizationUrl(parsed.authorizationUrl, "https://relay.test"),
    ).toBe(false);
    expect(
      new URL(login.authorizationUrl).searchParams.get("redirect_uri"),
    ).toBe(callbackUri);
    const forwarded: { url: string; status?: number; error?: string }[] = [];
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        name: "gateway-test",
        modules: true,
        script: gatewayScript,
        compatibilityDate: "2026-10-01",
        compatibilityFlags: ["nodejs_compat"],
        telemetry: { enabled: false },
        bindings: {
          FRAMEBRIDGE_RELAY_ORIGIN: "https://relay.test",
          ROBLOX_OAUTH_REDIRECT_URI: callbackUri,
          ROBLOX_OAUTH_GATEWAY_SECRET: key,
        },
        outboundService: async (request) => {
          const record: (typeof forwarded)[number] = { url: request.url };
          forwarded.push(record);
          try {
            expect(request.url).toBe(
              "https://relay.test/v1/roblox/callback-forward",
            );
            expect(request.headers.get("Authorization")).toBe("Bearer " + key);
            expect(request.headers.has("X-Framebridge-Beta")).toBe(false);
            const response = await host.runtime.dispatchFetch(request.url, {
              method: request.method,
              headers: request.headers,
              body: await request.arrayBuffer(),
            });
            record.status = response.status;
            return response;
          } catch (error) {
            record.error = String(error);
            throw error;
          }
        },
      }),
    );
    runtimes.add(runtime);
    const scopedHealth = await runtime.dispatchFetch(
      "https://framebridge.test/oauth/roblox/health",
    );
    expect(scopedHealth.headers.get("Cache-Control")).toBe("no-store");
    expect(await scopedHealth.json()).toEqual({
      ok: true,
      access: "callback-only",
    });
    expect(
      (
        await runtime.dispatchFetch(
          "https://framebridge.test/oauth/roblox/complete",
        )
      ).status,
    ).toBe(200);
    for (const path of ["/", "/health", "/assets/website.js", "/v1/sessions"])
      expect(
        (await runtime.dispatchFetch("https://framebridge.test" + path)).status,
      ).toBe(404);
    expect(forwarded).toHaveLength(0);
    const response = await runtime.dispatchFetch(callbackUrl);
    expect(response.status, JSON.stringify(forwarded)).toBe(200);
    expect(await response.text()).not.toContain(state!);
    const ready = (await host.call("/v1/roblox/login", login.loginToken)).body;
    expect(ready).toMatchObject({
      status: "ready",
      account: {
        userId: "123",
        owners: [
          { kind: "user", id: "123" },
          { kind: "group", id: "456" },
        ],
      },
    });
    expect(
      host.remote.calls
        .find((c) => c.path === "token")
        ?.body.get("redirect_uri"),
    ).toBe(callbackUri);
    expect((await runtime.dispatchFetch(callbackUrl)).status).toBe(401);
    expect(host.remote.calls.filter((c) => c.path === "token")).toHaveLength(1);
    expect(
      (await host.call("/v1/roblox/login", login.loginToken)).body.status,
    ).toBe("ready");
    await host.call("/v1/roblox/login/complete", login.loginToken, {});
    expect(
      (await host.call("/v1/session", session.body.receiverToken)).status,
    ).toBe(200);
    expect(
      await (await host.sql()).exec("SELECT id FROM sessions"),
    ).toHaveLength(1);
    expect(
      await (await host.sql()).exec("SELECT id FROM oauth_logins"),
    ).toHaveLength(0);
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).status,
    ).toBe(200);
  });
  it("rejects gateway forgery and callback substitution before consuming provider codes", async () => {
    const key = "c".repeat(64),
      host = await start("gateway-guards", {
        ROBLOX_OAUTH_GATEWAY_SECRET: key,
      }),
      login = (await host.begin()).body,
      state = new URL(login.authorizationUrl).searchParams.get("state"),
      callbackUrl =
        oauthConfig.redirectUri + "?state=" + state + "&code=local-code";
    for (const [token, body, method, status] of [
      ["", { callbackUrl }, "POST", 404],
      ["d".repeat(64), { callbackUrl }, "POST", 404],
      [key, undefined, "GET", 404],
      [
        key,
        { callbackUrl: callbackUrl.replace("relay.test", "evil.test") },
        "POST",
        400,
      ],
      [key, { callbackUrl: callbackUrl + "&code=second-code" }, "POST", 400],
      [key, { callbackUrl: callbackUrl + "&state=" + state }, "POST", 400],
      [key, { callbackUrl: "x".repeat(20001) }, "POST", 413],
      [key, null, "POST", 400],
    ] as const) {
      expect(
        (
          await host.dispatch(
            "/v1/roblox/callback-forward",
            token,
            body,
            { "X-Framebridge-Invite-Id": oauthHash(invite) },
            method,
          )
        ).status,
      ).toBe(status);
    }
    expect(host.remote.calls).toHaveLength(0);
    expect(
      (await host.call("/v1/roblox/login", login.loginToken)).body.status,
    ).toBe("pending");
    expect(
      (await host.dispatch("/v1/roblox/callback-forward", key, { callbackUrl }))
        .status,
    ).toBe(200);
    expect(
      (await host.call("/v1/roblox/login", login.loginToken)).body.status,
    ).toBe("ready");
    const disabled = await start("gateway-disabled");
    expect(
      (
        await disabled.dispatch("/v1/roblox/callback-forward", key, {
          callbackUrl,
        })
      ).status,
    ).toBe(404);
  });
  it("prunes orphaned unacknowledged accounts after a partial storage operation", async () => {
    const host = await start("orphaned-ready"),
      existing = await host.connect();
    const login = (await host.begin(existing.accountToken)).body;
    await host.authorize(login);
    const ready = (await host.call("/v1/roblox/login", login.loginToken)).body;
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).status,
    ).toBe(200);
    await (await host.sql()).exec("DELETE FROM oauth_logins");
    // New session creation performs the production expiry/orphan cleanup.
    await host.uploadSession();
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).status,
    ).toBe(401);
    expect(
      (await host.call("/v1/roblox/account", existing.accountToken)).status,
    ).toBe(200);
  });
  it("requires a private invitation, isolates capabilities and protects callback pages", async () => {
    const host = await start("access");
    expect((await host.call("/v1/roblox/config")).body.available).toBe(true);
    expect(
      (
        await host.call(
          "/v1/roblox/login",
          "",
          {},
          { "X-Framebridge-Invite-Id": oauthHash(invite) },
        )
      ).status,
    ).toBe(403);
    const response = await host.begin(),
      login = response.body;
    expect(response.status).toBe(201);
    expect(
      (await host.call("/v1/roblox/account", login.loginToken)).status,
    ).toBe(401);
    const callback = await host.authorize(login),
      html = await callback.text();
    expect(callback.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(callback.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(html).toContain("history.replaceState");
    for (const secret of [
      "local-code",
      login.loginToken,
      new URL(login.authorizationUrl).searchParams.get("state")!,
      oauthConfig.clientSecret,
    ])
      expect(html).not.toContain(secret);
    const ready = (await host.call("/v1/roblox/login", login.loginToken)).body;
    expect(
      (await host.call("/v1/roblox/login", ready.accountToken)).status,
    ).toBe(401);
    expect(
      (
        await host.call(
          "/v1/assets",
          await host.uploadSession(otherInvite),
          { name: "Icon", owner: { kind: "user", id: "123" }, png: validPng },
          { "X-Framebridge-Roblox-Account": ready.accountToken },
        )
      ).status,
    ).toBe(401);
    const stored = await (
      await host.sql()
    ).exec(
      "SELECT data FROM oauth_logins UNION ALL SELECT data FROM oauth_accounts",
    );
    const serialized = JSON.stringify(stored);
    for (const secret of [
      login.loginToken,
      ready.accountToken,
      "local-access-token-1",
      "local-refresh-token-1",
    ])
      expect(serialized).not.toContain(secret);
    expect((await host.authorize(login)).status).toBe(401);
    expect(host.remote.calls.filter((c) => c.path === "token")).toHaveLength(1);
  });
  it("restores a ready login after process restart and cleans unacknowledged expired accounts", async () => {
    let host = await start("restart-login"),
      login = (await host.begin()).body;
    await host.authorize(login);
    const remote = host.remote;
    await host.close();
    host = await start("restart-login", {}, remote);
    const ready = (await host.call("/v1/roblox/login", login.loginToken)).body;
    expect(ready.status).toBe("ready");
    expect(ready.account.owners).toHaveLength(2);
    const storage = await host.sql();
    await storage.exec("UPDATE oauth_logins SET expires=0");
    // Begin prunes both the expired polling record and its unacknowledged account.
    expect((await host.begin()).status).toBe(201);
    expect(await storage.exec("SELECT id FROM oauth_accounts")).toHaveLength(0);
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).status,
    ).toBe(401);
  });
  it("creates and polls personal/group images with Bearer auth and retains job identity through refresh", async () => {
    const host = await start("uploads"),
      ready = await host.connect(),
      session = await host.uploadSession(),
      headers = { "X-Framebridge-Roblox-Account": ready.accountToken };
    const input = {
      name: "Icon",
      owner: { kind: "group", id: "456" },
      png: validPng,
    };
    const job = await host.call("/v1/assets", session, input, headers);
    expect(job.status).toBe(202);
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).body,
    ).toMatchObject({
      providerRefreshCount: 0,
      providerRefreshedAt: null,
    });
    const stored = (
        await (await host.sql()).exec("SELECT id,data FROM oauth_accounts")
      )[0],
      record = JSON.parse(String(stored.data));
    // Emulate a persisted pre-diagnostics JSON record, only in this isolated mock backend.
    delete record.providerRefreshCount;
    delete record.providerRefreshedAt;
    record.accessExpires = 0;
    await (
      await host.sql()
    ).exec(
      "UPDATE oauth_accounts SET data=? WHERE id=?",
      JSON.stringify(record),
      stored.id,
    );
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).body,
    ).toMatchObject({
      providerRefreshCount: 0,
      providerRefreshedAt: null,
      providerAccessExpiresAt: 0,
    });
    // An account refresh must not change the credential identity of an existing job.
    const completed = await host.call(
      "/v1/assets/" + job.body.id,
      session,
      undefined,
      headers,
    );
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      state: "done",
      result: { assetId: "987654" },
    });
    expect(
      (await host.call("/v1/assets", session, input, headers)).body.id,
    ).toBe(job.body.id);
    expect(host.remote.creates).toBe(1);
    const create = host.remote.calls.find((c) => c.path === "asset-create")!,
      poll = host.remote.calls.find((c) => c.path === "asset-poll")!;
    expect(create.headers.get("Authorization")).toBe(
      "Bearer local-access-token-1",
    );
    expect(poll.headers.get("Authorization")).toBe(
      "Bearer local-access-token-2",
    );
    const attestation = await host.call(
      "/v1/roblox/account",
      ready.accountToken,
    );
    expect(attestation.status).toBe(200);
    expect(attestation.body.providerRefreshCount).toBe(1);
    expect(attestation.body.providerRefreshedAt).toBeGreaterThan(0);
    expect(attestation.body.providerAccessExpiresAt).toBeGreaterThan(
      attestation.body.providerRefreshedAt,
    );
    const persisted = JSON.parse(
      String(
        (await (await host.sql()).exec("SELECT data FROM oauth_accounts"))[0]
          .data,
      ),
    );
    expect(persisted.providerRefreshCount).toBe(1);
    expect(persisted.providerRefreshedAt).toBe(
      attestation.body.providerRefreshedAt,
    );
    expect((await host.call("/v1/roblox/account")).status).toBe(401);
    expect(create.headers.has("x-api-key")).toBe(false);
    expect(JSON.stringify(completed.body)).not.toContain("local-access");
    expect(
      (
        await host.call(
          "/v1/assets",
          session,
          { ...input, owner: { kind: "group", id: "999" } },
          headers,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await host.call("/v1/assets", session, input, {
          ...headers,
          "X-Roblox-Api-Key": "local-api-key",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await host.call("/v1/assets/" + job.body.id, session, undefined, {
          "X-Roblox-Api-Key": "local-api-key",
        })
      ).status,
    ).toBe(403);
  });
  it("acknowledges replacement safely and clears both ready cancellation and provider revocation", async () => {
    const host = await start("replace"),
      old = await host.connect(),
      next = await host.connect(old.accountToken);
    expect(
      (await host.call("/v1/roblox/account", old.accountToken)).status,
    ).toBe(401);
    expect(
      (await host.call("/v1/roblox/account", next.accountToken)).body.userId,
    ).toBe("123");
    expect(
      await (await host.sql()).exec("SELECT id FROM oauth_accounts"),
    ).toHaveLength(1);
    const pending = (await host.begin(next.accountToken)).body;
    await host.authorize(pending);
    expect(
      (
        await host.call(
          "/v1/roblox/login",
          pending.loginToken,
          undefined,
          {},
          "DELETE",
        )
      ).body.cancelled,
    ).toBe(true);
    expect(
      await (await host.sql()).exec("SELECT id FROM oauth_accounts"),
    ).toHaveLength(1);
    const disconnected = await host.call(
      "/v1/roblox/account",
      next.accountToken,
      undefined,
      {},
      "DELETE",
    );
    expect(disconnected.body).toEqual({ disconnected: true, revoked: true });
    expect(
      await (await host.sql()).exec("SELECT id FROM oauth_accounts"),
    ).toHaveLength(0);
    expect(
      host.remote.calls.filter((c) => c.path === "token/revoke"),
    ).toHaveLength(3);
  });
  it("does not reuse an interrupted refresh after restart", async () => {
    let host = await start("restart-refresh"),
      ready = await host.connect(),
      remote = host.remote;
    const storage = await host.sql(),
      row = (await storage.exec("SELECT id,data FROM oauth_accounts"))[0],
      record = JSON.parse(String(row.data));
    record.state = "refreshing";
    await storage.exec(
      "UPDATE oauth_accounts SET data=? WHERE id=?",
      JSON.stringify(record),
      row.id,
    );
    await host.close();
    host = await start("restart-refresh", {}, remote);
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).body
        .needsAuthorization,
    ).toBe(true);
    expect(
      (
        await host.call(
          "/v1/assets",
          await host.uploadSession(),
          { name: "Icon", owner: { kind: "user", id: "123" }, png: validPng },
          { "X-Framebridge-Roblox-Account": ready.accountToken },
        )
      ).status,
    ).toBe(401);
    expect(remote.calls.filter((c) => c.path === "token")).toHaveLength(1);
  });
  it("forgets revoked invitations and invalidates a provider-rejected account", async () => {
    let host = await start("revoked"),
      ready = await host.connect(),
      remote = host.remote;
    remote.assetStatus = 401;
    const job = await host.call(
      "/v1/assets",
      await host.uploadSession(),
      { name: "Icon", owner: { kind: "user", id: "123" }, png: validPng },
      { "X-Framebridge-Roblox-Account": ready.accountToken },
    );
    expect(job.body.state).toBe("failed");
    expect(job.body.error).toContain("authorization ended");
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).body
        .needsAuthorization,
    ).toBe(true);
    await host.close();
    host = await start(
      "revoked",
      { BETA_ACCESS_HASHES: oauthHash(otherInvite) },
      remote,
    );
    expect(
      (await host.call("/v1/roblox/account", ready.accountToken)).status,
    ).toBe(401);
    await host.call(
      "/v1/roblox/login",
      "",
      {},
      { "X-Framebridge-Beta": otherInvite },
    );
    expect(
      await (await host.sql()).exec("SELECT id FROM oauth_accounts"),
    ).toHaveLength(0);
  });
  it("keeps key uploads usable when OAuth is unconfigured", async () => {
    const host = await start("fallback", { ROBLOX_OAUTH_CLIENT_SECRET: "" });
    expect((await host.call("/v1/roblox/config")).body.available).toBe(false);
    expect((await host.begin()).status).toBe(503);
    const session = await host.uploadSession(),
      input = {
        name: "Icon",
        owner: { kind: "user", id: "123" },
        png: validPng,
      };
    const job = await host.call("/v1/assets", session, input, {
      "X-Roblox-Api-Key": "local-api-key",
    });
    expect(
      (
        await host.call("/v1/assets/" + job.body.id, session, undefined, {
          "X-Roblox-Api-Key": "local-api-key",
        })
      ).body.state,
    ).toBe("done");
    expect(
      host.remote.calls
        .find((c) => c.path === "asset-create")
        ?.headers.get("x-api-key"),
    ).toBe("local-api-key");
  });
});
