// Shared by the Worker and private release tooling. Increment when this contract
// changes; runtime/build input hashes provide the stricter source compatibility.
export const PRIVATE_RELEASE_SCHEMA = 1;
export const PRIVATE_RELEASE_CONTRACT = "framebridge-private-release-v1";
const sha256 = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const revision = (value) =>
  typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);

export function releaseSource(value) {
  if (!value || !revision(value.revision) || !sha256(value.sha256)) return null;
  return { revision: value.revision, sha256: value.sha256 };
}

export function workerIdentity(value) {
  if (
    !value ||
    typeof value.id !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.id) ||
    value.id === "00000000-0000-0000-0000-000000000000" ||
    typeof value.timestamp !== "string" ||
    value.timestamp.length > 64 ||
    !Number.isFinite(Date.parse(value.timestamp)) ||
    typeof value.tag !== "string" ||
    value.tag.length > 256
  )
    return null;
  return { id: value.id, tag: value.tag, timestamp: value.timestamp };
}

export function workerReleaseProvenance(compiled, metadata) {
  if (
    compiled?.schema !== PRIVATE_RELEASE_SCHEMA ||
    compiled.compatibility !== PRIVATE_RELEASE_CONTRACT
  )
    return null;
  const source = releaseSource(compiled.source);
  if (!source) return null;
  return {
    schema: PRIVATE_RELEASE_SCHEMA,
    compatibility: PRIVATE_RELEASE_CONTRACT,
    source,
    worker: workerIdentity(metadata),
  };
}

export function assertMatchingBackend(
  health,
  expectedSource,
  expectedWorkerId,
  expectedAccess = "private-beta",
) {
  if (
    health?.ok !== true ||
    !["public", "private-beta"].includes(expectedAccess) ||
    health.access !== expectedAccess ||
    health.configured !== true
  )
    throw new Error(
      "Backend is not healthy or its access mode does not match the release.",
    );
  const expected = releaseSource(expectedSource);
  if (!expected) throw new Error("Invalid local release source provenance.");
  const provenance = health.provenance;
  if (
    provenance?.schema !== PRIVATE_RELEASE_SCHEMA ||
    provenance.compatibility !== PRIVATE_RELEASE_CONTRACT
  )
    throw new Error(
      "Backend release provenance is missing or incompatible. Deploy the reviewed source with beta:deploy before beta:release.",
    );
  const source = releaseSource(provenance.source),
    worker = workerIdentity(provenance.worker);
  if (!source || !worker)
    throw new Error(
      "Backend source or Cloudflare Worker revision is unidentified. Deploy with beta:deploy before beta:release.",
    );
  // Commits may differ after documentation-only changes. Only the actual
  // runtime/build input fingerprint establishes source compatibility.
  if (source.sha256 !== expected.sha256)
    throw new Error(
      "Backend runtime/build source does not match these plugins. Deploy the reviewed source with beta:deploy before beta:release.",
    );
  if (expectedWorkerId && worker.id !== expectedWorkerId)
    throw new Error(
      "Backend Worker revision changed during the release build. Retry after the deployment is stable.",
    );
  return {
    schema: PRIVATE_RELEASE_SCHEMA,
    compatibility: PRIVATE_RELEASE_CONTRACT,
    source,
    worker,
  };
}
