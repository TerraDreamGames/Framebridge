import { it, expect } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { demoResult } from "../packages/core/src/demo";

// npm check remains usable without the optional Studio test runtime. The actual
// Luau integration runs when Lune (aftman.toml) is installed, including release QA.
const luneAvailable =
  spawnSync("lune", ["--version"], { stdio: "ignore" }).status === 0;
it.skipIf(!luneAvailable)(
  "runs production Studio queue cancellation and reconnect over HTTP against local workerd",
  async () => {
    const bundle = await build({
      entryPoints: ["packages/relay/cloudflare/worker.ts"],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      external: ["node:*", "cloudflare:workers"],
      write: false,
      logLevel: "silent",
    });
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: "2026-10-01",
        compatibilityFlags: ["nodejs_compat"],
        durableObjects: { RELAY: { className: "RelayRoom", useSQLite: true } },
        telemetry: { enabled: false },
        bindings: {
          BETA_ACCESS_HASHES: createHash("sha256")
            .update("local-sync-cancel-invitation-1234567890")
            .digest("hex"),
        },
        outboundService: async () => {
          throw new Error("External requests are forbidden in this test");
        },
      }),
    );
    let holdInbox = false,
      holdDelete = false,
      inboxEntered = false;
    let inboxHeld = false,
      deleteHeld = false,
      releaseInbox!: () => void,
      releaseDelete!: () => void;
    let waitedInboxUrl = "",
      deleteHadBearer = false,
      inboxWaitMs = 0;
    const trace: unknown[] = [];
    const inboxGate = new Promise<void>((resolve) => {
      releaseInbox = resolve;
    });
    const deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const server = createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        const path = requestUrl.pathname + requestUrl.search;
        const json = (value: unknown) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(value));
        };
        if (requestUrl.pathname === "/__test__/package") {
          const pkg = demoResult().package;
          pkg.roots[0].name =
            "Queued revision " + requestUrl.searchParams.get("revision");
          return json(pkg);
        }
        if (path === "/__test__/state")
          return json({ inboxEntered, inboxHeld, deleteHeld });
        if (path === "/__test__/hold-inbox") {
          holdInbox = true;
          return json({ ok: true });
        }
        if (path === "/__test__/hold-delete") {
          holdDelete = true;
          return json({ ok: true });
        }
        if (path === "/__test__/release-inbox") {
          holdInbox = false;
          releaseInbox();
          return json({ ok: true });
        }
        if (path === "/__test__/release-delete") {
          holdDelete = false;
          releaseDelete();
          return json({ ok: true });
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(req.headers))
          if (typeof value === "string" && name !== "host")
            headers[name] = value;
        const heldInboxRequest =
          path.startsWith("/v1/inbox?") && holdInbox && !inboxEntered;
        if (heldInboxRequest) {
          inboxEntered = true;
          waitedInboxUrl = path;
        }
        const inboxStartedAt = heldInboxRequest ? Date.now() : 0;
        if (path === "/v1/session" && req.method === "DELETE" && holdDelete) {
          deleteHeld = true;
          deleteHadBearer = /^Bearer [a-f0-9]{64}$/.test(
            headers.authorization ?? "",
          );
          await deleteGate;
        }
        const response = await runtime.dispatchFetch(
          "https://local-relay.test" + path,
          {
            method: req.method,
            headers,
            ...(body.length ? { body } : {}),
          },
        );
        const content = await response.text();
        trace.push({
          path: path.split("?")[0],
          method: req.method,
          status: response.status,
          authValid: /^Bearer [a-f0-9]{64}$/.test(headers.authorization ?? ""),
        });
        if (heldInboxRequest) {
          inboxWaitMs = Date.now() - inboxStartedAt;
          inboxHeld = true;
          await inboxGate;
        }
        res.statusCode = response.status;
        res.setHeader("Content-Type", "application/json");
        res.end(content);
      } catch {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Isolated HTTP test failed" }));
      }
    });
    try {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No local test address");
      const result = await promisify(execFile)(
        "lune",
        ["run", "tests/studio-sync-cancel-http.luau"],
        {
          env: {
            ...process.env,
            FRAMEBRIDGE_TEST_RELAY: `http://127.0.0.1:${address.port}`,
          },
          timeout: 35_000,
          maxBuffer: 64_000,
        },
      ).catch((error) => {
        throw new Error(
          String(error) + "\nHTTP boundary trace: " + JSON.stringify(trace),
        );
      });
      expect(result.stdout).toContain("10 boundaries passed");
      expect(waitedInboxUrl).toContain("wait=15000");
      expect(inboxWaitMs).toBeGreaterThanOrEqual(14_500);
      expect(deleteHadBearer).toBe(true);
    } finally {
      releaseInbox();
      releaseDelete();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await runtime.dispose();
    }
  },
  45_000,
);
