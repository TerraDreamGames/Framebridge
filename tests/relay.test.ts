import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { createRelay } from "../packages/relay/src/server";
import {
  PublicError,
  uploadImage,
  validateUpload,
  type Upload,
} from "../packages/relay/src/roblox";
import { demoResult } from "../packages/core/src/demo";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const input: Upload = {
  owner: { kind: "group", id: "123" },
  name: "Game icon",
  png,
};
const key = "test-only-roblox-key";
it("rejects corrupted or truncated PNG chunks before upload", () => {
  const bytes = Buffer.from(png, "base64");
  bytes[45] ^= 1;
  expect(() =>
    validateUpload({ ...input, png: bytes.toString("base64") }),
  ).toThrow("checksum");
  const truncated = Buffer.from(png, "base64").subarray(0, -5);
  expect(() =>
    validateUpload({ ...input, png: truncated.toString("base64") }),
  ).toThrow("truncated");
  const noEnd = Buffer.from(png, "base64").subarray(0, -12);
  expect(() =>
    validateUpload({ ...input, png: noEnd.toString("base64") }),
  ).toThrow("incomplete");
});
it("accepts the valid 64px RGBA live-upload fixture", () => {
  const bytes = readFileSync(
    new URL("./fixtures/upload-test.png", import.meta.url),
  );
  expect(validateUpload({ ...input, png: bytes.toString("base64") })).toEqual(
    bytes,
  );
});
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((r) => {
          server.closeAllConnections();
          server.close(() => r());
        }),
    ),
  );
});
async function start(options: Parameters<typeof createRelay>[0] = {}) {
  const server = createRelay(options);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (
    path: string,
    token?: string,
    body?: unknown,
    headers = {},
    method?: string,
  ) => {
    const response = await fetch(base + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const session = (await call("/v1/sessions", undefined, {})).body;
  const pair = (await call("/v1/pair", undefined, { code: session.code })).body;
  return { call, session, pair };
}
describe("private paired transfer", () => {
  it("rejects deeply nested metadata without advancing the inbox", async () => {
    const host = await start();
    const pkg = demoResult().package;
    let metadata: unknown = "leaf";
    for (let i = 0; i < 350; i++) metadata = { next: metadata };
    pkg.options = metadata as never;
    expect(
      (await host.call("/v1/package", host.pair.senderToken, pkg)).status,
    ).toBe(400);
    const inbox = await host.call("/v1/inbox", host.session.receiverToken);
    expect(inbox.body.revision).toBe(0);
    expect(inbox.body.package).toBeUndefined();
  });
  it("rejects unsafe tree structure without storing a transfer", async () => {
    const host = await start();
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
    expect(
      (await host.call("/v1/package", host.pair.senderToken, pkg)).status,
    ).toBe(400);
    const inbox = await host.call("/v1/inbox", host.session.receiverToken);
    expect(inbox.body.revision).toBe(0);
    expect(inbox.body.package).toBeUndefined();
  });
  it("hands off an immutable design without a paired Studio and keeps it after session expiry", async () => {
    let time = 1000;
    const host = await start({ now: () => time });
    await host.call(
      "/v1/session",
      host.pair.senderToken,
      undefined,
      {},
      "DELETE",
    );
    const upload = (await host.call("/v1/upload-sessions", "", {})).body;
    const ownerToken = "a".repeat(64),
      receiptToken = "b".repeat(64),
      other = "c".repeat(64),
      pkg = demoResult().package;
    const created = await host.call("/v1/handoffs", upload.uploadToken, {
      ownerToken,
      package: pkg,
      ttlMinutes: 1440,
    });
    expect(created.status).toBe(201);
    time += 7_200_001;
    const opened = await host.call("/v1/handoffs/open", "", {
      code: created.body.code,
      receiptToken,
    });
    expect(opened.body.package).toEqual(pkg);
    expect(
      (
        await host.call("/v1/handoff-receipt", receiptToken, {
          status: "imported",
        })
      ).status,
    ).toBe(200);
    expect(
      (await host.call("/v1/handoff", ownerToken)).body.receipts,
    ).toMatchObject([{ status: "imported" }]);
    expect((await host.call("/v1/handoff", other)).status).toBe(404);
    expect(
      (
        await host.call("/v1/handoffs/open", "", {
          code: created.body.code,
          receiptToken: other,
        })
      ).status,
    ).toBe(200);
    expect(
      (await host.call("/v1/handoff", ownerToken, undefined, {}, "DELETE"))
        .status,
    ).toBe(200);
    expect(
      (
        await host.call("/v1/handoffs/open", "", {
          code: created.body.code,
          receiptToken: other,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await host.call("/v1/handoff-receipt", receiptToken, {
          status: "ready",
        })
      ).status,
    ).toBe(401);
  });
  it("does not let a receiver create shares or confuse management and import capabilities", async () => {
    const host = await start(),
      input = { ownerToken: "a".repeat(64), package: demoResult().package };
    expect(
      (await host.call("/v1/handoffs", host.session.receiverToken, input))
        .status,
    ).toBe(404);
    const created = await host.call(
      "/v1/handoffs",
      host.pair.senderToken,
      input,
    );
    expect(created.status).toBe(201);
    expect((await host.call("/v1/handoff", host.pair.senderToken)).status).toBe(
      404,
    );
    expect(
      (await host.call("/v1/package", input.ownerToken, input.package)).status,
    ).toBe(401);
    expect(
      (await host.call("/v1/session", host.pair.senderToken)).body.role,
    ).toBe("sender");
    expect(
      (
        await host.call("/v1/handoff-receipt", input.ownerToken, {
          status: "ready",
        })
      ).status,
    ).toBe(401);
  });
  it("delivers waiting inboxes and receipts immediately, then invalidates a pending wait on disconnect", async () => {
    const { call, session, pair } = await start();
    let settled = false;
    const inbox = call(
      "/v1/inbox?after=0&paired=true&wait=5000",
      session.receiverToken,
    ).then((r) => {
      settled = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(settled).toBe(false);
    await call("/v1/package", pair.senderToken, demoResult().package);
    expect((await inbox).body).toMatchObject({
      revision: 1,
      longPoll: true,
      package: { format: "framebridge" },
    });
    const receipt = call("/v1/receipt?revision=1&wait=5000", pair.senderToken);
    await new Promise((r) => setTimeout(r, 30));
    await call("/v1/receipt", session.receiverToken, {
      revision: 1,
      status: "ready",
    });
    expect((await receipt).body).toEqual({
      revision: 1,
      status: "ready",
      longPoll: true,
    });
    const waiting = call(
      "/v1/inbox?after=1&paired=true&wait=5000",
      session.receiverToken,
    );
    await new Promise((r) => setTimeout(r, 30));
    await call("/v1/session", pair.senderToken, undefined, {}, "DELETE");
    expect((await waiting).status).toBe(401);
  });
  it("pairs once, isolates roles, and delivers native frames without an API key", async () => {
    const { call, session, pair } = await start();
    expect(
      (await call("/v1/pair", undefined, { code: session.code })).status,
    ).toBe(401);
    expect((await call("/v1/inbox", pair.senderToken)).status).toBe(404);
    expect(
      (await call("/v1/package", session.receiverToken, demoResult().package))
        .status,
    ).toBe(404);
    expect(
      (await call("/v1/package", pair.senderToken, demoResult().package))
        .status,
    ).toBe(200);
    const received = await call("/v1/inbox", session.receiverToken);
    expect(received.body.package.roots[0].className).toBe("ScreenGui");
    expect(received.body.revision).toBe(1);
    expect(JSON.stringify(received.body)).not.toContain(pair.senderToken);
    expect(
      (await call("/v1/inbox?after=1", session.receiverToken)).body.package,
    ).toBeUndefined();
    expect((await call("/v1/inbox", "wrong-token")).status).toBe(401);
  });
  it("does not disclose a transfer to another connection", async () => {
    const { call, session, pair } = await start();
    const other = (await call("/v1/sessions", undefined, {})).body;
    await call("/v1/package", pair.senderToken, demoResult().package);
    expect(
      (await call("/v1/inbox", other.receiverToken)).body.package,
    ).toBeUndefined();
    await call("/v1/session", session.receiverToken, undefined, {}, "DELETE");
    expect(
      (await call("/v1/package", pair.senderToken, demoResult().package))
        .status,
    ).toBe(401);
  });
  it("expires codes at ten minutes and connections at two hours", async () => {
    let now = 1000;
    const { call, session } = await start({ now: () => now });
    const fresh = (await call("/v1/sessions", undefined, {})).body;
    now += 600_001;
    expect(
      (await call("/v1/pair", undefined, { code: fresh.code })).status,
    ).toBe(401);
    expect((await call("/v1/inbox", session.receiverToken)).status).toBe(200);
    now += 7_200_000;
    expect((await call("/v1/inbox", session.receiverToken)).status).toBe(401);
  });
  it("blocks unresolved artwork, conversion errors, and credential fields", async () => {
    const { call, pair } = await start();
    const pkg = demoResult().package;
    expect(
      (await call("/v1/package", pair.senderToken, { ...pkg, apiKey: key }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("/v1/package", pair.senderToken, {
          ...pkg,
          assets: [{ id: "art" }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/v1/package", pair.senderToken, {
          ...pkg,
          issues: [{ severity: "error" }],
        })
      ).status,
    ).toBe(400);
  });
  it("rejects nested OAuth capabilities and provider credentials in otherwise valid UI packages", async () => {
    const { call, pair } = await start();
    for (const field of [
      "accountToken",
      "loginToken",
      "oauthToken",
      "access_token",
      "refresh_token",
      "client_secret",
      "sealingKey",
    ]) {
      const pkg = structuredClone(demoResult().package);
      Object.assign(pkg.roots[0].properties, { [field]: "must-not-export" });
      expect((await call("/v1/package", pair.senderToken, pkg)).status).toBe(
        400,
      );
    }
  });
  it("bounds creation attempts", async () => {
    const { call } = await start();
    let status = 200;
    for (let i = 0; i < 22; i++)
      status = (await call("/v1/pair", undefined, { code: "bad" })).status;
    expect(status).toBe(429);
  });
});
describe("image upload jobs", () => {
  it("uploads with creator/key, caches identical artwork and scopes cache to ownership", async () => {
    const upload = vi.fn(
      async (_input: Upload, _bytes: Buffer, _key: string) => ({
        assetId: "456",
        moderation: "MODERATION_STATE_APPROVED",
      }),
    );
    const { call, pair, session } = await start({ upload });
    const headers = { "X-Roblox-Api-Key": key };
    const first = await call("/v1/assets", pair.senderToken, input, headers);
    expect(first.status).toBe(202);
    const repeat = await call("/v1/assets", pair.senderToken, input, headers);
    expect(repeat.body.id).toBe(first.body.id);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][2]).toBe(key);
    const job = await call(`/v1/assets/${first.body.id}`, pair.senderToken);
    expect(job.body.result.assetId).toBe("456");
    expect(JSON.stringify(job)).not.toContain(key);
    expect(
      (await call(`/v1/assets/${first.body.id}`, session.receiverToken)).status,
    ).toBe(404);
    await call(
      "/v1/assets",
      pair.senderToken,
      { ...input, owner: { kind: "user", id: "123" } },
      headers,
    );
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it("deduplicates concurrent requests before the upload finishes", async () => {
    let finish!: (v: { assetId: string; moderation: string }) => void;
    const upload = vi.fn(
      () =>
        new Promise<{ assetId: string; moderation: string }>((r) => {
          finish = r;
        }),
    );
    const { call, pair } = await start({ upload });
    const [a, b] = await Promise.all(
      [1, 2].map(() =>
        call("/v1/assets", pair.senderToken, input, {
          "X-Roblox-Api-Key": key,
        }),
      ),
    );
    expect(a.body.id).toBe(b.body.id);
    expect(upload).toHaveBeenCalledTimes(1);
    finish({ assetId: "456", moderation: "MODERATION_STATE_APPROVED" });
  });
  it("keeps uncertain failures without retrying an irreversible upload or leaking errors", async () => {
    const upload = vi.fn(async () => {
      throw new Error(`unexpected with ${key}`);
    });
    const { call, pair } = await start({ upload });
    const first = await call("/v1/assets", pair.senderToken, input, {
      "X-Roblox-Api-Key": key,
    });
    const again = await call("/v1/assets", pair.senderToken, input, {
      "X-Roblox-Api-Key": key,
    });
    expect(first.body.id).toBe(again.body.id);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(again.body.state).toBe("failed");
    expect(JSON.stringify(again)).not.toContain(key);
  });
  it("lets a later explicit upload retry a definite rejection without creating another job", async () => {
    let time = 100000;
    const upload = vi
      .fn<typeof uploadImage>()
      .mockRejectedValueOnce(
        new PublicError("Image name was rejected.", 502, true),
      )
      .mockResolvedValue({
        assetId: "456",
        moderation: "MODERATION_STATE_APPROVED",
      });
    const { call, pair } = await start({ upload, now: () => time });
    const headers = { "X-Roblox-Api-Key": key };
    const first = await call("/v1/assets", pair.senderToken, input, headers);
    expect(
      (await call("/v1/assets/" + first.body.id, pair.senderToken)).body.state,
    ).toBe("failed");
    await call("/v1/assets", pair.senderToken, input, headers);
    expect(upload).toHaveBeenCalledTimes(1);
    time += 11000;
    const retried = await call(
      "/v1/assets",
      pair.senderToken,
      { ...input, name: "Test image" },
      headers,
    );
    expect(retried.body.id).toBe(first.body.id);
    const result = await call("/v1/assets/" + first.body.id, pair.senderToken);
    expect(result.body.state).toBe("done");
    expect(result.body.error).toBeUndefined();
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed PNGs, wrong dimensions, missing credentials and invalid owners", async () => {
    const upload = vi.fn();
    const { call, pair } = await start({ upload });
    expect((await call("/v1/assets", pair.senderToken, input)).status).toBe(
      400,
    );
    expect(
      (
        await call(
          "/v1/assets",
          pair.senderToken,
          { ...input, png: "aaaa" },
          { "X-Roblox-Api-Key": key },
        )
      ).status,
    ).toBe(400);
    expect(() =>
      validateUpload({
        ...input,
        owner: { kind: "group", id: "https://example.com" },
      }),
    ).toThrow("numeric");
    const bytes = Buffer.from(png, "base64");
    bytes.writeUInt32BE(5000, 16);
    expect(() =>
      validateUpload({ ...input, png: bytes.toString("base64") }),
    ).toThrow("4096");
    expect(upload).not.toHaveBeenCalled();
  });
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
describe("Roblox Open Cloud protocol", () => {
  it.each(["Approved", "Reviewing", "Rejected"])(
    "handles live moderation state %s",
    async (moderationState) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ path: "operations/live" }))
        .mockResolvedValueOnce(
          response({
            done: true,
            response: {
              assetId: "456",
              assetType: "Image",
              moderationResult: { moderationState },
            },
          }),
        );
      const job = uploadImage(input, validateUpload(input), key, {
        fetch: request,
        sleep: async () => {},
      });
      if (moderationState === "Rejected")
        await expect(job).rejects.toThrow("rejected");
      else
        expect((await job).moderation).toBe(
          `MODERATION_STATE_${moderationState.toUpperCase()}`,
        );
    },
  );
  it("sends an Image multipart upload, polls, and returns a usable ID", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ path: "operations/op-1" }))
      .mockResolvedValueOnce(response({ done: false }))
      .mockResolvedValueOnce(
        response({
          done: true,
          response: {
            assetId: "456",
            assetType: "ASSET_TYPE_IMAGE",
            moderationResult: { moderationState: "MODERATION_STATE_APPROVED" },
          },
        }),
      );
    const result = await uploadImage(input, validateUpload(input), key, {
      fetch: request,
      sleep: async () => {},
    });
    expect(result.assetId).toBe("456");
    expect(request).toHaveBeenCalledTimes(3);
    const [url, opts] = request.mock.calls[0];
    expect(url).toBe("https://apis.roblox.com/assets/v1/assets");
    expect(opts?.headers).toEqual({ "x-api-key": key });
    const form = opts?.body as FormData;
    const metadata = JSON.parse(form.get("request") as string);
    expect(metadata.assetType).toBe("Image");
    expect(metadata.creationContext.creator).toEqual({ groupId: "123" });
    expect((form.get("fileContent") as Blob).type).toBe("image/png");
  });
  it.each([401, 403, 429, 500])(
    "reports HTTP %s without reflecting remote response secrets",
    async (status) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ error: key }, status));
      await expect(
        uploadImage(input, validateUpload(input), key, { fetch: request }),
      ).rejects.toBeInstanceOf(PublicError);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("never retries an ambiguous create and rejects untrusted operation paths", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network lost"));
    await expect(
      uploadImage(input, validateUpload(input), key, { fetch: request }),
    ).rejects.toThrow("duplicate");
    expect(request).toHaveBeenCalledTimes(1);
    request
      .mockReset()
      .mockResolvedValue(response({ path: "https://attacker.example/steal" }));
    await expect(
      uploadImage(input, validateUpload(input), key, { fetch: request }),
    ).rejects.toThrow("unexpected upload operation");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["ASSET_TYPE_DECAL", "Model"])(
    "rejects %s instead of mistaking its ID for an Image",
    async (assetType) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ path: "operations/abc" }))
        .mockResolvedValue(
          response({ done: true, response: { assetId: "123", assetType } }),
        );
      await expect(
        uploadImage(input, validateUpload(input), key, {
          fetch: request,
          sleep: async () => {},
        }),
      ).rejects.toThrow("Image asset");
    },
  );
  it("handles throttled polls, pending moderation, rejection and timeouts", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ path: "operations/abc" }))
      .mockResolvedValueOnce(response({}, 429))
      .mockResolvedValue(
        response({
          done: true,
          response: {
            assetId: "123",
            assetType: "Image",
            moderationResult: { moderationState: "MODERATION_STATE_REVIEWING" },
          },
        }),
      );
    expect(
      (
        await uploadImage(input, validateUpload(input), key, {
          fetch: request,
          sleep: async () => {},
        })
      ).moderation,
    ).toContain("REVIEWING");
    request
      .mockReset()
      .mockResolvedValueOnce(response({ path: "operations/abc" }))
      .mockResolvedValue(
        response({
          done: true,
          response: {
            assetId: "123",
            assetType: "Image",
            moderationResult: { moderationState: "MODERATION_STATE_REJECTED" },
          },
        }),
      );
    await expect(
      uploadImage(input, validateUpload(input), key, {
        fetch: request,
        sleep: async () => {},
      }),
    ).rejects.toThrow("rejected");
    request
      .mockReset()
      .mockResolvedValueOnce(response({ path: "operations/abc" }))
      .mockImplementation(async () => response({ done: false }));
    await expect(
      uploadImage(input, validateUpload(input), key, {
        fetch: request,
        sleep: async () => {},
        polls: 2,
      }),
    ).rejects.toThrow("still processing");
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe("standalone upload sessions", () => {
  it("uploads independently, hides jobs across sessions, and has no Studio receiver or sender privileges", async () => {
    const upload = vi.fn(async () => ({
      assetId: "456",
      moderation: "MODERATION_STATE_APPROVED",
    }));
    const { call, pair } = await start({ upload });
    const session = (await call("/v1/upload-sessions", undefined, {})).body;
    expect(session.uploadToken).toMatch(/^[a-f0-9]{64}$/);
    expect(session.code).toBeUndefined();
    expect(session.receiverToken).toBeUndefined();
    const job = await call("/v1/assets", session.uploadToken, input, {
      "X-Roblox-Api-Key": key,
    });
    expect(job.status).toBe(202);
    expect(
      (await call(`/v1/assets/${job.body.id}`, session.uploadToken)).body.result
        .assetId,
    ).toBe("456");
    expect(
      (await call(`/v1/assets/${job.body.id}`, pair.senderToken)).status,
    ).toBe(404);
    expect((await call("/v1/inbox", session.uploadToken)).status).toBe(404);
    expect(
      (await call("/v1/package", session.uploadToken, demoResult().package))
        .status,
    ).toBe(404);
    await call("/v1/session", session.uploadToken, undefined, {}, "DELETE");
    expect(
      (await call(`/v1/assets/${job.body.id}`, session.uploadToken)).status,
    ).toBe(401);
  });
  it("expires and shares creation limits with paired sessions", async () => {
    let now = 1000;
    const { call } = await start({ now: () => now, maxSessions: 2 });
    const standalone = await call("/v1/upload-sessions", undefined, {});
    expect(standalone.status).toBe(201);
    expect((await call("/v1/upload-sessions", undefined, {})).status).toBe(503);
    now += 7_200_001;
    expect(
      (await call("/v1/assets/missing", standalone.body.uploadToken)).status,
    ).toBe(401);
    expect((await call("/v1/upload-sessions", undefined, {})).status).toBe(201);
  });
});

describe("Studio delivery receipts", () => {
  it("restricts receipt roles and tracks only the latest export", async () => {
    const { call, session, pair } = await start();
    await call("/v1/package", pair.senderToken, demoResult().package);
    expect(
      (await call("/v1/receipt?revision=1", pair.senderToken)).body,
    ).toEqual({ revision: 1, status: "pending" });
    expect(
      (await call("/v1/receipt?revision=1", session.receiverToken)).status,
    ).toBe(404);
    expect(
      (
        await call("/v1/receipt", pair.senderToken, {
          revision: 1,
          status: "imported",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("/v1/receipt", session.receiverToken, {
          revision: 1,
          status: "invented",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/v1/receipt", session.receiverToken, {
          revision: 1,
          status: "failed",
          message: {},
        })
      ).status,
    ).toBe(400);
    await call("/v1/receipt", session.receiverToken, {
      revision: 1,
      status: "queued",
    });
    expect(
      (await call("/v1/receipt?revision=1", pair.senderToken)).body.status,
    ).toBe("queued");
    await call("/v1/receipt", session.receiverToken, {
      revision: 1,
      status: "imported",
    });
    expect(
      (await call("/v1/receipt?revision=1", pair.senderToken)).body.status,
    ).toBe("imported");
    await call("/v1/package", pair.senderToken, demoResult().package);
    expect(
      (await call("/v1/receipt?revision=2", pair.senderToken)).body.status,
    ).toBe("pending");
    expect(
      (await call("/v1/receipt?revision=1", pair.senderToken)).body.status,
    ).toBe("superseded");
    expect(
      (
        await call("/v1/receipt", session.receiverToken, {
          revision: 1,
          status: "imported",
        })
      ).status,
    ).toBe(409);
    for (const revision of [0, 3, 1.5, "abc"])
      expect(
        (await call(`/v1/receipt?revision=${revision}`, pair.senderToken))
          .status,
      ).toBe(400);
  });
  it("isolates receipts between sessions and bounds error text", async () => {
    const { call, session, pair } = await start();
    const other = (await call("/v1/sessions", undefined, {})).body;
    const otherPair = (await call("/v1/pair", undefined, { code: other.code }))
      .body;
    await call("/v1/package", pair.senderToken, demoResult().package);
    await call("/v1/package", otherPair.senderToken, demoResult().package);
    await call("/v1/receipt", session.receiverToken, {
      revision: 1,
      status: "failed",
      message: "x".repeat(1000),
    });
    expect(
      (await call("/v1/receipt?revision=1", pair.senderToken)).body.message,
    ).toHaveLength(500);
    expect(
      (await call("/v1/receipt?revision=1", otherPair.senderToken)).body.status,
    ).toBe("pending");
    const upload = (await call("/v1/upload-sessions", undefined, {})).body;
    expect(
      (
        await call("/v1/receipt", upload.uploadToken, {
          revision: 1,
          status: "imported",
        })
      ).status,
    ).toBe(404);
  });
});
