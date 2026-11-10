import { afterEach, expect, it, vi } from "vitest";
import { imageToolsResult } from "./image-tools-fixtures";
import {
  reuseArtwork,
  type UploadCatalog,
} from "../plugins/figma/src/asset-catalog";
import type { CloudSettings } from "../plugins/figma/src/cloud-storage";
import type { ConnectionState } from "../plugins/figma/src/studio-connection";
import {
  guardUploadConnection,
  recoverUnauthorizedUpload,
  selectUploadAccess,
  uploadConnectionProblem,
} from "../plugins/figma/src/upload-connection";

const pairedToken = "a".repeat(64);
const standaloneToken = "b".repeat(64);
const settings: CloudSettings = {
  key: "test-only-api-key",
  ownerType: "user",
  ownerId: "123",
};
const unpaired: ConnectionState = { restoring: false, retry: false, error: "" };
const paired = (expiresAt = Date.now() + 60_000): ConnectionState => ({
  ...unpaired,
  connection: { senderToken: pairedToken, expiresAt },
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function clientTrace(assetStatus = 200, privateBeta = false) {
  vi.stubEnv("VITE_FRAMEBRIDGE_RELAY_URL", "https://upload.test");
  vi.stubEnv("VITE_FRAMEBRIDGE_PRIVATE_BETA", privateBeta ? "1" : "0");
  vi.resetModules();
  const requests: { path: string; method: string; headers: Headers }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    requests.push({
      path,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
    });
    let body: unknown;
    let status = 200;
    if (path === "/v1/upload-sessions")
      body = { uploadToken: standaloneToken, expiresAt: Date.now() + 60_000 };
    else if (path === "/v1/assets") {
      status = assetStatus;
      body =
        status === 200
          ? { id: "job-1", state: "uploading" }
          : { error: "Upload authorization ended." };
    } else if (path === "/v1/assets/job-1")
      body = {
        id: "job-1",
        state: "done",
        result: { assetId: "987", moderation: "MODERATION_STATE_APPROVED" },
      };
    else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetch);
  return {
    client: await import("../plugins/figma/src/transfer"),
    requests,
    fetch,
  };
}

it("uploads and polls with the active paired sender, without beta access or package publication", async () => {
  const { client, requests } = await clientTrace();
  vi.stubGlobal("crypto", undefined);
  const create = vi.fn(() => client.createUploadSession());
  const connection = guardUploadConnection(() => paired());
  const access = await selectUploadAccess(
    connection,
    { uploadToken: standaloneToken, expiresAt: Date.now() + 60_000 },
    create,
  );
  const pkg = await client.uploadArtwork(
    imageToolsResult(),
    access.token,
    settings,
    new AbortController().signal,
    () => {},
    () => true,
  );
  expect(access.kind).toBe("paired");
  expect(create).not.toHaveBeenCalled();
  expect(requests.map(({ path, method }) => [path, method])).toEqual([
    ["/v1/assets", "POST"],
    ["/v1/assets/job-1", "GET"],
  ]);
  for (const request of requests) {
    expect(request.headers.get("Authorization")).toBe(`Bearer ${pairedToken}`);
    expect(request.headers.get("X-Roblox-Api-Key")).toBe(settings.key);
    expect(request.headers.has("X-Framebridge-Beta")).toBe(false);
  }
  expect(pkg.assets[0].robloxId).toBe("987");
  expect(requests.some(({ path }) => path === "/v1/package")).toBe(false);
});

it("creates a standalone session only when unpaired, and reuses that capability for uploads and polls", async () => {
  const { client, requests } = await clientTrace(200, true);
  const create = vi.fn(() =>
    client.createUploadSession(undefined, "test-only-beta"),
  );
  const connection = guardUploadConnection(() => unpaired);
  const access = await selectUploadAccess(connection, null, create);
  await client.uploadArtwork(
    imageToolsResult(),
    access.token,
    settings,
    new AbortController().signal,
    () => {},
    () => true,
  );
  expect(access.kind).toBe("standalone");
  expect(create).toHaveBeenCalledOnce();
  expect(requests.map(({ path }) => path)).toEqual([
    "/v1/upload-sessions",
    "/v1/assets",
    "/v1/assets/job-1",
  ]);
  expect(requests[0].headers.has("Authorization")).toBe(false);
  expect(requests[0].headers.get("X-Framebridge-Beta")).toBe("test-only-beta");
  for (const request of requests.slice(1))
    expect(request.headers.get("Authorization")).toBe(
      `Bearer ${standaloneToken}`,
    );
  const reused = await selectUploadAccess(
    connection,
    access.kind === "standalone" ? access.session : null,
    create,
  );
  expect(reused.token).toBe(standaloneToken);
  expect(create).toHaveBeenCalledOnce();
  expect(requests.some(({ path }) => path === "/v1/package")).toBe(false);
});

it.each([
  { ...paired(9000), restoring: true },
  { ...unpaired, retry: true },
  paired(1000),
])(
  "blocks unavailable saved connections before any upload session or asset request: %j",
  async (state) => {
    const { client, fetch } = await clientTrace();
    const create = vi.fn(() => client.createUploadSession());
    expect(uploadConnectionProblem(state, 1000)).toBeDefined();
    expect(() =>
      guardUploadConnection(
        () => state,
        () => 1000,
      ),
    ).toThrow(/connection/);
    expect(create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each(["restoring", "retry", "expired", "forgotten", "replaced"] as const)(
  "blocks a connection becoming %s during awaited image reuse without falling back to beta access",
  async (change) => {
    const { client, fetch } = await clientTrace();
    let state = paired(9000);
    let now = 1000;
    const connection = guardUploadConnection(
      () => state,
      () => now,
    );
    let finish!: (value: undefined) => void;
    const catalog: UploadCatalog = {
      match: vi.fn(
        () =>
          new Promise<undefined>((resolve) => {
            finish = resolve;
          }),
      ),
      remember: vi.fn(),
    };
    const prepared = reuseArtwork(
      imageToolsResult(),
      settings,
      catalog,
      connection,
    );
    expect(catalog.match).toHaveBeenCalledOnce();
    if (change === "restoring") state = { ...state, restoring: true };
    if (change === "retry") state = { ...unpaired, retry: true };
    if (change === "expired") now = 9000;
    if (change === "forgotten") state = unpaired;
    if (change === "replaced")
      state = {
        ...state,
        connection: { senderToken: "c".repeat(64), expiresAt: 9000 },
      };
    finish(undefined);
    await expect(prepared).rejects.toThrow(/connection/);
    const create = vi.fn(() => client.createUploadSession());
    await expect(
      selectUploadAccess(connection, null, create, () => now),
    ).rejects.toThrow(/connection/);
    expect(create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each(["restoring", "retry", "paired"] as const)(
  "rechecks unpaired state after standalone session creation when it becomes %s",
  async (change) => {
    let state = unpaired;
    const connection = guardUploadConnection(
      () => state,
      () => 1000,
    );
    let finish!: (value: { uploadToken: string; expiresAt: number }) => void;
    const create = vi.fn(
      () =>
        new Promise<{ uploadToken: string; expiresAt: number }>((resolve) => {
          finish = resolve;
        }),
    );
    const access = selectUploadAccess(connection, null, create, () => 1000);
    state =
      change === "paired" ? paired(9000) : { ...unpaired, [change]: true };
    finish({ uploadToken: standaloneToken, expiresAt: 9000 });
    await expect(access).rejects.toThrow(/connection/);
    expect(create).toHaveBeenCalledOnce();
  },
);

it("replaces expired standalone access and rejects an already expired replacement", async () => {
  const cached = { uploadToken: standaloneToken, expiresAt: 1000 };
  const create = vi.fn(async () => ({
    uploadToken: "c".repeat(64),
    expiresAt: 9000,
  }));
  const connection = guardUploadConnection(
    () => unpaired,
    () => 1000,
  );
  expect(
    (await selectUploadAccess(connection, cached, create, () => 1000)).token,
  ).toBe("c".repeat(64));
  expect(create).toHaveBeenCalledOnce();
  await expect(
    selectUploadAccess(
      connection,
      null,
      async () => cached,
      () => 1000,
    ),
  ).rejects.toThrow(/session expired/);
});

it.each(["paired", "standalone"] as const)(
  "recovers a real artwork 401 using the %s access that failed",
  async (kind) => {
    const { client, requests } = await clientTrace(401);
    const connection = guardUploadConnection(() =>
      kind === "paired" ? paired() : unpaired,
    );
    const access = await selectUploadAccess(
      connection,
      { uploadToken: standaloneToken, expiresAt: Date.now() + 60_000 },
      () => client.createUploadSession(),
    );
    const restore = vi.fn();
    const clear = vi.fn();
    try {
      await client.uploadArtwork(
        imageToolsResult(),
        access.token,
        settings,
        new AbortController().signal,
        () => {},
        () => true,
      );
      expect.fail("Expected an artwork authorization error");
    } catch (error) {
      expect(error).toBeInstanceOf(client.RelayError);
      expect(error).toMatchObject({ status: 401, path: "/v1/assets" });
      recoverUnauthorizedUpload(access, restore, clear);
    }
    expect(restore).toHaveBeenCalledTimes(kind === "paired" ? 1 : 0);
    expect(clear).toHaveBeenCalledTimes(kind === "standalone" ? 1 : 0);
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("Authorization")).toBe(
      `Bearer ${access.token}`,
    );
  },
);

it("retains completed image links on a later paired 401 without switching capabilities", async () => {
  const { client, requests, fetch } = await clientTrace();
  const original = fetch.getMockImplementation()!;
  let assetRequests = 0;
  let confirmFirst!: () => void;
  const firstConfirmed = new Promise<void>((resolve) => {
    confirmFirst = resolve;
  });
  fetch.mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/v1/assets" && ++assetRequests === 2) {
      requests.push({
        path,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
      });
      await firstConfirmed;
      return new Response(
        JSON.stringify({ error: "Studio authorization ended." }),
        { status: 401 },
      );
    }
    return original(input, init);
  });
  const value = imageToolsResult();
  const second = imageToolsResult({ whiteMask: true });
  value.package.assets.push({
    ...second.package.assets[0],
    id: "second",
    nodeId: "second",
  });
  value.assets.second = second.assets[second.package.assets[0].id];
  const create = vi.fn(() => client.createUploadSession());
  const access = await selectUploadAccess(
    guardUploadConnection(() => paired()),
    null,
    create,
  );
  const committed: (typeof value.package)[] = [];
  const restore = vi.fn();
  const clear = vi.fn();
  try {
    await client.uploadArtwork(
      value,
      access.token,
      settings,
      new AbortController().signal,
      () => {},
      () => true,
      (pkg) => {
        committed.push(structuredClone(pkg));
        if (pkg.assets[0].robloxId) confirmFirst();
      },
    );
    expect.fail("Expected the second upload to lose authorization");
  } catch (error) {
    expect(error).toBeInstanceOf(client.RelayError);
    expect(error).toMatchObject({ status: 401, path: "/v1/assets" });
    recoverUnauthorizedUpload(access, restore, clear);
  }
  expect(create).not.toHaveBeenCalled();
  expect(restore).toHaveBeenCalledOnce();
  expect(clear).not.toHaveBeenCalled();
  expect(committed.at(-1)?.assets.map((asset) => asset.robloxId)).toEqual([
    "987",
    undefined,
  ]);
  expect(requests.filter(({ path }) => path === "/v1/assets")).toHaveLength(2);
  for (const request of requests)
    expect(request.headers.get("Authorization")).toBe(`Bearer ${pairedToken}`);
  expect(
    requests.some(({ path }) =>
      ["/v1/upload-sessions", "/v1/package"].includes(path),
    ),
  ).toBe(false);
});

it("keeps Roblox creator authorization required for a paired sender", async () => {
  const { client, fetch } = await clientTrace();
  const access = await selectUploadAccess(
    guardUploadConnection(() => paired()),
    null,
    () => client.createUploadSession(),
  );
  await expect(
    client.uploadArtwork(
      imageToolsResult(),
      access.token,
      { ...settings, key: "" },
      new AbortController().signal,
      () => {},
      () => true,
    ),
  ).rejects.toThrow(/API key and creator ID/);
  expect(fetch).not.toHaveBeenCalled();
});
