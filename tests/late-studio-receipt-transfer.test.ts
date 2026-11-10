import { afterEach, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createRelay } from "../packages/relay/src/server";
import { demoResult } from "../packages/core/src/demo";
import { createStudioReceiptWatch } from "../plugins/figma/src/studio-receipt-watch";
import type { StudioReceipt } from "../plugins/figma/src/transfer";

let server: Server | undefined;
let watcher: ReturnType<typeof createStudioReceiptWatch> | undefined;
afterEach(async () => {
  watcher?.destroy();
  vi.unstubAllEnvs();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
});

it.each(["ready", "queued"] as const)(
  "finishes Send at %s, then observes a later real HTTP imported receipt without another export",
  async (initialStatus) => {
    server = createRelay();
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
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
    const late: StudioReceipt[] = [];
    const reads: number[] = [];
    watcher = createStudioReceiptWatch({
      readReceipt: (token, revision, signal) => {
        reads.push(revision);
        return client.relayRequest<StudioReceipt>(
          `/v1/receipt?revision=${revision}&wait=15000`,
          token,
          undefined,
          signal,
        );
      },
      changed: (receipt) => late.push(receipt),
      expired: () => expect.fail("The test session must stay active"),
      authorizationLost: () =>
        expect.fail("The test sender must stay authorized"),
      intervalMs: 2500,
    });
    let sendBusy = true;
    const value = demoResult();
    const send = client
      .sendToStudio(
        value,
        pair.senderToken,
        { key: "", ownerId: "", ownerType: "user" },
        new AbortController().signal,
        () => {},
        () => true,
        undefined,
        (receipt) =>
          watcher!.replace({ ...pair, revision: receipt.revision }, receipt),
      )
      .finally(() => {
        sendBusy = false;
      });
    const inbox = await client.relayRequest<{
      revision: number;
      package: unknown;
    }>("/v1/inbox?after=0&paired=true&wait=15000", session.receiverToken);
    expect(inbox.revision).toBe(1);
    expect(inbox.package).toEqual(value.package);
    await client.relayRequest("/v1/receipt", session.receiverToken, {
      revision: 1,
      status: initialStatus,
    });
    await send;
    expect(sendBusy).toBe(false);
    expect(late).toEqual([]);
    expect(reads).toEqual([]);
    // The user imports after Send has already completed; only a receipt changes.
    await client.relayRequest("/v1/receipt", session.receiverToken, {
      revision: 1,
      status: "imported",
      message: "Done · 3 created.",
    });
    await vi.waitFor(
      () =>
        expect(late).toEqual([
          { revision: 1, status: "imported", message: "Done · 3 created." },
        ]),
      { timeout: 4000 },
    );
    expect(sendBusy).toBe(false);
    expect(reads).toEqual([1]);
    const current = await client.relayRequest<{ revision: number }>(
      "/v1/inbox",
      session.receiverToken,
    );
    expect(current.revision).toBe(1);
    expect(JSON.stringify(late)).not.toContain(pair.senderToken);
    expect(JSON.stringify(late)).not.toContain(session.receiverToken);
  },
  10_000,
);
