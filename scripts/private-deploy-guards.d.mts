export function validateInvitations(value: unknown): Record<string, string>;
export function readDeployInvitations(
  directory: string,
): Promise<Record<string, string>>;
export function assertUnchangedInvitations(
  before: Record<string, string>,
  after: Record<string, string>,
): void;
export function workerExistsFromWrangler(
  result: {
    error?: unknown;
    status: number | null;
    stdout?: string | null;
    stderr?: string | null;
  },
  accountId: string,
  workerName: string,
): boolean;
