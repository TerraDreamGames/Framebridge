import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RobloxOAuth } from "../packages/relay/src/roblox-oauth";
import { oauthConfig, oauthFixture, oauthHash } from "./roblox-oauth-fixture";

const migrated = {
  ...oauthConfig,
  clientId: "987654321098765",
  clientSecret: "group-owned-client-secret",
  legacyClientId: oauthConfig.clientId,
  legacyClientSecret: oauthConfig.clientSecret,
};

// Reproduce ciphertext written by the pre-migration release, which had no
// issuer field. This tests actual upgrade compatibility rather than a mock.
function rewriteIssuer<
  T extends { id: string; invite: string; sealed: string },
>(kind: string, row: T, clientId?: string) {
  const data = Buffer.from(row.sealed, "base64");
  const key = Buffer.from(oauthConfig.sealingKey, "hex");
  const aad = Buffer.from(`${kind}:${row.id}:${row.invite}`);
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAAD(aad);
  decipher.setAuthTag(data.subarray(12, 28));
  const value = JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  );
  if (clientId === undefined) delete value.clientId;
  else value.clientId = clientId;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value))),
    cipher.final(),
  ]);
  return {
    ...row,
    sealed: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64",
    ),
  };
}

describe("OAuth app ownership migration", () => {
  it("reads updated bindings in a reused service without dropping an existing grant or pending login", async () => {
    const f = oauthFixture();
    let config = { ...oauthConfig };
    const service = new RobloxOAuth(f.store, () => config, f.deps);
    const ready = await f.connect();
    const pending = await service.begin("invite");
    config = migrated;
    expect(await service.callback(f.callback(pending))).toBe(true);
    await service.cancel(pending.loginToken);
    const next = await service.begin("invite");
    expect(new URL(next.authorizationUrl).searchParams.get("client_id")).toBe(
      migrated.clientId,
    );
    await service.cancel(next.loginToken);
    f.advance(900_000);
    await service.credential(ready.accountToken, "invite");
    expect(
      f.calls
        .filter((c) => c.path === "token")
        .at(-1)!
        .body.get("client_id"),
    ).toBe(oauthConfig.clientId);
  });
  it.each([true, false])(
    "preserves existing account refresh and revocation across restarts (legacy ciphertext: %s)",
    async (untagged) => {
      const f = oauthFixture();
      const ready = await f.connect();
      if (untagged) {
        const row = f.store.account(oauthHash(ready.accountToken))!;
        f.store.saveAccount(rewriteIssuer("account", row));
      }
      f.calls.length = 0;
      for (let i = 0; i < 2; i++) {
        f.advance(900_000);
        const service = new RobloxOAuth(f.store, migrated, f.deps);
        expect(service.status(ready.accountToken).needsAuthorization).toBe(
          false,
        );
        await service.credential(ready.accountToken, "invite", {
          kind: "group",
          id: "456",
        });
      }
      expect(f.calls.filter((c) => c.path === "token")).toHaveLength(2);
      await new RobloxOAuth(f.store, migrated, f.deps).disconnect(
        ready.accountToken,
      );
      for (const call of f.calls.filter((c) => c.path !== "userinfo")) {
        if (call.path.startsWith("https://groups.roblox.com/v2/groups?")) {
          expect(call.headers.has("Authorization")).toBe(false);
          expect(call.body.get("client_secret")).toBeNull();
          continue;
        }
        expect(call.body.get("client_id")).toBe(oauthConfig.clientId);
        expect(call.body.get("client_secret")).toBe(oauthConfig.clientSecret);
      }
      expect(f.accounts.size).toBe(0);
    },
  );

  it.each([true, false])(
    "finishes a login begun before deployment with its original client (legacy ciphertext: %s)",
    async (untagged) => {
      const f = oauthFixture();
      const login = await f.service.begin("invite");
      if (untagged) {
        const row = f.store.login(oauthHash(login.loginToken))!;
        f.store.saveLogin(
          rewriteIssuer("login", { ...row, sealed: row.sealed! }),
        );
      }
      const service = new RobloxOAuth(f.store, migrated, f.deps);
      expect(await service.callback(f.callback(login))).toBe(true);
      expect(service.poll(login.loginToken)).toMatchObject({ status: "ready" });
      expect(
        f.calls.find((c) => c.path === "token")!.body.get("client_id"),
      ).toBe(oauthConfig.clientId);
    },
  );

  it("starts new sign-ins with the group app and revokes the old grant only after reconnect completes", async () => {
    const f = oauthFixture();
    const old = await f.connect();
    const service = new RobloxOAuth(f.store, migrated, f.deps);
    f.calls.length = 0;
    const login = await service.begin("invite", old.accountToken);
    expect(new URL(login.authorizationUrl).searchParams.get("client_id")).toBe(
      migrated.clientId,
    );
    expect(await service.callback(f.callback(login))).toBe(true);
    const ready = service.poll(login.loginToken) as { accountToken: string };
    expect(service.status(old.accountToken).needsAuthorization).toBe(false);
    expect(f.calls.some((c) => c.path === "token/revoke")).toBe(false);
    await service.acknowledge(login.loginToken);
    const revoke = f.calls.find((c) => c.path === "token/revoke")!;
    expect(revoke.body.get("client_id")).toBe(oauthConfig.clientId);
    expect(revoke.body.get("client_secret")).toBe(oauthConfig.clientSecret);
    for (const call of f.calls.filter(
      (c) => c.path === "token" || c.path === "token/resources",
    )) {
      expect(call.body.get("client_id")).toBe(migrated.clientId);
      expect(call.body.get("client_secret")).toBe(migrated.clientSecret);
    }
    f.advance(900_000);
    await new RobloxOAuth(f.store, migrated, f.deps).credential(
      ready.accountToken,
      "invite",
    );
    expect(
      f.calls
        .filter((c) => c.path === "token")
        .at(-1)!
        .body.get("client_id"),
    ).toBe(migrated.clientId);
    await service.disconnect(ready.accountToken);
    expect(f.calls.at(-1)!.body.get("client_id")).toBe(migrated.clientId);
    expect(service.publicConfig()).toEqual({
      available: true,
      callbackOrigin: "https://relay.test",
    });
  });

  it("does not retry a rejected legacy refresh using the new client", async () => {
    const f = oauthFixture();
    const ready = await f.connect();
    f.advance(900_000);
    f.calls.length = 0;
    f.remote.run = async () => new Response(null, { status: 401 });
    const service = new RobloxOAuth(f.store, migrated, f.deps);
    await expect(
      service.credential(ready.accountToken, "invite"),
    ).rejects.toMatchObject({ status: 401 });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].body.get("client_id")).toBe(oauthConfig.clientId);
    expect(service.status(ready.accountToken).needsAuthorization).toBe(true);
  });

  it.each(["removed client", "missing legacy secret"])(
    "fails closed for %s without exposing tokens to a different app",
    async (kind) => {
      const f = oauthFixture();
      const ready = await f.connect();
      if (kind === "removed client") {
        const row = f.store.account(oauthHash(ready.accountToken))!;
        f.store.saveAccount(rewriteIssuer("account", row, "7777777"));
      }
      const service = new RobloxOAuth(
        f.store,
        { ...migrated, legacyClientSecret: undefined },
        f.deps,
      );
      f.calls.length = 0;
      expect(service.status(ready.accountToken).needsAuthorization).toBe(true);
      await expect(
        service.credential(ready.accountToken, "invite"),
      ).rejects.toMatchObject({ status: 401 });
      expect(f.calls).toHaveLength(0);
      expect(await service.disconnect(ready.accountToken)).toEqual({
        disconnected: true,
        revoked: false,
      });
      expect(f.accounts.size).toBe(0);
    },
  );
});
