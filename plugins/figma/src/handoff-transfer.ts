import type { TransferPackage } from "../../../packages/core/src/types";
import { relayRequest } from "./transfer";
export type HandoffSummary = {
  code: string;
  name: string;
  expiresAt: number;
  receipts: {
    status: "opened" | "ready" | "queued" | "imported" | "failed";
    at: number;
    message?: string;
  }[];
};
export const handoffCapability = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
export function createHandoff(
  uploadToken: string,
  pkg: TransferPackage,
  ownerToken: string,
  ttlMinutes: 60 | 1440,
  signal: AbortSignal,
) {
  return relayRequest<Omit<HandoffSummary, "receipts">>(
    "/v1/handoffs",
    uploadToken,
    { package: pkg, ownerToken, ttlMinutes },
    signal,
  );
}
export function inspectHandoff(ownerToken: string, signal?: AbortSignal) {
  return relayRequest<HandoffSummary>(
    "/v1/handoff",
    ownerToken,
    undefined,
    signal,
  );
}
export function revokeHandoff(ownerToken: string, signal?: AbortSignal) {
  return relayRequest<{ ok: boolean }>(
    "/v1/handoff",
    ownerToken,
    undefined,
    signal,
    undefined,
    "DELETE",
  );
}
