import { describe, expect, it } from "vitest";
import { applyOverrideChanges } from "../packages/core/src/bulk-editor";
import { validProperty } from "../packages/core/src/editor";
import {
  DEFAULT_THEMES,
  resolveThemes,
} from "../packages/core/src/theme-tokens";
import { previewImageSource } from "../plugins/figma/src/preview-image-source";

describe("untrusted dictionary identities", () => {
  it("treats prototype-shaped layer IDs as ordinary own data", () => {
    const value = { renderMode: "native" as const };
    const result = applyOverrideChanges({}, [{ id: "__proto__", value }]);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(
      true,
    );
    expect(result.__proto__).toEqual(value);
    expect(({} as Record<string, unknown>).renderMode).toBeUndefined();
    const removed = applyOverrideChanges(result, [
      { id: "__proto__", value: undefined },
    ]);
    expect(Object.prototype.hasOwnProperty.call(removed, "__proto__")).toBe(
      false,
    );
  });
  it.each(["__proto__", "constructor", "prototype", "toString"])(
    "rejects inherited class/property schemas: %s",
    (key) => {
      expect(
        validProperty("Frame", key, { type: "Enum", value: ["x", "y"] }),
      ).toBe(false);
      expect(validProperty(key, "Name", "bad")).toBe(false);
    },
  );
  it.each(["__proto__", "constructor", "prototype"])(
    "rejects reserved theme and token identities: %s",
    (key) => {
      const token = Object.values(DEFAULT_THEMES.modes.Light)[0];
      const modes = JSON.parse(
        JSON.stringify({
          version: 1,
          initial: key,
          modes: { [key]: { accent: token } },
        }),
      );
      expect(() => resolveThemes(modes)).toThrow();
      expect(() =>
        resolveThemes({
          version: 1,
          initial: "Light",
          modes: { Light: { [key]: token } },
        }),
      ).toThrow();
    },
  );
  it("accepts local image previews and rejects executable, remote and HTML sources", () => {
    for (const source of [
      "data:image/png;base64,AA==",
      "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E",
      "blob:null/fixture",
    ])
      expect(previewImageSource(source)).toBe(source);
    for (const source of [
      undefined,
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "https://example.com/image.png",
      "//example.com/image.png",
    ])
      expect(previewImageSource(source)).toBeUndefined();
  });
});
