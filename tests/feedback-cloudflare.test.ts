import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { feedbackHash, feedbackReport } from "./feedback-fixture";
const invite = "feedback-local-invitation-1234567890123456",
  other = "feedback-other-invitation-1234567890123456",
  admin = "a".repeat(64),
  cap = "b".repeat(64);
let script: string, directory: string;
const runtimes = new Set<Miniflare>();
beforeAll(async () => {
  script = (
    await build({
      stdin: {
        contents: `import { DurableObject } from "cloudflare:workers"; import { RelayRoom } from "./packages/relay/cloudflare/worker.ts"; export { default } from "./packages/relay/cloudflare/worker.ts"; export class InspectableRelayRoom extends DurableObject { constructor(ctx, env) { super(ctx,env); this.room=new RelayRoom(ctx,env); } fetch(r) { return this.room.fetch(r); } alarm() { return this.room.alarm(); } }`,
        resolveDir: process.cwd(),
        sourcefile: "feedback-qa-entry.ts",
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
  directory = await mkdtemp(join(tmpdir(), "framebridge-feedback-"));
});
afterAll(async () => {
  await Promise.all([...runtimes].map((r) => r.dispose()));
  await rm(directory, { recursive: true, force: true });
});
async function start(name: string, overrides: Record<string, string> = {}) {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: "feedback-test",
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
        BETA_ACCESS_HASHES: [feedbackHash(invite), feedbackHash(other)].join(
          ",",
        ),
        FEEDBACK_ADMIN_HASH: feedbackHash(admin),
        ROBLOX_OAUTH_CLIENT_SECRET: "backend-only-secret-value",
        ...overrides,
      },
      outboundService: () => {
        throw new Error("Reports must not make external requests.");
      },
    }),
  );
  runtimes.add(runtime);
  const call = async (
    path: string,
    token = "",
    body?: unknown,
    headers: Record<string, string> = {},
    method?: string,
  ) => {
    const response = await runtime.dispatchFetch("https://relay.test" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  return {
    call,
    sql: () =>
      runtime.unsafeGetDurableObjectStorage(
        "feedback-test",
        "InspectableRelayRoom",
        { name: "private-beta-v1" },
      ),
    close: async () => {
      await runtime.dispose();
      runtimes.delete(runtime);
    },
  };
}
const beta = { "X-Framebridge-Beta": invite };
describe("private feedback in actual Worker and durable SQLite", () => {
  it("requires invitation and separate operator access, persists canonical reports after restart", async () => {
    let host = await start("restart");
    const report = {
      ...feedbackReport(),
      actual: "backend-only-secret-value Bearer abc123-secret",
    };
    expect((await host.call("/v1/feedback/config")).body.available).toBe(true);
    expect(
      (
        await host.call(
          "/v1/feedback",
          "",
          { reportToken: cap, report },
          { "X-Framebridge-Invite-Id": feedbackHash(invite) },
        )
      ).status,
    ).toBe(403);
    const created = await host.call(
      "/v1/feedback",
      "",
      { reportToken: cap, report },
      beta,
    );
    expect(created.status).toBe(201);
    expect(
      (await host.call("/v1/feedback", "", { reportToken: cap, report }, beta))
        .body,
    ).toEqual(created.body);
    expect(
      (
        await host.call(
          "/v1/feedback",
          "",
          { reportToken: cap, report },
          { "X-Framebridge-Beta": other },
        )
      ).status,
    ).toBe(409);
    expect((await host.call("/v1/feedback/reports", cap)).status).toBe(403);
    expect((await host.call("/v1/feedback/report", admin)).status).toBe(404);
    const stored = await (
      await host.sql()
    ).exec("SELECT owner,report,data FROM feedback");
    expect(stored).toHaveLength(1);
    expect(String(stored[0].owner)).toBe(feedbackHash(cap));
    expect(JSON.stringify(stored)).not.toContain(cap);
    expect(JSON.stringify(stored)).not.toContain("backend-only-secret-value");
    const review = (
      await host.call("/v1/feedback/reports/" + created.body.id, admin)
    ).body;
    expect(review.report.actual).toBe("[removed] Bearer [removed]");
    expect(
      (await host.call("/v1/feedback/reports", admin)).body.reports,
    ).toEqual([created.body]);
    await host.close();
    host = await start("restart");
    expect((await host.call("/v1/feedback/report", cap)).body).toEqual(review);
    expect(
      (await host.call("/v1/feedback/report", cap, undefined, {}, "DELETE"))
        .body.withdrawn,
    ).toBe(true);
    expect(
      (await host.call("/v1/feedback/report", cap, undefined, {}, "DELETE"))
        .body.withdrawn,
    ).toBe(true);
    expect(
      await (await host.sql()).exec("SELECT * FROM feedback"),
    ).toHaveLength(0);
    expect(
      (await host.call("/v1/feedback", "", { reportToken: cap, report }, beta))
        .status,
    ).toBe(410);
  });
  it("cancels an unknown pending attempt before a delayed submission and isolates invitation ownership", async () => {
    const host = await start("cancel");
    expect(
      (await host.call("/v1/feedback/cancel", "", { reportToken: cap }, beta))
        .status,
    ).toBe(200);
    expect(
      (
        await host.call(
          "/v1/feedback",
          "",
          { reportToken: cap, report: feedbackReport() },
          beta,
        )
      ).status,
    ).toBe(410);
    expect(
      (await host.call("/v1/feedback/cancel", "", { reportToken: cap }, beta))
        .status,
    ).toBe(200);
    const second = "c".repeat(64);
    await host.call(
      "/v1/feedback",
      "",
      { reportToken: second, report: feedbackReport() },
      beta,
    );
    expect(
      (
        await host.call(
          "/v1/feedback/cancel",
          "",
          { reportToken: second },
          { "X-Framebridge-Beta": other },
        )
      ).status,
    ).toBe(403);
    expect((await host.call("/v1/feedback/report", second)).status).toBe(200);
    expect(
      JSON.stringify(
        await (await host.sql()).exec("SELECT * FROM feedback_retired"),
      ),
    ).not.toContain(cap);
  });
  it("enforces actual daily quotas while duplicate requests are free and rejects unknown data", async () => {
    const host = await start("limits");
    for (let n = 1; n <= 5; n++) {
      const input = {
        reportToken: n.toString(16).padStart(64, "0"),
        report: feedbackReport(),
      };
      expect((await host.call("/v1/feedback", "", input, beta)).status).toBe(
        201,
      );
      expect((await host.call("/v1/feedback", "", input, beta)).status).toBe(
        201,
      );
    }
    expect(
      (
        await host.call(
          "/v1/feedback",
          "",
          { reportToken: cap, report: feedbackReport() },
          beta,
        )
      ).status,
    ).toBe(429);
    expect(
      (
        await host.call(
          "/v1/feedback",
          "",
          { reportToken: cap, report: { ...feedbackReport(), apiKey: "no" } },
          beta,
        )
      ).status,
    ).toBe(400);
    expect(
      await (await host.sql()).exec("SELECT id FROM feedback"),
    ).toHaveLength(5);
  });
  it("expires content, cleans revoked invites and leaves transfer sessions working", async () => {
    let host = await start("expiry");
    const receipt = (
      await host.call(
        "/v1/feedback",
        "",
        { reportToken: cap, report: feedbackReport() },
        beta,
      )
    ).body;
    expect(receipt.expiresAt - receipt.receivedAt).toBe(14 * 86400000);

    await (
      await host.sql()
    ).exec("UPDATE feedback SET expires=0,data=json_set(data,'$.expiresAt',0)");
    expect(
      (await host.call("/v1/feedback/reports", admin)).body.reports,
    ).toEqual([]);
    expect(
      await (await host.sql()).exec("SELECT * FROM feedback"),
    ).toHaveLength(0);
    await host.call(
      "/v1/feedback",
      "",
      { reportToken: "c".repeat(64), report: feedbackReport() },
      beta,
    );
    await host.close();
    host = await start("expiry", { BETA_ACCESS_HASHES: feedbackHash(other) });
    expect(
      (await host.call("/v1/feedback/reports", admin)).body.reports,
    ).toEqual([]);
    expect(
      (await host.call("/v1/sessions", "", {}, { "X-Framebridge-Beta": other }))
        .status,
    ).toBe(201);
  });
  it("keeps collection opt-in when no operator hash is configured", async () => {
    const host = await start("disabled", { FEEDBACK_ADMIN_HASH: "" });
    expect((await host.call("/v1/feedback/config")).body.available).toBe(false);
    expect(
      (
        await host.call(
          "/v1/feedback",
          "",
          { reportToken: cap, report: feedbackReport() },
          beta,
        )
      ).status,
    ).toBe(503);
  });
});
