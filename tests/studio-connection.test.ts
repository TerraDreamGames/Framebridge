import { expect, it, vi } from "vitest";
import {
  createConnectionManager,
  createConnectionStorage,
  CONNECTION_STORAGE_KEY,
  type ConnectionState,
} from "../plugins/figma/src/studio-connection";
const origin = "https://relay.test";
const token = "a".repeat(64);
const saved = { origin, senderToken: token, expiresAt: 9000 };
function setup(initial: unknown = saved) {
  let record = initial;
  const device = {
    getAsync: async () => record,
    setAsync: vi.fn(async (_key: string, value: unknown) => {
      record = value;
    }),
  };
  const storage = createConnectionStorage(device);
  const validate = vi.fn(async () => ({ role: "sender", expiresAt: 9000 }));
  let state!: ConnectionState;
  const manager = createConnectionManager(
    origin,
    storage,
    validate,
    (next) => {
      state = next;
    },
    () => 1000,
  );
  return {
    device,
    storage,
    validate,
    manager,
    state: () => state,
    record: () => record,
  };
}
it("remembers the reusable token and resumes it in a reopened plugin", async () => {
  const test = setup(null);
  await test.manager.remember({ senderToken: token, expiresAt: 9000 });
  const reopened = createConnectionManager(
    origin,
    createConnectionStorage(test.device),
    test.validate,
    () => {},
    () => 1000,
  );
  await reopened.restore();
  expect(test.validate).toHaveBeenCalledWith(token);
  expect(test.record()).toEqual(saved);
  expect(test.device.setAsync).toHaveBeenCalledWith(
    CONNECTION_STORAGE_KEY,
    saved,
  );
});
it("does not erase the saved token during a temporary outage and can retry", async () => {
  const test = setup();
  test.validate.mockRejectedValueOnce(new Error("offline"));
  await test.manager.restore();
  expect(test.state().retry).toBe(true);
  expect(test.state().connection).toBeUndefined();
  expect(test.record()).toEqual(saved);
  await test.manager.restore();
  expect(test.state().connection?.senderToken).toBe(token);
});
it.each([
  { ...saved, origin: "https://other.test" },
  { ...saved, expiresAt: 999 },
  { ...saved, senderToken: "malformed" },
])(
  "never sends an expired, malformed, or different-backend credential",
  async (record) => {
    const test = setup(record);
    await test.manager.restore();
    expect(test.validate).not.toHaveBeenCalled();
    expect(test.state().connection).toBeUndefined();
  },
);
it("forgets revoked connections and does not leak the backend exception", async () => {
  const test = setup();
  test.validate.mockRejectedValueOnce({ status: 401, message: "dummy-secret" });
  await test.manager.restore();
  expect(test.record()).toBeNull();
  expect(test.state().retry).toBe(false);
  expect(test.state().error).not.toContain("dummy-secret");
});
it("a delayed restore cannot resurrect a forgotten connection or replace a new pairing", async () => {
  const test = setup();
  let finish!: (value: { role: string; expiresAt: number }) => void;
  test.validate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const restoring = test.manager.restore();
  await vi.waitFor(() => expect(test.validate).toHaveBeenCalled());
  await test.manager.forget();
  const next = { senderToken: "b".repeat(64), expiresAt: 8000 };
  await test.manager.remember(next);
  finish({ role: "sender", expiresAt: 9000 });
  await restoring;
  expect(test.state().connection).toEqual(next);
  expect(test.record()).toEqual({ ...next, origin });
  await test.manager.forget(token); // stale errors must not disconnect the new pairing
  expect(test.state().connection).toEqual(next);
});
it("serializes saves so a slow write cannot resurrect a forgotten token", async () => {
  const test = setup(null);
  let finish!: () => void;
  test.device.setAsync.mockImplementationOnce(
    async () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const saving = test.manager.remember({ senderToken: token, expiresAt: 9000 });
  const forgetting = test.manager.forget();
  await vi.waitFor(() => expect(test.device.setAsync).toHaveBeenCalledTimes(1));
  finish();
  await Promise.all([saving, forgetting]);
  expect(test.device.setAsync.mock.calls.at(-1)?.[1]).toBeNull();
  expect(test.state().connection).toBeUndefined();
});
