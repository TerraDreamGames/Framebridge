import { createPropertyDraftRegistry } from "../plugins/figma/src/property-drafts";
import { scrollbarResult } from "./scrollbar-fixtures";
import { afterEach, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createRelay } from "../packages/relay/src/server";
import { readFileSync } from "node:fs";
import { PublicError, type uploadImage } from "../packages/relay/src/roblox";
import { buildExport } from "../packages/core/src/export";
import { flatten } from "../packages/core/src/types";
import { demoResult } from "../packages/core/src/demo";
import { imageToolsResult, iconPng, PNG } from "./image-tools-fixtures";
let server: Server;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (server)
    await new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    });
});
it("marks publication only after validating the snapshot, then finishes that accepted revision", async () => {
  const { client, pair, session } = await setup();
  let current = true;
  const publishing = vi.fn(() => {
    current = false;
  });
  const value = demoResult();
  const sent = await client.sendToStudio(
    value,
    pair.senderToken,
    cloudSettings,
    new AbortController().signal,
    () => {},
    () => current,
    undefined,
    undefined,
    publishing,
  );
  expect(publishing).toHaveBeenCalledOnce();
  expect(sent.roots).toEqual(value.package.roots);
  const inbox = await client.relayRequest<{ package: unknown }>(
    "/v1/inbox?after=0",
    session.receiverToken,
    undefined,
    undefined,
    undefined,
    "GET",
  );
  expect(inbox.package).toEqual(sent);
});
async function setup(uploadOverride?: typeof uploadImage) {
  const upload = vi.fn(async () => ({
    assetId: "987",
    moderation: "MODERATION_STATE_REVIEWING",
  }));
  server = createRelay({ upload: uploadOverride ?? upload });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv("VITE_FRAMEBRIDGE_RELAY_URL", base);
  vi.resetModules();
  const client = await import("../plugins/figma/src/transfer");
  const session = await client.relayRequest<{
    code: string;
    receiverToken: string;
  }>("/v1/sessions", "", {});
  const pair = await client.pairStudio(session.code);
  return { client, session, pair, upload };
}
function artwork() {
  const result = demoResult();
  result.package.assets.push({
    id: "art",
    nodeId: "art",
    name: "Icon",
    filename: "Icon.png",
    width: 1,
    height: 1,
    scale: 1,
    reason: "Vector",
  });
  result.assets.art = Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  return result;
}
it.each(["sendToStudio", "uploadArtwork"] as const)(
  "preserves the service failure diagnostics through %s without publishing a design",
  async (method) => {
    const revision = "a".repeat(40);
    vi.stubEnv("VITE_FRAMEBRIDGE_CLIENT_REVISION", revision);
    const { client, pair, session, upload } = await setup();
    const original = artwork();
    const imageName =
      "Inventory background artwork with a long descriptive layer label ".repeat(
        2,
      );
    original.package.assets[0].name = imageName;
    let uploadName = "";
    const actualFetch = globalThis.fetch;
    const mockedFetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        if (String(input).endsWith("/v1/assets")) {
          uploadName = JSON.parse(init!.body as string).name;
          return Response.json(
            {
              id: "failed-image",
              state: "failed",
              error:
                "Roblox rejected this image upload (HTTP 400). Roblox reason: Invalid operation.",
              diagnostics: {
                sourceRevision: revision,
                stage: "check",
                cached: true,
                providerStatus: 400,
              },
            },
            { status: 202 },
          );
        }
        return actualFetch(input, init);
      });
    try {
      const failure = await client[method](
        original,
        pair.senderToken,
        cloudSettings,
        new AbortController().signal,
        () => {},
        () => true,
      ).catch((error) => error);
      expect(failure.name).toBe("ArtworkUploadError");
      expect(JSON.parse(failure.report)).toMatchObject({
        pluginRevision: revision,
        serviceRevision: revision,
        stage: "check",
        cached: true,
        providerStatus: 400,
        imageName: imageName.trim(),
        uploadName,
      });
      expect(Buffer.byteLength(uploadName, "utf8")).toBeLessThanOrEqual(50);
      expect(original.package.assets[0].name).toBe(imageName);
      expect(failure.report).not.toContain(pair.senderToken);
      expect(upload).not.toHaveBeenCalled();
      const state = await client.relayRequest<{
        revision: number;
        package?: unknown;
      }>("/v1/inbox", session.receiverToken);
      expect(state.revision).toBe(0);
      expect(state.package).toBeUndefined();
    } finally {
      mockedFetch.mockRestore();
    }
  },
);
it("shares uploaded artwork without a live connection and recovers management access after a lost response", async () => {
  const { client, pair, session, upload } = await setup();
  const handoff = await import("../plugins/figma/src/handoff-transfer");
  const access = await client.createUploadSession();
  const signal = new AbortController().signal;
  const pkg = await client.uploadArtwork(
    artwork(),
    access.uploadToken,
    cloudSettings,
    signal,
    () => {},
    () => true,
  );
  await client.relayRequest(
    "/v1/session",
    session.receiverToken,
    undefined,
    undefined,
    undefined,
    "DELETE",
  );
  const ownerToken = handoff.handoffCapability();
  expect(ownerToken).toMatch(/^[a-f0-9]{64}$/);
  const created = await handoff.createHandoff(
    access.uploadToken,
    pkg,
    ownerToken,
    60,
    signal,
  );
  expect(upload).toHaveBeenCalledOnce();
  // Reopening needs only the saved management capability, not the old upload
  // session or a copy of the design. The owner endpoint restores the code.
  await client.relayRequest(
    "/v1/session",
    access.uploadToken,
    undefined,
    undefined,
    undefined,
    "DELETE",
  );
  const recovered = await handoff.inspectHandoff(ownerToken);
  expect(recovered).toMatchObject({ ...created, receipts: [] });
  const receiptToken = handoff.handoffCapability();
  const opened = await client.relayRequest<{ package: unknown }>(
    "/v1/handoffs/open",
    "",
    { code: recovered.code, receiptToken },
  );
  expect(opened.package).toEqual(pkg);
  expect(JSON.stringify(opened.package)).not.toMatch(
    /ownerToken|receiptToken|local-test-roblox-key/,
  );
  expect(JSON.stringify(opened.package)).not.toContain(pair.senderToken);
  await client.relayRequest("/v1/handoff-receipt", receiptToken, {
    status: "imported",
  });
  expect((await handoff.inspectHandoff(ownerToken)).receipts).toMatchObject([
    { status: "imported" },
  ]);
  await handoff.revokeHandoff(ownerToken);
  await expect(
    client.relayRequest("/v1/handoffs/open", "", {
      code: created.code,
      receiptToken: handoff.handoffCapability(),
    }),
  ).rejects.toMatchObject({ status: 404 });
});
it("starts only two uploads together and consumes completed jobs without a one-second delay", async () => {
  const releases: (() => void)[] = [];
  let active = 0,
    peak = 0;
  const upstream = vi.fn<typeof uploadImage>(async () => {
    peak = Math.max(peak, ++active);
    await new Promise<void>((r) => releases.push(r));
    active--;
    return { assetId: "987", moderation: "MODERATION_STATE_APPROVED" };
  });
  const { client } = await setup(upstream);
  const session = await client.createUploadSession();
  const original = artwork();
  for (const id of ["second"]) {
    original.package.assets.push({
      ...original.package.assets[0],
      id,
      nodeId: id,
      name: id,
    });
    original.assets[id] = Array.from(
      readFileSync(new URL("./fixtures/upload-test.png", import.meta.url)),
    );
  }
  const commits: string[][] = [];
  const progress: number[] = [];
  const run = client.uploadArtwork(
    original,
    session.uploadToken,
    cloudSettings,
    new AbortController().signal,
    (_, n) => progress.push(n),
    () => true,
    (pkg) =>
      commits.push(pkg.assets.filter((a) => a.robloxId).map((a) => a.id)),
  );
  await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
  expect(active).toBe(2);
  releases.shift()!();
  releases.shift()!();
  expect((await run).assets.every((a) => a.robloxId)).toBe(true);
  expect(peak).toBe(2);
  expect(commits).toHaveLength(3); // Each completed binding, then the final package.
  expect(commits.map((c) => c.length)).toEqual([1, 2, 2]);
  expect(progress.every((value, i) => !i || value >= progress[i - 1])).toBe(
    true,
  );
  const started = performance.now();
  await client.uploadArtwork(
    original,
    session.uploadToken,
    cloudSettings,
    new AbortController().signal,
    () => {},
    () => true,
  );
  expect(performance.now() - started).toBeLessThan(700);
  expect(upstream).toHaveBeenCalledTimes(2);
});
it("sends a second design on the same connection after Studio confirms an import", async () => {
  const { client, pair, session } = await setup();
  for (let revision = 1; revision <= 2; revision++) {
    const design = demoResult();
    design.package.roots[0].name = "Design " + revision;
    await client.sendToStudio(
      design,
      pair.senderToken,
      { key: "", ownerType: "user", ownerId: "" },
      new AbortController().signal,
      () => {},
      () => true,
    );
    const inbox = await client.relayRequest<any>(
      `/v1/inbox?after=${revision - 1}`,
      session.receiverToken,
    );
    expect(inbox.paired).toBe(true);
    expect(inbox.revision).toBe(revision);
    await client.relayRequest("/v1/receipt", session.receiverToken, {
      revision,
      status: "imported",
    });
    expect(
      (
        await client.waitForStudio(
          pair.senderToken,
          revision,
          new AbortController().signal,
        )
      ).status,
    ).toBe("imported");
    expect((await client.studioSession(pair.senderToken)).role).toBe("sender");
  }
});
it("sends native frames directly without credentials", async () => {
  const { client, pair, session, upload } = await setup();
  const original = demoResult();
  await client.sendToStudio(
    original,
    pair.senderToken,
    { key: "", ownerType: "user", ownerId: "" },
    new AbortController().signal,
    () => {},
    () => true,
  );
  const inbox = await client.relayRequest<any>(
    "/v1/inbox",
    session.receiverToken,
  );
  expect(inbox.package.roots).toEqual(original.package.roots);
  expect(upload).not.toHaveBeenCalled();
  await client.disconnectStudio(pair.senderToken);
  await expect(
    client.relayRequest("/v1/inbox", session.receiverToken),
  ).rejects.toThrow("expired");
});
it("uploads and binds artwork, preserves native frames, reports moderation and reuses assets", async () => {
  const { client, pair, session, upload } = await setup();
  const original = artwork();
  const settings = {
    key: "test-only-secret",
    ownerType: "group" as const,
    ownerId: "123",
  };
  for (let i = 0; i < 2; i++)
    await client.sendToStudio(
      original,
      pair.senderToken,
      settings,
      new AbortController().signal,
      () => {},
      () => true,
    );
  const inbox = await client.relayRequest<any>(
    "/v1/inbox",
    session.receiverToken,
  );
  expect(upload).toHaveBeenCalledTimes(1);
  expect(inbox.package.assets[0].robloxId).toBe("987");
  expect(
    inbox.package.issues.some((i: any) => i.code === "asset-moderation"),
  ).toBe(true);
  expect(inbox.package.roots).toEqual(original.package.roots);
  expect(original.package.assets[0].robloxId).toBeUndefined(); // never persist a binding to a stale image
  expect(JSON.stringify(inbox)).not.toContain(settings.key);
  expect(JSON.stringify(inbox)).not.toContain("iVBOR");
});
it("blocks artwork without credentials and never sends stale or cancelled designs", async () => {
  const { client, pair, session, upload } = await setup();
  const settings = { key: "", ownerType: "user" as const, ownerId: "" };
  await expect(
    client.sendToStudio(
      artwork(),
      pair.senderToken,
      settings,
      new AbortController().signal,
      () => {},
      () => true,
    ),
  ).rejects.toThrow("API key");
  await expect(
    client.sendToStudio(
      demoResult(),
      pair.senderToken,
      settings,
      new AbortController().signal,
      () => {},
      () => false,
    ),
  ).rejects.toThrow("changed");
  const abort = new AbortController();
  abort.abort();
  await expect(
    client.sendToStudio(
      demoResult(),
      pair.senderToken,
      settings,
      abort.signal,
      () => {},
      () => true,
    ),
  ).rejects.toThrow();
  expect(
    (await client.relayRequest<any>("/v1/inbox", session.receiverToken))
      .revision,
  ).toBe(0);
  expect(upload).not.toHaveBeenCalled();
});

const cloudSettings = {
  key: "test-only-secret",
  ownerType: "user" as const,
  ownerId: "123",
};
it.each([{ whiteMask: true }, { edgeCleanup: true }])(
  "uploads prepared artwork %j over HTTP and retains the image tint in the delivered package",
  async (processing) => {
    const original = imageToolsResult(processing);
    const prepared = Buffer.from(
      original.assets[original.package.assets[0].id],
    );
    const upstream = vi.fn<typeof uploadImage>(async (input, bytes, key) => {
      expect(input.owner).toEqual({ kind: "user", id: "123" });
      expect(key).toBe(cloudSettings.key);
      expect(bytes).toEqual(prepared);
      const source = PNG.sync.read(Buffer.from(iconPng())),
        received = PNG.sync.read(bytes);
      for (let p = 0; p < received.data.length; p += 4) {
        expect(received.data[p + 3]).toBe(source.data[p + 3]);
        if (processing.whiteMask)
          expect(Array.from(received.data.slice(p, p + 3))).toEqual([
            255, 255, 255,
          ]);
        else if (source.data[p + 3])
          expect(received.data.slice(p, p + 4)).toEqual(
            source.data.slice(p, p + 4),
          );
      }
      return { assetId: "987", moderation: "MODERATION_STATE_APPROVED" };
    });
    const { client, pair, session } = await setup(upstream);
    const sent = await client.sendToStudio(
      original,
      pair.senderToken,
      cloudSettings,
      new AbortController().signal,
      () => {},
      () => true,
    );
    const inbox = await client.relayRequest<any>(
      "/v1/inbox",
      session.receiverToken,
    );
    expect(inbox.package).toEqual(sent);
    const icon = flatten(sent.roots).find((n) => n.id === "icon")!;
    expect(icon.properties.Image).toBe("rbxassetid://987");
    expect(icon.properties.ImageColor3).toEqual({
      type: "Color3",
      value: [0.2, 0.7, 1],
    });
    expect(sent.assets[0].processing).toEqual(
      original.package.assets[0].processing,
    );
    expect(JSON.stringify(inbox)).not.toContain(cloudSettings.key);
    expect(JSON.stringify(inbox)).not.toContain(
      Buffer.from(prepared).toString("base64"),
    );
    await client.relayRequest("/v1/receipt", session.receiverToken, {
      revision: inbox.revision,
      status: "imported",
    });
    expect(
      (
        await client.waitForStudio(
          pair.senderToken,
          inbox.revision,
          new AbortController().signal,
        )
      ).status,
    ).toBe("imported");
    expect(upstream).toHaveBeenCalledOnce();
  },
);
it("uploads a batch without Studio pairing and exports linked JSON with native text intact", async () => {
  const { client, session, upload } = await setup();
  const standalone = await client.createUploadSession();
  const original = artwork();
  original.package.assets.push({
    ...original.package.assets[0],
    id: "duplicate",
    nodeId: "duplicate",
    name: "Duplicate icon",
  });
  original.assets.duplicate = original.assets.art;
  original.package.roots[0].children.push({
    id: "art",
    name: "Icon",
    className: "ImageLabel",
    assetRef: "art",
    properties: { Image: "" },
    children: [],
  });
  const commits = vi.fn();
  const pkg = await client.uploadArtwork(
    original,
    standalone.uploadToken,
    cloudSettings,
    new AbortController().signal,
    () => {},
    () => true,
    commits,
  );
  expect(pkg.assets.map((a) => a.robloxId)).toEqual(["987", "987"]);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(flatten(pkg.roots).find((n) => n.id === "art")?.properties.Image).toBe(
    "rbxassetid://987",
  );
  expect(
    flatten(pkg.roots).filter((n) => n.className.includes("Text")),
  ).toEqual(
    flatten(original.package.roots).filter((n) => n.className.includes("Text")),
  );
  const exported = buildExport({ ...original, package: pkg });
  expect(exported.mime).toBe("application/json");
  expect(
    JSON.parse(new TextDecoder().decode(exported.data)).assets[0].robloxId,
  ).toBe("987");
  expect(new TextDecoder().decode(exported.data)).not.toContain(
    cloudSettings.key,
  );
  expect(commits).toHaveBeenCalled();
  expect(original.package.assets[0].robloxId).toBeUndefined();
  expect(
    (await client.relayRequest<any>("/v1/inbox", session.receiverToken))
      .revision,
  ).toBe(0);
  await expect(
    client.relayRequest("/v1/package", standalone.uploadToken, pkg),
  ).rejects.toThrow("Endpoint");
});
it("retains completed bindings when a later upload fails", async () => {
  const upload = vi
    .fn<typeof uploadImage>()
    .mockResolvedValueOnce({
      assetId: "987",
      moderation: "MODERATION_STATE_APPROVED",
    })
    .mockRejectedValueOnce(new PublicError("Roblox denied the second image."));
  const { client } = await setup(upload);
  const standalone = await client.createUploadSession();
  const original = artwork();
  original.package.assets.push({
    ...original.package.assets[0],
    id: "second",
    nodeId: "second",
    name: "Second",
  });
  original.assets.second = Array.from(
    readFileSync(new URL("./fixtures/upload-test.png", import.meta.url)),
  );
  let retained = original;
  await expect(
    client.uploadArtwork(
      original,
      standalone.uploadToken,
      cloudSettings,
      new AbortController().signal,
      () => {},
      () => true,
      (pkg) => {
        retained = { ...original, package: pkg };
      },
    ),
  ).rejects.toThrow("second image");
  expect(retained.package.assets[0].robloxId).toBe("987");
  expect(retained.package.assets[1].robloxId).toBeUndefined();
  await expect(
    client.uploadArtwork(
      retained,
      standalone.uploadToken,
      cloudSettings,
      new AbortController().signal,
      () => {},
      () => true,
    ),
  ).rejects.toThrow("second image");
  expect(upload).toHaveBeenCalledTimes(2); // no duplicate create, even after an uncertain failure
});
it("retains completed bindings on cancel and resumes without creating duplicates", async () => {
  const { client, upload } = await setup();
  const standalone = await client.createUploadSession();
  const original = artwork();
  original.package.assets.push({
    ...original.package.assets[0],
    id: "second",
    nodeId: "second",
  });
  original.assets.second = Array.from(
    readFileSync(new URL("./fixtures/upload-test.png", import.meta.url)),
  );
  const abort = new AbortController();
  let retained = original;
  await expect(
    client.uploadArtwork(
      original,
      standalone.uploadToken,
      cloudSettings,
      abort.signal,
      () => {},
      () => true,
      (pkg) => {
        retained = { ...original, package: pkg };
        abort.abort();
      },
    ),
  ).rejects.toThrow();
  expect(
    retained.package.assets.filter((asset) => asset.robloxId),
  ).toHaveLength(1);
  // Either parallel upload can finish first. Cancellation must preserve that
  // confirmed image; the final upstream count proves retry creates no duplicate.
  expect(upload.mock.calls.length).toBeGreaterThanOrEqual(1);
  expect(upload.mock.calls.length).toBeLessThanOrEqual(2);
  const pkg = await client.uploadArtwork(
    retained,
    standalone.uploadToken,
    cloudSettings,
    new AbortController().signal,
    () => {},
    () => true,
  );
  expect(pkg.assets.every((a) => a.robloxId)).toBe(true);
  expect(upload).toHaveBeenCalledTimes(2);
});
it("never commits upload bindings after the selection changes", async () => {
  let current = true;
  const { client } = await setup(async () => {
    current = false;
    return { assetId: "987", moderation: "MODERATION_STATE_APPROVED" };
  });
  const standalone = await client.createUploadSession();
  const commit = vi.fn();
  await expect(
    client.uploadArtwork(
      artwork(),
      standalone.uploadToken,
      cloudSettings,
      new AbortController().signal,
      () => {},
      () => current,
      commit,
    ),
  ).rejects.toThrow("changed");
  expect(commit).not.toHaveBeenCalled();
});

it.each(["send", "upload"] as const)(
  "rejects a %s continuation when a property draft becomes invalid during a pending upload",
  async (action) => {
    let started!: () => void, complete!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const { client, pair, session } = await setup(async () => {
      started();
      await pending;
      return { assetId: "987", moderation: "MODERATION_STATE_APPROVED" };
    });
    const drafts = createPropertyDraftRegistry(() => {});
    const field = {};
    const value = artwork(),
      before = JSON.stringify(value);
    const commit = vi.fn(),
      publishing = vi.fn();
    const signal = new AbortController().signal;
    const current = () => !drafts.isBlocked();
    const operation =
      action === "send"
        ? client.sendToStudio(
            value,
            pair.senderToken,
            cloudSettings,
            signal,
            () => {},
            current,
            commit,
            undefined,
            publishing,
          )
        : client.uploadArtwork(
            value,
            pair.senderToken,
            cloudSettings,
            signal,
            () => {},
            current,
            commit,
          );
    const rejected = expect(operation).rejects.toThrow("changed");
    await entered;
    drafts.report(field, {
      label: "Icon · Rotation",
      message: "Enter a number.",
    });
    complete();
    await rejected;
    expect(drafts.isBlocked()).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    expect(publishing).not.toHaveBeenCalled();
    expect(JSON.stringify(value)).toBe(before);
    const inbox = await client.relayRequest<{ package?: unknown }>(
      "/v1/inbox",
      session.receiverToken,
    );
    expect(inbox.package).toBeUndefined();
    drafts.report(field, undefined);
    const recovered = await client.uploadArtwork(
      value,
      pair.senderToken,
      cloudSettings,
      signal,
      () => {},
      current,
      commit,
    );
    expect(recovered.assets[0].robloxId).toBe("987");
    expect(commit).toHaveBeenCalled();
    expect(JSON.stringify(value)).toBe(before);
  },
);

it("waits for Studio receipt after uploading and sending, without exposing credentials", async () => {
  const { client, pair, session, upload } = await setup();
  const statuses: number[] = [];
  const commit = vi.fn(),
    receipt = vi.fn();
  const abort = new AbortController();
  const sent = client.sendToStudio(
    artwork(),
    pair.senderToken,
    { key: "test-only-secret", ownerType: "user", ownerId: "123" },
    abort.signal,
    (_, percent) => statuses.push(percent),
    () => true,
    commit,
    receipt,
  );
  // Receiver observes the real HTTP transfer after the fake Roblox upload completes.
  let inbox: any;
  for (let i = 0; i < 100; i++) {
    inbox = await client.relayRequest<any>("/v1/inbox", session.receiverToken);
    if (inbox.package) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  expect(inbox.package.assets[0].robloxId).toBe("987");
  expect(receipt).not.toHaveBeenCalled();
  expect(JSON.stringify(inbox)).not.toContain("test-only-secret");
  await client.relayRequest("/v1/receipt", session.receiverToken, {
    revision: inbox.revision,
    status: "imported",
  });
  await sent;
  expect(receipt).toHaveBeenCalledWith({ revision: 1, status: "imported" });
  expect(commit).toHaveBeenCalled();
  expect(upload).toHaveBeenCalledTimes(1);
  expect(statuses).toEqual([...statuses].sort((a, b) => a - b));
});

it.each(["ready", "queued", "imported"])(
  "recognizes Studio %s confirmation",
  async (status) => {
    const { client, pair, session } = await setup();
    await client.relayRequest(
      "/v1/package",
      pair.senderToken,
      demoResult().package,
    );
    await client.relayRequest("/v1/receipt", session.receiverToken, {
      revision: 1,
      status,
    });
    expect(
      (
        await client.waitForStudio(
          pair.senderToken,
          1,
          new AbortController().signal,
        )
      ).status,
    ).toBe(status);
  },
);

it("reports import failures and allows cancelling receipt polling", async () => {
  const { client, pair, session } = await setup();
  const abort = new AbortController();
  const receipt = vi.fn();
  const sending = client.sendToStudio(
    demoResult(),
    pair.senderToken,
    { key: "", ownerType: "user", ownerId: "" },
    abort.signal,
    () => {},
    () => true,
    undefined,
    receipt,
  );
  const rejected = expect(sending).rejects.toThrow(
    "Another operation is recording",
  );
  let inbox: any;
  for (let i = 0; i < 100; i++) {
    inbox = await client.relayRequest<any>("/v1/inbox", session.receiverToken);
    if (inbox.package) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  await client.relayRequest("/v1/receipt", session.receiverToken, {
    revision: inbox.revision,
    status: "failed",
    message: "Another operation is recording",
  });
  await rejected;
  expect(receipt).not.toHaveBeenCalled();
  await client.relayRequest(
    "/v1/package",
    pair.senderToken,
    demoResult().package,
  );
  const waiting = client.waitForStudio(pair.senderToken, 2, abort.signal);
  const cancelled = expect(waiting).rejects.toMatchObject({
    name: "AbortError",
  });
  abort.abort();
  await cancelled;
});

it("identifies a revoked pairing so the UI can offer reconnection", async () => {
  const { client, pair, session } = await setup();
  await client.disconnectStudio(session.receiverToken);
  await expect(
    client.sendToStudio(
      demoResult(),
      pair.senderToken,
      { key: "", ownerType: "user", ownerId: "" },
      new AbortController().signal,
      () => {},
      () => true,
      undefined,
      () => {},
    ),
  ).rejects.toMatchObject({ status: 401 });
});

it("blocks conversion errors before creating image assets", async () => {
  const { client, pair, upload } = await setup();
  const result = artwork();
  result.package.issues.push({
    severity: "error",
    code: "invalid-design",
    nodeId: "art",
    nodeName: "Icon",
    message: "Invalid geometry",
  });
  await expect(
    client.sendToStudio(
      result,
      pair.senderToken,
      { key: "test-only-secret", ownerType: "user", ownerId: "123" },
      new AbortController().signal,
      () => {},
      () => true,
      undefined,
      () => {},
    ),
  ).rejects.toThrow("conversion errors");
  expect(upload).not.toHaveBeenCalled();
});

it("reuses persisted uploads on a fresh helper session, but creates separate assets for a different owner or PNG", async () => {
  const { createAssetCatalog } =
    await import("../plugins/figma/src/asset-catalog");
  const { client, upload } = await setup();
  let saved: unknown = [];
  const store = {
    load: async () => structuredClone(saved),
    save: async (value: unknown) => {
      saved = structuredClone(value);
    },
  };
  const settings = {
    key: "test-only-key",
    ownerType: "user" as const,
    ownerId: "123",
  };
  const first = await client.createUploadSession();
  const value = imageToolsResult();
  const send = (
    token: string,
    data = value,
    creator = settings,
    catalog = createAssetCatalog(store),
  ) =>
    client.uploadArtwork(
      data,
      token,
      creator,
      new AbortController().signal,
      () => {},
      () => true,
      undefined,
      catalog,
    );
  await send(first.uploadToken);
  expect(upload).toHaveBeenCalledTimes(1);
  const reopened = await client.createUploadSession();
  const reused = await send(reopened.uploadToken, value, {
    ...settings,
    key: "",
  });
  expect(upload).toHaveBeenCalledTimes(1);
  expect(reused.assets[0].robloxId).toBe("rbxassetid://987");
  expect(reused.issues.some((i) => i.code === "asset-moderation")).toBe(true);
  await send(reopened.uploadToken, value, { ...settings, ownerId: "456" });
  expect(upload).toHaveBeenCalledTimes(2);
  await send(reopened.uploadToken, imageToolsResult({ whiteMask: true }));
  expect(upload).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(saved)).not.toContain(settings.key);
});

it("uploads all scrollbar pieces over real HTTP and delivers native bindings with partial-link notices intact", async () => {
  const { client, pair, session, upload } = await setup();
  const original = scrollbarResult(),
    commits: any[] = [];
  const sent = await client.sendToStudio(
    original,
    pair.senderToken,
    cloudSettings,
    new AbortController().signal,
    () => {},
    () => true,
    (pkg) => commits.push(pkg),
  );
  expect(upload).toHaveBeenCalledTimes(6);
  expect(
    commits.some(
      (pkg) =>
        pkg.assets.some((a: any) => a.robloxId) &&
        pkg.issues.some((i: any) => i.code === "asset-required"),
    ),
  ).toBe(true);
  expect(sent.issues.filter((i) => i.code === "asset-moderation")).toHaveLength(
    6,
  );
  for (const viewport of flatten(sent.roots).filter((n) => n.assetBindings))
    for (const key of ["TopImage", "MidImage", "BottomImage"])
      expect(viewport.properties[key]).toBe("rbxassetid://987");
  const inbox = await client.relayRequest<{ package: typeof sent }>(
    "/v1/inbox?after=0",
    session.receiverToken,
    undefined,
    undefined,
    undefined,
    "GET",
  );
  expect(inbox.package).toEqual(sent);
  expect(JSON.stringify(sent)).not.toContain(cloudSettings.key);
  expect(original.package.assets.every((a) => !a.robloxId)).toBe(true);
});
