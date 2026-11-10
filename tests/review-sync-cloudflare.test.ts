import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { oauthConfig, oauthHash, tokenResponse } from "./roblox-oauth-fixture";
import { reviewVersion } from "../packages/core/src/review-cloud";
import { createReviewSyncManager } from "../plugins/figma/src/review-sync-manager";
import {
  EMPTY_REVIEW_PREFERENCES,
  type ReviewPreferences,
} from "../packages/core/src/structure-review";
const invite = "review-local-private-invitation-1234567890123456",
  other = "review-other-private-invitation-1234567890123456";
let script: string, directory: string;
const runtimes = new Set<Miniflare>();
beforeAll(async () => {
  script = (
    await build({
      stdin: {
        contents: `import { DurableObject } from "cloudflare:workers";
    import { RelayRoom } from "./packages/relay/cloudflare/worker.ts";export {default} from "./packages/relay/cloudflare/worker.ts";
    export class InspectableRelayRoom extends DurableObject {constructor(ctx,env){super(ctx,env);this.room=new RelayRoom(ctx,env);}fetch(r){return this.room.fetch(r);}alarm(){return this.room.alarm();}}`,
        resolveDir: process.cwd(),
        sourcefile: "review-sync-qa.ts",
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
  directory = await mkdtemp(join(tmpdir(), "framebridge-review-"));
});
afterAll(async () => {
  await Promise.all([...runtimes].map((r) => r.dispose()));
  await rm(directory, { recursive: true, force: true });
});
type Provider = {
  userId: string;
  groups: string[];
  number: number;
  users: Map<string, string>;
  calls: string[];
};
async function start(
  name: string,
  provider: Provider = {
    userId: "123",
    groups: ["456"],
    number: 0,
    users: new Map(),
    calls: [],
  },
  access = [invite, other],
) {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: "review-test",
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
      },
      outboundService: async (request) => {
        const endpoint = new URL(request.url).pathname.split("/oauth/v1/")[1];
        provider.calls.push(endpoint);
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
          const body = new URLSearchParams(await request.text()),
            id = provider.users.get(body.get("token")!);
          return Response.json({
            resource_infos: [
              {
                owner: { id, type: "User" },
                resources: {
                  creator: {
                    ids: ["U", ...provider.groups.map((g) => "G" + g)],
                  },
                },
              },
            ],
          });
        }
        if (endpoint === "token/revoke")
          return new Response(null, { status: 204 });
        throw new Error("Unexpected outbound request " + endpoint);
      },
    }),
  );
  runtimes.add(runtime);
  const base = (await runtime.ready).origin;
  // Use an actual local HTTP socket, not dispatchFetch or mocked SQLite.
  const call = async (
    path: string,
    token = "",
    body?: unknown,
    grant = "",
    method?: string,
    accessCode?: string,
  ) => {
    const response = await fetch(base + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        Connection: "close",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(grant ? { "X-Framebridge-Review-Grant": grant } : {}),
        ...(accessCode ? { "X-Framebridge-Beta": accessCode } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: response.headers.get("Content-Type")?.includes("application/json")
        ? JSON.parse(text)
        : text,
    };
  };
  const connectAccount = async (id = "123", accessCode = invite) => {
    provider.userId = id;
    const login = (
      await call("/v1/roblox/login", "", {}, "", undefined, accessCode)
    ).body;
    expect(login.authorizationUrl).toBeTypeOf("string");
    const state = new URL(login.authorizationUrl).searchParams.get("state");
    expect(
      (
        await runtime.dispatchFetch(
          "https://relay.test/oauth/roblox/callback?code=local-auth-code&state=" +
            state,
        )
      ).status,
    ).toBe(200);
    const ready = (await call("/v1/roblox/login", login.loginToken)).body;
    expect(ready.status).toBe("ready");
    expect(
      (await call("/v1/roblox/login/complete", login.loginToken, {})).status,
    ).toBe(200);
    return ready.accountToken as string;
  };
  const connect = async (token: string, group?: string) => {
    const result = await call(
      "/v1/review-sync/connect",
      token,
      group
        ? { scope: "group", groupId: group, consent: true }
        : { scope: "personal", consent: true },
    );
    expect(result.status).toBe(201);
    return result.body;
  };
  const sql = () =>
    runtime.unsafeGetDurableObjectStorage(
      "review-test",
      "InspectableRelayRoom",
      { name: "private-beta-v1" },
    );
  const close = async () => {
    await runtime.dispose();
    runtimes.delete(runtime);
  };
  return { runtime, provider, call, connectAccount, connect, sql, close };
}
const prefs: ReviewPreferences = {
  version: 1,
  enabled: true,
  rules: [],
  naming: { style: "pascal", prefix: "UI" },
  hints: [
    {
      phrase: "purchase",
      sourceType: "*",
      decision: { kind: "class", value: "TextButton" },
    },
  ],
};
describe("private review preferences through real HTTP/workerd/SQLite", () => {
  it("uses server identities, invitation partitions, explicit consent and strict preference-only payloads", async () => {
    const r = await start("isolation"),
      token = await r.connectAccount(),
      peer = await r.connectAccount("123", other);
    expect(
      (await r.call("/v1/review-sync/connect", token, { scope: "personal" }))
        .status,
    ).toBe(400);
    expect(
      (
        await r.call("/v1/review-sync/connect", token, {
          scope: "personal",
          consent: true,
          userId: "789",
        })
      ).status,
    ).toBe(400);
    const a = await r.connect(token),
      b = await r.connect(peer);
    expect(a.snapshot.scope).toMatchObject({ kind: "personal", id: "123" });
    const publish = await r.call(
      "/v1/review-sync",
      token,
      { expected: reviewVersion(a.snapshot), preferences: prefs },
      a.grantToken,
    );
    expect(publish.status).toBe(200);
    expect(
      (await r.call("/v1/review-sync", peer, undefined, b.grantToken)).body
        .preferences.rules,
    ).toEqual([]);
    expect(
      (await r.call("/v1/review-sync", peer, undefined, a.grantToken)).status,
    ).toBe(401);
    const version = reviewVersion(publish.body.snapshot);
    for (const injected of [
      { ...prefs, design: { text: "private" } },
      {
        ...prefs,
        rules: [
          {
            name: "purchase",
            sourceType: "FRAME",
            family: "container",
            decision: { kind: "class", value: "TextButton" },
            secret: "x",
          },
        ],
      },
      { ...prefs, hints: Array(33).fill(prefs.hints![0]) },
      { ...prefs, naming: { style: "pascal", prefix: "secret".repeat(10000) } },
    ])
      expect(
        (
          await r.call(
            "/v1/review-sync",
            token,
            { expected: version, preferences: injected },
            a.grantToken,
          )
        ).status,
      ).toBeGreaterThanOrEqual(400);
    const stored = await r.sql();
    const rows = await stored.exec("SELECT data FROM review_profiles");
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(
      (await r.call("/v1/review-sync", token, undefined, a.grantToken)).body
        .preferences,
    ).toEqual(prefs);
    await r.close();
  });
  it("shares only fresh provider-authorized Roblox groups and denies revoked creator resources", async () => {
    const r = await start("groups"),
      owner = await r.connectAccount("123"),
      peer = await r.connectAccount("789");
    expect(
      (
        await r.call("/v1/review-sync/connect", owner, {
          scope: "group",
          groupId: "999",
          consent: true,
        })
      ).status,
    ).toBe(403);
    const a = await r.connect(owner, "456"),
      b = await r.connect(peer, "456");
    const written = await r.call(
      "/v1/review-sync",
      owner,
      { expected: reviewVersion(a.snapshot), preferences: prefs },
      a.grantToken,
    );
    expect(written.status).toBe(200);
    expect(
      (await r.call("/v1/review-sync", peer, undefined, b.grantToken)).body
        .preferences,
    ).toEqual(prefs);
    r.provider.groups = [];
    expect(
      (await r.call("/v1/review-sync", peer, undefined, b.grantToken)).status,
    ).toBe(403);
    expect(
      (
        await r.call(
          "/v1/review-sync",
          owner,
          { expected: reviewVersion(written.body.snapshot) },
          a.grantToken,
          "DELETE",
        )
      ).status,
    ).toBe(403);
    // Revoking a grant remains possible after group permission disappears.
    expect(
      (
        await r.call(
          "/v1/review-sync/grant",
          peer,
          undefined,
          b.grantToken,
          "DELETE",
        )
      ).body.revoked,
    ).toBe(true);
    await r.close();
  });
  it("persists across worker restart, handles CAS conflicts, reset, revoke and delete/recreate generations", async () => {
    let r = await start("lifecycle");
    const token = await r.connectAccount(),
      peer = await r.connectAccount(),
      a = await r.connect(token),
      b = await r.connect(peer),
      provider = r.provider;
    const first = await r.call(
      "/v1/review-sync",
      token,
      { expected: reviewVersion(a.snapshot), preferences: prefs },
      a.grantToken,
    );
    const stale = await r.call(
      "/v1/review-sync",
      peer,
      {
        expected: reviewVersion(b.snapshot),
        preferences: { ...prefs, enabled: false },
      },
      b.grantToken,
    );
    expect(stale.status).toBe(409);
    expect(stale.body.snapshot.preferences).toEqual(prefs);
    await r.close();
    r = await start("lifecycle", provider);
    const read = await r.call("/v1/review-sync", peer, undefined, b.grantToken);
    expect(read.body).toEqual(first.body.snapshot);
    const reset = await r.call(
      "/v1/review-sync",
      peer,
      {
        expected: reviewVersion(read.body),
        preferences: EMPTY_REVIEW_PREFERENCES,
      },
      b.grantToken,
    );
    expect(reset.body.snapshot.preferences).toEqual(EMPTY_REVIEW_PREFERENCES);
    expect(
      (
        await r.call(
          "/v1/review-sync/grant",
          peer,
          undefined,
          b.grantToken,
          "DELETE",
        )
      ).body.revoked,
    ).toBe(true);
    expect(
      (await r.call("/v1/review-sync", peer, undefined, b.grantToken)).status,
    ).toBe(401);
    expect(
      (
        await r.call(
          "/v1/review-sync",
          token,
          { expected: reviewVersion(reset.body.snapshot) },
          a.grantToken,
          "DELETE",
        )
      ).body.deleted,
    ).toBe(true);
    expect(
      (await r.call("/v1/review-sync", token, undefined, a.grantToken)).status,
    ).toBe(401);
    const replacement = await r.connect(token);
    expect(replacement.snapshot.generation).not.toBe(a.snapshot.generation);
    expect(
      (
        await r.call(
          "/v1/review-sync",
          token,
          { expected: reviewVersion(first.body.snapshot), preferences: prefs },
          replacement.grantToken,
        )
      ).status,
    ).toBe(409);
    expect(
      (await r.call("/v1/roblox/account", token, undefined, "", "DELETE")).body
        .disconnected,
    ).toBe(true);
    expect(
      (
        await r.call(
          "/v1/review-sync",
          token,
          undefined,
          replacement.grantToken,
        )
      ).status,
    ).toBe(401);
    await r.close();
  });
  it("cleans expired/revoked-invite data and bounds storage without evicting live preferences", async () => {
    let r = await start("retention");
    const token = await r.connectAccount(),
      a = await r.connect(token),
      provider = r.provider;
    const storage = await r.sql();
    await storage.exec("UPDATE review_profiles SET expires=0");
    const replacement = await r.connect(token);
    expect(replacement.snapshot.generation).not.toBe(a.snapshot.generation);
    expect(
      (await r.call("/v1/review-sync", token, undefined, a.grantToken)).status,
    ).toBe(401);
    for (let i = 0; i < 7; i++) await r.connect(token);
    expect(
      (
        await r.call("/v1/review-sync/connect", token, {
          scope: "personal",
          consent: true,
        })
      ).status,
    ).toBe(429);
    // A denied ninth grant must not leave an empty newly created group profile.
    expect(
      (
        await r.call("/v1/review-sync/connect", token, {
          scope: "group",
          groupId: "456",
          consent: true,
        })
      ).status,
    ).toBe(429);
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM review_profiles"))[0].n,
    ).toBe(1);
    await r.close();
    r = await start("retention", provider, [other]);
    expect(
      (
        await r.call(
          "/v1/review-sync",
          token,
          undefined,
          replacement.grantToken,
        )
      ).status,
    ).toBe(401);
    const peer = await r.connectAccount("123", other);
    await r.connect(peer);
    const rows = await (
      await r.sql()
    ).exec("SELECT invite FROM review_profiles");
    expect(rows.every((row: any) => row.invite === oauthHash(other))).toBe(
      true,
    );
    await r.close();
  });
  it("rejects full invitation/global SQLite storage while retaining existing profiles", async () => {
    const access = [
      invite,
      other,
      "review-third-private-invitation-1234567890123456",
      "review-fourth-private-invitation-1234567890123456",
    ];
    const r = await start("profile-bounds", undefined, access),
      token = await r.connectAccount(),
      a = await r.connect(token),
      storage = await r.sql();
    // Seed valid retained snapshots directly in the real SQLite fixture to test
    // admission limits without making hundreds of redundant provider exchanges.
    const expires = Date.now() + 86400000;
    for (let i = 0; i < 29; i++)
      await storage.exec(
        "INSERT INTO review_profiles VALUES (?,?,?,?)",
        "invite-profile-" + i,
        oauthHash(invite),
        expires,
        JSON.stringify({
          ...a.snapshot,
          scope: { kind: "personal", id: String(1000 + i), label: "Fixture" },
        }),
      );
    const candidate = await r.connectAccount("789");
    expect(
      (
        await r.call("/v1/review-sync/connect", candidate, {
          scope: "personal",
          consent: true,
        })
      ).status,
    ).toBe(429);
    for (let i = 0; i < 70; i++)
      await storage.exec(
        "INSERT INTO review_profiles VALUES (?,?,?,?)",
        "global-profile-" + i,
        oauthHash(access[1 + Math.floor(i / 25)]),
        expires,
        JSON.stringify({
          ...a.snapshot,
          scope: { kind: "personal", id: String(2000 + i), label: "Fixture" },
        }),
      );
    const otherToken = await r.connectAccount("789", other);
    expect(
      (
        await r.call("/v1/review-sync/connect", otherToken, {
          scope: "personal",
          consent: true,
        })
      ).status,
    ).toBe(429);
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM review_profiles"))[0].n,
    ).toBe(100);
    expect(
      (await r.call("/v1/review-sync", token, undefined, a.grantToken)).body,
    ).toEqual(a.snapshot);
    // Connecting an existing record still works at the profile cap.
    expect((await r.connect(token)).snapshot).toEqual(a.snapshot);
    await r.close();
  });
  it("runs two installation managers with conflict recovery and ignores cancelled late results", async () => {
    const r = await start("managers"),
      token = await r.connectAccount(),
      peer = await r.connectAccount();
    const installation = (token: string) => {
      let saved: unknown = null,
        local: ReviewPreferences = { ...EMPTY_REVIEW_PREFERENCES, rules: [] };
      let delay = false,
        release: (() => void) | undefined,
        arrived: (() => void) | undefined;
      const delayed = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const api = async (
        path: string,
        bearer: string,
        grant: string,
        body: unknown,
        method: string,
        _signal: AbortSignal,
      ) => {
        const response = await r.call(
          "/v1/review-sync" + path,
          bearer,
          body,
          grant,
          method,
        );
        if (delay)
          await new Promise<void>((resolve) => {
            release = resolve;
            arrived?.();
          });
        if (response.status >= 400 && response.status !== 409)
          throw new Error(response.body.error);
        return response.body;
      };
      const m = createReviewSyncManager(
        "https://relay.test",
        {
          load: async () => saved,
          save: async (v) => {
            saved = v;
          },
        },
        api,
        {
          get: () => local,
          save: async (v) => {
            local = v;
            return true;
          },
        },
        () => {},
      );
      return {
        m,
        account: { userId: "123", token },
        get: () => local,
        set: (p: ReviewPreferences) => {
          local = p;
        },
        saved: () => saved,
        delay: () => {
          delay = true;
        },
        delayed,
        release: () => {
          delay = false;
          release?.();
        },
      };
    };
    const a = installation(token),
      b = installation(peer);
    await a.m.setAccount(a.account);
    await b.m.setAccount(b.account);
    await a.m.connect("personal");
    await b.m.connect("personal");
    a.set(prefs);
    await a.m.publish();
    b.set({ ...prefs, enabled: false });
    await b.m.publish();
    expect(b.m.snapshot().conflict?.preferences).toEqual(prefs);
    expect(b.get().enabled).toBe(false);
    await b.m.overwrite();
    await a.m.fetch();
    expect(a.get()).toEqual(prefs);
    await a.m.useCloud();
    expect(a.get().enabled).toBe(false);
    await b.m.setAccount(b.account);
    await b.m.restore();
    expect(b.m.snapshot().connected).toBe(true);
    expect(b.get().enabled).toBe(false);
    b.delay();
    const pending = b.m.fetch();
    await b.delayed;
    b.m.cancel();
    b.release();
    await pending;
    expect(b.m.snapshot().notice).toContain("Cancelled");
    expect(b.m.snapshot().busy).toBe(false);
    // Cancellation cannot retract a sent durable write; the manager must
    // ignore its late response and explicitly refetch before retrying.
    const previous = a.m.snapshot().snapshot!.revision;
    a.set(prefs);
    a.delay();
    const write = a.m.publish();
    await a.delayed;
    a.m.cancel();
    a.release();
    await write;
    expect(a.m.snapshot().snapshot!.revision).toBe(previous);
    expect(a.m.snapshot().notice).toContain("Cancelled");
    await a.m.fetch();
    expect(a.m.snapshot().snapshot!.revision).toBe(previous + 1);
    expect(a.m.snapshot().snapshot!.preferences).toEqual(prefs);
    await a.m.revoke();
    expect(a.saved()).toBeNull();
    expect(b.m.snapshot().connected).toBe(true);
    a.m.dispose();
    b.m.dispose();
    await r.close();
  });
});
