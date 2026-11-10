import { describe, expect, it } from "vitest";
import { connectionBuildSettings } from "../scripts/connection-build.mjs";
import config from "../framebridge.config.json";

describe("connected build configuration", () => {
  it("keeps sign-in, Studio pairing and sync configured for a fresh source checkout", () => {
    expect(connectionBuildSettings(config)).toEqual({
      relayUrl: config.relayUrl,
      privateBeta: false,
      mode: "connected",
    });
  });
  it("requires an explicit offline choice to clear the checked-in connection", () => {
    expect(
      connectionBuildSettings(
        config,
        {
          FRAMEBRIDGE_RELAY_URL: "https://override.example",
          FRAMEBRIDGE_PRIVATE_BETA: "1",
        },
        ["--offline"],
      ),
    ).toEqual({ relayUrl: "", privateBeta: false, mode: "offline" });
    expect(
      connectionBuildSettings(config, { FRAMEBRIDGE_RELAY_URL: "" }),
    ).toEqual({ relayUrl: "", privateBeta: false, mode: "offline" });
  });
  it("uses the loopback helper without invitations for local development", () => {
    expect(connectionBuildSettings(config, {}, ["--local"])).toEqual({
      relayUrl: "http://localhost:4318",
      privateBeta: false,
      mode: "local",
    });
  });
  it("honors explicit service and access-mode overrides", () => {
    expect(
      connectionBuildSettings(config, {
        FRAMEBRIDGE_RELAY_URL: "https://custom.example/",
        FRAMEBRIDGE_PRIVATE_BETA: "0",
      }),
    ).toEqual({
      relayUrl: "https://custom.example",
      privateBeta: false,
      mode: "connected",
    });
    expect(
      connectionBuildSettings(
        config,
        {
          FRAMEBRIDGE_RELAY_URL: "http://127.0.0.1:4319",
          FRAMEBRIDGE_PRIVATE_BETA: "1",
        },
        ["--local"],
      ),
    ).toEqual({
      relayUrl: "http://localhost:4319",
      privateBeta: true,
      mode: "local",
    });
  });
  it.each([
    "http://external.example",
    "https://custom.example/path",
    "https://custom.example?q=x",
    "https://user:password@custom.example",
    "file:///tmp/service",
  ])("rejects unsafe origins: %s", (origin) => {
    expect(() =>
      connectionBuildSettings(config, { FRAMEBRIDGE_RELAY_URL: origin }),
    ).toThrow();
  });
  it("rejects ambiguous mode or invitation settings", () => {
    expect(() =>
      connectionBuildSettings(config, {}, ["--local", "--offline"]),
    ).toThrow();
    expect(() =>
      connectionBuildSettings(config, { FRAMEBRIDGE_PRIVATE_BETA: "yes" }),
    ).toThrow();
  });
});
