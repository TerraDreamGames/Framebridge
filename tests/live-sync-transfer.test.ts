import { expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { createRelay } from "../packages/relay/src/server";
import { createLiveSync, type SyncRun } from "../plugins/figma/src/live-sync";
import { createSyncAnalysis } from "../plugins/figma/src/sync-analysis";
import {
  DEFAULT_OPTIONS,
  type AnalysisResult,
  type TransferPackage,
} from "../packages/core/src/types";

it("sends actual controller conversions after edits through HTTP with receipts, pinned identities and an off switch", async () => {
  const server = createRelay();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  vi.stubEnv(
    "VITE_FRAMEBRIDGE_RELAY_URL",
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );
  vi.resetModules();
  const client = await import("../plugins/figma/src/transfer");
  const session = await client.relayRequest<{
    code: string;
    receiverToken: string;
  }>("/v1/sessions", "", {});
  const pair = await client.pairStudio(session.code);
  let sourceChanged!: (event: any) => void;
  const events: Record<string, Function> = {};
  const page: any = {
    id: "page",
    selection: [],
    on: (_event: string, callback: any) => {
      sourceChanged = callback;
    },
    off: () => {},
  };
  const node: any = {
    id: "1:1",
    name: "Shop",
    type: "FRAME",
    width: 400,
    height: 300,
    parent: page,
    children: [],
    visible: true,
    opacity: 1,
    relativeTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.3 } }],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 0,
    effects: [],
    constraints: { horizontal: "MIN", vertical: "MIN" },
    layoutMode: "NONE",
    blendMode: "PASS_THROUGH",
    clipsContent: false,
    exportAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  page.selection = [node];
  let manual: AnalysisResult | undefined;
  let receivedRevision = 0;
  const received: TransferPackage[] = [];
  let syncing = false;
  const messages: Promise<void>[] = [];
  const host: any = {
    mixed: Symbol("mixed"),
    currentPage: page,
    root: {
      id: "0:0",
      getPluginData: () => "source-id",
      setPluginData: () => {},
    },
    ui: {
      resize: () => {},
      postMessage: (message: any) => {
        if (analysis.receive(message)) return;
        if (message.type === "result") manual = message.result;
        if (message.type === "sync-source-changed") sync.edited();
        if (message.type === "sync-target-unavailable")
          sync.pause(message.message);
      },
    },
    showUI: () => {},
    on: (name: string, callback: Function) => {
      events[name] = callback;
    },
    clientStorage: {
      getAsync: async () => undefined,
      setAsync: async () => undefined,
    },
    base64Encode: () => "AQID",
    getNodeByIdAsync: async (id: string) => (id === node.id ? node : null),
  };
  const dispatch = (type: string, data: object) => {
    messages.push(host.ui.onmessage({ type, ...data }));
  };
  const analysis = createSyncAnalysis(
    dispatch,
    () => {},
    () => {},
  );
  async function receipt() {
    const inbox = await client.relayRequest<{
      revision: number;
      package: TransferPackage;
    }>(
      `/v1/inbox?after=${receivedRevision}&paired=true&wait=15000`,
      session.receiverToken,
    );
    receivedRevision = inbox.revision;
    received.push(inbox.package);
    await client.relayRequest("/v1/receipt", session.receiverToken, {
      revision: inbox.revision,
      status: "imported",
    });
  }
  async function deliver(value: AnalysisResult, job?: SyncRun) {
    const receiver = receipt();
    await Promise.all([
      receiver,
      client.sendToStudio(
        value,
        pair.senderToken,
        { key: "", ownerId: "", ownerType: "user" },
        job?.signal ?? new AbortController().signal,
        () => {},
        () => !job?.signal.aborted,
        undefined,
        () => {},
        job?.publishing,
      ),
    ]);
    return "Imported";
  }
  const sync = createLiveSync(
    async (job) => {
      syncing = true;
      try {
        const value = await analysis.request(
          DEFAULT_OPTIONS,
          job.target.ids,
          job.signal,
        );
        job.sending();
        return await deliver(value, job);
      } finally {
        syncing = false;
      }
    },
    () => {},
    (target) => dispatch("watch-sync", { rootIds: target?.ids ?? [] }),
    1,
  );
  try {
    vi.stubGlobal("figma", host);
    vi.stubGlobal("__html__", "<html/>");
    await import("../plugins/figma/src/controller");
    await host.ui.onmessage({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() => expect(manual).toBeDefined());
    await deliver(manual!);
    sync.delivered({ ids: [node.id], names: [node.name] }, "Imported");
    sync.setEnabled(true);
    await Promise.all(messages);
    for (const width of [420, 440, 460]) {
      node.width = width;
      sourceChanged({
        nodeChanges: [{ node, type: "PROPERTY_CHANGE", properties: ["width"] }],
      });
    }
    await vi.waitFor(() => expect(received).toHaveLength(2));
    await vi.waitFor(() => expect(syncing).toBe(false));
    expect(sync.state().phase).toBe("idle");
    // Resizing the panel changes its screen proportion, not the screen reference.
    expect(received[1].roots[0].referenceSize).toEqual([1920, 1080]);
    expect(received[1].roots[0].children[0].properties.Size).toEqual({
      type: "UDim2",
      value: [460 / 1920, 0, 300 / 1080, 0],
    });
    page.selection = [];
    events.selectionchange();
    node.width = 480;
    sourceChanged({
      nodeChanges: [{ node, type: "PROPERTY_CHANGE", properties: ["width"] }],
    });
    await vi.waitFor(() => expect(received).toHaveLength(3), { timeout: 5000 });
    await vi.waitFor(() => expect(syncing).toBe(false));
    expect(new Set(received.map((pkg) => pkg.sourceId)).size).toBe(1);
    expect(
      new Set(received.map((pkg) => pkg.roots[0].children[0].id)).size,
    ).toBe(1);
    expect(received[2].roots[0].referenceSize).toEqual([1920, 1080]);
    expect(received[2].roots[0].children[0].properties.Size).toEqual({
      type: "UDim2",
      value: [480 / 1920, 0, 300 / 1080, 0],
    });
    sync.setEnabled(false);
    node.width = 500;
    sourceChanged({
      nodeChanges: [{ node, type: "PROPERTY_CHANGE", properties: ["width"] }],
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toHaveLength(3);
  } finally {
    sync.dispose();
    analysis.dispose();
    await Promise.all(messages);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.resetModules();
  }
}, 10_000);
