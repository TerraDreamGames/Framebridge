export const PRIVATE_RELEASE_SCHEMA: 1;
export const PRIVATE_RELEASE_CONTRACT: "framebridge-private-release-v1";
export interface ReleaseSource {
  revision: string;
  sha256: string;
}
export interface WorkerIdentity {
  id: string;
  tag: string;
  timestamp: string;
}
export interface BackendProvenance {
  schema: 1;
  compatibility: "framebridge-private-release-v1";
  source: ReleaseSource;
  worker: WorkerIdentity;
}
export function releaseSource(value: unknown): ReleaseSource | null;
export function workerIdentity(value: unknown): WorkerIdentity | null;
export function workerReleaseProvenance(
  compiled: unknown,
  metadata: unknown,
):
  | (Omit<BackendProvenance, "worker"> & { worker: WorkerIdentity | null })
  | null;
export function assertMatchingBackend(
  health: unknown,
  expectedSource: unknown,
  expectedWorkerId?: string,
  expectedAccess?: "public" | "private-beta",
): BackendProvenance;
