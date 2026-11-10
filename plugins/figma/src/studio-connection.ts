export type StudioConnection = { senderToken: string; expiresAt: number };
export type SavedConnection = StudioConnection & { origin: string };
export const CONNECTION_STORAGE_KEY = "framebridge-studio-connection-v1";

export function readConnection(value: unknown): SavedConnection | undefined {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (
    typeof record.origin !== "string" ||
    !/^https?:\/\//.test(record.origin) ||
    typeof record.senderToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.senderToken) ||
    typeof record.expiresAt !== "number" ||
    !Number.isSafeInteger(record.expiresAt)
  )
    return;
  return {
    origin: record.origin,
    senderToken: record.senderToken,
    expiresAt: record.expiresAt,
  };
}

export function createConnectionStorage(storage: {
  getAsync(key: string): Promise<unknown>;
  setAsync(key: string, value: unknown): Promise<void>;
}) {
  let pending = Promise.resolve();
  return {
    async load() {
      await pending;
      return readConnection(await storage.getAsync(CONNECTION_STORAGE_KEY));
    },
    save(value: unknown) {
      const record = readConnection(value) ?? null;
      const write = pending.then(() =>
        storage.setAsync(CONNECTION_STORAGE_KEY, record),
      );
      pending = write.catch(() => {});
      return write;
    },
    flush() {
      return pending;
    },
  };
}

export type ConnectionState = {
  connection?: StudioConnection;
  restoring: boolean;
  retry: boolean;
  error: string;
};

/** A consumed pairing code creates a reusable connection; only invalid sessions are forgotten. */
export function createConnectionManager(
  origin: string,
  storage: {
    load(): Promise<unknown>;
    save(value: SavedConnection | null): Promise<void>;
  },
  validate: (token: string) => Promise<{ role: string; expiresAt: number }>,
  changed: (state: ConnectionState) => void,
  now = Date.now,
) {
  let version = 0;
  let state: ConnectionState = { restoring: true, retry: false, error: "" };
  const publish = (next: ConnectionState) => {
    state = next;
    changed(next);
  };
  const save = async (value: SavedConnection | null, at: number) => {
    try {
      await storage.save(value);
    } catch {
      if (at === version)
        publish({
          ...state,
          error: value
            ? "Connected for this window, but Figma could not remember the connection."
            : "Disconnected here, but Figma could not clear the saved connection. Try Forget connection again.",
        });
    }
  };
  return {
    async restore() {
      const at = ++version;
      publish({ ...state, restoring: true, retry: false, error: "" });
      try {
        const saved = readConnection(await storage.load());
        if (at !== version) return;
        if (!saved || saved.origin !== origin || saved.expiresAt <= now()) {
          publish({ restoring: false, retry: false, error: "" });
          if (saved) await save(null, at);
          return;
        }
        const session = await validate(saved.senderToken);
        if (at !== version) return;
        if (session.role !== "sender" || session.expiresAt <= now()) {
          publish({ restoring: false, retry: false, error: "" });
          await save(null, at);
          return;
        }
        publish({
          connection: {
            senderToken: saved.senderToken,
            expiresAt: session.expiresAt,
          },
          restoring: false,
          retry: false,
          error: "",
        });
      } catch (error) {
        if (at !== version) return;
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 401
        ) {
          publish({
            restoring: false,
            retry: false,
            error:
              "Your Studio connection ended. Connect again with a new code.",
          });
          await save(null, at);
        } else
          publish({
            restoring: false,
            retry: true,
            error:
              "Could not check your saved Studio connection. Retry when the service is available.",
          });
      }
    },
    beginPair() {
      ++version;
      publish({ ...state, restoring: false, retry: false, error: "" });
    },
    async remember(connection: StudioConnection) {
      const at = ++version;
      publish({ connection, restoring: false, retry: false, error: "" });
      await save({ ...connection, origin }, at);
    },
    async forget(token?: string) {
      if (token && state.connection?.senderToken !== token) return;
      const at = ++version;
      publish({ restoring: false, retry: false, error: "" });
      await save(null, at);
    },
    dispose() {
      ++version;
    },
  };
}
