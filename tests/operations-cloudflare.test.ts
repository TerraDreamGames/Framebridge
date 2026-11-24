import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FIGMA_USAGE_PATH,
  ONBOARDING_EVENTS as event,
  utcDay,
} from "../packages/core/src/figma-usage";
const token = "a".repeat(64),
  hash = createHash("sha256").update(token).digest("hex");
let script: string, directory: string;
const runtimes: Miniflare[] = [];
beforeAll(async () => {
  script = (
    await build({
      stdin: {
        contents: `import {DurableObject} from 'cloudflare:workers'; import {RelayRoom} from './packages/relay/cloudflare/worker.ts'; export {default} from './packages/relay/cloudflare/worker.ts';
      export class TestRoom extends DurableObject {constructor(ctx,env){super(ctx,env);this.room=new RelayRoom(ctx,env)} fetch(r){return this.room.fetch(r)} alarm(){return this.room.alarm()}}`,
        resolveDir: process.cwd(),
        sourcefile: "operations-test-entry.ts",
      },
      bundle: true,
      format: "esm",
      target: "es2022",
      platform: "browser",
      external: ["node:*", "cloudflare:workers"],
      write: false,
      logLevel: "silent",
    })
  ).outputFiles[0].text;
  directory = await mkdtemp(join(tmpdir(), "framebridge-operations-"));
});
afterAll(async () => {
  await Promise.all(runtimes.map((r) => r.dispose()));
  await rm(directory, { recursive: true, force: true });
});
async function start(name: string, overrides: Record<string, string> = {}) {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: "operations-test",
      modules: true,
      script,
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { RELAY: { className: "TestRoom", useSQLite: true } },
      resourcePersistencePath: join(directory, name),
      telemetry: { enabled: false },
      unsafeInspectDurableObjects: true,
      bindings: {
        ACCESS_MODE: "public",
        OPERATIONS_ADMIN_HASH: hash,
        DAILY_REQUESTS: "4",
        ...overrides,
      },
    }),
  );
  runtimes.push(runtime);
  const call = async (
    path: string,
    bearer = "",
    body?: unknown,
    method?: string,
  ) => {
    const response = await runtime.dispatchFetch("https://relay.test" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Connection: "close",
        "Content-Type": "application/json",
        Authorization: "Bearer " + bearer,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const sql = () =>
    runtime.unsafeGetDurableObjectStorage("operations-test", "TestRoom", {
      name: "private-beta-v1",
    });
  return { call, sql };
}
describe("private operator metrics in real workerd + SQLite", () => {
  it("deduplicates daily usage and onboarding steps across retries and restarts", async () => {
    let host = await start("figma-usage");
    const day = utcDay();
    const key = "1".repeat(64);
    const cohortKey = "2".repeat(64);
    const opened = event.opened | event.signInStarted;
    const complete =
      opened |
      event.tutorialOffered |
      event.tutorialStarted |
      event.previewReached |
      event.studioReached |
      event.tutorialCompleted;
    const report = (events: number, installation = key) => ({
      day,
      key: installation,
      onboarding: { day: day - 1, key: cohortKey, events },
    });
    expect((await host.call(FIGMA_USAGE_PATH, "", report(opened))).status).toBe(
      200,
    );
    await Promise.all([
      host.call(FIGMA_USAGE_PATH, "", report(complete)),
      host.call(FIGMA_USAGE_PATH, "", report(opened)),
    ]);
    await runtimes.at(-1)!.dispose();
    host = await start("figma-usage");
    await host.call(FIGMA_USAGE_PATH, "", report(complete));
    expect(
      (await host.call(FIGMA_USAGE_PATH, "", { day, key: "3".repeat(64) }))
        .status,
    ).toBe(200);
    const { body } = await host.call("/v1/operations", token);
    expect(
      body.quotas.find((quota: { name: string }) => quota.name === "requests")
        .used,
    ).toBe(0);
    expect(body.figmaUsage.days).toHaveLength(30);
    expect(body.figmaUsage.days.at(-1)).toMatchObject({
      installations: 2,
      onboarding: {},
    });
    expect(body.figmaUsage.days.at(-2)).toMatchObject({
      installations: null,
      followUpOpen: true,
      onboarding: { opened: 1, signInStarted: 1, tutorialCompleted: 1 },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(key);
    expect(serialized).not.toContain(cohortKey);
  });

  it("rejects malformed, expired and out-of-sequence reports", async () => {
    const host = await start("figma-usage-rejection");
    const day = utcDay();
    const key = "1".repeat(64);
    for (const report of [
      { day: day - 1, key },
      { day, key, account: "should-not-be-stored" },
      { day, key: "bad" },
      { day, key, onboarding: { day: day - 7, key, events: event.opened } },
      {
        day,
        key,
        onboarding: {
          day,
          key,
          events: event.opened | event.tutorialCompleted,
        },
      },
    ])
      expect((await host.call(FIGMA_USAGE_PATH, "", report)).status).toBe(400);
    expect((await host.call(FIGMA_USAGE_PATH)).status).toBe(404);
    expect(
      (
        await host.call(FIGMA_USAGE_PATH, "", {
          day,
          key,
          payload: "x".repeat(512),
        })
      ).status,
    ).toBe(413);
    expect((await host.call("/v1/operations")).status).toBe(404);
    expect(
      (await host.call("/v1/operations", token)).body.figmaUsage.days.at(-1)
        .installations,
    ).toBeNull();
  });

  it("prunes deduplication keys ahead of the aggregate history", async () => {
    const host = await start("figma-usage-expiry");
    const day = utcDay();
    const key = "1".repeat(64);
    await host.call(FIGMA_USAGE_PATH, "", { day, key });
    const storage = await host.sql();
    await storage.exec(
      "INSERT INTO figma_usage_seen VALUES (?,?)",
      day - 1,
      key,
    );
    await storage.exec(
      "INSERT INTO figma_onboarding_seen VALUES (?,?,?)",
      day - 7,
      key,
      event.opened,
    );
    await storage.exec(
      "INSERT INTO figma_usage_daily VALUES (?,1),(?,2)",
      day - 30,
      day - 29,
    );
    await storage.exec(
      "INSERT INTO figma_onboarding_daily VALUES (?,'opened',1),(?,'opened',2)",
      day - 30,
      day - 29,
    );
    await host.call("/v1/sessions", "", {});
    expect(await storage.exec("SELECT day FROM figma_usage_seen")).toEqual([
      { day },
    ]);
    expect(await storage.exec("SELECT day FROM figma_onboarding_seen")).toEqual(
      [],
    );
    expect(
      await storage.exec("SELECT day FROM figma_usage_daily ORDER BY day"),
    ).toEqual([{ day: day - 29 }, { day }]);
    expect(
      await storage.exec("SELECT day FROM figma_onboarding_daily"),
    ).toEqual([{ day: day - 29 }]);
  });
  it("denies public, invalid and ordinary session tokens, and rejects writes", async () => {
    const host = await start("authorization");
    for (const credential of [
      "",
      "b".repeat(64),
      "a".repeat(63),
      "a".repeat(65),
    ])
      expect((await host.call("/v1/operations", credential)).status).toBe(404);
    const session = (await host.call("/v1/sessions", "", {})).body;
    expect(
      (await host.call("/v1/operations", session.receiverToken)).status,
    ).toBe(404);
    expect((await host.call("/v1/operations", token, {}, "POST")).status).toBe(
      404,
    );
    expect((await host.call("/v1/operations", token)).status).toBe(200);
  });
  it("reports presence separately from retained pairing and preserves access at quota exhaustion", async () => {
    const host = await start("live-presence");
    const session = (await host.call("/v1/sessions", "", {})).body;
    await host.call("/v1/pair", "", { code: session.code });
    const fresh = (await host.call("/v1/operations", token)).body;
    expect(fresh.connections).toMatchObject({
      studioOnline: 1,
      paired: 1,
      retained: 1,
      uploadOnly: 0,
    });
    expect(fresh.quotas.find((q: any) => q.name === "requests").used).toBe(2);
    const storage = await host.sql();
    await storage.exec(
      "UPDATE operations_presence SET studio=?,figma=?",
      Date.now() - 120000,
      Date.now() - 120000,
    );
    expect(
      (await host.call("/v1/operations", token)).body.connections,
    ).toMatchObject({ studioOnline: 0, paired: 1 });
    await host.call("/v1/session", session.receiverToken);
    await host.call("/v1/session", session.receiverToken);
    expect((await host.call("/v1/session", session.receiverToken)).status).toBe(
      429,
    );
    const limited = await host.call("/v1/operations", token);
    expect(limited.status).toBe(200);
    expect(
      limited.body.quotas.find((q: any) => q.name === "requests").used,
    ).toBe(4);
  });
  it("excludes expired sessions, removes disconnected presence and never exposes secrets or payloads", async () => {
    const host = await start("privacy", { DAILY_REQUESTS: "30" });
    const session = (await host.call("/v1/sessions", "", {})).body;
    const pair = (await host.call("/v1/pair", "", { code: session.code })).body;
    const storage = await host.sql();
    await storage.exec(
      "INSERT INTO chunks VALUES ((SELECT id FROM sessions LIMIT 1),0,?)",
      "private-design-content",
    );
    const body = (await host.call("/v1/operations", token)).body;
    expect(body.storage.sqliteBytes).toBeGreaterThan(0);
    expect(body.storage.cloudArtworkEnabled).toBe(false);
    const serialized = JSON.stringify(body);
    for (const sensitive of [
      token,
      session.receiverToken,
      pair.senderToken,
      session.code,
      "private-design-content",
      "receiver",
      "invite",
    ])
      expect(serialized).not.toContain(sensitive);
    expect(body.quotaResetsAt).toMatch(/T00:00:00.000Z$/);
    await host.call("/v1/session", session.receiverToken, undefined, "DELETE");
    expect(
      (await host.call("/v1/operations", token)).body.connections.retained,
    ).toBe(0);
    expect(
      await storage.exec("SELECT * FROM operations_presence"),
    ).toHaveLength(0);
    await host.call("/v1/upload-sessions", "", {});
    expect(
      (await host.call("/v1/operations", token)).body.connections,
    ).toMatchObject({ uploadOnly: 1, studioOnline: 0 });
    await storage.exec("UPDATE sessions SET expires=?", Date.now() - 1000);
    expect(
      (await host.call("/v1/operations", token)).body.connections.retained,
    ).toBe(0);
  });
  it("leaves monitoring disabled when no operator credential is configured", async () => {
    const host = await start("disabled", { OPERATIONS_ADMIN_HASH: "" });
    expect((await host.call("/v1/operations", token)).status).toBe(404);
    expect(
      (await host.call(FIGMA_USAGE_PATH, "", { day: utcDay(), key: token }))
        .status,
    ).toBe(404);
    await host.call("/v1/sessions", "", {});
    const storage = await host.sql();
    expect(
      await storage.exec(
        "SELECT name FROM sqlite_master WHERE name LIKE 'operations_%'",
      ),
    ).toHaveLength(0);
  });
  it("preserves existing pairings when monitoring is enabled and retains presence across a restart", async () => {
    let host = await start("upgrade", {
      OPERATIONS_ADMIN_HASH: "",
      DAILY_REQUESTS: "30",
    });
    const session = (await host.call("/v1/sessions", "", {})).body;
    const pair = (await host.call("/v1/pair", "", { code: session.code })).body;
    await runtimes[runtimes.length - 1].dispose();
    host = await start("upgrade", { DAILY_REQUESTS: "30" });
    expect(
      (await host.call("/v1/operations", token)).body.connections,
    ).toMatchObject({ paired: 1, studioOnline: 0 });
    expect(
      (await host.call("/v1/session", session.receiverToken)).body.paired,
    ).toBe(true);
    expect((await host.call("/v1/session", pair.senderToken)).body.role).toBe(
      "sender",
    );
    const before = (await host.call("/v1/operations", token)).body;
    await runtimes[runtimes.length - 1].dispose();
    host = await start("upgrade", { DAILY_REQUESTS: "30" });
    const after = (await host.call("/v1/operations", token)).body;
    expect(after.connections).toMatchObject({ paired: 1, studioOnline: 1 });
    expect(after.monitoringSince).toBe(before.monitoringSince);
  });
});
