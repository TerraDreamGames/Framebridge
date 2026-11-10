import { describe, expect, it } from "vitest";
import { documentationUrl } from "../plugins/figma/src/documentation";

describe("public documentation navigation", () => {
  it("uses the public guides in connected and offline builds", () => {
    expect(documentationUrl("overview")).toBe(
      "https://framebridge.terradream.games/#docs",
    );
    expect(documentationUrl("properties")).toBe(
      "https://framebridge.terradream.games/#docs/properties",
    );
    expect(documentationUrl("studio")).toBe(
      "https://framebridge.terradream.games/#docs/connection",
    );
  });
  it("cannot open arbitrary URLs or prototype properties from an iframe message", () => {
    for (const value of [
      undefined,
      null,
      {},
      "__proto__",
      "constructor",
      "toString",
      "https://example.com",
      "javascript:alert(1)",
      "../../account",
      "images?q=secret",
    ]) {
      expect(documentationUrl(value)).toBeUndefined();
    }
  });
});
