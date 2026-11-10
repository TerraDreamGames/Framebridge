import type {
  ReleaseSource,
  BackendProvenance,
} from "../packages/relay/src/release-provenance.mjs";
export const RELEASE_SOURCE_PATHS: string[];
export interface SourceProvenance extends ReleaseSource {
  inputs: Record<string, string>;
}
export function digest(value: string | Uint8Array): string;
export function sourceProvenance(cwd?: string): Promise<SourceProvenance>;
export function compilationProvenance(
  source: ReleaseSource,
): Omit<BackendProvenance, "worker">;
export function workerDeployArgs(source: ReleaseSource): string[];
export function assertUnchangedSource(
  before: ReleaseSource,
  after: ReleaseSource,
): void;
export function fetchMatchingBackend(
  url: string,
  source: ReleaseSource,
  options?: {
    fetchImpl?: typeof fetch;
    expectedWorkerId?: string;
    expectedAccess?: "public" | "private-beta";
  },
): Promise<BackendProvenance>;
export function releaseBuildProvenance(
  files: Record<string, Uint8Array>,
  source: SourceProvenance,
  backend: BackendProvenance,
  access?: "public" | "private-beta",
): {
  schema: 1;
  compatibility: "framebridge-private-release-v1";
  client: { source: SourceProvenance; buildId: string; node: string };
  backend: BackendProvenance;
  sha256: Record<string, string>;
};
