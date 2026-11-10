import { describe, expect, it, vi } from "vitest";
import {
  CLOUD_STORAGE_KEY,
  createCloudStorage,
  readCloudSettings,
} from "../plugins/figma/src/cloud-storage";

describe("local Open Cloud settings", () => {
  it("restores and clears beta access independently of the Roblox key", async () => {
    let saved: unknown;
    const storage = {
      getAsync: async () => saved,
      setAsync: async (_key: string, value: unknown) => {
        saved = value;
      },
    };
    const store = createCloudStorage(storage);
    await store.save({
      betaAccess: "private-tester-code",
      key: "roblox-key",
      ownerId: "123",
    });
    expect((await store.load()).betaAccess).toBe("private-tester-code");
    await store.save({ betaAccess: "", key: "roblox-key", ownerId: "123" });
    expect(await store.load()).toEqual({
      key: "roblox-key",
      ownerId: "123",
      ownerType: "user",
    });
    expect(readCloudSettings({ betaAccess: 123 })).not.toHaveProperty(
      "betaAccess",
    );
  });
  it("restores only supported fields and handles missing or old data", () => {
    expect(readCloudSettings(undefined)).toEqual({
      key: "",
      ownerType: "user",
      ownerId: "",
    });
    expect(
      readCloudSettings({ key: 4, ownerType: "invalid", ownerId: null }),
    ).toEqual(readCloudSettings(null));
    expect(
      readCloudSettings({
        key: "dummy-key",
        ownerType: "group",
        ownerId: "123",
        token: "ignored",
      }),
    ).toEqual({ key: "dummy-key", ownerType: "group", ownerId: "123" });
  });

  it("persists across store instances and clears the key without losing the creator", async () => {
    const values = new Map<string, unknown>();
    const storage = {
      getAsync: async (key: string) => values.get(key),
      setAsync: async (key: string, value: unknown) => {
        values.set(key, value);
      },
    };
    const first = createCloudStorage(storage);
    await first.save({ key: "dummy-key", ownerType: "group", ownerId: "123" });
    const reopened = createCloudStorage(storage);
    expect(await reopened.load()).toEqual({
      key: "dummy-key",
      ownerType: "group",
      ownerId: "123",
    });
    await reopened.save({ key: "", ownerType: "group", ownerId: "123" });
    expect(values.get(CLOUD_STORAGE_KEY)).not.toHaveProperty("key");
    expect(await createCloudStorage(storage).load()).toEqual({
      key: "",
      ownerType: "group",
      ownerId: "123",
    });
  });

  it("serializes rapid changes so a delayed save cannot restore a cleared key", async () => {
    let finish!: () => void;
    let value: unknown;
    const storage = {
      getAsync: async () => value,
      setAsync: vi.fn(async (_key: string, record: unknown) => {
        if (storage.setAsync.mock.calls.length === 1)
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        value = record;
      }),
    };
    const store = createCloudStorage(storage);
    const save = store.save({ key: "dummy-key", ownerId: "123" });
    const clear = store.save({ key: "", ownerId: "456", ownerType: "group" });
    const restored = store.load();
    await vi.waitFor(() => expect(storage.setAsync).toHaveBeenCalledTimes(1));
    finish();
    await Promise.all([save, clear]);
    expect(await restored).toEqual({
      key: "",
      ownerType: "group",
      ownerId: "456",
    });
  });

  it("reports failures and allows a later save to recover", async () => {
    const storage = {
      getAsync: vi.fn().mockRejectedValue(new Error("read failed")),
      setAsync: vi
        .fn()
        .mockRejectedValueOnce(new Error("write failed"))
        .mockResolvedValue(undefined),
    };
    const store = createCloudStorage(storage);
    await expect(store.load()).rejects.toThrow("read failed");
    await expect(store.save({ key: "dummy-key" })).rejects.toThrow(
      "write failed",
    );
    await expect(store.save({ key: "" })).resolves.toBeUndefined();
    await store.flush();
  });
});
