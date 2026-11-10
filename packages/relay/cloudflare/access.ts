import { createHash } from "node:crypto";

export interface AccessEnvironment {
  ACCESS_MODE?: string;
  BETA_ACCESS_HASHES?: string;
}
export const publicAccess = (env: AccessEnvironment) =>
  env.ACCESS_MODE === "public";
export const invitations = (env: AccessEnvironment) =>
  (env.BETA_ACCESS_HASHES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[a-f0-9]{64}$/.test(value));
export const activeAccess = (env: AccessEnvironment, identity: string) =>
  (publicAccess(env) && /^public:[a-f0-9]{64}$/.test(identity)) ||
  invitations(env).includes(identity);

// Cloudflare supplies this address. Only its hash is retained for anonymous
// usage limits; connection/account capabilities authorize all private data.
export const clientIdentity = (request: Request) =>
  createHash("sha256")
    .update(
      "framebridge-client-v1:" +
        (request.headers.get("CF-Connecting-IP") ?? "unknown"),
    )
    .digest("hex");
export const publicIdentity = (request: Request) =>
  "public:" + clientIdentity(request);
