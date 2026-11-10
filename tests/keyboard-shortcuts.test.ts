import { describe, expect, it } from "vitest";
import {
  formatShortcut,
  isApplePlatform,
  type PlatformHints,
} from "../plugins/figma/src/keyboard-shortcuts";

describe("Figma device-specific shortcut hints", () => {
  it.each<[string, PlatformHints, boolean]>([
    ["Mac desktop", { platform: "MacIntel" }, true],
    ["Windows desktop", { platform: "Win32" }, false],
    ["Linux desktop", { platform: "Linux x86_64" }, false],
    ["iPad", { platform: "iPad" }, true],
    ["iPhone", { platform: "iPhone" }, true],
    [
      "modern browser",
      { userAgentData: { platform: "macOS" }, platform: "Win32" },
      true,
    ],
    [
      "modern Windows",
      { userAgentData: { platform: "Windows" }, userAgent: "like Mac OS X" },
      false,
    ],
    [
      "UA fallback",
      {
        platform: "",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      },
      true,
    ],
    [
      "unrecognized platform fallback",
      { userAgentData: { platform: "Unknown" }, platform: "MacIntel" },
      true,
    ],
    ["missing browser hints", {}, false],
  ])("recognizes %s", (_name, hints, expected) => {
    expect(isApplePlatform(hints)).toBe(expected);
  });

  it.each([
    ["click", "⌘-click", "Ctrl-click"],
    ["C", "⌘C", "Ctrl+C"],
    ["Z", "⌘Z", "Ctrl+Z"],
    ["Shift+Z", "⌘⇧Z", "Ctrl+Shift+Z"],
    ["Shift+P", "⌘⇧P", "Ctrl+Shift+P"],
    ["Alt+0", "⌥0", "Alt+0"],
    ["Alt+6", "⌥6", "Alt+6"],
    ["Alt+T", "⌥T", "Alt+T"],
    ["Alt+1–6", "⌥1–6", "Alt+1–6"],
  ])("formats %s with only the current device's keys", (keys, mac, other) => {
    expect(formatShortcut(keys, true)).toBe(mac);
    expect(formatShortcut(keys, false)).toBe(other);
  });
});
