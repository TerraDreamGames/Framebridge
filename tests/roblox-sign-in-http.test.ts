import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSignInQaService,
  SIGN_IN_QA_INVITATION,
} from "../scripts/roblox-sign-in-qa";
import { createRobloxAccountManager } from "../plugins/figma/src/roblox-account-manager";
import {
  robloxAuthorizationUrl,
  type SavedRobloxAccount,
} from "../plugins/figma/src/roblox-account-storage";
import { updateCloudSettings } from "../plugins/figma/src/cloud-storage";
import { robloxUploadSettings } from "../plugins/figma/src/roblox-upload-settings";
import { demoResult } from "../packages/core/src/demo";
import { iconPng } from "./image-tools-fixtures";
let directory: string,
  service: Awaited<ReturnType<typeof createSignInQaService>>;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "framebridge-sign-in-http-"));
  service = await createSignInQaService(0, directory);
  vi.stubEnv("VITE_FRAMEBRIDGE_RELAY_URL", service.origin);
  vi.stubEnv("VITE_FRAMEBRIDGE_PRIVATE_BETA", "1");
  vi.resetModules();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await service?.close();
  await rm(directory, { recursive: true, force: true });
});
it("recovers sign-in, revoked creators, outages and idle expiry through real localhost HTTP and workerd", async () => {
  const api = await import("../plugins/figma/src/roblox-login-api");
  const transfer = await import("../plugins/figma/src/transfer");
  let record: SavedRobloxAccount | null = null;
  const savedRecord = (): SavedRobloxAccount | null => record;
  const open = vi.fn(async (url: string) => {
    expect(
      robloxAuthorizationUrl(
        url,
        service.origin,
        manager.snapshot().callbackOrigin,
      ),
    ).toBe(true);
  });
  const manager = createRobloxAccountManager(
    service.origin,
    {
      load: async () => record,
      save: async (value) => {
        record = value ? structuredClone(value) : null;
      },
    },
    {
      config: api.robloxLoginConfig,
      begin: api.beginRobloxLogin,
      poll: api.pollRobloxLogin,
      acknowledge: api.acknowledgeRobloxLogin,
      cancel: api.cancelRobloxLogin,
      inspect: api.inspectRobloxAccount,
      disconnect: api.disconnectRobloxAccount,
    },
    open,
    () => {},
  );
  try {
    for (const path of [
      "/v1/roblox/config",
      "/v1/roblox/login",
      "/v1/roblox/account",
    ]) {
      const preflight = await fetch(service.origin + path, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5189",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "content-type,x-framebridge-beta,authorization",
        },
      });
      expect(preflight.status).toBe(204);
      expect(await preflight.text()).toBe("");
      expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(
        preflight.headers.get("Access-Control-Allow-Headers")?.toLowerCase(),
      ).toContain("x-framebridge-beta");
    }
    await manager.restore();
    expect(manager.snapshot()).toMatchObject({
      available: true,
      simulation: true,
      callbackOrigin: "https://framebridge-qa.test",
    });
    await manager.start(SIGN_IN_QA_INVITATION);
    expect(savedRecord()?.pending?.callbackOrigin).toBe(
      "https://framebridge-qa.test",
    );
    expect(open).toHaveBeenCalledTimes(1);
    await manager.recheck();
    expect(manager.snapshot().account?.owners.map((o) => o.id)).toEqual([
      "123",
      "456",
    ]);
    const original = manager.snapshot().accountToken;
    await service.control("hold-next");
    await manager.start(SIGN_IN_QA_INVITATION);
    expect(savedRecord()?.pending?.previousToken).toBe(original);
    expect(manager.snapshot().accountToken).toBe(original);
    await manager.cancel();
    expect(savedRecord()?.pending).toBeUndefined();
    expect(manager.snapshot().accountToken).toBe(original);
    await service.control("release"); // a canceled state cannot complete later
    await service.control("deny-next");
    await manager.start(SIGN_IN_QA_INVITATION);
    await manager.recheck();
    expect(manager.snapshot().error).toContain("declined");
    expect(manager.snapshot().accountToken).toBe(original);
    expect(savedRecord()?.pending).toBeUndefined();
    const selected = updateCloudSettings(
      {
        key: "local-qa-api-key",
        ownerType: "group",
        ownerId: "987",
        authMode: "key",
      },
      { authMode: "roblox" },
      "123",
    );
    const cloud = updateCloudSettings(
      selected,
      { ownerType: "group", ownerId: "456" },
      "123",
    );
    const saved = record;
    await service.control("offline-on");
    const outagePreflight = await fetch(service.origin + "/v1/roblox/account", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5189",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(outagePreflight.status).toBe(204);
    expect(outagePreflight.headers.get("Access-Control-Allow-Origin")).toBe(
      "*",
    );
    await manager.recheck();
    expect(manager.snapshot().retry).toBe(true);
    expect(record).toEqual(saved);
    await service.control("offline-off");
    await manager.retry();
    expect(manager.snapshot().retry).toBe(false);
    await service.control("group-off");
    await manager.recheck();
    expect(service.counts.refresh).toBe(1);
    expect(manager.snapshot().account?.owners.map((o) => o.id)).toEqual([
      "123",
    ]);
    expect(cloud.ownerId).toBe("456");
    const upload = robloxUploadSettings(cloud, {
      ...manager.snapshot(),
      simulation: false,
    });
    expect(() => transfer.uploadAuthorization(upload)).toThrow(
      "Choose an approved",
    );
    expect(service.counts.creates).toBe(0);
    const previous = manager.snapshot().accountToken;
    await service.control("expire-soon");
    await manager.recheck();
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(manager.snapshot().account?.needsAuthorization).toBe(true);
    expect(manager.snapshot().accountToken).toBe(previous);
    await manager.start(SIGN_IN_QA_INVITATION);
    expect(savedRecord()?.pending?.previousToken).toBeUndefined();
    expect(manager.snapshot().error).toBe("");
    await manager.recheck();
    expect(manager.snapshot().accountToken).not.toBe(previous);
    expect(manager.snapshot().account?.needsAuthorization).toBe(false);
    const fallback = updateCloudSettings(cloud, { authMode: "key" }, "123");
    expect(fallback.ownerId).toBe("987");
    const session = await transfer.createUploadSession(
      undefined,
      SIGN_IN_QA_INVITATION,
    );
    const result = demoResult();
    result.package.assets.push({
      id: "qa-art",
      nodeId: "qa-art",
      name: "QA icon",
      filename: "QA_Icon.png",
      width: 4,
      height: 4,
      scale: 1,
      reason: "Vector",
    });
    result.assets["qa-art"] = Array.from(iconPng());
    const pkg = await transfer.uploadArtwork(
      result,
      session.uploadToken,
      fallback,
      new AbortController().signal,
      () => {},
      () => true,
    );
    expect(pkg.assets.at(-1)?.robloxId).toBe("987654");
    expect(service.counts).toMatchObject({
      creates: 1,
      keyCreates: 1,
      bearerCreates: 0,
      polls: 1,
    });
    await transfer.disconnectStudio(session.uploadToken);
    await manager.disconnect();
    expect(record).toBeNull();
    const counts = await service.control("offline-off");
    expect(counts).toMatchObject({ accounts: 0, logins: 0, sessions: 0 });
  } finally {
    manager.dispose();
  }
}, 20000);
