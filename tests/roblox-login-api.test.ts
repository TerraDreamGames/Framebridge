import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { oauthFixture } from "./roblox-oauth-fixture";
import { demoResult } from "../packages/core/src/demo";
import { iconPng } from "./image-tools-fixtures";
import { buildExport } from "../packages/core/src/export";
import { unzipSync } from "fflate";
import { buildSourceExport } from "../packages/core/src/source-export";
import { generateModel } from "../packages/core/src/model-export";
let mock: ReturnType<typeof vi.fn<typeof fetch>>;
const accountToken = "a".repeat(64),
  uploadToken = "b".repeat(64);
const publicAccount = {
  userId: "123",
  username: "TestCreator",
  displayName: "Test Creator",
  owners: [{ kind: "user", id: "123", label: "TestCreator" }],
  expiresAt: Date.now() + 86400000,
  needsAuthorization: false,
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_FRAMEBRIDGE_RELAY_URL", "https://relay.test");
  vi.stubEnv("VITE_FRAMEBRIDGE_PRIVATE_BETA", "1");
  mock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", mock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("distinguishes a simulated service and returns only public configuration", async () => {
  const api = await import("../plugins/figma/src/roblox-login-api");
  mock
    .mockResolvedValueOnce(
      Response.json({
        available: true,
        simulation: true,
        client_secret: "server-only",
      }),
    )
    .mockResolvedValueOnce(Response.json({ available: true }))
    .mockResolvedValueOnce(Response.json({ available: false }))
    .mockResolvedValueOnce(
      Response.json({ available: true, simulation: "true" }),
    );
  expect(await api.robloxLoginConfig()).toEqual({
    available: true,
    simulation: true,
  });
  expect(await api.robloxLoginConfig()).toEqual({
    available: true,
    simulation: false,
  });
  expect(await api.robloxLoginConfig()).toEqual({
    available: false,
    simulation: false,
  });
  await expect(api.robloxLoginConfig()).rejects.toThrow(
    "availability could not be checked",
  );
});
it("begins private authorization and keeps polling/account capabilities in their intended headers", async () => {
  const f = oauthFixture(),
    login = await f.service.begin("invite"),
    api = await import("../plugins/figma/src/roblox-login-api");
  mock
    .mockResolvedValueOnce(Response.json(login))
    .mockResolvedValueOnce(
      Response.json({
        status: "ready",
        accountToken,
        account: { ...publicAccount, refresh_token: "not-client-data" },
      }),
    )
    .mockResolvedValueOnce(Response.json(publicAccount))
    .mockResolvedValueOnce(Response.json({ ok: true }))
    .mockResolvedValueOnce(
      Response.json({ disconnected: true, revoked: false }),
    );
  expect(
    await api.beginRobloxLogin("private-invitation", accountToken),
  ).toEqual(login);
  const start = new Headers(mock.mock.calls[0][1]?.headers);
  expect(start.get("X-Framebridge-Beta")).toBe("private-invitation");
  expect(start.get("X-Framebridge-Roblox-Account")).toBe(accountToken);
  expect(start.has("Authorization")).toBe(false);
  const ready = await api.pollRobloxLogin(login.loginToken);
  expect(JSON.stringify(ready)).not.toContain("not-client-data");
  expect(new Headers(mock.mock.calls[1][1]?.headers).get("Authorization")).toBe(
    "Bearer " + login.loginToken,
  );
  expect(await api.inspectRobloxAccount(accountToken)).toEqual(publicAccount);
  await api.acknowledgeRobloxLogin(login.loginToken);
  expect(await api.disconnectRobloxAccount(accountToken)).toEqual({
    disconnected: true,
    revoked: false,
  });
  expect(mock.mock.calls.at(-1)?.[1]?.method).toBe("DELETE");
});
it("starts public authorization without transmitting a saved tester code", async () => {
  vi.stubEnv("VITE_FRAMEBRIDGE_PRIVATE_BETA", "0");
  const login = await oauthFixture().service.begin("invite");
  const api = await import("../plugins/figma/src/roblox-login-api");
  mock.mockResolvedValueOnce(Response.json(login));
  expect(
    await api.beginRobloxLogin("old-saved-invitation", accountToken),
  ).toEqual(login);
  const headers = new Headers(mock.mock.calls[0][1]?.headers);
  expect(headers.has("X-Framebridge-Beta")).toBe(false);
  expect(headers.get("X-Framebridge-Roblox-Account")).toBe(accountToken);
});
it("rejects altered authorization links and incomplete account metadata", async () => {
  const f = oauthFixture(),
    login = await f.service.begin("invite"),
    api = await import("../plugins/figma/src/roblox-login-api");
  mock
    .mockResolvedValueOnce(
      Response.json({ ...login, authorizationUrl: "https://malicious.test" }),
    )
    .mockResolvedValueOnce(
      Response.json({
        status: "ready",
        accountToken,
        account: {
          ...publicAccount,
          owners: [{ kind: "unknown", id: "123", label: "Bad" }],
        },
      }),
    );
  await expect(api.beginRobloxLogin("private-invitation")).rejects.toThrow(
    "invalid Roblox authorization link",
  );
  await expect(api.pollRobloxLogin(login.loginToken)).rejects.toThrow(
    "invalid account",
  );
});
it("retains only safe authenticated refresh diagnostics and rejects partial or inconsistent metadata", async () => {
  const api = await import("../plugins/figma/src/roblox-login-api");
  const diagnostics = {
    providerAccessExpiresAt: 1900000,
    providerRefreshCount: 1,
    providerRefreshedAt: 1000000,
  };
  mock.mockResolvedValueOnce(
    Response.json({
      ...publicAccount,
      ...diagnostics,
      access_token: "never-client-data",
      sealed: "never-client-data",
    }),
  );
  expect(await api.inspectRobloxAccount(accountToken)).toEqual({
    ...publicAccount,
    ...diagnostics,
  });
  for (const invalid of [
    { providerRefreshCount: 1 },
    { ...diagnostics, providerRefreshCount: -1 },
    { ...diagnostics, providerRefreshedAt: null },
    { ...diagnostics, providerRefreshCount: 0 },
  ]) {
    mock.mockResolvedValueOnce(Response.json({ ...publicAccount, ...invalid }));
    await expect(api.inspectRobloxAccount(accountToken)).rejects.toThrow(
      "Invalid provider refresh diagnostics",
    );
  }
});
it("accepts the configured callback gateway while sending capabilities only to the relay", async () => {
  const login = await oauthFixture().service.begin("invite"),
    api = await import("../plugins/figma/src/roblox-login-api");
  const callbackOrigin = "https://framebridge.test",
    url = new URL(login.authorizationUrl);
  url.searchParams.set(
    "redirect_uri",
    callbackOrigin + "/oauth/roblox/callback",
  );
  mock
    .mockResolvedValueOnce(
      Response.json({
        available: true,
        callbackOrigin,
        client_secret: "server-only",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...login, authorizationUrl: url.href }),
    );
  const config = await api.robloxLoginConfig();
  expect(config).toEqual({
    available: true,
    simulation: false,
    callbackOrigin,
  });
  expect(
    (
      await api.beginRobloxLogin(
        "invitation",
        accountToken,
        undefined,
        config.callbackOrigin,
      )
    ).callbackOrigin,
  ).toBe(callbackOrigin);
  expect(
    mock.mock.calls.every(([url]) =>
      String(url).startsWith("https://relay.test/"),
    ),
  ).toBe(true);
  for (const invalid of [
    "http://remote.test",
    "https://gateway.test/path",
    "https://user:password@gateway.test",
  ]) {
    mock.mockResolvedValueOnce(
      Response.json({ available: true, callbackOrigin: invalid }),
    );
    await expect(api.robloxLoginConfig()).rejects.toThrow("availability");
  }
});
it("rejects duplicate grants and a different user's personal creator", async () => {
  const api = await import("../plugins/figma/src/roblox-login-api");
  for (const owners of [
    [...publicAccount.owners, ...publicAccount.owners],
    [{ kind: "user", id: "999", label: "Other" }],
  ]) {
    mock.mockResolvedValueOnce(Response.json({ ...publicAccount, owners }));
    await expect(api.inspectRobloxAccount(accountToken)).rejects.toThrow(
      "invalid account",
    );
  }
});
it("uses the selected account for image create/poll and excludes credentials from exported UI", async () => {
  const client = await import("../plugins/figma/src/transfer"),
    result = demoResult();
  result.package.assets.push({
    id: "art",
    nodeId: "art",
    name: "Icon",
    filename: "Icon.png",
    width: 4,
    height: 4,
    scale: 1,
    reason: "Vector",
  });
  result.assets.art = Array.from(iconPng());
  const settings = {
    authMode: "roblox" as const,
    accountToken,
    key: "retained-manual-key",
    ownerType: "user" as const,
    ownerId: "123",
  };
  mock
    .mockResolvedValueOnce(Response.json({ id: "job", state: "uploading" }))
    .mockResolvedValueOnce(
      Response.json({
        id: "job",
        state: "done",
        result: { assetId: "987", moderation: "MODERATION_STATE_APPROVED" },
      }),
    );
  const pkg = await client.uploadArtwork(
    result,
    uploadToken,
    settings,
    new AbortController().signal,
    () => {},
    () => true,
  );
  expect(pkg.assets.at(-1)?.robloxId).toBe("987");
  for (const request of mock.mock.calls) {
    const h = new Headers(request[1]?.headers);
    expect(h.get("X-Framebridge-Roblox-Account")).toBe(accountToken);
    expect(h.has("X-Roblox-Api-Key")).toBe(false);
    expect(h.get("Authorization")).toBe("Bearer " + uploadToken);
  }
  const exported = buildExport({ ...result, package: pkg });
  const decoder = new TextDecoder();
  const contents =
    exported.mime === "application/zip"
      ? Object.values(unzipSync(exported.data)).map((bytes) =>
          decoder.decode(bytes),
        )
      : [decoder.decode(exported.data)];
  const pendingExport = buildExport({
    ...result,
    package: {
      ...pkg,
      assets: pkg.assets.map((asset) => ({ ...asset, robloxId: undefined })),
    },
  });
  expect(pendingExport.mime).toBe("application/zip");
  contents.push(
    ...Object.values(unzipSync(pendingExport.data)).map((bytes) =>
      decoder.decode(bytes),
    ),
  );
  // Check unpacked bytes and all supported source/model formats, not compressed ZIP text.
  for (const format of ["react", "luau", "fusion", "tsx"] as const) {
    const source = buildSourceExport({ ...result, package: pkg }, format);
    contents.push(
      ...Object.values(unzipSync(source.data)).map((bytes) =>
        decoder.decode(bytes),
      ),
    );
  }
  contents.push(generateModel(pkg));
  for (const value of [
    accountToken,
    uploadToken,
    settings.key,
    "local-access-token",
    "local-refresh-token",
    "server-only",
  ])
    for (const text of contents) expect(text).not.toContain(value);
  expect(client.uploadAuthorization({ ...settings, authMode: "key" })).toEqual({
    key: settings.key,
    accountToken: undefined,
  });
  expect(() =>
    client.uploadAuthorization({ ...settings, accountToken: undefined }),
  ).toThrow("Sign in with Roblox");
});
it("exports native and fully linked artwork without requiring any upload authorization", async () => {
  const client = await import("../plugins/figma/src/transfer");
  const settings = {
    authMode: "roblox" as const,
    key: "",
    ownerType: "user" as const,
    ownerId: "",
    authorizationError: "Reconnect required",
  };
  for (const linked of [false, true]) {
    const result = demoResult();
    result.package.assets = linked
      ? [
          {
            id: "linked",
            nodeId: "linked",
            name: "Linked icon",
            filename: "Linked.png",
            width: 4,
            height: 4,
            scale: 1,
            reason: "Vector",
            robloxId: "987",
          },
        ]
      : [];
    await expect(
      client.uploadArtwork(
        result,
        "",
        settings,
        new AbortController().signal,
        () => {},
        () => true,
      ),
    ).resolves.toMatchObject({ assets: result.package.assets });
  }
  expect(mock).not.toHaveBeenCalled();
});
