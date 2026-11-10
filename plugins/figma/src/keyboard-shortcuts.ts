export type PlatformHints = {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
};

// Local presentation only; no device information is stored or sent anywhere.
export function isApplePlatform(hints: PlatformHints): boolean {
  const platform =
    [hints.userAgentData?.platform, hints.platform, hints.userAgent].find(
      (value) =>
        value &&
        /mac|iphone|ipad|ipod|ios|windows|win32|win64|linux|android|cros|chrome os/i.test(
          value,
        ),
    ) ?? "";
  return /mac|iphone|ipad|ipod|ios/i.test(platform);
}

const apple = isApplePlatform(
  typeof navigator === "undefined" ? {} : navigator,
);

/** The primary modifier is Command on Apple devices and Control elsewhere. */
export function formatShortcut(keys: string, useApple = apple): string {
  if (keys === "click") return `${useApple ? "⌘" : "Ctrl"}-click`;
  if (keys.startsWith("Alt+")) return useApple ? `⌥${keys.slice(4)}` : keys;
  const parts = keys.split("+");
  return useApple
    ? `⌘${parts.map((key) => (key === "Shift" ? "⇧" : key)).join("")}`
    : `Ctrl+${parts.join("+")}`;
}
