import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  symlink,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  assertMatchingBackend,
  workerReleaseProvenance,
} from "../packages/relay/src/release-provenance.mjs";
import {
  sourceProvenance,
  compilationProvenance,
  workerDeployArgs,
  assertUnchangedSource,
  fetchMatchingBackend,
  releaseBuildProvenance,
  digest,
} from "../scripts/private-release-provenance.mjs";

const source = {
  revision: "a".repeat(40),
  sha256: "b".repeat(64),
  inputs: { "worker.ts": "c".repeat(64) },
};
const worker = {
  id: "12345678-1234-4321-9876-123456789abc",
  timestamp: "2026-10-03T14:00:00.000Z",
  tag: "reviewed-source",
};
const provenance = { ...compilationProvenance(source), worker };
const health = (p: unknown = provenance) => ({
  ok: true,
  access: "private-beta",
  configured: true,
  provenance: p,
});
const directories: string[] = [];
const runtimes: Miniflare[] = [];
describe("public release access verification", () => {
  it("requires the deployed access mode to match the explicitly requested release mode", async () => {
    const publicHealth = { ...health(), access: "public" };
    expect(
      assertMatchingBackend(publicHealth, source, undefined, "public"),
    ).toEqual(provenance);
    expect(() => assertMatchingBackend(publicHealth, source)).toThrow();
    expect(() =>
      assertMatchingBackend(health(), source, undefined, "public"),
    ).toThrow();
    expect(
      await fetchMatchingBackend("https://public.test", source, {
        expectedAccess: "public",
        fetchImpl: async () => Response.json(publicHealth),
      }),
    ).toEqual(provenance);
  });
});
let script: string;
beforeAll(async () => {
  script = (
    await build({
      entryPoints: ["packages/relay/cloudflare/worker.ts"],
      bundle: true,
      format: "esm",
      target: "es2022",
      platform: "browser",
      external: ["node:*", "cloudflare:workers"],
      write: false,
      logLevel: "silent",
      define: {
        __FRAMEBRIDGE_RELEASE_PROVENANCE__: JSON.stringify(
          compilationProvenance(source),
        ),
      },
    })
  ).outputFiles[0].text;
});
afterAll(async () => {
  await Promise.all(runtimes.map((r) => r.dispose()));
  await Promise.all(
    directories.map((d) => rm(d, { recursive: true, force: true })),
  );
});
function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "framebridge-release-"));
  directories.push(dir);
  for (const p of [
    "packages/relay/cloudflare",
    "plugins/figma/src",
    "scripts",
    "docs",
    ".artifacts/private-beta",
  ])
    await mkdir(join(dir, p), { recursive: true });
  await writeFile(
    join(dir, ".gitignore"),
    ".artifacts/\nnode_modules\ndist/\n",
  );
  await writeFile(
    join(dir, "packages/relay/cloudflare/worker.ts"),
    "export default {};\n",
  );
  await writeFile(
    join(dir, "plugins/figma/src/runtime.ts"),
    "export const version=1;\n",
  );
  await writeFile(join(dir, "scripts/build.mjs"), "// reviewed build\n");
  await writeFile(
    join(dir, "package.json"),
    '{"version":"0.1.0","type":"module"}',
  );
  await writeFile(join(dir, "package-lock.json"), "{}");
  await writeFile(join(dir, "wrangler.jsonc"), "{}");
  await writeFile(
    join(dir, "docs/PRIVATE_BETA.md"),
    "Synthetic local release QA.\n",
  );
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "qa@example.invalid");
  git(dir, "config", "user.name", "Local QA");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "reviewed source");
  return dir;
}
describe("matching private release provenance", () => {
  it("requires identified invitation-protected healthy source and a real Worker revision", () => {
    expect(assertMatchingBackend(health(), source)).toEqual(provenance);
    for (const bad of [
      {},
      health(null),
      health({ ...provenance, source: null }),
      health({ ...provenance, worker: null }),
      { ...health(), configured: false },
      health({
        ...provenance,
        worker: { ...worker, id: "00000000-0000-0000-0000-000000000000" },
      }),
    ])
      expect(() => assertMatchingBackend(bad, source)).toThrow();
  });
  it("rejects stale runtime source and incompatible contracts despite an ordinary healthy endpoint", () => {
    expect(() =>
      assertMatchingBackend(
        health({
          ...provenance,
          source: { ...source, sha256: "d".repeat(64) },
        }),
        source,
      ),
    ).toThrow("does not match");
    expect(() =>
      assertMatchingBackend(
        health({ ...provenance, compatibility: "future" }),
        source,
      ),
    ).toThrow("incompatible");
    expect(() =>
      assertMatchingBackend(health({ ...provenance, schema: 2 }), source),
    ).toThrow("incompatible");
  });
  it("allows a documentation-only commit and preserves distinct client/backend commits", () => {
    const client = { ...source, revision: "d".repeat(40) };
    expect(assertMatchingBackend(health(), client).source.revision).toBe(
      source.revision,
    );
    const record = releaseBuildProvenance(
      { "figma/code.js": new TextEncoder().encode("reviewed client") },
      client,
      provenance,
    );
    expect(record.client.source.revision).toBe(client.revision);
    expect(record.backend.source.revision).toBe(source.revision);
  });
  it("rejects a Worker revision change during a build even when source remains compatible", () => {
    expect(() =>
      assertMatchingBackend(
        health(),
        source,
        "abcdabcd-1234-4321-9876-123456789abc",
      ),
    ).toThrow("changed");
    expect(assertMatchingBackend(health(), source, worker.id).worker.id).toBe(
      worker.id,
    );
  });
  it("records exact deterministic client payload hashes and changes the build ID when content changes", () => {
    const first = releaseBuildProvenance(
      { b: Uint8Array.of(2), a: Uint8Array.of(1) },
      source,
      provenance,
    );
    expect(first.client.buildId).toBe(
      releaseBuildProvenance(
        { a: Uint8Array.of(1), b: Uint8Array.of(2) },
        source,
        provenance,
      ).client.buildId,
    );
    expect(first.sha256.a).toBe(digest(Uint8Array.of(1)));
    expect(first.client.buildId).not.toBe(
      releaseBuildProvenance(
        { a: Uint8Array.of(3), b: Uint8Array.of(2) },
        source,
        provenance,
      ).client.buildId,
    );
  });
  it("uses compile-time provenance and documented Wrangler flags rather than mutable health variables", () => {
    const args = workerDeployArgs(source);
    expect(args[0]).toBe("deploy");
    expect(args[1]).toBe("--define");
    expect(args[3]).toBe("--tag");
    expect(JSON.parse(args[2].slice(args[2].indexOf(":") + 1))).toEqual(
      compilationProvenance(source),
    );
    expect(workerReleaseProvenance(null, worker)).toBeNull();
    expect(
      workerReleaseProvenance(compilationProvenance(source), null)?.worker,
    ).toBeNull();
  });
  it("fingerprints runtime/build/config inputs while documentation commits retain compatibility", async () => {
    const dir = await repo(),
      first = await sourceProvenance(dir);
    await writeFile(
      join(dir, "docs/PRIVATE_BETA.md"),
      "Documentation-only correction.\n",
    );
    git(dir, "add", "docs");
    git(dir, "commit", "-qm", "docs only");
    const next = await sourceProvenance(dir);
    expect(next.revision).not.toBe(first.revision);
    expect(next.sha256).toBe(first.sha256);
    for (const path of [
      "packages/relay/cloudflare/worker.ts",
      "plugins/figma/src/runtime.ts",
      "scripts/build.mjs",
      "package-lock.json",
      "wrangler.jsonc",
    ]) {
      await writeFile(
        join(dir, path),
        (await readFile(join(dir, path), "utf8")) + " ",
      );
      await expect(sourceProvenance(dir)).rejects.toThrow("uncommitted");
      git(dir, "add", path);
      git(dir, "commit", "-qm", "review runtime input");
      expect((await sourceProvenance(dir)).sha256).not.toBe(first.sha256);
    }
  });
  it("rejects untracked source and changes after a build; local metadata/artifacts remain harmless", async () => {
    const dir = await repo(),
      first = await sourceProvenance(dir);
    await writeFile(join(dir, ".artifacts/private-beta/local.txt"), "local QA");
    expect((await sourceProvenance(dir)).sha256).toBe(first.sha256);
    await writeFile(join(dir, "plugins/figma/src/new.ts"), "export {};");
    await expect(sourceProvenance(dir)).rejects.toThrow("uncommitted");
    expect(() =>
      assertUnchangedSource(source, { ...source, sha256: "e".repeat(64) }),
    ).toThrow("changed");
  });
  it("bounds malformed health and refuses HTTP failures without exposing response content", async () => {
    for (const response of [
      new Response("not json"),
      new Response("x".repeat(16_385)),
      new Response("private secret detail", { status: 503 }),
    ])
      await expect(
        fetchMatchingBackend("https://fixture.workers.dev", source, {
          fetchImpl: async () => response,
        }),
      ).rejects.toThrow(/health|healthy/);
    await expect(
      fetchMatchingBackend("https://fixture.workers.dev", source, {
        fetchImpl: async (_url, init) => {
          expect(init?.redirect).toBe("error");
          expect(init?.cache).toBe("no-store");
          return Response.json(health());
        },
      }),
    ).resolves.toEqual(provenance);
  });
});

describe("real workerd health provenance", () => {
  async function host(
    compiled: string,
    metadata: unknown = worker,
    configured = true,
  ) {
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: compiled,
        compatibilityDate: "2026-10-01",
        compatibilityFlags: ["nodejs_compat"],
        durableObjects: { RELAY: { className: "RelayRoom", useSQLite: true } },
        telemetry: { enabled: false },
        bindings: {
          BETA_ACCESS_HASHES: configured ? "f".repeat(64) : "",
          FRAMEBRIDGE_VERSION_METADATA: metadata,
        },
        outboundService: async () => {
          throw new Error("No external service is authorized in release QA.");
        },
      }),
    );
    runtimes.push(runtime);
    return runtime;
  }
  it("identifies compiled runtime source and deployed metadata with no credentials or requests beyond health", async () => {
    const runtime = await host(script);
    const response = await runtime.dispatchFetch(
      "https://fixture.workers.dev/health",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as any;
    expect(body).toEqual(health());
    expect(JSON.stringify(body)).not.toContain("f".repeat(64));
    await expect(
      fetchMatchingBackend("https://fixture.workers.dev", source, {
        fetchImpl: async () => {
          const response = await runtime.dispatchFetch(
            "https://fixture.workers.dev/health",
          );
          return new Response(await response.text(), {
            status: response.status,
          });
        },
      }),
    ).resolves.toEqual(provenance);
  });
  it("keeps unidentified local development health useful while rejecting it as a private release", async () => {
    const local = (
      await build({
        entryPoints: ["packages/relay/cloudflare/worker.ts"],
        bundle: true,
        format: "esm",
        target: "es2022",
        platform: "browser",
        external: ["node:*", "cloudflare:workers"],
        write: false,
        logLevel: "silent",
      })
    ).outputFiles[0].text;
    const runtime = await host(local);
    const body = (await (
      await runtime.dispatchFetch("https://fixture.workers.dev/health")
    ).json()) as any;
    expect(body.ok).toBe(true);
    expect(body.provenance).toBeNull();
    expect(() => assertMatchingBackend(body, source)).toThrow("missing");
  });
  it("rejects missing platform metadata and invitation configuration", async () => {
    for (const runtime of [
      await host(script, null),
      await host(script, worker, false),
    ]) {
      const body = await (
        await runtime.dispatchFetch("https://fixture.workers.dev/health")
      ).json();
      expect(() => assertMatchingBackend(body, source)).toThrow();
    }
  });
});

describe("actual private release CLI with isolated local service fixtures", () => {
  async function cli(
    mode: "healthy" | "missing" | "stale" | "revision-change" | "source-change",
  ) {
    const dir = await repo();
    await symlink(resolve("node_modules"), join(dir, "node_modules"), "dir");
    await writeFile(
      join(dir, "scripts/build.mjs"),
      `import {mkdir,writeFile} from 'node:fs/promises'; import {zipSync,strToU8} from 'fflate';
await mkdir('dist/studio',{recursive:true}); await writeFile('.artifacts/build-ran','yes');
const files={'figma/manifest.json':strToU8(JSON.stringify({networkAccess:{allowedDomains:[process.env.FRAMEBRIDGE_RELAY_URL]}})),'figma/code.js':strToU8('synthetic reviewed client'),'studio/Framebridge.rbxmx':strToU8('<roblox/>')};
await writeFile('dist/Framebridge-plugins.zip',zipSync(files)); await writeFile('dist/studio/Framebridge.rbxmx',files['studio/Framebridge.rbxmx']);
${mode === "source-change" ? "await writeFile('plugins/figma/src/runtime.ts','changed during build');" : ""}`,
    );
    git(dir, "add", "scripts/build.mjs");
    git(dir, "commit", "-qm", "review test builder");
    await writeFile(
      join(dir, ".artifacts/private-beta/deployment.json"),
      JSON.stringify({ url: "https://fixture.workers.dev" }),
    );
    const imported = pathToFileURL(
      resolve("scripts/private-release-provenance.mjs"),
    ).href;
    const preload = join(dir, ".artifacts/preload.mjs");
    await writeFile(
      preload,
      `import {sourceProvenance,compilationProvenance} from ${JSON.stringify(imported)};
const source=await sourceProvenance(); let calls=0;
globalThis.fetch=async()=>{calls++; const provenance=${mode === "missing" ? "null" : `({...compilationProvenance(source),source:{revision:source.revision,sha256:${mode === "stale" ? "'e'.repeat(64)" : "source.sha256"}},worker:{id:calls>1&&${JSON.stringify(mode === "revision-change")}?'abcdabcd-1234-4321-9876-123456789abc':${JSON.stringify(worker.id)},tag:'synthetic',timestamp:${JSON.stringify(worker.timestamp)}}})`};return Response.json({ok:true,access:'private-beta',configured:true,provenance});};`,
    );
    const result = spawnSync(
      process.execPath,
      ["--import", preload, resolve("scripts/private-beta.mjs"), "release"],
      { cwd: dir, encoding: "utf8", timeout: 15_000 },
    );
    return { dir, result };
  }
  it.each(["missing", "stale"] as const)(
    "refuses %s backend before building and leaves no matching release",
    async (mode) => {
      const { dir, result } = await cli(mode);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/provenance|does not match/);
      await expect(
        readFile(join(dir, ".artifacts/build-ran")),
      ).rejects.toThrow();
      await expect(
        readFile(
          join(dir, ".artifacts/private-beta/Framebridge-private-beta.zip"),
        ),
      ).rejects.toThrow();
    },
  );
  it.each(["revision-change", "source-change"] as const)(
    "refuses %s during the build instead of outputting a matching release",
    async (mode) => {
      const { dir, result } = await cli(mode);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/changed|uncommitted/);
      expect(await readFile(join(dir, ".artifacts/build-ran"), "utf8")).toBe(
        "yes",
      );
      await expect(
        readFile(
          join(dir, ".artifacts/private-beta/Framebridge-private-beta.zip"),
        ),
      ).rejects.toThrow();
    },
  );
  it("writes a checksummed matching record after both healthy revision checks", async () => {
    const { dir, result } = await cli("healthy");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Matching private plugins built");
    const files = unzipSync(
      await readFile(
        join(dir, ".artifacts/private-beta/Framebridge-private-beta.zip"),
      ),
    );
    const record = JSON.parse(new TextDecoder().decode(files["release.json"]));
    expect(record.provenance.backend.worker.id).toBe(worker.id);
    expect(record.provenance.client.source.sha256).toBe(
      (await sourceProvenance(dir)).sha256,
    );
    expect(record.provenance.client.buildId).toBe(
      digest(JSON.stringify(record.sha256)),
    );
    for (const [path, checksum] of Object.entries(record.sha256))
      expect(digest(files[path])).toBe(checksum);
    expect(
      JSON.parse(
        await readFile(
          join(dir, ".artifacts/private-beta/deployment.json"),
          "utf8",
        ),
      ).backend.worker.id,
    ).toBe(worker.id);
  });
});
