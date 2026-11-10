export type PluginTheme = "dark" | "light";
export const PLUGIN_APPEARANCE_KEY = "framebridge-plugin-appearance";

export function readPluginTheme(value: unknown): PluginTheme | undefined {
  return value === "dark" || value === "light" ? value : undefined;
}

export function createAppearanceStorage(storage: {
  getAsync(key: string): Promise<unknown>;
  setAsync(key: string, value: unknown): Promise<void>;
}) {
  let queue = Promise.resolve();
  return {
    async load(): Promise<PluginTheme> {
      await queue;
      return (
        readPluginTheme(await storage.getAsync(PLUGIN_APPEARANCE_KEY)) ??
        "light"
      );
    },
    save(value: unknown) {
      const theme = readPluginTheme(value);
      if (!theme)
        return Promise.reject(
          new Error("Choose a dark or light plugin theme."),
        );
      const write = queue.then(() =>
        storage.setAsync(PLUGIN_APPEARANCE_KEY, theme),
      );
      // Report a failed write to its caller without blocking later choices.
      queue = write.catch(() => {});
      return write;
    },
    flush: () => queue,
  };
}
