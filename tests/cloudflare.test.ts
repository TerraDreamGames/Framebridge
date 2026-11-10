import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createHash } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoResult } from "../packages/core/src/demo";
import { feedbackReport } from "./feedback-fixture";
const invitation = "local-test-access-code-1234567890-abcd";
const key = "local-test-roblox-key";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
let script: string, directory: string;
const runtimes: Miniflare[] = [];
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ["packages/relay/cloudflare/worker.ts"],
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    external: ["node:*", "cloudflare:workers"],
    write: false,
    logLevel: "silent",
  });
  script = bundle.outputFiles[0].text;
  directory = await mkdtemp(join(tmpdir(), "framebridge-cloudflare-"));
});
afterAll(async () => {
  await Promise.all(runtimes.map((runtime) => runtime.dispose()));
  await rm(directory, { recursive: true, force: true });
});
async function start(name: string, overrides: Record<string, string> = {}) {
  let creates = 0,
    reads = 0;
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { RELAY: { className: "RelayRoom", useSQLite: true } },
      resourcePersistencePath: join(directory, name),
      telemetry: { enabled: false },
      bindings: { BETA_ACCESS_HASHES: hash(invitation), ...overrides },
      outboundService: async (request) => {
        if (request.url === "https://apis.roblox.com/assets/v1/assets") {
          creates++;
          return Response.json({ path: "operations/local-job" });
        }
        if (request.url.endsWith("/operations/local-job")) {
          reads++;
          return Response.json({
            done: true,
            response: {
              assetId: "123456",
              assetType: "Image",
              moderationResult: { moderationState: "Approved" },
            },
          });
        }
        throw new Error("Unexpected external request " + request.url);
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
    const response = await runtime.dispatchFetch("https://relay.test" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        // workerd resets unread rejected bodies across service bindings.
        // A fresh local socket avoids reusing that connection; no retry hides
        // an authorization failure. https://github.com/cloudflare/workerd/issues/7634
        Connection: "close",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  return { runtime, call, creates: () => creates, reads: () => reads };
}
async function paired(host: Awaited<ReturnType<typeof start>>) {
  const session = (
    await host.call(
      "/v1/sessions",
      "",
      {},
      { "X-Framebridge-Beta": invitation },
    )
  ).body;
  const pair = (await host.call("/v1/pair", "", { code: session.code })).body;
  expect(typeof pair.senderToken).toBe("string");
  return { session, pair };
}
describe("public Cloudflare relay in real workerd + SQLite storage", () => {
  it("rejects nested metadata without retaining design chunks", async () => {
    const host = await start("nested-metadata-boundary");
    const { session, pair } = await paired(host);
    const pkg = demoResult().package;
    let metadata: unknown = "leaf";
    for (let i = 0; i < 350; i++) metadata = { next: metadata };
    pkg.options = metadata as never;
    expect((await host.call("/v1/package", pair.senderToken, pkg)).status).toBe(
      400,
    );
    const inbox = await host.call("/v1/inbox", session.receiverToken);
    expect(inbox.body.revision).toBe(0);
    expect(inbox.body.package).toBeUndefined();
  });
  it("rejects unsafe instances before persisting any design chunks", async () => {
    const host = await start("unsafe-package-boundary");
    const { session, pair } = await paired(host);
    const pkg = demoResult().package;
    pkg.roots[0].children = [
      {
        id: "untrusted-script",
        name: "Script",
        className: "LocalScript",
        properties: { Source: "error('untrusted')" },
        children: [],
      },
    ];
    expect((await host.call("/v1/package", pair.senderToken, pkg)).status).toBe(
      400,
    );
    const inbox = await host.call("/v1/inbox", session.receiverToken);
    expect(inbox.body.revision).toBe(0);
    expect(inbox.body.package).toBeUndefined();
  });
  it("pairs and repeatedly transfers without an invite while keeping role capabilities private", async () => {
    const host = await start("public-pairing", {
      ACCESS_MODE: "public",
      BETA_ACCESS_HASHES: "",
    });
    expect((await host.call("/health")).body).toMatchObject({
      access: "public",
      configured: true,
    });
    const first = await host.call("/v1/sessions", "", {});
    expect(first.status).toBe(201);
    const { receiverToken, code } = first.body;
    const pair = await host.call("/v1/pair", "", { code });
    expect(pair.status).toBe(200);
    expect((await host.call("/v1/pair", "", { code })).status).toBe(401);
    const pkg = demoResult().package;
    for (let revision = 1; revision <= 2; revision++) {
      pkg.roots[0].name += " public";
      expect(
        (await host.call("/v1/package", pair.body.senderToken, pkg)).body
          .revision,
      ).toBe(revision);
      expect(
        (await host.call(`/v1/inbox?after=${revision - 1}`, receiverToken))
          .body,
      ).toMatchObject({ paired: true, revision, package: pkg });
      expect(
        (
          await host.call("/v1/receipt", receiverToken, {
            revision,
            status: "imported",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await host.call(
            `/v1/receipt?revision=${revision}`,
            pair.body.senderToken,
          )
        ).body.status,
      ).toBe("imported");
    }
    expect((await host.call("/v1/inbox")).status).toBe(401);
    expect((await host.call("/v1/inbox", pair.body.senderToken)).status).toBe(
      404,
    );
    expect((await host.call("/v1/package", receiverToken, pkg)).status).toBe(
      404,
    );
    expect((await host.call("/v1/roblox/account")).status).toBe(401);
    expect(
      (await host.call("/v1/assets", pair.body.senderToken, {})).status,
    ).toBe(400);
    expect(host.creates()).toBe(0);
    expect(
      (await host.call("/v1/session", receiverToken, undefined, {}, "DELETE"))
        .status,
    ).toBe(200);
    expect((await host.call("/v1/session", pair.body.senderToken)).status).toBe(
      401,
    );
  });
  it("shares design codes without tester codes and protects owner and receipt capabilities", async () => {
    const host = await start("public-handoff", {
      ACCESS_MODE: "public",
      BETA_ACCESS_HASHES: "",
    });
    const created = await host.call("/v1/upload-sessions", "", {});
    expect(created.status).toBe(201);
    const ownerToken = "a".repeat(64),
      receiptToken = "b".repeat(64);
    const pkg = demoResult().package;
    const handoff = await host.call("/v1/handoffs", created.body.uploadToken, {
      ownerToken,
      package: pkg,
    });
    expect(handoff.status).toBe(201);
    const opened = await host.call(
      "/v1/handoffs/open",
      "",
      { code: handoff.body.code, receiptToken },
      { "CF-Connecting-IP": "192.0.2.2" },
    );
    expect(opened.status).toBe(200);
    expect(opened.body.package).toEqual(pkg);
    expect((await host.call("/v1/handoff", receiptToken)).status).toBe(404);
    expect(
      (await host.call("/v1/handoff", ownerToken, undefined, {}, "DELETE"))
        .status,
    ).toBe(200);
    expect(
      (
        await host.call("/v1/handoffs/open", "", {
          code: handoff.body.code,
          receiptToken: "c".repeat(64),
        })
      ).status,
    ).toBe(404);
  });
  it("cannot bypass client quotas with forged invitation headers", async () => {
    const host = await start("public-quotas", {
      ACCESS_MODE: "public",
      BETA_ACCESS_HASHES: "",
    });
    for (let i = 0; i < 4; i++)
      expect(
        (
          await host.call(
            "/v1/sessions",
            "",
            {},
            {
              "CF-Connecting-IP": "192.0.2.1",
              "X-Framebridge-Invite-Id": hash(String(i)),
              "X-Framebridge-Beta": String(i),
            },
          )
        ).status,
      ).toBe(201);
    expect(
      (
        await host.call(
          "/v1/sessions",
          "",
          {},
          {
            "CF-Connecting-IP": "192.0.2.1",
            "X-Framebridge-Invite-Id": hash("new"),
          },
        )
      ).status,
    ).toBe(429);
    expect(
      (
        await host.call(
          "/v1/sessions",
          "",
          {},
          { "CF-Connecting-IP": "192.0.2.2" },
        )
      ).status,
    ).toBe(201);
  });
  it("accepts private reports without an invite but retains administrator and receipt authorization", async () => {
    const host = await start("public-feedback", {
      ACCESS_MODE: "public",
      BETA_ACCESS_HASHES: "",
      FEEDBACK_ADMIN_HASH: hash("d".repeat(64)),
    });
    const reportToken = "e".repeat(64);
    expect(
      (
        await host.call("/v1/feedback", "", {
          reportToken,
          report: feedbackReport(),
        })
      ).status,
    ).toBe(201);
    expect((await host.call("/v1/feedback/reports")).status).toBe(403);
    expect(
      (await host.call("/v1/feedback/report", "f".repeat(64))).status,
    ).toBe(404);
    expect((await host.call("/v1/feedback/report", reportToken)).status).toBe(
      200,
    );
    expect(
      (
        await host.call(
          "/v1/feedback/report",
          reportToken,
          undefined,
          {},
          "DELETE",
        )
      ).status,
    ).toBe(200);
  });
  it("preserves an existing invited connection during the public upgrade", async () => {
    let host = await start("public-upgrade");
    const { session, pair } = await paired(host);
    await host.runtime.dispose();
    host = await start("public-upgrade", { ACCESS_MODE: "public" });
    expect((await host.call("/v1/session", session.receiverToken)).status).toBe(
      200,
    );
    expect(
      (await host.call("/v1/package", pair.senderToken, demoResult().package))
        .status,
    ).toBe(200);
    expect((await host.call("/v1/sessions", "", {})).status).toBe(201);
  });
});
describe("private Cloudflare relay in real workerd + SQLite storage", () => {
  it("charges new snapshots to the existing transfer budget, but permits a lost-response retry", async () => {
    const host = await start("handoff-transfer-budget", {
      DAILY_TRANSFERS: "1",
    });
    const { pair } = await paired(host);
    const body = { ownerToken: "f".repeat(64), package: demoResult().package };
    expect(
      (await host.call("/v1/handoffs", pair.senderToken, body)).status,
    ).toBe(201);
    expect(
      (await host.call("/v1/handoffs", pair.senderToken, body)).status,
    ).toBe(201);
    expect(
      (
        await host.call("/v1/handoffs", pair.senderToken, {
          ...body,
          ownerToken: "a".repeat(64),
        })
      ).status,
    ).toBe(429);
    expect(
      (await host.call("/v1/package", pair.senderToken, body.package)).status,
    ).toBe(429);
    expect((await host.call("/v1/handoff", body.ownerToken)).body.name).toBe(
      body.package.name,
    );
  });
  it("requires a private recipient invitation and isolates code, receipt and owner capabilities", async () => {
    const invite2 = "local-second-invite-1234567890-abcd",
      host = await start("handoff-access", {
        BETA_ACCESS_HASHES: [hash(invitation), hash(invite2)].join(","),
      });
    const { session, pair } = await paired(host),
      ownerToken = "a".repeat(64),
      receiptToken = "b".repeat(64),
      body = { ownerToken, package: demoResult().package, ttlMinutes: 1440 };
    expect(
      (await host.call("/v1/handoffs", session.receiverToken, body)).status,
    ).toBe(404);
    const created = await host.call("/v1/handoffs", pair.senderToken, body);
    expect(created.status).toBe(201);
    const opening = { code: created.body.code, receiptToken };
    expect(
      (
        await host.call("/v1/handoffs/open", "", opening, {
          "X-Framebridge-Invite-Id": hash(invitation),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await host.call("/v1/handoffs/open", "", opening, {
          "X-Framebridge-Beta": "invalid",
        })
      ).status,
    ).toBe(403);
    const opened = await host.call("/v1/handoffs/open", "", opening, {
      "X-Framebridge-Beta": invite2,
    });
    expect(opened.status).toBe(200);
    expect(opened.body.package).toEqual(body.package);
    expect((await host.call("/v1/handoff", receiptToken)).status).toBe(404);
    expect(
      (
        await host.call("/v1/handoff-receipt", ownerToken, {
          status: "imported",
        })
      ).status,
    ).toBe(401);
    await host.call("/v1/handoff-receipt", receiptToken, { status: "ready" });
    await host.call("/v1/handoff-receipt", receiptToken, {
      status: "imported",
    });
    expect(
      (await host.call("/v1/handoff", ownerToken)).body.receipts,
    ).toMatchObject([{ status: "imported" }]);
    expect(
      (await host.call("/v1/handoff", ownerToken, undefined, {}, "DELETE"))
        .status,
    ).toBe(200);
    expect(
      (await host.call("/v1/handoffs", pair.senderToken, body)).status,
    ).toBe(410);
    expect(
      (
        await host.call("/v1/handoffs/open", "", opening, {
          "X-Framebridge-Beta": invite2,
        })
      ).status,
    ).toBe(404);
    expect((await host.call("/v1/session", pair.senderToken)).body.role).toBe(
      "sender",
    );
  });
  it("persists chunked Unicode snapshots and receipts across restarts independently of the source session", async () => {
    let host = await start("handoff-persistent");
    const upload = (
      await host.call(
        "/v1/upload-sessions",
        "",
        {},
        { "X-Framebridge-Beta": invitation },
      )
    ).body;
    const ownerToken = "d".repeat(64),
      receiptToken = "e".repeat(64),
      pkg = demoResult().package;
    pkg.roots[0].children.push({
      id: "large-text",
      name: "Unicode",
      className: "TextLabel",
      properties: { Text: "界😀".repeat(500_000) },
      children: [],
    });
    const created = await host.call("/v1/handoffs", upload.uploadToken, {
      ownerToken,
      package: pkg,
      ttlMinutes: 1440,
    });
    expect(created.status).toBe(201);
    await host.call("/v1/session", upload.uploadToken, undefined, {}, "DELETE");
    await host.runtime.dispose();
    host = await start("handoff-persistent");
    const opened = await host.call(
      "/v1/handoffs/open",
      "",
      { code: created.body.code, receiptToken },
      { "X-Framebridge-Beta": invitation },
    );
    expect(opened.status).toBe(200);
    expect(hash(JSON.stringify(opened.body.package))).toBe(
      hash(JSON.stringify(pkg)),
    );
    await host.call("/v1/handoff-receipt", receiptToken, {
      status: "imported",
    });
    await host.runtime.dispose();
    host = await start("handoff-persistent");
    expect(
      (await host.call("/v1/handoff", ownerToken)).body.receipts,
    ).toMatchObject([{ status: "imported" }]);
    expect(
      (
        await host.call("/v1/handoff-receipt", receiptToken, {
          status: "ready",
        })
      ).status,
    ).toBe(409);
    expect((await host.call("/v1/handoff", upload.uploadToken)).status).toBe(
      404,
    );
  });
  it("revokes codes when the creator invitation is removed, and claims when the recipient is removed", async () => {
    const second = "second-private-invitation-1234567890";
    let host = await start("handoff-revoked", {
      BETA_ACCESS_HASHES: [hash(invitation), hash(second)].join(","),
    });
    const upload = (
      await host.call(
        "/v1/upload-sessions",
        "",
        {},
        { "X-Framebridge-Beta": invitation },
      )
    ).body;
    const ownerToken = "f".repeat(64),
      receiptToken = "1".repeat(64);
    const created = await host.call("/v1/handoffs", upload.uploadToken, {
      ownerToken,
      package: demoResult().package,
    });
    await host.call(
      "/v1/handoffs/open",
      "",
      { code: created.body.code, receiptToken },
      { "X-Framebridge-Beta": second },
    );
    await host.runtime.dispose();
    host = await start("handoff-revoked");
    expect(
      (
        await host.call("/v1/handoff-receipt", receiptToken, {
          status: "imported",
        })
      ).status,
    ).toBe(401);
    expect((await host.call("/v1/handoff", ownerToken)).status).toBe(200);
    await host.runtime.dispose();
    host = await start("handoff-revoked", { BETA_ACCESS_HASHES: hash(second) });
    expect((await host.call("/v1/handoff", ownerToken)).status).toBe(404);
    expect(
      (
        await host.call(
          "/v1/handoffs/open",
          "",
          { code: created.body.code, receiptToken },
          { "X-Framebridge-Beta": second },
        )
      ).status,
    ).toBe(404);
  });
  it("wakes waiting inboxes and receipts on delivery, and revokes pending requests on disconnect", async () => {
    const host = await start("long-poll"),
      { session, pair } = await paired(host);
    const other = await paired(host);
    let settled = false;
    const inbox = host
      .call("/v1/inbox?after=0&paired=true&wait=5000", session.receiverToken)
      .then((r) => {
        settled = true;
        return r;
      });
    await new Promise((r) => setTimeout(r, 50));
    expect(settled).toBe(false);
    await host.call(
      "/v1/package",
      other.pair.senderToken,
      demoResult().package,
    );
    expect(settled).toBe(false);
    await host.call("/v1/package", pair.senderToken, demoResult().package);
    expect((await inbox).body).toMatchObject({
      longPoll: true,
      revision: 1,
      package: { format: "framebridge" },
    });
    const receipt = host.call(
      "/v1/receipt?revision=1&wait=5000",
      pair.senderToken,
    );
    await new Promise((r) => setTimeout(r, 50));
    await host.call("/v1/receipt", session.receiverToken, {
      revision: 1,
      status: "imported",
    });
    expect((await receipt).body).toEqual({
      revision: 1,
      status: "imported",
      longPoll: true,
    });
    const waiting = host.call(
      "/v1/inbox?after=1&paired=true&wait=5000",
      session.receiverToken,
    );
    await new Promise((r) => setTimeout(r, 50));
    await host.call("/v1/session", pair.senderToken, undefined, {}, "DELETE");
    expect((await waiting).status).toBe(401);
    const timed = await host.call(
      "/v1/inbox?after=1&paired=true&wait=20",
      other.session.receiverToken,
    );
    expect(timed.body).toEqual({
      revision: 1,
      paired: true,
      longPoll: true,
      pollAfterMs: 5000,
    });
  });
  it("bounds pending HTTP waits and returns pairing changes immediately", async () => {
    const host = await start("wait-bounds");
    const session = (
      await host.call(
        "/v1/sessions",
        "",
        {},
        { "X-Framebridge-Beta": invitation },
      )
    ).body;
    const one = host.call(
      "/v1/inbox?after=0&paired=false&wait=5000",
      session.receiverToken,
    );
    const two = host.call(
      "/v1/inbox?after=0&paired=false&wait=5000",
      session.receiverToken,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(
      (
        await host.call(
          "/v1/inbox?after=0&paired=false&wait=5000",
          session.receiverToken,
        )
      ).status,
    ).toBe(429);
    await host.call("/v1/pair", "", { code: session.code });
    expect((await one).body.paired).toBe(true);
    expect((await two).body.paired).toBe(true);
  });
  it("keeps both roles connected across imports and resumes without reusing the pairing code", async () => {
    const host = await start("reusable"),
      { session, pair } = await paired(host);
    for (let revision = 1; revision <= 3; revision++) {
      const pkg = demoResult().package;
      pkg.roots[0].name = "Screen " + revision;
      expect(
        (await host.call("/v1/package", pair.senderToken, pkg)).body.revision,
      ).toBe(revision);
      const inbox = await host.call(
        `/v1/inbox?after=${revision - 1}`,
        session.receiverToken,
      );
      expect(inbox.body.paired).toBe(true);
      expect(inbox.body.revision).toBe(revision);
      await host.call("/v1/receipt", session.receiverToken, {
        revision,
        status: "imported",
      });
      const sender = await host.call("/v1/session", pair.senderToken);
      expect(sender).toEqual({
        status: 200,
        body: { role: "sender", paired: true, expiresAt: pair.expiresAt },
      });
      const receiver = await host.call("/v1/session", session.receiverToken);
      expect(receiver.body).toEqual({
        role: "receiver",
        paired: true,
        expiresAt: session.expiresAt,
        importedRevision: revision,
      });
      expect(JSON.stringify(receiver.body)).not.toContain(pair.senderToken);
      expect(JSON.stringify(receiver.body)).not.toContain(session.code);
    }
    expect(
      (await host.call("/v1/pair", "", { code: session.code })).status,
    ).toBe(401);
    await host.call("/v1/session", pair.senderToken, undefined, {}, "DELETE");
    expect((await host.call("/v1/session", session.receiverToken)).status).toBe(
      401,
    );
    expect((await host.call("/v1/session", pair.senderToken)).status).toBe(401);
  });
  it("invalidates both session roles when a tester invitation is revoked", async () => {
    let host = await start("revocation");
    const { session, pair } = await paired(host);
    await host.runtime.dispose();
    runtimes.splice(runtimes.indexOf(host.runtime), 1);
    host = await start("revocation", {
      BETA_ACCESS_HASHES: hash("another-testers-private-access-code"),
    });
    expect((await host.call("/v1/inbox", session.receiverToken)).status).toBe(
      401,
    );
    expect(
      (await host.call("/v1/package", pair.senderToken, demoResult().package))
        .status,
    ).toBe(401);
    expect(
      (
        await host.call(
          "/v1/sessions",
          "",
          {},
          { "X-Framebridge-Beta": invitation },
        )
      ).status,
    ).toBe(403);
  });
  it("fails closed without invitations and rejects spoofed invite headers", async () => {
    const unconfigured = await start("closed", { BETA_ACCESS_HASHES: "" });
    expect((await unconfigured.call("/v1/sessions", "", {})).status).toBe(503);
    const host = await start("private");
    expect((await host.call("/v1/sessions", "", {})).status).toBe(403);
    expect(
      (
        await host.call(
          "/v1/sessions",
          "",
          {},
          { "X-Framebridge-Invite-Id": hash(invitation) },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await host.call(
          "/v1/upload-sessions",
          "",
          {},
          { "X-Framebridge-Beta": "wrong" },
        )
      ).status,
    ).toBe(403);
    const { session, pair } = await paired(host);
    expect((await host.call("/v1/inbox", pair.senderToken)).status).toBe(404);
    expect(
      (
        await host.call(
          "/v1/package",
          session.receiverToken,
          demoResult().package,
        )
      ).status,
    ).toBe(404);
    expect(
      (await host.call("/v1/pair", "", { code: session.code })).status,
    ).toBe(401);
  });
  it("persists pairing, multi-chunk packages and receipts across process restart", async () => {
    let host = await start("restart");
    const { session, pair } = await paired(host);
    const pkg = demoResult().package;
    pkg.issues.push({
      severity: "info",
      nodeId: "test",
      nodeName: "test",
      code: "long-text",
      message: "界".repeat(750_000),
    });
    expect(
      (await host.call("/v1/package", pair.senderToken, pkg)).body.revision,
    ).toBe(1);
    expect(
      (
        await host.call("/v1/receipt", session.receiverToken, {
          revision: 1,
          status: "ready",
        })
      ).status,
    ).toBe(200);
    await host.runtime.dispose();
    runtimes.splice(runtimes.indexOf(host.runtime), 1);
    host = await start("restart");
    expect((await host.call("/v1/session", pair.senderToken)).body.role).toBe(
      "sender",
    );
    const inbox = await host.call("/v1/inbox?after=0", session.receiverToken);
    expect(inbox.status, JSON.stringify(inbox.body.error)).toBe(200);
    expect(JSON.stringify(inbox.body.package) === JSON.stringify(pkg)).toBe(
      true,
    );
    expect(inbox.body.pollAfterMs).toBe(5000);
    expect(
      (await host.call("/v1/receipt?revision=1", pair.senderToken)).body.status,
    ).toBe("ready");
    expect(
      (await host.call("/v1/inbox?after=1", session.receiverToken)).body
        .package,
    ).toBeUndefined();
  });
  it("deduplicates unchanged exports and preserves the current revision after concurrent sends", async () => {
    const host = await start("versions"),
      { session, pair } = await paired(host);
    const pkg = demoResult().package;
    const sent = await Promise.all([
      host.call("/v1/package", pair.senderToken, pkg),
      host.call("/v1/package", pair.senderToken, {
        ...pkg,
        createdAt: "later",
      }),
    ]);
    expect(sent.map((r) => r.body.revision)).toEqual([1, 1]);
    expect(sent.filter((r) => r.body.unchanged)).toHaveLength(1);
    pkg.roots[0].name = "Changed";
    expect(
      (await host.call("/v1/package", pair.senderToken, pkg)).body.revision,
    ).toBe(2);
    expect(
      (
        await host.call("/v1/receipt", session.receiverToken, {
          revision: 1,
          status: "imported",
        })
      ).status,
    ).toBe(409);
    expect(
      (await host.call("/v1/receipt?revision=1", pair.senderToken)).body.status,
    ).toBe("superseded");
  });
  it("isolates sessions and deletes capabilities and packages on disconnect", async () => {
    const host = await start("isolation"),
      first = await paired(host),
      second = await paired(host);
    await host.call(
      "/v1/package",
      first.pair.senderToken,
      demoResult().package,
    );
    expect(
      (await host.call("/v1/inbox", second.session.receiverToken)).body.package,
    ).toBeUndefined();
    await host.call(
      "/v1/session",
      first.pair.senderToken,
      undefined,
      {},
      "DELETE",
    );
    expect(
      (await host.call("/v1/inbox", first.session.receiverToken)).status,
    ).toBe(401);
    expect(
      (
        await host.call(
          "/v1/package",
          first.pair.senderToken,
          demoResult().package,
        )
      ).status,
    ).toBe(401);
  });
  it("resumes a Roblox operation after restart without storing its key or creating another asset", async () => {
    let host = await start("upload"),
      { session, pair } = await paired(host);
    const bytes = await readFile("tests/fixtures/upload-test.png");
    const input = {
      owner: { kind: "user", id: "123" },
      name: "Image",
      png: bytes.toString("base64"),
    };
    const headers = { "X-Roblox-Api-Key": key };
    const upload = await host.call(
      "/v1/assets",
      pair.senderToken,
      input,
      headers,
    );
    expect(upload.status).toBe(202);
    expect(host.creates(), JSON.stringify(upload.body)).toBe(1);
    expect(JSON.stringify(upload.body)).not.toContain("keyHash");
    const again = await host.call(
      "/v1/assets",
      pair.senderToken,
      input,
      headers,
    );
    expect(again.body.id).toBe(upload.body.id);
    expect(host.creates()).toBe(1);
    await host.runtime.dispose();
    runtimes.splice(runtimes.indexOf(host.runtime), 1);
    host = await start("upload");
    expect(
      (
        await host.call(
          "/v1/assets/" + upload.body.id,
          pair.senderToken,
          undefined,
          { "X-Roblox-Api-Key": "different-key-123" },
        )
      ).status,
    ).toBe(403);
    const complete = await host.call(
      "/v1/assets/" + upload.body.id,
      pair.senderToken,
      undefined,
      headers,
    );
    expect(complete.body.state).toBe("done");
    expect(complete.body.result.assetId).toBe("123456");
    expect(host.creates()).toBe(0);
    expect(
      (
        await host.call(
          "/v1/assets/" + upload.body.id,
          session.receiverToken,
          undefined,
          headers,
        )
      ).status,
    ).toBe(404);
  });
  it("enforces the global request budget and session capacity", async () => {
    const host = await start("quotas", {
      DAILY_REQUESTS: "2",
      MAX_SESSIONS: "1",
    });
    expect(
      (
        await host.call(
          "/v1/sessions",
          "",
          {},
          { "X-Framebridge-Beta": invitation },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await host.call(
          "/v1/sessions",
          "",
          {},
          { "X-Framebridge-Beta": invitation },
        )
      ).status,
    ).toBe(503);
    expect((await host.call("/v1/pair", "", { code: "wrong" })).status).toBe(
      429,
    );
  });
  it("rejects secrets in transfer envelopes and unlinked images", async () => {
    const host = await start("payload"),
      { pair } = await paired(host);
    expect(
      (
        await host.call("/v1/package", pair.senderToken, {
          ...demoResult().package,
          apiKey: key,
        })
      ).status,
    ).toBe(400);
    const pkg = demoResult().package;
    pkg.assets.push({
      id: "image:x",
      nodeId: "x",
      name: "Photo",
      filename: "x.png",
      width: 1,
      height: 1,
      scale: 1,
      reason: "photo",
    });
    expect((await host.call("/v1/package", pair.senderToken, pkg)).status).toBe(
      400,
    );
  });
});
