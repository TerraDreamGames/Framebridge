import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  PRIVATE_RELEASE_SCHEMA,
  PRIVATE_RELEASE_CONTRACT,
  assertMatchingBackend,
  releaseSource,
} from "../packages/relay/src/release-provenance.mjs";

// Documentation/examples are checksummed in the bundle, but cannot change
// backend compatibility. Include future build/release helpers automatically.
export const RELEASE_SOURCE_PATHS = [
  "packages",
  "plugins",
  "scripts/*.mjs",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  "components.json",
  "framebridge.config.json",
  "wrangler*.jsonc",
];
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0)
    throw new Error("Could not inspect Git source provenance.");
  return result.stdout;
}
export async function sourceProvenance(cwd = process.cwd()) {
  const revision = git(cwd, ["rev-parse", "HEAD"]).trim();
  const dirty = git(cwd, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    ...RELEASE_SOURCE_PATHS,
  ]);
  if (dirty)
    throw new Error(
      "Runtime/build source has uncommitted changes. Commit reviewed source before beta:deploy or beta:release; local development builds remain available.",
    );
  const paths = git(cwd, ["ls-files", "-z", "--", ...RELEASE_SOURCE_PATHS])
    .split("\0")
    .filter(Boolean)
    .sort();
  if (
    !paths.includes("packages/relay/cloudflare/worker.ts") ||
    !paths.includes("scripts/build.mjs")
  )
    throw new Error("Release source inputs are incomplete.");
  const inputs = {};
  for (const path of paths) {
    const full = resolve(cwd, path);
    if (!(await lstat(full)).isFile())
      throw new Error("Release source inputs must be regular files.");
    inputs[path] = digest(await readFile(full));
  }
  return { revision, sha256: digest(JSON.stringify(inputs)), inputs };
}
export function compilationProvenance(source) {
  const normalized = releaseSource(source);
  if (!normalized) throw new Error("Invalid release source provenance.");
  return {
    schema: PRIVATE_RELEASE_SCHEMA,
    compatibility: PRIVATE_RELEASE_CONTRACT,
    source: normalized,
  };
}
export function workerDeployArgs(source) {
  return [
    "deploy",
    "--define",
    "__FRAMEBRIDGE_RELEASE_PROVENANCE__:" +
      JSON.stringify(compilationProvenance(source)),
    "--tag",
    "framebridge-" + source.sha256.slice(0, 12),
  ];
}
export function assertUnchangedSource(before, after) {
  if (before.sha256 !== after.sha256)
    throw new Error(
      "Runtime/build source changed during the release operation. Rebuild from stable reviewed source.",
    );
}
export async function fetchMatchingBackend(
  url,
  source,
  { fetchImpl = fetch, expectedWorkerId, expectedAccess = "private-beta" } = {},
) {
  const response = await fetchImpl(url + "/health", {
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error("Backend is not healthy or has no tester invitations.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Backend release health response is missing.");
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16_384)
        throw new Error("Backend release health response is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  let health;
  try {
    health = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Backend release health response is invalid.");
  }
  return assertMatchingBackend(
    health,
    source,
    expectedWorkerId,
    expectedAccess,
  );
}
export function releaseBuildProvenance(
  files,
  source,
  backend,
  access = "private-beta",
) {
  assertMatchingBackend(
    { ok: true, access, configured: true, provenance: backend },
    source,
    undefined,
    access,
  );
  const sha256 = Object.fromEntries(
    Object.keys(files)
      .sort()
      .map((path) => [path, digest(files[path])]),
  );
  return {
    schema: PRIVATE_RELEASE_SCHEMA,
    compatibility: PRIVATE_RELEASE_CONTRACT,
    client: {
      source,
      buildId: digest(JSON.stringify(sha256)),
      node: process.version,
    },
    backend,
    sha256,
  };
}
