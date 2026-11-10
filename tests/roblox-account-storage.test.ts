import { afterEach, expect, it, vi } from "vitest";
import {
  createRobloxAccountStorage,
  readRobloxAccountSettings,
  readRobloxLogin,
  robloxAuthorizationUrl,
  ROBLOX_ACCOUNT_STORAGE_KEY,
} from "../plugins/figma/src/roblox-account-storage";
import { cloudStorageRecord } from "../plugins/figma/src/cloud-storage";
import { oauthFixture } from "./roblox-oauth-fixture";
afterEach(() => vi.unstubAllGlobals());
it("allows only the configured public callback origin and persists it without provider secrets", async () => {
  const login = await oauthFixture().service.begin("invite"),
    origin = "https://relay.test",
    callbackOrigin = "https://framebridge.test";
  const url = new URL(login.authorizationUrl);
  url.searchParams.set(
    "redirect_uri",
    callbackOrigin + "/oauth/roblox/callback",
  );
  const value = { ...login, authorizationUrl: url.href };
  expect(readRobloxLogin(value, origin)).toBeUndefined();
  const pending = readRobloxLogin(value, origin, callbackOrigin)!;
  expect(pending.callbackOrigin).toBe(callbackOrigin);
  expect(readRobloxAccountSettings({ origin, pending })).toEqual({
    origin,
    pending,
  });
  expect(
    readRobloxLogin(
      { ...value, callbackOrigin: "https://other.test" },
      origin,
      callbackOrigin,
    ),
  ).toBeUndefined();
  expect(readRobloxLogin(value, origin, "http://remote.test")).toBeUndefined();
  vi.stubGlobal("URL", undefined);
  vi.stubGlobal("URLSearchParams", undefined);
  expect(robloxAuthorizationUrl(url.href, origin, callbackOrigin)).toBe(true);
});
it("stores pending authorization and account capabilities independently of design/API-key settings", async () => {
  const f = oauthFixture(),
    pending = await f.service.begin("invite"),
    token = "f".repeat(64);
  let value: unknown;
  const device = {
    getAsync: async () => value,
    setAsync: vi.fn(async (_key: string, record: unknown) => {
      value = record;
    }),
  };
  const saved = {
    origin: "https://relay.test",
    accountToken: token,
    pending: { ...pending, previousToken: token },
  };
  await createRobloxAccountStorage(device).save({
    ...saved,
    access_token: "must-not-persist",
    refresh_token: "must-not-persist",
    key: "must-not-persist",
  });
  expect(device.setAsync).toHaveBeenCalledWith(
    ROBLOX_ACCOUNT_STORAGE_KEY,
    saved,
  );
  expect(await createRobloxAccountStorage(device).load()).toEqual(saved);
  const cloud = cloudStorageRecord({
    key: "manual-key",
    ownerType: "user",
    ownerId: "123",
    authMode: "roblox",
    accountToken: token,
    pending,
  });
  expect(cloud).toEqual({
    key: "manual-key",
    ownerType: "user",
    ownerId: "123",
    authMode: "roblox",
  });
  expect(JSON.stringify(cloud)).not.toContain(token);
  vi.stubGlobal("URL", undefined);
  vi.stubGlobal("URLSearchParams", undefined);
  expect(readRobloxAccountSettings(value)).toEqual(saved);
  expect(robloxAuthorizationUrl(pending.authorizationUrl, saved.origin)).toBe(
    true,
  );
});
it("rejects altered provider links, extra permissions, secrets, duplicate fields and different redirects", async () => {
  const f = oauthFixture(),
    login = await f.service.begin("invite"),
    origin = "https://relay.test";
  expect(robloxAuthorizationUrl(login.authorizationUrl, origin)).toBe(true);
  const mutations = [
    (u: URL) => {
      u.hostname = "untrusted.test";
    },
    (u: URL) => {
      u.searchParams.set(
        "redirect_uri",
        "https://other.test/oauth/roblox/callback",
      );
    },
    (u: URL) => {
      u.searchParams.set(
        "scope",
        u.searchParams.get("scope") + " universe-messaging-service:publish",
      );
    },
    (u: URL) => {
      u.searchParams.set("client_secret", "hidden-secret");
    },
    (u: URL) => {
      u.searchParams.append("state", "c".repeat(64));
    },
    (u: URL) => {
      u.searchParams.set("code_challenge_method", "plain");
    },
    (u: URL) => {
      u.hash = "fragment";
    },
  ];
  for (const change of mutations) {
    const u = new URL(login.authorizationUrl);
    change(u);
    expect(robloxAuthorizationUrl(u.href, origin)).toBe(false);
  }
  expect(
    readRobloxAccountSettings({
      origin: "https://user:password@relay.test",
      accountToken: "a".repeat(64),
    }),
  ).toBeUndefined();
  expect(
    readRobloxAccountSettings({
      origin,
      accountToken: "malformed",
      pending: { ...login, loginToken: "bad" },
    }),
  ).toBeUndefined();
});
it("serializes saves and clear so slow storage cannot restore a disconnected account", async () => {
  let value: unknown, finish!: () => void;
  const device = {
    getAsync: async () => value,
    setAsync: vi.fn(async (_key: string, record: unknown) => {
      value = record;
    }),
  };
  device.setAsync.mockImplementationOnce(
    (_key, record) =>
      new Promise<void>((resolve) => {
        finish = () => {
          value = record;
          resolve();
        };
      }),
  );
  const storage = createRobloxAccountStorage(device),
    saving = storage.save({
      origin: "https://relay.test",
      accountToken: "a".repeat(64),
    }),
    clearing = storage.save(null);
  await vi.waitFor(() => expect(finish).toBeDefined());
  finish();
  await Promise.all([saving, clearing]);
  expect(value).toBeNull();
  expect(await storage.load()).toBeUndefined();
  device.setAsync.mockRejectedValueOnce(new Error("disk unavailable"));
  await expect(
    storage.save({
      origin: "https://relay.test",
      accountToken: "b".repeat(64),
    }),
  ).rejects.toThrow("disk unavailable");
  await storage.save(null);
  expect(value).toBeNull();
});
