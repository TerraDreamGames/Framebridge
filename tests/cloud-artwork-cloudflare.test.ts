import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  artworkScript,
  startArtwork,
  artworkInvite,
  otherArtworkInvite,
  artworkPng,
} from "./cloud-artwork-fixture";
import {
  ARTWORK_LIMITS as L,
  readArtworkSnapshot,
} from "../packages/core/src/cloud-artwork";
import { reviewVersion } from "../packages/core/src/review-cloud";
import { createCloudArtworkManager } from "../plugins/figma/src/cloud-artwork-manager";
import { request as httpRequest } from "node:http";
import { oauthHash } from "./roblox-oauth-fixture";
let script: string, directory: string;
const running = new Set<Awaited<ReturnType<typeof startArtwork>>>();
beforeAll(async () => {
  script = await artworkScript();
  directory = await mkdtemp(join(tmpdir(), "framebridge-artwork-"));
});
afterAll(async () => {
  await Promise.all([...running].map((r) => r.close()));
  await rm(directory, { recursive: true, force: true });
});
async function start(
  name: string,
  ...args: Parameters<typeof startArtwork> extends [any, any, ...infer R]
    ? R
    : never
) {
  const r = await startArtwork(script, join(directory, name), ...args);
  running.add(r);
  return r;
}
async function close(r: Awaited<ReturnType<typeof start>>) {
  await r.close();
  running.delete(r);
}
describe("private artwork through actual HTTP/workerd/SQLite/R2", () => {
  it.each(["replacement", "unacknowledged cancellation"] as const)(
    "revokes only removed-account artwork grants before stalled provider revocation during %s",
    async (kind) => {
      const r = await start("combined-account-removal-" + kind),
        original = await r.account(),
        originalGrant = await r.connect(original);
      r.provider.userId = "789";
      const begin = await fetch(r.base + "/v1/roblox/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Framebridge-Beta": artworkInvite,
          "X-Framebridge-Roblox-Account": original,
          Connection: "close",
        },
        body: "{}",
      });
      expect(begin.status).toBe(201);
      const login = await begin.json(),
        state = new URL(login.authorizationUrl).searchParams.get("state");
      expect(
        (
          await r.runtime.dispatchFetch(
            "https://relay.test/oauth/roblox/callback?code=local-auth-code&state=" +
              state,
          )
        ).status,
      ).toBe(200);
      const pending = (await r.call("/v1/roblox/login", login.loginToken)).body,
        newGrant = await r.connect(pending.accountToken),
        removed = kind === "replacement" ? original : pending.accountToken,
        retained = kind === "replacement" ? pending.accountToken : original,
        retainedGrant = kind === "replacement" ? newGrant : originalGrant;
      let release!: () => void, arrived!: () => void;
      const begun = new Promise<void>((resolve) => (arrived = resolve));
      r.provider.revocation = {
        promise: new Promise<void>((resolve) => (release = resolve)),
        arrived,
      };
      const removal =
        kind === "replacement"
          ? r.call("/v1/roblox/login/complete", login.loginToken, {})
          : r.call(
              "/v1/roblox/login",
              login.loginToken,
              undefined,
              "",
              "DELETE",
            );
      try {
        await begun;
        const storage = await r.sql(),
          grants = await storage.exec("SELECT account FROM artwork_grants"),
          accounts = await storage.exec("SELECT id FROM oauth_accounts");
        expect(grants.map((row: any) => row.account)).toEqual([
          oauthHash(retained),
        ]);
        expect(accounts.map((row: any) => row.id)).toEqual([
          oauthHash(retained),
        ]);
        expect(
          (
            await r.call(
              "/v1/artwork",
              removed,
              undefined,
              kind === "replacement"
                ? originalGrant.grantToken
                : newGrant.grantToken,
            )
          ).status,
        ).toBe(401);
        expect(
          (
            await r.call(
              "/v1/artwork",
              retained,
              undefined,
              retainedGrant.grantToken,
            )
          ).status,
        ).toBe(200);
      } finally {
        release();
        expect((await removal).status).toBe(200);
        await close(r);
      }
    },
  );
  it("rejects invitation/global item, byte and folder quotas before another R2 write, and keeps revoke usable at cancellation capacity", async () => {
    const r = await start("shared-bounds"),
      token = await r.account(),
      a = await r.connect(token),
      uploaded = await r.upload(token, a.grantToken, 70),
      storage = await r.sql(),
      original = (await storage.exec("SELECT * FROM artwork_libraries"))[0];
    const fake = "d".repeat(64);
    await storage.exec(
      "INSERT INTO artwork_libraries VALUES (?,?,?,?,?,?,?,?,?)",
      fake,
      original.invite,
      "personal",
      "999",
      "Quota fixture",
      "a".repeat(32),
      0,
      Date.now() + 86400000,
      "active",
    );
    const seed = async (count: number, size: number) => {
      await storage.exec("DELETE FROM artwork_images WHERE library=?", fake);
      await storage.exec(
        "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<?) INSERT INTO artwork_images SELECT printf('%032x',i),?,NULL,'Quota fixture',printf('%064x',i),?,2,1,0,'ready',0,0 FROM n",
        count,
        fake,
        size,
      );
    };
    await seed(1, L.inviteBytes);
    expect((await r.upload(token, a.grantToken, 71)).status).toBe(429);
    await seed(L.inviteItems - 1, 75);
    expect((await r.upload(token, a.grantToken, 72)).status).toBe(429);
    await storage.exec(
      "UPDATE artwork_libraries SET invite='other-quota-fixture' WHERE id=?",
      fake,
    );
    await seed(1, L.globalBytes);
    expect((await r.upload(token, a.grantToken, 73)).status).toBe(429);
    await seed(L.globalItems - 1, 75);
    expect((await r.upload(token, a.grantToken, 74)).status).toBe(429);
    expect((await r.call("/__qa/state")).body.objects).toHaveLength(1);
    await storage.exec(
      "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<100) INSERT INTO artwork_folders SELECT printf('%032x',i),?,'Quota folder'||i FROM n",
      fake,
    );
    expect(
      (
        await r.call(
          "/v1/artwork/edit",
          token,
          {
            action: "create-folder",
            name: "No global folder slot",
            expected: reviewVersion(uploaded.body.snapshot),
          },
          a.grantToken,
        )
      ).status,
    ).toBe(429);
    await storage.exec(
      "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<200) INSERT INTO artwork_cancellations SELECT printf('%064x',i),'quota-account',? FROM n",
      Date.now() + 600000,
    );
    expect(
      (
        await r.call(
          "/v1/artwork/grant",
          token,
          undefined,
          a.grantToken,
          "DELETE",
        )
      ).body.revoked,
    ).toBe(true);
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_grants"))[0].n,
    ).toBe(0);
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_cancellations"))[0]
        .n,
    ).toBe(L.cancellations);
    await close(r);
  });
  it("rejects provider-revoked personal reads/uploads despite cached access credentials", async () => {
    const r = await start("revoked-personal"),
      token = await r.account(),
      a = await r.connect(token),
      uploaded = await r.upload(token, a.grantToken, 60);
    r.provider.revoked = new Set(["123"]);
    expect(
      (
        await r.call(
          "/v1/artwork/images/" + uploaded.body.itemId,
          token,
          undefined,
          a.grantToken,
        )
      ).status,
    ).toBe(401);
    expect((await r.upload(token, a.grantToken, 61)).status).toBe(401);
    expect(
      (await r.call("/v1/artwork", token, undefined, a.grantToken)).status,
    ).toBe(401);
    expect((await r.call("/__qa/state")).body.objects).toHaveLength(1);
    expect(
      (
        await r.call(
          "/v1/artwork/grant",
          token,
          undefined,
          a.grantToken,
          "DELETE",
        )
      ).body.revoked,
    ).toBe(true);
    await close(r);
  });
  it("rechecks group authorization after a streamed body and personal authorization after slow storage cleanup", async () => {
    const r = await start("streamed-authorization"),
      token = await r.account(),
      a = await r.connect(token, "456"),
      raw = JSON.stringify({
        action: "create-folder",
        name: "Unauthorized late body",
        expected: reviewVersion(a.snapshot),
      });
    let sent!: () => void;
    const begun = new Promise<void>((resolve) => (sent = resolve));
    let finish!: () => void;
    const response = new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        r.base + "/v1/artwork/edit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(raw),
            Authorization: "Bearer " + token,
            "X-Framebridge-Artwork-Grant": a.grantToken,
            Connection: "close",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      request.on("error", reject);
      request.flushHeaders();
      request.write(raw.slice(0, 10));
      sent();
      finish = () => request.end(raw.slice(10));
    });
    await begun;
    await new Promise((resolve) => setTimeout(resolve, 40));
    r.provider.groups = [];
    finish();
    expect(await response).toBe(403);
    const storage = await r.sql();
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_folders"))[0].n,
    ).toBe(0);
    r.provider.groups = ["456"];
    const personal = await r.connect(token);
    await r.call("/__qa/fault", "", { holdList: true });
    const edit = r.call(
      "/v1/artwork/edit",
      token,
      {
        action: "create-folder",
        name: "Authorized before cleanup",
        expected: reviewVersion(personal.snapshot),
      },
      personal.grantToken,
    );
    for (let i = 0; i < 30; i++) {
      if ((await r.call("/__qa/state")).body.waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    r.provider.revoked = new Set(["123"]);
    await r.call("/__qa/release", "", {});
    expect((await edit).status).toBe(401);
    await close(r);
  });
  it("revokes grants synchronously on local disconnect while provider revocation is still pending", async () => {
    const r = await start("disconnect-race"),
      token = await r.account(),
      a = await r.connect(token),
      raw = JSON.stringify({
        action: "create-folder",
        name: "Late disconnected body",
        expected: reviewVersion(a.snapshot),
      });
    let finish!: () => void;
    const response = new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        r.base + "/v1/artwork/edit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(raw),
            Authorization: "Bearer " + token,
            "X-Framebridge-Artwork-Grant": a.grantToken,
            Connection: "close",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      request.on("error", reject);
      request.flushHeaders();
      request.write(raw.slice(0, 10));
      finish = () => request.end(raw.slice(10));
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    let arrived!: () => void, release!: () => void;
    const atProvider = new Promise<void>((resolve) => (arrived = resolve));
    r.provider.revocation = {
      promise: new Promise<void>((resolve) => (release = resolve)),
      arrived,
    };
    const disconnect = r.call(
      "/v1/roblox/account",
      token,
      undefined,
      "",
      "DELETE",
    );
    await atProvider;
    const storage = await r.sql();
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_grants"))[0].n,
    ).toBe(0);
    finish();
    expect(await response).toBe(401);
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_folders"))[0].n,
    ).toBe(0);
    release();
    expect((await disconnect).status).toBe(200);
    await close(r);
  });
  it("rejects inherited action names with typed400 and recovers idempotent/lost connection responses", async () => {
    const r = await start("connect-idempotency"),
      token = await r.account(),
      proposal = "f".repeat(64),
      first = await r.call(
        "/v1/artwork/connect",
        token,
        { scope: "personal", consent: true },
        proposal,
      ),
      retry = await r.call(
        "/v1/artwork/connect",
        token,
        { scope: "personal", consent: true },
        proposal,
      );
    expect(first.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    const storage = await r.sql();
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_grants"))[0].n,
    ).toBe(1);
    for (const action of ["__proto__", "constructor", "toString", [], {}])
      expect(
        (
          await r.call(
            "/v1/artwork/edit",
            token,
            { action, expected: reviewVersion(first.body.snapshot) },
            proposal,
          )
        ).status,
      ).toBe(400);
    const cancelled = "e".repeat(64);
    expect(
      (await r.call("/v1/artwork/grant", token, undefined, cancelled, "DELETE"))
        .status,
    ).toBe(200);
    expect(
      (
        await r.call(
          "/v1/artwork/connect",
          token,
          { scope: "personal", consent: true },
          cancelled,
        )
      ).status,
    ).toBe(409);
    await close(r);
  });
  it("cancels a proposed connection before its streamed body can be admitted", async () => {
    const r = await start("pre-admission-cancel"),
      token = await r.account(),
      proposal = "c".repeat(64),
      raw = JSON.stringify({ scope: "personal", consent: true });
    let finish!: () => void;
    const response = new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        r.base + "/v1/artwork/connect",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(raw),
            Authorization: "Bearer " + token,
            "X-Framebridge-Artwork-Grant": proposal,
            Connection: "close",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      request.on("error", reject);
      request.flushHeaders();
      request.write(raw.slice(0, 5));
      finish = () => request.end(raw.slice(5));
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      (await r.call("/v1/artwork/grant", token, undefined, proposal, "DELETE"))
        .status,
    ).toBe(200);
    finish();
    expect(await response).toBe(409);
    const storage = await r.sql();
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_grants"))[0].n,
    ).toBe(0);
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_libraries"))[0].n,
    ).toBe(0);
    await close(r);
  });
  it("reconciles repeated cancelled/lost connects and preserves another account through a storage-save race", async () => {
    const r = await start("connect-recovery"),
      token = await r.account(),
      peer = await r.account("789"),
      storage = await r.sql();
    let saved: any = null,
      delay = false,
      release!: () => void,
      arrived!: () => void,
      lose = false,
      fail = false;
    let waiting: Promise<void>;
    const pause = () => {
      delay = true;
      waiting = new Promise<void>((resolve) => (arrived = resolve));
    };
    const api = async (
      path: string,
      bearer: string,
      grant: string,
      body: unknown,
      method: string,
    ) => {
      const res = await r.call(
        "/v1/artwork" + path,
        bearer,
        body,
        grant,
        method,
      );
      if (path === "/connect" && delay)
        await new Promise<void>((resolve) => {
          release = resolve;
          arrived();
        });
      if (path === "/connect" && lose) {
        lose = false;
        throw Error("simulated lost HTTP response");
      }
      if (res.status >= 400 && res.status !== 409) throw Error(res.body.error);
      if (res.status === 409 && !res.body.conflict) throw Error(res.body.error);
      return res.body;
    };
    const manager = createCloudArtworkManager(
      "https://relay.test",
      {
        load: async () => saved,
        save: async (v) => {
          saved = v;
          if (fail && v && !v.pending) {
            fail = false;
            throw Error("simulated uncertain settings save");
          }
        },
      },
      api,
      () => {},
    );
    await manager.setAccount({ userId: "123", token });
    await manager.restore();
    for (let i = 0; i < 8; i++) {
      pause();
      const pending = manager.connect("personal");
      await waiting!;
      manager.cancel();
      manager.cancel();
      delay = false;
      release();
      await pending;
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(saved).toBeNull();
      expect(
        (await storage.exec("SELECT COUNT(*) AS n FROM artwork_grants"))[0].n,
      ).toBe(0);
    }
    lose = true;
    await manager.connect("personal");
    lose = true;
    await manager.connect("personal");
    expect(saved.pending).toBe(true);
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_grants"))[0].n,
    ).toBe(1);
    await manager.restore();
    expect(manager.snapshot().connected).toBe(true);
    expect(saved.pending).toBeUndefined();
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_grants"))[0].n,
    ).toBe(1);
    await manager.revoke();
    fail = true;
    await manager.connect("personal");
    expect(manager.snapshot().error).toContain("settings save");
    expect(saved).toBeNull();
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_grants"))[0].n,
    ).toBe(0);
    manager.dispose();
    let writing!: () => void,
      finishWrite!: () => void,
      first = true;
    const blocked = new Promise<void>((resolve) => (writing = resolve));
    const race = createCloudArtworkManager(
      "https://relay.test",
      {
        load: async () => saved,
        save: async (v) => {
          if (first) {
            first = false;
            await new Promise<void>((resolve) => {
              finishWrite = resolve;
              writing();
            });
          }
          saved = v;
        },
      },
      api,
      () => {},
    );
    await race.setAccount({ userId: "123", token });
    await race.restore();
    const original = race.connect("personal");
    await blocked;
    race.cancel();
    await race.setAccount({ userId: "789", token: peer });
    const next = race.connect("personal");
    finishWrite();
    await Promise.all([original, next]);
    expect(race.snapshot().connected).toBe(true);
    expect(race.snapshot().snapshot!.scope.id).toBe("789");
    expect(saved.userId).toBe("789");
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_grants"))[0].n,
    ).toBe(1);
    await race.revoke();
    race.dispose();
    await close(r);
  });
  it("retains a generation tombstone through orphan list/delete faults and truncated namespace scans", async () => {
    const r = await start("physical-deletion"),
      token = await r.account(),
      a = await r.connect(token),
      storage = await r.sql(),
      library = (await storage.exec("SELECT id FROM artwork_libraries"))[0].id;
    for (let i = 0; i < 21; i++)
      await r.call("/__qa/object", "", {
        key:
          "framebridge-artwork-v1/" +
          library +
          "/" +
          i.toString(16).padStart(32, "0"),
        bytes: Array.from(artworkPng(62)),
      });
    await r.call("/__qa/fault", "", { list: true });
    const deleted = await r.call(
      "/v1/artwork/edit",
      token,
      { action: "delete-library", expected: reviewVersion(a.snapshot) },
      a.grantToken,
    );
    expect(deleted.body.pendingCleanup).toBe(1);
    expect(
      (await storage.exec("SELECT state FROM artwork_libraries"))[0].state,
    ).toBe("deleting");
    expect(
      (
        await r.call("/v1/artwork/connect", token, {
          scope: "personal",
          consent: true,
        })
      ).status,
    ).toBe(503);
    await r.call("/__qa/fault", "", { delete: true });
    expect(
      (
        await r.call("/v1/artwork/connect", token, {
          scope: "personal",
          consent: true,
        })
      ).status,
    ).toBe(503);
    expect((await r.call("/__qa/state")).body.objects).toHaveLength(21);
    await r.call("/__qa/fault", "", {});
    expect(
      (
        await r.call("/v1/artwork/connect", token, {
          scope: "personal",
          consent: true,
        })
      ).status,
    ).toBe(503);
    expect((await r.call("/__qa/state")).body.objects).toHaveLength(1);
    const replacement = await r.connect(token);
    expect(replacement.snapshot.generation).not.toBe(a.snapshot.generation);
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_deletion"))[0].n,
    ).toBe(0);
    await close(r);
  });
  it("schedules recovery before R2put, keeps overdue active alarms bounded and reclaims a killed/restarted pending write", async () => {
    let r = await start("killed-write"),
      token = await r.account(),
      a = await r.connect(token);
    await r.call("/__qa/fault", "", { hold: true });
    const pending = r.upload(token, a.grantToken, 63).catch(() => undefined);
    for (let i = 0; i < 30; i++) {
      if ((await r.call("/__qa/state")).body.waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const state = (await r.call("/__qa/state")).body;
    expect(state.waiting).toBe(true);
    expect(state.alarm).toBeGreaterThan(Date.now());
    expect(state.alarm).toBeLessThan(Date.now() + 600100);
    const storage = await r.sql();
    await storage.exec("UPDATE artwork_images SET retry=0");
    await storage.exec("UPDATE artwork_leases SET expires=0");
    await r.call("/__qa/alarm", "", {});
    expect((await r.call("/__qa/state")).body.alarm).toBeGreaterThan(
      Date.now() + 30000,
    );
    const provider = r.provider;
    await close(r);
    await pending;
    r = await start("killed-write", provider);
    const before = (await r.call("/v1/artwork", token, undefined, a.grantToken))
      .body;
    expect(before.usage.pending).toBe(1);
    expect(before.items).toEqual([]);
    await r.call("/__qa/alarm", "", {});
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    expect(
      (await r.call("/v1/artwork", token, undefined, a.grantToken)).body.usage
        .items,
    ).toBe(0);
    await close(r);
  });
  it("defaults to disabled and enforces consent, server identities, accounts and invitation partitions", async () => {
    const disabled = await start("disabled", undefined, false),
      dt = await disabled.account();
    expect((await disabled.call("/v1/artwork/config")).body.enabled).toBe(
      false,
    );
    expect(
      (
        await disabled.call("/v1/artwork/connect", dt, {
          scope: "personal",
          consent: true,
        })
      ).status,
    ).toBe(503);
    await close(disabled);
    const r = await start("isolation"),
      token = await r.account(),
      same = await r.account(),
      other = await r.account("123", otherArtworkInvite);
    for (const input of [
      { scope: "personal" },
      { scope: "personal", consent: true, userId: "789" },
      { scope: "group", groupId: "999", consent: true },
    ])
      expect(
        (await r.call("/v1/artwork/connect", token, input)).status,
      ).toBeGreaterThanOrEqual(400);
    const a = await r.connect(token),
      b = await r.connect(same),
      c = await r.connect(other),
      saved = await r.upload(token, a.grantToken);
    expect(saved.status).toBe(201);
    const snapshot = readArtworkSnapshot(saved.body.snapshot);
    expect(snapshot.scope).toMatchObject({ kind: "personal", id: "123" });
    expect(
      (await r.call("/v1/artwork", same, undefined, b.grantToken)).body.items,
    ).toEqual(snapshot.items);
    expect(
      (await r.call("/v1/artwork", same, undefined, a.grantToken)).status,
    ).toBe(401);
    expect(
      (await r.call("/v1/artwork", other, undefined, c.grantToken)).body.items,
    ).toEqual([]);
    expect(
      (
        await r.call(
          "/v1/artwork/images/" + saved.body.itemId,
          other,
          undefined,
          c.grantToken,
        )
      ).status,
    ).toBe(404);
    for (const extra of [
      { secret: "no" },
      { assetId: "123" },
      { ownerId: "789" },
    ])
      expect(
        (
          await r.call(
            "/v1/artwork/images",
            token,
            {
              name: "PNG",
              folder: null,
              png: Buffer.from(artworkPng()).toString("base64"),
              ...extra,
            },
            a.grantToken,
          )
        ).status,
      ).toBe(400);
    const storage = await r.sql(),
      grants = await storage.exec("SELECT id,account FROM artwork_grants");
    expect(JSON.stringify(grants)).not.toContain(a.grantToken);
    expect(JSON.stringify(grants)).not.toContain(token);
    await close(r);
  });
  it("shares only fresh Roblox creator groups, with download and revoke authorization after permission changes", async () => {
    const r = await start("groups"),
      token = await r.account("123"),
      peer = await r.account("789"),
      a = await r.connect(token, "456"),
      b = await r.connect(peer, "456"),
      uploaded = await r.upload(token, a.grantToken, 2);
    const image = uploaded.body.itemId;
    expect(
      (
        await r.call(
          "/v1/artwork/images/" + image,
          peer,
          undefined,
          b.grantToken,
        )
      ).body,
    ).toEqual(artworkPng(2));
    r.provider.groups = [];
    expect(
      (
        await r.call(
          "/v1/artwork/images/" + image,
          peer,
          undefined,
          b.grantToken,
        )
      ).status,
    ).toBe(403);
    expect((await r.upload(token, a.grantToken, 3)).status).toBe(403);
    expect(
      (
        await r.call(
          "/v1/artwork/grant",
          peer,
          undefined,
          b.grantToken,
          "DELETE",
        )
      ).body.revoked,
    ).toBe(true);
    expect(
      r.provider.calls.filter((c) => c === "token/resources").length,
    ).toBeGreaterThan(5);
    await close(r);
  });
  it("persists PNGs/folders across worker restart, handles CAS metadata conflicts and deletion generations", async () => {
    let r = await start("persistence"),
      token = await r.account(),
      peer = await r.account(),
      a = await r.connect(token),
      b = await r.connect(peer);
    const edit = (body: unknown, grant = a.grantToken, t = token) =>
      r.call("/v1/artwork/edit", t, body, grant);
    let result = await edit({
      action: "create-folder",
      name: "Buttons",
      expected: reviewVersion(a.snapshot),
    });
    expect(result.status).toBe(200);
    const folder = result.body.snapshot.folders[0].id;
    const uploaded = await r.upload(token, a.grantToken, 3, "Confirm", folder);
    expect(uploaded.status).toBe(201);
    const duplicate = await r.upload(peer, b.grantToken, 3, "Other name", null);
    expect(duplicate.body.reused).toBe(true);
    expect(duplicate.body.snapshot.items[0]).toMatchObject({
      name: "Confirm",
      folder,
    });
    const stale = await edit(
      {
        action: "rename-folder",
        id: folder,
        name: "Inputs",
        expected: reviewVersion(b.snapshot),
      },
      b.grantToken,
      peer,
    );
    expect(stale.status).toBe(409);
    expect(stale.body.conflict).toBe(true);
    expect(
      (
        await edit({
          action: "delete-folder",
          id: folder,
          expected: reviewVersion(stale.body.snapshot),
        })
      ).status,
    ).toBe(409);
    const provider = r.provider;
    await close(r);
    r = await start("persistence", provider);
    const restored = (
      await r.call("/v1/artwork", peer, undefined, b.grantToken)
    ).body;
    expect(restored).toEqual(uploaded.body.snapshot);
    expect(
      (
        await r.call(
          "/v1/artwork/images/" + uploaded.body.itemId,
          peer,
          undefined,
          b.grantToken,
        )
      ).body,
    ).toEqual(artworkPng(3));
    result = await edit({
      action: "edit-image",
      id: uploaded.body.itemId,
      name: "Confirm shared",
      folder: null,
      expected: reviewVersion(restored),
    });
    expect(result.status).toBe(200);
    result = await edit({
      action: "delete-folder",
      id: folder,
      expected: reviewVersion(result.body.snapshot),
    });
    expect(result.body.snapshot.folders).toEqual([]);
    const deleted = await edit({
      action: "delete-library",
      expected: reviewVersion(result.body.snapshot),
    });
    expect(deleted.body).toEqual({ deleted: true, pendingCleanup: 0 });
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    expect(
      (await r.call("/v1/artwork", peer, undefined, b.grantToken)).status,
    ).toBe(401);
    const replacement = await r.connect(token);
    expect(replacement.snapshot.generation).not.toBe(a.snapshot.generation);
    expect(
      (
        await edit(
          {
            action: "create-folder",
            name: "Stale",
            expected: reviewVersion(restored),
          },
          replacement.grantToken,
        )
      ).status,
    ).toBe(409);
    await close(r);
  });
  it("validates malformed PNGs before reserving quota and never returns corrupt stored bytes", async () => {
    const r = await start("validation"),
      token = await r.account(),
      a = await r.connect(token),
      good = artworkPng(4),
      bad = new Uint8Array(good);
    bad[40] ^= 1;
    for (const png of [
      "",
      "Zg==",
      Buffer.from(bad).toString("base64"),
      "!".repeat(80),
      "A".repeat(710000),
    ])
      expect(
        (
          await r.call(
            "/v1/artwork/images",
            token,
            { name: "Bad", folder: null, png },
            a.grantToken,
          )
        ).status,
      ).toBeGreaterThanOrEqual(400);
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    const uploaded = await r.upload(token, a.grantToken, 4),
      state = (await r.call("/__qa/state")).body;
    await r.call("/__qa/object", "", {
      key: state.objects[0].key,
      bytes: Array.from(artworkPng(5)),
    });
    const read = await r.call(
      "/v1/artwork/images/" + uploaded.body.itemId,
      token,
      undefined,
      a.grantToken,
    );
    expect(read.status).toBe(503);
    expect(read.body.error).toContain("integrity");
    await close(r);
  });
  it("retains durable reservations on lost writes/deletion outages, recovers cleanup and reconciles orphans", async () => {
    const r = await start("failures"),
      token = await r.account(),
      a = await r.connect(token);
    await r.call("/__qa/fault", "", { put: true, delete: true });
    const lost = await r.upload(token, a.grantToken, 6);
    expect(lost.status).toBe(503);
    let snapshot = (await r.call("/v1/artwork", token, undefined, a.grantToken))
      .body;
    expect(snapshot.items).toEqual([]);
    expect(snapshot.usage).toMatchObject({ items: 1, pending: 0, cleanup: 1 });
    expect((await r.call("/__qa/state")).body.objects).toHaveLength(1);
    expect((await r.upload(token, a.grantToken, 6)).status).toBe(409);
    const storage = await r.sql();
    expect(
      (await storage.exec("SELECT attempts,retry FROM artwork_images"))[0]
        .attempts,
    ).toBeGreaterThan(0);
    await r.call("/__qa/fault", "", {});
    const cleaned = await r.call(
      "/v1/artwork/cleanup",
      token,
      {},
      a.grantToken,
    );
    expect(cleaned.body.snapshot.usage).toMatchObject({
      items: 0,
      bytes: 0,
      cleanup: 0,
    });
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    const uploaded = await r.upload(token, a.grantToken, 7);
    await r.call("/__qa/fault", "", { delete: true });
    const deleted = await r.call(
      "/v1/artwork/edit",
      token,
      {
        action: "delete-library",
        expected: reviewVersion(uploaded.body.snapshot),
      },
      a.grantToken,
    );
    expect(deleted.body.pendingCleanup).toBe(1);
    expect(
      (await r.call("/v1/artwork", token, undefined, a.grantToken)).status,
    ).toBe(401);
    expect(
      (
        await r.call("/v1/artwork/connect", token, {
          scope: "personal",
          consent: true,
        })
      ).status,
    ).toBe(503);
    await r.call("/__qa/fault", "", {});
    const replacement = await r.connect(token);
    expect(replacement.snapshot.usage.items).toBe(0);
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    const orphan =
      "framebridge-artwork-v1/" + "a".repeat(64) + "/" + "b".repeat(32);
    await r.call("/__qa/object", "", {
      key: orphan,
      bytes: Array.from(artworkPng()),
    });
    await storage.exec("UPDATE artwork_gc SET retry=0");
    await r.call("/__qa/alarm", "", {});
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    await close(r);
  });
  it("revokes an in-flight upload when a peer deletes the library, with no exposed PNG or leaked object", async () => {
    const r = await start("race"),
      token = await r.account(),
      peer = await r.account(),
      a = await r.connect(token),
      b = await r.connect(peer);
    await r.call("/__qa/fault", "", { hold: true });
    const upload = r.upload(token, a.grantToken, 8);
    for (let i = 0; i < 30; i++) {
      if ((await r.call("/__qa/state")).body.waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((await r.call("/__qa/state")).body.waiting).toBe(true);
    const snapshot = (
      await r.call("/v1/artwork", peer, undefined, b.grantToken)
    ).body;
    expect(snapshot.items).toEqual([]);
    expect(snapshot.usage.pending).toBe(1);
    const deletion = await r.call(
      "/v1/artwork/edit",
      peer,
      { action: "delete-library", expected: reviewVersion(snapshot) },
      b.grantToken,
    );
    expect(deletion.body.pendingCleanup).toBe(1);
    await r.call("/__qa/release", "", {});
    expect((await upload).status).toBe(401);
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    await close(r);
  });
  it("bounds daily saves, items/bytes/folders and grants without consuming quotas on denied writes", async () => {
    const r = await start("quotas"),
      token = await r.account(),
      a = await r.connect(token);
    for (let n = 20; n < 30; n++)
      expect((await r.upload(token, a.grantToken, n)).status).toBe(201);
    expect((await r.upload(token, a.grantToken, 30)).status).toBe(429);
    expect((await r.upload(token, a.grantToken, 20)).body.reused).toBe(true);
    const storage = await r.sql(),
      library = (await storage.exec("SELECT id FROM artwork_libraries"))[0].id;
    await storage.exec(
      "DELETE FROM counters WHERE scope LIKE 'artwork:uploads:%'",
    );
    await storage.exec(
      "UPDATE artwork_images SET size=? WHERE id=(SELECT id FROM artwork_images LIMIT 1)",
      L.scopeBytes,
    );
    expect((await r.upload(token, a.grantToken, 31)).status).toBe(429);
    expect((await r.call("/__qa/state")).body.objects).toHaveLength(10);
    await storage.exec("UPDATE artwork_images SET size=80");
    const expires = Date.now() + 86400000;
    for (let i = 10; i < L.items; i++)
      await storage.exec(
        "INSERT INTO artwork_images VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        i.toString(16).padStart(32, "0"),
        library,
        null,
        "Quota fixture",
        i.toString(16).padStart(64, "0"),
        80,
        2,
        1,
        Date.now(),
        "ready",
        0,
        0,
      );
    expect((await r.upload(token, a.grantToken, 32)).status).toBe(429);
    for (let i = 0; i < L.folders; i++)
      await storage.exec(
        "INSERT INTO artwork_folders VALUES (?,?,?)",
        (1000 + i).toString(16).padStart(32, "0"),
        library,
        "Folder " + i,
      );
    const current = (
      await r.call("/v1/artwork", token, undefined, a.grantToken)
    ).body;
    expect(
      (
        await r.call(
          "/v1/artwork/edit",
          token,
          {
            action: "create-folder",
            name: "Extra",
            expected: reviewVersion(current),
          },
          a.grantToken,
        )
      ).status,
    ).toBe(429);
    for (let i = 1; i < L.accountGrants; i++) await r.connect(token);
    expect(
      (
        await r.call("/v1/artwork/connect", token, {
          scope: "group",
          groupId: "456",
          consent: true,
        })
      ).status,
    ).toBe(429);
    expect(
      (await storage.exec("SELECT COUNT(*) AS n FROM artwork_libraries"))[0].n,
    ).toBe(1);
    await close(r);
  });
  it("removes expired and revoked-invitation objects, while preserving another private invitation", async () => {
    let r = await start("retention"),
      token = await r.account(),
      a = await r.connect(token);
    await r.upload(token, a.grantToken, 40);
    const provider = r.provider;
    await close(r);
    r = await start("retention", provider, true, [otherArtworkInvite]);
    const other = await r.account("123", otherArtworkInvite),
      b = await r.connect(other);
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    expect(
      (await r.call("/v1/artwork", token, undefined, a.grantToken)).status,
    ).toBe(401);
    await r.upload(other, b.grantToken, 41);
    const storage = await r.sql();
    await storage.exec("UPDATE artwork_libraries SET expires=0");
    const replacement = await r.connect(other);
    expect(replacement.snapshot.generation).not.toBe(b.snapshot.generation);
    expect(replacement.snapshot.items).toEqual([]);
    expect((await r.call("/__qa/state")).body.objects).toEqual([]);
    await close(r);
  });
  it("runs two installation managers over real HTTP with private reuse, conflict recovery and cancellation", async () => {
    const r = await start("managers"),
      token = await r.account(),
      peer = await r.account();
    const installation = (bearer: string) => {
      let saved: unknown = null,
        delay = false,
        release: undefined | (() => void),
        arrived: undefined | (() => void);
      const delayed = new Promise<void>((resolve) => (arrived = resolve));
      const m = createCloudArtworkManager(
        "https://relay.test",
        {
          load: async () => saved,
          save: async (v) => {
            saved = v;
          },
        },
        async (path, token, grant, body, method) => {
          const res = await r.call(
            "/v1/artwork" + path,
            token,
            body,
            grant,
            method,
          );
          if (delay)
            await new Promise<void>((resolve) => {
              release = resolve;
              arrived?.();
            });
          if (res.status >= 400 && res.status !== 409)
            throw Error(res.body.error);
          return res.body;
        },
        () => {},
      );
      return {
        m,
        account: { userId: "123", token: bearer },
        saved: () => saved,
        delay: () => (delay = true),
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
    await a.m.restore();
    await b.m.setAccount(b.account);
    await b.m.restore();
    await a.m.connect("personal");
    await b.m.connect("personal");
    await a.m.upload({
      name: "Cross device",
      folder: null,
      bytes: artworkPng(50),
    });
    await b.m.fetch();
    expect(
      (await b.m.download(b.m.snapshot().snapshot!.items[0].id))!.bytes,
    ).toEqual(artworkPng(50));
    await a.m.edit("create-folder", { name: "Buttons" });
    await b.m.edit("create-folder", { name: "Stale" });
    expect(b.m.snapshot().conflict?.folders[0].name).toBe("Buttons");
    expect(b.m.snapshot().snapshot!.folders).toEqual([]);
    await b.m.fetch();
    expect(b.m.snapshot().conflict).toBeUndefined();
    await b.m.setAccount(b.account);
    await b.m.restore();
    expect(b.m.snapshot().connected).toBe(true);
    const previous = a.m.snapshot().snapshot!.revision;
    a.delay();
    const pending = a.m.upload({
      name: "Cancelled sent save",
      folder: null,
      bytes: artworkPng(51),
    });
    await a.delayed;
    a.m.cancel();
    a.release();
    await pending;
    expect(a.m.snapshot().snapshot!.revision).toBe(previous);
    expect(a.m.snapshot().notice).toContain("Cancelled");
    await a.m.fetch();
    expect(a.m.snapshot().snapshot!.items).toHaveLength(2);
    await a.m.revoke();
    expect(a.saved()).toBeNull();
    expect(b.m.snapshot().connected).toBe(true);
    a.m.dispose();
    b.m.dispose();
    await close(r);
  });
});
