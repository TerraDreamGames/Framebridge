import { expect, it } from "vitest";
import { ArtworkUploadError } from "../plugins/figma/src/upload-diagnostics";

const revision = "a".repeat(40);
it("reports the service origin, plugin/service revisions and exact upload stage", () => {
  const error = new ArtworkUploadError(
    "Invalid operation request.",
    {
      sourceRevision: revision,
      stage: "check",
      cached: true,
      providerStatus: 400,
    },
    {
      service: "https://relay.test/path?private=query",
      pluginRevision: revision,
      authMode: "roblox",
    },
  );
  expect(JSON.parse(error.report)).toMatchObject({
    service: "https://relay.test",
    pluginRevision: revision,
    serviceRevision: revision,
    stage: "check",
    cached: true,
    providerStatus: 400,
    authMode: "roblox",
  });
  expect(error.report).not.toContain("private=query");
});
it("identifies an older service without pretending its stage/build are known", () => {
  const error = new ArtworkUploadError("Saved failure.", undefined, {
    service: "https://relay.test",
    pluginRevision: revision,
    authMode: "api-key",
  });
  expect(JSON.parse(error.report)).toMatchObject({
    serviceRevision: "unreported",
    stage: "unreported",
    cached: "unreported",
    providerStatus: "unreported",
  });
});
it("excludes credentials, arbitrary response fields, links and token-shaped values", () => {
  const key = "private-short-key",
    capability = "b".repeat(64);
  const error = new ArtworkUploadError(
    `Invalid creator ${key}. Bearer private-value ${capability} https://relay.test/?key=secret`,
    {
      request: { key },
      sourceRevision: capability,
      stage: { toString: null },
      headers: { Authorization: capability },
      providerStatus: 400,
    },
    {
      service: "https://relay.test",
      pluginRevision: revision,
      authMode: "roblox",
      secrets: [key, capability],
    },
  );
  for (const secret of [
    key,
    capability,
    "private-value",
    "?key=secret",
    "Authorization",
    "request",
  ])
    expect(error.report).not.toContain(secret);
  expect(JSON.parse(error.report).stage).toBe("unreported");
});
it("bounds the copied message and tolerates malformed diagnostics", () => {
  const error = new ArtworkUploadError("Invalid creator. ".repeat(1000), null, {
    service: "invalid",
    pluginRevision: "development",
    authMode: "roblox",
  });
  expect(error.message.length).toBeLessThanOrEqual(750);
  expect(JSON.parse(error.report)).toMatchObject({
    service: "unreported",
    pluginRevision: "unreported",
  });
});
it("identifies the failing image and its prepared upload name", () => {
  const error = new ArtworkUploadError(
    "Asset name length is invalid.",
    { stage: "create", providerStatus: 400 },
    {
      service: "https://relay.test",
      pluginRevision: revision,
      authMode: "roblox",
      image: {
        name: "Inventory background",
        uploadName: "Inventory background",
        nodeId: "3:201",
      },
    },
  );
  expect(error.message).toContain("Inventory background");
  expect(error.message).toContain("layer 3:201");
  expect(JSON.parse(error.report)).toMatchObject({
    imageName: "Inventory background",
    uploadName: "Inventory background",
    imageNodeId: "3:201",
  });
});
it("redacts credentials from image metadata and omits non-node capabilities", () => {
  const secret = "private-short-key";
  const capability = "b".repeat(64);
  const error = new ArtworkUploadError(
    "Upload failed.",
    {},
    {
      service: "https://relay.test",
      pluginRevision: revision,
      authMode: "api-key",
      secrets: [secret, capability],
      image: {
        name: "Image " + secret,
        uploadName: secret,
        nodeId: capability,
      },
    },
  );
  expect(error.message).not.toContain(secret);
  expect(error.report).not.toContain(secret);
  expect(error.report).not.toContain(capability);
  expect(JSON.parse(error.report).imageNodeId).toBeUndefined();
});
