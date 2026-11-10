import type { ConnectionState, StudioConnection } from "./studio-connection";
import type { UploadSession } from "./transfer";

export type UploadAccess =
  | { kind: "paired"; token: string }
  | { kind: "standalone"; token: string; session: UploadSession };

export class UploadConnectionError extends Error {}

export function uploadConnectionProblem(
  state: ConnectionState,
  now = Date.now(),
): string | undefined {
  if (state.restoring || state.retry)
    return "Check your saved Studio connection before uploading.";
  if (state.connection && state.connection.expiresAt <= now)
    return "Your Studio connection expired. Enter a new code to reconnect.";
}

/** Keep an upload on the connection that was validated when it started. */
export function guardUploadConnection(
  read: () => ConnectionState,
  now = Date.now,
): () => StudioConnection | undefined {
  const checked = () => {
    const state = read();
    const problem = uploadConnectionProblem(state, now());
    if (problem) throw new UploadConnectionError(problem);
    return state.connection;
  };
  const initial = checked();
  return () => {
    const current = checked();
    if (current?.senderToken !== initial?.senderToken)
      throw new UploadConnectionError(
        "Your Studio connection changed. Upload again to use the current connection.",
      );
    return current;
  };
}

export async function selectUploadAccess(
  connection: () => StudioConnection | undefined,
  cached: UploadSession | null,
  create: () => Promise<UploadSession>,
  now = Date.now,
): Promise<UploadAccess> {
  const paired = connection();
  if (paired) return { kind: "paired", token: paired.senderToken };
  const session = cached && cached.expiresAt > now() ? cached : await create();
  connection();
  if (session.expiresAt <= now())
    throw new Error(
      "Your image upload session expired. Upload again to continue.",
    );
  return { kind: "standalone", token: session.uploadToken, session };
}

export function recoverUnauthorizedUpload(
  access: UploadAccess | undefined,
  restorePairing: () => void,
  clearStandalone: () => void,
) {
  if (access?.kind === "paired") restorePairing();
  else clearStandalone();
}
