import { createHash } from "node:crypto";
import { robloxAssetName } from "../../core/src/asset-name";
export type Owner = { kind: "user" | "group"; id: string };
export type Upload = { owner: Owner; name: string; png: string };
export type Uploaded = { assetId: string; moderation: string };
export class PublicError extends Error {
  constructor(
    message: string,
    public status = 400,
    public readonly rejectedCreate = false,
    public readonly providerStatus?: number,
  ) {
    super(message);
  }
}
export function validateUpload(input: Upload) {
  if (
    !input ||
    !["user", "group"].includes(input.owner?.kind) ||
    typeof input.owner?.id !== "string" ||
    !/^[1-9]\d{0,19}$/.test(input.owner?.id)
  )
    throw new PublicError(
      "Choose a Roblox user or group and enter its numeric ID.",
    );
  if (typeof input.name !== "string" || input.name.length > 100)
    throw new PublicError(
      "Image names must be text of at most 100 characters.",
    );
  if (
    typeof input.png !== "string" ||
    input.png.length > 28_000_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.png)
  )
    throw new PublicError("Invalid PNG data.");
  const bytes = Buffer.from(input.png, "base64");
  if (
    bytes.length < 33 ||
    bytes.length > 20_000_000 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new PublicError("Upload a PNG image smaller than 20 MB.");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096)
    throw new PublicError(
      "Images must be between 1 and 4096 pixels on each edge.",
    );
  let offset = 8,
    hasPixels = false,
    ended = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length)
      throw new PublicError("The PNG is truncated.");
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new PublicError("The PNG is truncated.");
    const kind = bytes.toString("ascii", offset + 4, offset + 8);
    if (offset === 8 && (kind !== "IHDR" || length !== 13))
      throw new PublicError("Invalid PNG header.");
    if (offset > 8 && kind === "IHDR")
      throw new PublicError("Duplicate PNG header.");
    if (
      crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)
    )
      throw new PublicError(
        "The PNG checksum is invalid. Render the artwork again before uploading.",
      );
    if (kind === "IDAT") hasPixels = true;
    if (kind === "IEND") {
      if (length !== 0 || end !== bytes.length)
        throw new PublicError("Invalid PNG end marker.");
      ended = true;
    }
    offset = end;
  }
  if (!hasPixels || !ended) throw new PublicError("The PNG is incomplete.");
  return bytes;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
export function uploadKey(input: Upload, bytes: Buffer, key: string) {
  // Scope reuse to the credential and creator; do not expose credential hashes.
  return createHash("sha256")
    .update(key)
    .update("\0")
    .update(JSON.stringify(input.owner))
    .update(bytes)
    .digest("hex");
}
export function legacyUploadRejection(message?: string) {
  return (
    message ===
      "Roblox rejected the upload request (HTTP 400). Check asset permissions and Creator Dashboard." ||
    message ===
      "Roblox rejected the upload request (HTTP 422). Check asset permissions and Creator Dashboard."
  );
}
export function retryableUploadFailure(job: {
  state: string;
  operation?: string;
  result?: unknown;
  retryable?: boolean;
  error?: string;
}) {
  if (job.state !== "failed" || job.operation || job.result !== undefined)
    return false;
  // Older releases stored only the message. Migrate only the exact validation
  // rejection; timeouts, failed polls and successful/uncertain creates stay put.
  return job.retryable === true || legacyUploadRejection(job.error);
}
const API = "https://apis.roblox.com/assets/v1/";
export type RobloxCredential = string | { oauthToken: string };
const credentialHeaders = (
  credential: RobloxCredential,
): Record<string, string> =>
  typeof credential === "string"
    ? { "x-api-key": credential }
    : { Authorization: "Bearer " + credential.oauthToken };
export async function createImageOperation(
  input: Upload,
  bytes: Buffer,
  key: RobloxCredential,
  request: typeof fetch = fetch,
): Promise<string> {
  const form = new FormData();
  form.append(
    "request",
    JSON.stringify({
      assetType: "Image",
      displayName: robloxAssetName(input.name),
      description: "UI artwork exported with Framebridge",
      creationContext: {
        creator: {
          [input.owner.kind === "group" ? "groupId" : "userId"]: input.owner.id,
        },
      },
    }),
  );
  form.append(
    "fileContent",
    new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    "artwork.png",
  );
  let created: Response;
  try {
    created = await request(`${API}assets`, {
      method: "POST",
      headers: credentialHeaders(key),
      body: form,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // No blind retries of an irreversible create: a timeout may follow a successful upload.
    throw new PublicError(
      "Upload response was lost. Check Creator Dashboard before sending again; Framebridge will not create a duplicate automatically.",
      502,
    );
  }
  if (!created.ok) throw await responseError(created, key, true);
  const operation = (await created.json()) as { path?: string };
  if (!operation.path || !/^operations\/[A-Za-z0-9_-]+$/.test(operation.path))
    throw new PublicError(
      "Roblox returned an unexpected upload operation. Check Creator Dashboard.",
      502,
    );
  return operation.path;
}
export async function readImageOperation(
  path: string,
  key: RobloxCredential,
  request: typeof fetch = fetch,
): Promise<Uploaded | undefined> {
  if (!/^operations\/[A-Za-z0-9_-]+$/.test(path))
    throw new PublicError("Invalid upload operation.");
  let response: Response;
  try {
    response = await request(`${API}${path}`, {
      headers: credentialHeaders(key),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return undefined;
  }
  if (response.status === 429 || response.status >= 500) return undefined;
  if (!response.ok) throw await responseError(response, key);
  const status = (await response.json()) as {
    done?: boolean;
    error?: unknown;
    response?: {
      assetId?: string;
      assetType?: string;
      moderationResult?: { moderationState?: string };
    };
  };
  if (status.error)
    throw new PublicError(
      "Roblox could not process this image. Check its status in Creator Dashboard.",
      422,
    );
  if (!status.done) return undefined;
  const result = status.response;
  if (
    !result ||
    !/^[1-9]\d{0,19}$/.test(String(result.assetId)) ||
    !["Image", "ASSET_TYPE_IMAGE"].includes(result.assetType ?? "")
  )
    throw new PublicError(
      "Roblox did not return a usable Image asset. A Decal ID cannot be substituted for an Image ID.",
      502,
    );
  // Live v1 responses use TitleCase states; some documented responses use enum names.
  const state = (result.moderationResult?.moderationState ?? "Unknown")
    .replace(/^MODERATION_STATE_/i, "")
    .toUpperCase();
  const moderation = `MODERATION_STATE_${state}`;
  if (state === "REJECTED")
    throw new PublicError(
      "Roblox rejected this image during moderation. Review it in Creator Dashboard.",
      422,
    );
  return { assetId: String(result.assetId), moderation };
}
export async function uploadImage(
  input: Upload,
  bytes: Buffer,
  key: string,
  deps: {
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    polls?: number;
  } = {},
): Promise<Uploaded> {
  const request = deps.fetch ?? fetch;
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const path = await createImageOperation(input, bytes, key, request);
  for (let i = 0; i < (deps.polls ?? 90); i++) {
    await sleep(Math.min(1000 + i * 200, 3000));
    const result = await readImageOperation(path, key, request);
    if (result) return result;
  }

  throw new PublicError(
    "Roblox is still processing the upload. Check Creator Dashboard; no duplicate will be uploaded automatically.",
    504,
  );
}
const errorBodyLimit = 8192;
async function responseError(
  response: Response,
  credential: RobloxCredential,
  create = false,
) {
  // Provider validation errors vary between v1, gateway and field-validation
  // formats. Read only a bounded body, and never expose request/auth payloads.
  let reason = "";
  if ([400, 422].includes(response.status) && response.body) {
    const reader = response.body.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Error body timed out")),
          2000,
        );
      });
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { value, done } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        total += value.length;
        if (total > errorBodyLimit) throw new Error("Error body too large");
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      reason = rejectionReason(
        JSON.parse(new TextDecoder().decode(bytes)),
        typeof credential === "string" ? credential : credential.oauthToken,
      );
    } catch {
      // An unreadable diagnostic must not mask the original HTTP failure.
    } finally {
      clearTimeout(timer);
      void reader.cancel().catch(() => {});
    }
  }
  const error = cloudError(
    response.status,
    typeof credential !== "string",
    reason,
  );
  return new PublicError(
    error.message,
    error.status,
    create && [400, 422].includes(response.status),
    response.status,
  );
}
function rejectionReason(body: unknown, credential: string): string {
  if (!body || typeof body !== "object") return "";
  const value = body as Record<string, unknown>;
  const messages: string[] = [];
  const add = (message: unknown, field = "") => {
    if (typeof message !== "string" || !message.trim()) return;
    // Redact before truncating, including a credential crossing the boundary.
    let safe = message.slice(0, errorBodyLimit);
    if (credential) safe = safe.split(credential).join("[redacted]");
    safe = safe
      .replace(/https?:\/\/\S+/gi, "[link omitted]")
      .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/[A-Za-z0-9+/_=.-]{24,}/g, "[redacted]")
      .replace(
        /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    if (safe && !messages.includes(field + safe)) messages.push(field + safe);
  };
  add(value.message);
  if (value.error && typeof value.error === "object")
    add((value.error as Record<string, unknown>).message);
  if (Array.isArray(value.errors)) {
    for (const error of value.errors.slice(0, 3))
      if (error && typeof error === "object") add(error.message);
  } else if (value.errors && typeof value.errors === "object") {
    const fields = [
      "displayName",
      "description",
      "fileContent",
      "assetType",
      "creationContext",
      "creator",
      "userId",
      "groupId",
    ];
    for (const [field, errors] of Object.entries(value.errors).slice(0, 20)) {
      const label = fields.find((name) => field.split(".").includes(name));
      if (!label || !Array.isArray(errors)) continue;
      for (const error of errors.slice(0, 2)) add(error, label + ": ");
    }
  }
  if (!messages.length) add(value.title);
  if (!messages.length) add(value.error);
  return messages.slice(0, 3).join("; ").slice(0, 500);
}
function cloudError(status: number, oauth = false, reason = "") {
  const message =
    status === 401
      ? oauth
        ? "Your Roblox authorization ended. Sign in again."
        : "The Roblox API key is invalid or expired."
      : status === 403
        ? oauth
          ? "Roblox did not permit image access for this creator. Sign in again and approve the creator, or choose API-key uploads."
          : "The key needs Assets read/write permission for the selected creator. Check its IP restrictions too."
        : status === 429
          ? "Roblox's upload limit was reached. Try again after the quota resets."
          : [400, 422].includes(status)
            ? `Roblox rejected this image upload (HTTP ${status}). ${reason ? "Roblox reason: " + reason : "Check the image, name and selected creator in Creator Dashboard."}`
            : `Roblox rejected the upload request (HTTP ${status}). Check asset permissions and Creator Dashboard.`;
  return new PublicError(
    message,
    status === 401 || status === 403 ? status : 502,
  );
}
