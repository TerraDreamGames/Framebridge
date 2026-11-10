import { expect, it } from "vitest";
import {
  cloudStorageRecord,
  readCloudSettings,
  updateCloudSettings,
} from "../plugins/figma/src/cloud-storage";
import { robloxUploadSettings } from "../plugins/figma/src/roblox-upload-settings";
import { uploadAuthorization } from "../plugins/figma/src/transfer";
import type { RobloxAccountState } from "../plugins/figma/src/roblox-account-manager";
const state: RobloxAccountState = {
  loading: false,
  busy: false,
  retry: false,
  error: "",
  notice: "",
  accountToken: "a".repeat(64),
  account: {
    userId: "123",
    username: "Creator",
    displayName: "Creator",
    expiresAt: 5000,
    needsAuthorization: false,
    owners: [
      { kind: "user", id: "123", label: "Creator" },
      { kind: "group", id: "456", label: "Group 456" },
    ],
  },
};
it("keeps independent creator preferences across methods, reload, disconnect and reconnect", () => {
  const key = {
    key: "manual",
    ownerType: "group" as const,
    ownerId: "987",
    authMode: "key" as const,
  };
  const first = updateCloudSettings(key, { authMode: "roblox" }, "123");
  expect(first.ownerId).toBe("");
  const selected = updateCloudSettings(
    first,
    { ownerType: "group", ownerId: "456" },
    "123",
  );
  const persisted = readCloudSettings(cloudStorageRecord(selected));
  const fallback = updateCloudSettings(persisted, { authMode: "key" }, "123");
  expect(fallback).toMatchObject({
    ownerType: "group",
    ownerId: "987",
    key: "manual",
  });
  const disconnected = updateCloudSettings(fallback, { authMode: "roblox" });
  expect(disconnected.ownerId).toBe("");
  const reconnected = updateCloudSettings(disconnected, {}, "123");
  // Restoring the same saved account returns its explicitly selected group.
  expect(reconnected.ownerId).toBe("456");
  expect(reconnected.keyOwner?.ownerId).toBe("987");
});
it("requires a creator for a different account and never switches a revoked group to personal", () => {
  const selected = updateCloudSettings(
    {
      key: "retained",
      ownerType: "group",
      ownerId: "456",
      authMode: "roblox",
      robloxOwner: { ownerType: "group", ownerId: "456", userId: "123" },
    },
    {},
    "123",
  );
  const revoked = {
    ...state,
    account: { ...state.account!, owners: state.account!.owners.slice(0, 1) },
  };
  const upload = robloxUploadSettings(selected, revoked, 1000);
  expect(upload).toMatchObject({
    ownerType: "group",
    ownerId: "456",
    accountToken: undefined,
  });
  expect(() => uploadAuthorization(upload)).toThrow(
    "Choose an approved Roblox creator",
  );
  const newAccount = updateCloudSettings(selected, {}, "789");
  expect(newAccount).toMatchObject({
    ownerType: "user",
    ownerId: "",
    robloxOwner: { userId: "789", ownerId: "" },
  });
  expect(selected.robloxOwner?.ownerId).toBe("456");
});
it("reports expiry, connection checks and missing creator separately without API-key fallback", () => {
  const settings = updateCloudSettings(
    { key: "retained", ownerType: "user", ownerId: "", authMode: "roblox" },
    { ownerId: "123" },
    "123",
  );
  expect(
    uploadAuthorization(robloxUploadSettings(settings, state, 1000)),
  ).toEqual({ accountToken: state.accountToken, key: undefined });
  expect(() =>
    uploadAuthorization(robloxUploadSettings(settings, state, 5000)),
  ).toThrow("Reconnect Roblox");
  expect(() =>
    uploadAuthorization(
      robloxUploadSettings(settings, { ...state, loading: true }, 1000),
    ),
  ).toThrow("connection check");
  expect(() =>
    uploadAuthorization(
      robloxUploadSettings(settings, { ...state, simulation: true }, 1000),
    ),
  ).toThrow("demo cannot upload");
  expect(() =>
    uploadAuthorization(
      robloxUploadSettings({ ...settings, ownerId: "" }, state, 1000),
    ),
  ).toThrow("Choose an approved");
  const ephemeral = robloxUploadSettings(settings, state, 5000);
  expect(cloudStorageRecord(ephemeral)).not.toHaveProperty("accountToken");
  expect(cloudStorageRecord(ephemeral)).not.toHaveProperty(
    "authorizationError",
  );
});
it("drops secrets and malformed creator profiles at the device storage boundary", () => {
  const record = readCloudSettings({
    keyOwner: {
      ownerType: "user",
      ownerId: "123",
      accountToken: state.accountToken,
    },
    robloxOwner: {
      ownerType: "group",
      ownerId: "456",
      userId: "123",
      refresh_token: "secret",
    },
    authorizationError: "internal",
    accountToken: state.accountToken,
  });
  expect(record.keyOwner).toEqual({ ownerType: "user", ownerId: "123" });
  expect(record.robloxOwner).toEqual({
    ownerType: "group",
    ownerId: "456",
    userId: "123",
  });
  expect(JSON.stringify(record)).not.toContain(state.accountToken);
  expect(JSON.stringify(record)).not.toContain("secret");
  expect(
    readCloudSettings({
      keyOwner: { ownerType: "group", ownerId: "unapproved" },
      robloxOwner: { ownerType: "user", ownerId: "1", userId: "bad" },
    }),
  ).not.toHaveProperty("robloxOwner");
});
