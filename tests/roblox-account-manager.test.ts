import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createRobloxAccountManager,
  type RobloxAccountApi,
} from "../plugins/figma/src/roblox-account-manager";
import type { SavedRobloxAccount } from "../plugins/figma/src/roblox-account-storage";
import type { RobloxLoginStatus } from "../plugins/figma/src/roblox-login-api";
import { oauthFixture, oauthHash } from "./roblox-oauth-fixture";
const managers: ReturnType<typeof createRobloxAccountManager>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  managers.forEach((m) => m.dispose());
  managers.length = 0;
  vi.useRealTimers();
});
function fixture() {
  const backend = oauthFixture();
  let record: SavedRobloxAccount | null = null;
  const events: string[] = [];
  const storage = {
    load: vi.fn(async () => record),
    save: vi.fn(async (value: SavedRobloxAccount | null) => {
      events.push("saved");
      record = value ? structuredClone(value) : null;
    }),
  };
  const api: RobloxAccountApi = {
    config: vi.fn(async () => ({ available: true })),
    begin: vi.fn(async () =>
      backend.service.begin("invite", record?.accountToken),
    ),
    poll: vi.fn(
      async (token) => backend.service.poll(token) as RobloxLoginStatus,
    ),
    acknowledge: vi.fn(async (token) => {
      events.push("acknowledged");
      await backend.service.acknowledge(token);
    }),
    cancel: vi.fn(async (token) => backend.service.cancel(token)),
    inspect: vi.fn(async (token) => backend.service.status(token)),
    disconnect: vi.fn(async (token) => backend.service.disconnect(token)),
  };
  const open = vi.fn(async () => {
    events.push("opened");
  });
  const create = (origin = "https://relay.test") => {
    const m = createRobloxAccountManager(
      origin,
      storage,
      api,
      open,
      () => {},
      backend.deps.now,
    );
    managers.push(m);
    return m;
  };
  const authorize = async () => {
    expect(record?.pending).toBeDefined();
    await backend.service.callback(backend.callback(record!.pending!));
  };
  const connect = async () => {
    const m = create();
    await m.restore();
    await m.start("invitation");
    await authorize();
    await vi.advanceTimersByTimeAsync(2000);
    expect(m.snapshot().account?.username).toBe("TestCreator");
    return m;
  };
  return {
    backend,
    storage,
    api,
    open,
    events,
    create,
    authorize,
    connect,
    record: () => record,
    setRecord: (v: SavedRobloxAccount | null) => {
      record = v;
    },
  };
}
it("keeps simulated service status explicit across restore and reconnect", async () => {
  const f = fixture(),
    m = f.create();
  vi.mocked(f.api.config).mockResolvedValue({
    available: true,
    simulation: true,
  });
  await m.restore();
  expect(m.snapshot().simulation).toBe(true);
  await m.start("invitation");
  expect(m.snapshot().simulation).toBe(true);
  await m.cancel();
  vi.mocked(f.api.config).mockResolvedValue({ available: true });
  await m.restore();
  expect(m.snapshot().simulation).toBe(false);
});
it("reopens the saved attempt after browser opening fails without creating a second login", async () => {
  const f = fixture(),
    m = f.create();
  await m.restore();
  f.open.mockRejectedValueOnce(Error("popup blocked"));
  await m.start("invitation");
  const pending = f.record()!.pending!;
  expect(m.snapshot().retry).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(m.snapshot().retry).toBe(true);
  expect(f.api.poll).not.toHaveBeenCalled();
  await m.retry();
  expect(f.api.begin).toHaveBeenCalledTimes(1);
  expect(f.open).toHaveBeenCalledTimes(2);
  expect(f.open).toHaveBeenLastCalledWith(pending.authorizationUrl);
  expect(f.record()!.pending!.loginToken).toBe(pending.loginToken);
  expect(m.snapshot().retry).toBe(false);
});
it("passes separate public callback metadata while retaining the relay storage origin", async () => {
  const f = fixture(),
    m = f.create(),
    callbackOrigin = "https://framebridge.test";
  vi.mocked(f.api.config).mockResolvedValue({
    available: true,
    callbackOrigin,
  });
  await m.restore();
  await m.start("invitation");
  expect(m.snapshot().callbackOrigin).toBe(callbackOrigin);
  expect(f.api.begin).toHaveBeenLastCalledWith(
    "invitation",
    undefined,
    expect.any(AbortSignal),
    callbackOrigin,
  );
  expect(f.record()!.origin).toBe("https://relay.test");
});
it("marks an idle deadline locally without polling and can reconnect after the old capability is pruned", async () => {
  const f = fixture(),
    m = await f.connect(),
    token = f.record()!.accountToken!,
    deadline = m.snapshot().account!.expiresAt;
  vi.mocked(f.api.inspect).mockClear();
  vi.mocked(f.api.poll).mockClear();
  f.backend.advance(deadline - f.backend.deps.now());
  await vi.advanceTimersByTimeAsync(2147483647);
  expect(m.snapshot().account?.needsAuthorization).toBe(true);
  expect(m.snapshot().accountToken).toBe(token);
  expect(f.api.inspect).not.toHaveBeenCalled();
  expect(f.api.poll).not.toHaveBeenCalled();
  f.backend.accounts.delete(oauthHash(token));
  await m.start("invitation");
  expect(f.api.begin).toHaveBeenLastCalledWith(
    "invitation",
    undefined,
    expect.any(AbortSignal),
    "https://relay.test",
  );
  expect(m.snapshot().pending).toBeDefined();
  expect(f.record()?.pending?.previousToken).toBeUndefined();
});
it("persists before opening, resumes across windows, and acknowledges only after the account is saved", async () => {
  const f = fixture(),
    m = f.create();
  await m.restore();
  await m.start("invitation");
  expect(f.events).toEqual(["saved", "opened"]);
  expect(m.snapshot().pending).toBeDefined();
  m.dispose();
  await f.authorize();
  const reopened = f.create();
  await reopened.restore();
  expect(f.events).toEqual([
    "saved",
    "opened",
    "saved",
    "acknowledged",
    "saved",
  ]);
  expect(f.record()?.pending).toBeUndefined();
  expect(f.backend.logins.size).toBe(0);
  expect(reopened.snapshot().account?.owners).toHaveLength(2);
  expect(reopened.snapshot().accountToken).toBe(f.record()?.accountToken);
});
it("keeps the old account while reconnecting and removes it only when replacement is remembered", async () => {
  const f = fixture(),
    m = await f.connect(),
    old = f.record()!.accountToken!;
  await m.start("invitation");
  expect(m.snapshot().accountToken).toBe(old);
  await f.authorize();
  expect(f.backend.accounts.has(oauthHash(old))).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(m.snapshot().accountToken).not.toBe(old);
  expect(f.backend.accounts.has(oauthHash(old))).toBe(false);
  expect(f.backend.accounts.size).toBe(1);
});
it("cancels a ready replacement without removing the previous account", async () => {
  const f = fixture(),
    m = await f.connect(),
    old = f.record()!.accountToken!;
  await m.start("invitation");
  await f.authorize();
  await m.cancel();
  expect(f.backend.accounts.size).toBe(1);
  expect(f.record()?.accountToken).toBe(old);
  expect(m.snapshot().accountToken).toBe(old);
  expect(m.snapshot().pending).toBeUndefined();
});
it("recovers a lost acknowledgement response without starting another login", async () => {
  const f = fixture(),
    m = f.create();
  await m.restore();
  await m.start("invitation");
  await f.authorize();
  vi.mocked(f.api.acknowledge).mockImplementationOnce(async (token) => {
    await f.backend.service.acknowledge(token);
    throw Error("response lost");
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(m.snapshot().retry).toBe(true);
  const token = f.record()!.accountToken!;
  expect(f.record()?.pending).toBeDefined();
  m.dispose();
  const reopened = f.create();
  await reopened.restore();
  expect(reopened.snapshot().accountToken).toBe(token);
  expect(reopened.snapshot().error).toBe("");
  expect(f.record()?.pending).toBeUndefined();
  expect(f.api.begin).toHaveBeenCalledTimes(1);
});
it("does not acknowledge when saving fails, and retries from the previous durable record", async () => {
  const f = fixture(),
    m = await f.connect(),
    old = f.record()!.accountToken!;
  await m.start("invitation");
  await f.authorize();
  f.storage.save.mockRejectedValueOnce(Error("storage unavailable"));
  await vi.advanceTimersByTimeAsync(2000);
  expect(m.snapshot().retry).toBe(true);
  expect(m.snapshot().accountToken).toBe(old);
  expect(f.record()?.accountToken).toBe(old);
  expect(f.backend.accounts.size).toBe(2);
  await m.retry();
  expect(f.backend.accounts.size).toBe(1);
  expect(f.record()?.pending).toBeUndefined();
});
it("keeps the verified new account when the post-acknowledgement cleanup write fails", async () => {
  const f = fixture(),
    m = await f.connect(),
    old = f.record()!.accountToken!;
  await m.start("invitation");
  await f.authorize();
  const save = f.storage.save.getMockImplementation()!;
  f.storage.save
    .mockImplementationOnce(save)
    .mockRejectedValueOnce(Error("clear failed"));
  await vi.advanceTimersByTimeAsync(2000);
  expect(m.snapshot().accountToken).not.toBe(old);
  expect(m.snapshot().retry).toBe(true);
  expect(f.record()?.pending).toBeDefined();
  await m.retry();
  expect(f.record()?.pending).toBeUndefined();
});
it("preserves saved sign-in during service outages and exposes explicit recovery", async () => {
  const f = fixture(),
    m = await f.connect(),
    record = f.record();
  m.dispose();
  vi.mocked(f.api.config).mockRejectedValueOnce(Error("unreachable"));
  const reopened = f.create();
  await reopened.restore();
  expect(reopened.snapshot().retry).toBe(true);
  expect(f.record()).toEqual(record);
  expect(reopened.snapshot().accountToken).toBeUndefined();
  await reopened.retry();
  expect(reopened.snapshot().accountToken).toBe(record?.accountToken);
});
it("reports a first-time service failure without claiming a saved account and never exposes raw errors", async () => {
  const f = fixture(),
    m = f.create();
  vi.mocked(f.api.config).mockRejectedValueOnce(
    Error("private-provider-token-value"),
  );
  await m.restore();
  expect(m.snapshot().error).toContain("Could not check Roblox sign-in");
  expect(m.snapshot().error).not.toContain("saved");
  expect(m.snapshot().error).not.toContain("private-provider-token-value");
  await m.retry();
  expect(m.snapshot().error).toBe("");
  vi.mocked(f.api.begin).mockRejectedValueOnce(
    Error("private-provider-token-value"),
  );
  await m.start("invitation");
  expect(m.snapshot().error).toContain("use an API key");
  expect(m.snapshot().error).not.toContain("saved");
  expect(m.snapshot().error).not.toContain("private-provider-token-value");
});
it("does not send capabilities to a different backend and supports the API-key-only relay", async () => {
  const f = fixture(),
    m = await f.connect(),
    record = f.record();
  m.dispose();
  vi.mocked(f.api.inspect).mockClear();
  const other = f.create("https://different.test");
  await other.restore();
  expect(f.api.inspect).not.toHaveBeenCalled();
  expect(f.record()).toEqual(record);
  vi.mocked(f.api.config).mockRejectedValueOnce(
    Object.assign(Error("not found"), { status: 404 }),
  );
  const local = f.create("http://localhost:4318");
  await local.restore();
  expect(local.snapshot().available).toBe(false);
});
it("expires unfinished login attempts while preserving an existing connection", async () => {
  const f = fixture(),
    m = await f.connect(),
    old = f.record()!.accountToken!;
  await m.start("invitation");
  f.backend.advance(600001);
  await vi.advanceTimersByTimeAsync(2000);
  expect(m.snapshot().pending).toBeUndefined();
  expect(m.snapshot().error).toContain("expired");
  expect(m.snapshot().accountToken).toBe(old);
});
it("keeps capabilities until disconnect is confirmed, retries disconnect rather than reconnecting, and reports failed revocation", async () => {
  const f = fixture(),
    m = await f.connect(),
    record = f.record();
  vi.mocked(f.api.disconnect).mockRejectedValueOnce(Error("offline"));
  await m.disconnect();
  expect(f.record()).toEqual(record);
  expect(m.snapshot().retry).toBe(true);
  const disconnect = f.api.disconnect;
  vi.mocked(disconnect).mockImplementationOnce(async (token, signal) => {
    const v = await f.backend.service.disconnect(token);
    return { ...v, revoked: false };
  });
  await m.retry();
  expect(f.record()).toBeNull();
  expect(m.snapshot().accountToken).toBeUndefined();
  expect(m.snapshot().notice).toContain("could not confirm revocation");
  expect(disconnect).toHaveBeenCalledTimes(2);
});
it("does not publish or acknowledge a delayed ready response after the plugin closes", async () => {
  const f = fixture(),
    m = f.create();
  await m.restore();
  await m.start("invitation");
  await f.authorize();
  let release!: (v: RobloxLoginStatus) => void;
  vi.mocked(f.api.poll).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const timer = vi.advanceTimersByTimeAsync(2000);
  await vi.advanceTimersByTimeAsync(0);
  m.dispose();
  release(
    f.backend.service.poll(
      f.record()!.pending!.loginToken,
    ) as RobloxLoginStatus,
  );
  await timer;
  expect(f.api.acknowledge).not.toHaveBeenCalled();
  expect(f.record()?.accountToken).toBeUndefined();
  const reopened = f.create();
  await reopened.restore();
  expect(reopened.snapshot().account).toBeDefined();
});
