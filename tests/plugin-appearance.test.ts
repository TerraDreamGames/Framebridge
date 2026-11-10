import { describe, expect, it } from "vitest";
import {
  createAppearanceStorage,
  PLUGIN_APPEARANCE_KEY,
} from "../plugins/figma/src/plugin-appearance";

describe("plugin appearance persistence", () => {
  it("restores valid choices and falls back safely for old or malformed preferences", async () => {
    for (const [saved, expected] of [
      ["light", "light"],
      ["dark", "dark"],
      [null, "light"],
      [{ theme: "light" }, "light"],
      ["system", "light"],
    ] as const) {
      const store = createAppearanceStorage({
        getAsync: async (key) => {
          expect(key).toBe(PLUGIN_APPEARANCE_KEY);
          return saved;
        },
        setAsync: async () => {},
      });
      expect(await store.load()).toBe(expected);
    }
  });

  it("keeps rapid theme changes in order and waits for the newest choice before restoring", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    let saved: unknown;
    const writes: unknown[] = [];
    const store = createAppearanceStorage({
      getAsync: async () => saved,
      setAsync: async (key, value) => {
        expect(key).toBe(PLUGIN_APPEARANCE_KEY);
        writes.push(value);
        if (writes.length === 1) await first;
        saved = value;
      },
    });
    const light = store.save("light"),
      dark = store.save("dark"),
      restored = store.load();
    await Promise.resolve();
    expect(writes).toEqual(["light"]);
    release();
    await Promise.all([light, dark, store.flush()]);
    expect(writes).toEqual(["light", "dark"]);
    expect(await restored).toBe("dark");
  });

  it("reports storage failures, rejects invalid saves and still accepts a later retry", async () => {
    let fail = true,
      saved: unknown;
    const store = createAppearanceStorage({
      getAsync: async () => {
        if (fail) throw new Error("Storage unavailable");
        return saved;
      },
      setAsync: async (_key, value) => {
        if (fail) throw new Error("Storage unavailable");
        saved = value;
      },
    });
    await expect(store.load()).rejects.toThrow("Storage unavailable");
    await expect(store.save("light")).rejects.toThrow("Storage unavailable");
    await expect(store.save({ theme: "light" })).rejects.toThrow(
      "Choose a dark or light",
    );
    fail = false;
    await store.save("light");
    await store.flush();
    expect(await store.load()).toBe("light");
  });
});
