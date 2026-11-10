import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import config from "../framebridge.config.json";

describe("preview credential isolation", () => {
  let server: ViteDevServer;
  let fixture: string;
  let origin: string;
  const sentinel = "framebridge-test-only-private-value";

  beforeAll(async () => {
    vi.stubEnv("VITE_TEST_SERVER_SECRET", sentinel);
    await mkdir(".artifacts", { recursive: true });
    fixture = await mkdtemp(resolve(".artifacts/vite-security-"));
    await writeFile(
      `${fixture}/credentials.json`,
      JSON.stringify({ secret: sentinel }),
    );
    server = await createServer({
      mode: "development",
      configFile: resolve("vite.config.ts"),
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, hmr: false },
      plugins: [
        {
          name: "security-env-probe",
          resolveId(id) {
            return id === "virtual:security-env-probe"
              ? "\0security-env-probe"
              : null;
          },
          load(id) {
            if (id === "\0security-env-probe")
              return "export const settings = import.meta.env; export const relay = import.meta.env.VITE_FRAMEBRIDGE_RELAY_URL;";
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("No preview port.");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await server?.close();
    if (fixture) await rm(fixture, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("blocks private files through static, filesystem and raw-import routes", async () => {
    const relative = fixture.slice(process.cwd().length);
    for (const path of [
      `${relative}/credentials.json`,
      `/@fs${fixture}/credentials.json`,
      `${relative}/credentials.json?raw`,
      `${relative}/credentials.json?import`,
      "/.git/config",
    ]) {
      const response = await fetch(origin + path);
      expect(response.status, path).toBe(403);
      expect(await response.text()).not.toContain(sentinel);
    }
    expect((await fetch(origin + "/")).status).toBe(200);
  });

  it("exposes only explicit public settings, even when a secret has a VITE prefix", async () => {
    const response = await server.transformRequest(
      "virtual:security-env-probe",
    );
    expect(response!.code).not.toContain(sentinel);
    expect(response!.code).not.toContain("VITE_TEST_SERVER_SECRET");
    expect(response!.code).toContain(config.relayUrl);
  });
});
