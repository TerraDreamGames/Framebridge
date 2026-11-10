/** The Figma account-library build exports locally; the hosted relay is a separate deployment. */
import type { CloudSettings } from "./transfer";
export type { CloudSettings, UploadSession } from "./transfer";
export const RELAY_URL = "";
export const PRIVATE_BETA = false;
export class RelayError extends Error {
  constructor(
    public status: number,
    message: string,
    public readonly path?: string,
  ) {
    super(message);
  }
}
const unavailable = () =>
  new Error(
    "Use Export for Studio in this browser plugin. Direct transfer requires the hosted Framebridge build.",
  );
export async function relayRequest<T>(..._args: unknown[]): Promise<T> {
  throw unavailable();
}
export async function pairStudio(
  _code: string,
): Promise<{ senderToken: string; expiresAt: number }> {
  throw unavailable();
}
export async function disconnectStudio(_token: string): Promise<unknown> {
  throw unavailable();
}
export async function studioSession(
  _token: string,
): Promise<{ role: string; expiresAt: number }> {
  throw unavailable();
}
export async function sendToStudio(..._args: unknown[]): Promise<never> {
  throw unavailable();
}

export async function createUploadSession(..._args: unknown[]): Promise<never> {
  throw unavailable();
}
export async function uploadArtwork(..._args: unknown[]): Promise<never> {
  throw unavailable();
}
export function uploadAuthorization(_settings: CloudSettings): never {
  throw unavailable();
}
