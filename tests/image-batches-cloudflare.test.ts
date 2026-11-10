import { afterAll, beforeAll, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { uploadKey } from "../packages/relay/src/roblox";
import { batchPng } from "./image-batch-fixtures";

const invite = "local-batch-invite-1234567890-abcdef",
  second = "second-batch-invite-1234567890-abcdef",
  key = "local-batch-key-123";
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const headers = { "X-Roblox-Api-Key": key };
const input = (i: number) => ({
  owner: { kind: "user" as const, id: "123" },
  name: `Image ${i}`,
  png: Buffer.from(batchPng(i)).toString("base64"),
});
let script: string, directory: string;
const runtimes: Miniflare[] = [];
beforeAll(async () => {
  script = (
    await build({
      entryPoints: ["packages/relay/cloudflare/worker.ts"],
      bundle: true,
      format: "esm",
      target: "es2022",
      platform: "browser",
      external: ["node:*", "cloudflare:workers"],
      write: false,
      logLevel: "silent",
    })
  ).outputFiles[0].text;
  directory = await mkdtemp(join(tmpdir(), "framebridge-batches-"));
});
afterAll(async () => {
  await Promise.all(runtimes.map((r) => r.dispose()));
  await rm(directory, { recursive: true, force: true });
});
async function start(
  name: string,
  vars: Record<string, string> = {},
  source = script,
) {
  let creates = 0;
  const pngs = new Set<string>();
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: source,
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { RELAY: { className: "RelayRoom", useSQLite: true } },
      resourcePersistencePath: join(directory, name),
      telemetry: { enabled: false },
      bindings: { BETA_ACCESS_HASHES: hash(invite), ...vars },
      outboundService: async (request) => {
        if (request.url === "https://apis.roblox.com/assets/v1/assets") {
          expect(request.headers.get("x-api-key")).toBe(key);
          const form = await request.formData(),
            image = form.get("fileContent");
          if (!image || typeof image === "string")
            throw new Error("Missing provider PNG");
          pngs.add(hash(new Uint8Array(await image.arrayBuffer())));
          return Response.json({ path: `operations/job-${++creates}` });
        }
        const id = /\/operations\/job-(\d+)$/.exec(request.url);
        if (id)
          return Response.json({
            done: true,
            response: {
              assetId: String(800000 + Number(id[1])),
              assetType: "Image",
              moderationResult: { moderationState: "Approved" },
            },
          });
        throw new Error("Unexpected provider call");
      },
    }),
  );
  runtimes.push(runtime);
  const call = async (
    path: string,
    token = "",
    body?: unknown,
    extra: Record<string, string> = {},
    method?: string,
  ) => {
    const r = await runtime.dispatchFetch("https://batch.test" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: (await r.json()) as any };
  };
  const access = async (invitation = invite) => {
    const r = await call(
      "/v1/upload-sessions",
      "",
      {},
      { "X-Framebridge-Beta": invitation },
    );
    expect(r.status).toBe(201);
    return r.body.uploadToken as string;
  };
  const complete = async (token: string, index: number) => {
    const created = await call("/v1/assets", token, input(index), headers);
    expect(created.status, JSON.stringify(created.body)).toBe(202);
    const done = await call(
      "/v1/assets/" + created.body.id,
      token,
      undefined,
      headers,
    );
    expect(done.body.state, JSON.stringify(done.body)).toBe("done");
    return done;
  };
  return { runtime, call, access, complete, creates: () => creates, pngs };
}
async function stop(runtime: Miniflare) {
  await runtime.dispose();
  runtimes.splice(runtimes.indexOf(runtime), 1);
}

it("runs 1,000 distinct provider jobs in real workerd/SQLite, enforces two slots and reuses capped/restarted jobs", async () => {
  let host = await start("thousand", {
    DAILY_UPLOADS: "2000",
    DAILY_UPLOADS_PER_TESTER: "2000",
  });
  const token = await host.access();
  const initial = await Promise.all(
    [0, 1].map((i) => host.call("/v1/assets", token, input(i), headers)),
  );
  expect(initial.every((r) => r.status === 202)).toBe(true);
  expect((await host.call("/v1/assets", token, input(2), headers)).status).toBe(
    429,
  );
  expect(host.creates()).toBe(2);
  await Promise.all(
    initial.map((r) =>
      host.call("/v1/assets/" + r.body.id, token, undefined, headers),
    ),
  );
  for (let i = 2; i < 1000; i += 2)
    await Promise.all([i, i + 1].map((i) => host.complete(token, i)));
  expect(host.creates()).toBe(1000);
  expect(host.pngs.size).toBe(1000);
  const blocked = await host.call("/v1/assets", token, input(1000), headers);
  expect(blocked.status).toBe(429);
  expect(blocked.body.error).toContain("1,000");
  const cached = await host.call("/v1/assets", token, input(0), headers);
  expect(cached.body.state).toBe("done");
  expect(host.creates()).toBe(1000);
  await stop(host.runtime);
  host = await start("thousand", {
    DAILY_UPLOADS: "2000",
    DAILY_UPLOADS_PER_TESTER: "2000",
  });
  expect(
    (await host.call("/v1/assets", token, input(1000), headers)).status,
  ).toBe(429);
  expect(
    (await host.call("/v1/assets", token, input(999), headers)).body.state,
  ).toBe("done");
  expect(host.creates()).toBe(0);
  await host.call("/v1/session", token, undefined, {}, "DELETE");
  await host.complete(await host.access(), 1000);
  expect(host.creates()).toBe(1);
}, 60_000);
it("retains the default 40-per-tester daily allowance and reports its reset without charging cached retries", async () => {
  const host = await start("default-quota"),
    token = await host.access();
  for (let i = 0; i < 40; i++) await host.complete(token, i);
  const blocked = await host.call("/v1/assets", token, input(40), headers);
  expect(blocked.status).toBe(429);
  expect(blocked.body.error).toMatch(/Your daily.*40.*00:00 UTC/);
  expect(
    (await host.call("/v1/assets", token, input(0), headers)).body.state,
  ).toBe("done");
  expect(host.creates()).toBe(40);
});
it("rolls back the global allowance when a tester is already over quota", async () => {
  const host = await start("isolated-quota", {
    DAILY_UPLOADS: "2",
    DAILY_UPLOADS_PER_TESTER: "1",
    BETA_ACCESS_HASHES: [hash(invite), hash(second)].join(","),
  });
  const one = await host.access(),
    two = await host.access(second);
  await host.complete(one, 0);
  expect((await host.call("/v1/assets", one, input(1), headers)).status).toBe(
    429,
  );
  await host.complete(two, 2);
  expect(host.creates()).toBe(2);
});
it("migrates the actual four-column legacy SQLite schema once and retains all 1,000 cached links and totals", async () => {
  const legacy = `export class RelayRoom { constructor(ctx) { this.ctx=ctx; ctx.storage.sql.exec("CREATE TABLE sessions(id TEXT PRIMARY KEY,receiver TEXT UNIQUE,sender TEXT UNIQUE,code TEXT UNIQUE,invite TEXT,expires REAL,data TEXT); CREATE TABLE jobs(session TEXT,id TEXT,hash TEXT,data TEXT,PRIMARY KEY(session,id),UNIQUE(session,hash));"); } async fetch(request) { const b=await request.json(); this.ctx.storage.transactionSync(()=>{const s=b.session;this.ctx.storage.sql.exec("INSERT INTO sessions VALUES (?,?,?,?,?,?,?)",s.id,s.receiver,s.sender,s.code,s.invite,s.expires,JSON.stringify(s));for(const j of b.jobs)this.ctx.storage.sql.exec("INSERT INTO jobs VALUES (?,?,?,?)",s.id,j.id,j.hash,JSON.stringify(j.data));});return Response.json({ok:true}); } } export default { fetch(request,env){return env.RELAY.get(env.RELAY.idFromName("private-beta-v1")).fetch(request);} };`;
  let host = await start("legacy", {}, legacy);
  const token = "a".repeat(64),
    now = Date.now(),
    session = {
      id: "legacy-session",
      receiver: hash(token),
      sender: null,
      code: "LEGACY",
      invite: hash(invite),
      expires: now + 3600000,
      pairExpires: now + 600000,
      uploadOnly: true,
      revision: 0,
    };
  const jobs = Array.from({ length: 1000 }, (_, i) => ({
    id: `legacy-${i}`,
    hash: uploadKey(input(i), Buffer.from(batchPng(i)), key),
    data: {
      id: `legacy-${i}`,
      state: "done",
      keyHash: hash(key),
      created: now,
      checked: now,
      result: {
        assetId: String(600000 + i),
        moderation: "MODERATION_STATE_APPROVED",
      },
    },
  }));
  expect((await host.call("/seed", "", { session, jobs })).body.ok).toBe(true);
  await stop(host.runtime);
  host = await start("legacy");
  expect(
    (await host.call("/v1/assets", token, input(999), headers)).body.result
      .assetId,
  ).toBe("600999");
  expect(
    (await host.call("/v1/assets", token, input(1000), headers)).status,
  ).toBe(429);
  expect(host.creates()).toBe(0);
  await stop(host.runtime);
  host = await start("legacy");
  expect(
    (await host.call("/v1/assets", token, input(0), headers)).body.result
      .assetId,
  ).toBe("600000");
  expect(
    (await host.call("/v1/assets", token, input(1000), headers)).status,
  ).toBe(429);
});
