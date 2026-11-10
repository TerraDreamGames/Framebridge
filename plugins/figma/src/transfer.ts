import { IMAGE_BATCH_LIMITS } from "../../../packages/core/src/image-batches";
import { imageBatchPlan } from "./image-batch-plan";
import {
  bindImage,
  imageBindingIndex,
} from "../../../packages/core/src/image-bindings";
import type {
  AnalysisResult,
  TransferPackage,
} from "../../../packages/core/src/types";
import { validAssetId } from "../../../packages/core/src/geometry";
import { reuseArtwork, type UploadCatalog } from "./asset-catalog";
import { mapConcurrent } from "../../../packages/core/src/concurrency";
import { ArtworkUploadError } from "./upload-diagnostics";
import { robloxAssetName } from "../../../packages/core/src/asset-name";
const CLIENT_REVISION =
  import.meta.env.VITE_FRAMEBRIDGE_CLIENT_REVISION ?? "development";
export const RELAY_URL = (
  import.meta.env.VITE_FRAMEBRIDGE_RELAY_URL ?? ""
).replace(/\/$/, "");
export const PRIVATE_BETA =
  import.meta.env.VITE_FRAMEBRIDGE_PRIVATE_BETA === "1";
import type { CloudSettings } from "./cloud-storage";
export type { CloudSettings } from "./cloud-storage";
type Job = {
  id: string;
  state: "uploading" | "done" | "failed";
  error?: string;
  diagnostics?: unknown;
  pollAfterMs?: number;
  result?: { assetId: string; moderation: string };
};
export class RelayError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly path?: string,
  ) {
    super(message);
  }
}
export async function relayRequest<T>(
  path: string,
  token = "",
  body?: unknown,
  signal?: AbortSignal,
  key?: string,
  method?: string,
  betaAccess?: string,
  accountToken?: string,
): Promise<T> {
  if (!RELAY_URL)
    throw new Error(
      "This build is not connected to a transfer service yet. See the release setup guide.",
    );
  const response = await fetch(`${RELAY_URL}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(35_000)])
      : AbortSignal.timeout(35_000),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "X-Roblox-Api-Key": key } : {}),
      ...(PRIVATE_BETA && betaAccess
        ? { "X-Framebridge-Beta": betaAccess }
        : {}),
      ...(accountToken ? { "X-Framebridge-Roblox-Account": accountToken } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: "omit",
    redirect: "error",
  }).catch((error: unknown) => {
    if (error instanceof TypeError)
      throw new Error(
        RELAY_URL.startsWith("http:")
          ? "Cannot reach the upload helper on this Mac. Start it with npm run relay, then try again."
          : "Cannot reach the upload service. Check your connection and try again.",
      );
    throw error;
  });
  const data = await response.json();
  if (!response.ok)
    throw new RelayError(
      response.status,
      data.error ?? `Connection failed (HTTP ${response.status}).`,
      path,
    );
  return data as T;
}
export function pairStudio(code: string) {
  return relayRequest<{ senderToken: string; expiresAt: number }>(
    "/v1/pair",
    "",
    { code },
  );
}
export function studioSession(token: string) {
  return relayRequest<{ role: "sender" | "receiver"; expiresAt: number }>(
    "/v1/session",
    token,
  );
}
function base64(bytes: number[]) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(binary);
}
const pause = (signal: AbortSignal, milliseconds = 1000) =>
  new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      reject(new DOMException("Transfer cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
  });
export type UploadSession = { uploadToken: string; expiresAt: number };
export function createUploadSession(signal?: AbortSignal, betaAccess?: string) {
  return relayRequest<UploadSession>(
    "/v1/upload-sessions",
    "",
    {},
    signal,
    undefined,
    undefined,
    betaAccess,
  );
}
export function uploadAuthorization(settings: CloudSettings) {
  if (settings.authMode === "roblox") {
    if (settings.authorizationError)
      throw new Error(settings.authorizationError);
    if (!/^[a-f0-9]{64}$/.test(settings.accountToken ?? ""))
      throw new Error("Sign in with Roblox in Images before uploading.");
    if (!/^[1-9]\d{0,19}$/.test(settings.ownerId))
      throw new Error("Choose a Roblox creator for image uploads.");
    return { accountToken: settings.accountToken!, key: undefined };
  }
  if (!settings.key.trim())
    throw new Error(
      "Enter your Roblox API key and creator ID in Images to upload images.",
    );
  if (!/^[1-9]\d{0,19}$/.test(settings.ownerId))
    throw new Error("Choose a Roblox creator for image uploads.");
  return { key: settings.key.trim(), accountToken: undefined };
}
/** Upload without Studio pairing. Commit completed bindings so retries retain progress. */
export async function uploadArtwork(
  result: AnalysisResult,
  token: string,
  settings: CloudSettings,
  signal: AbortSignal,
  progress: (label: string, percent: number) => void,
  isCurrent: () => boolean,
  onCommit: (pkg: TransferPackage) => void = () => {},
  catalog?: UploadCatalog,
): Promise<TransferPackage> {
  const guard = () => {
    signal.throwIfAborted();
    if (!isCurrent())
      throw new Error(
        "Your design changed. Analyze again to upload the latest selection.",
      );
  };
  guard();
  progress("Checking image bytes and saved links…", 1);
  const pkg = await reuseArtwork(result, settings, catalog, guard);
  if (
    catalog &&
    pkg.assets.some((a, i) => a.robloxId !== result.package.assets[i]?.robloxId)
  )
    onCommit(JSON.parse(JSON.stringify(pkg)));
  const plan = await imageBatchPlan(pkg, result.assets, guard);
  const auth: { key?: string; accountToken?: string } = plan.groups.length
    ? uploadAuthorization(settings)
    : {};
  const imageBindings = imageBindingIndex(pkg);
  let completed = 0,
    lastCommit = 0,
    lastCommitAt = Date.now();
  const commit = (force = false) => {
    if (!isCurrent()) return;
    if (
      force ||
      plan.groups.length < 25 ||
      completed - lastCommit >= 25 ||
      Date.now() - lastCommitAt >= 750
    ) {
      onCommit(JSON.parse(JSON.stringify(pkg)));
      lastCommit = completed;
      lastCommitAt = Date.now();
    }
  };
  const describe = () =>
    `Uploading ${completed} of ${plan.groups.length} unique images · ${pkg.assets.filter((a) => a.robloxId).length} of ${plan.totalReferences} references linked`;
  progress(
    `${plan.groups.length} unique uploads · ${plan.duplicates} duplicate references share uploads · ${plan.linked} already linked`,
    5,
  );
  try {
    await mapConcurrent(
      plan.groups,
      IMAGE_BATCH_LIMITS.concurrency,
      async (group) => {
        guard();
        const asset = group.assets[0],
          bytes = group.bytes;
        progress(
          describe(),
          5 + (90 * completed) / Math.max(1, plan.groups.length),
        );
        let job = await relayRequest<Job>(
          "/v1/assets",
          token,
          {
            owner: { kind: settings.ownerType, id: settings.ownerId },
            name: robloxAssetName(asset.name),
            png: base64(bytes),
          },
          signal,
          auth.key,
          undefined,
          undefined,
          auth.accountToken,
        );
        const deadline = Date.now() + 600_000;
        let firstCheck = true;
        while (job.state === "uploading") {
          if (Date.now() > deadline)
            throw new Error(
              "Upload is still processing. Try again in this plugin session to check the same upload without creating another.",
            );
          // Check immediately: many cached or small uploads are already complete.
          if (!firstCheck)
            await pause(
              signal,
              Math.max(1000, Math.min(5000, job.pollAfterMs ?? 1000)),
            );
          firstCheck = false;
          guard();
          job = await relayRequest<Job>(
            `/v1/assets/${job.id}`,
            token,
            undefined,
            signal,
            auth.key,
            undefined,
            undefined,
            auth.accountToken,
          );
        }
        if (job.state !== "done" || !job.result)
          throw new ArtworkUploadError(
            typeof job.error === "string"
              ? job.error
              : `Could not upload ${asset.name}.`,
            job.diagnostics,
            {
              service: RELAY_URL,
              pluginRevision: CLIENT_REVISION,
              authMode: settings.authMode === "roblox" ? "roblox" : "api-key",
              secrets: [settings.key, settings.betaAccess, auth.accountToken],
              image: {
                name: asset.name,
                uploadName: robloxAssetName(asset.name),
                nodeId: asset.nodeId,
              },
            },
          );
        guard();
        const imageId = validAssetId(job.result.assetId);
        if (!imageId)
          throw new Error("Roblox returned an invalid image asset ID.");
        for (const asset of group.assets) {
          asset.robloxId = job.result.assetId;
          bindImage(pkg, asset.id, imageId, imageBindings);
          pkg.issues = pkg.issues.filter(
            (issue) =>
              !(
                (issue.code === "asset-required" ||
                  issue.code === "asset-moderation") &&
                issue.nodeId === asset.nodeId &&
                (issue.code === "asset-required"
                  ? !pkg.assets.some(
                      (a) => a.nodeId === asset.nodeId && !a.robloxId,
                    )
                  : issue.nodeName === asset.name)
              ),
          );
          if (job.result.moderation !== "MODERATION_STATE_APPROVED")
            pkg.issues.push({
              severity: "warning",
              code: "asset-moderation",
              nodeId: asset.nodeId,
              nodeName: asset.name,
              message:
                "Uploaded to Roblox. The image may remain blank until moderation finishes.",
            });
        }
        if (catalog)
          await catalog.remember(
            settings,
            asset,
            bytes,
            job.result.assetId,
            job.result.moderation,
          );
        guard();
        completed++;
        commit();
        progress(
          describe(),
          5 + (90 * completed) / Math.max(1, plan.groups.length),
        );
      },
    );
  } catch (error) {
    commit(true);
    throw error;
  }
  guard();
  if (pkg.assets.every((asset) => asset.robloxId))
    pkg.issues = pkg.issues.filter((issue) => issue.code !== "asset-required");
  onCommit(pkg);
  progress("All images are linked. Ready for Studio.", 100);
  return pkg;
}
export type StudioReceipt = {
  revision: number;
  status: "pending" | "ready" | "queued" | "imported" | "failed" | "superseded";
  message?: string;
};
export async function waitForStudio(
  token: string,
  revision: number,
  signal: AbortSignal,
): Promise<StudioReceipt> {
  const deadline = Date.now() + 30_000;
  while (true) {
    const data = await relayRequest<StudioReceipt & { longPoll?: boolean }>(
      `/v1/receipt?revision=${revision}&wait=15000`,
      token,
      undefined,
      signal,
    );
    const { longPoll, ...receipt } = data;
    if (
      receipt.revision !== revision ||
      ![
        "pending",
        "ready",
        "queued",
        "imported",
        "failed",
        "superseded",
      ].includes(receipt.status)
    )
      throw new Error(
        "Studio returned an invalid delivery confirmation. Check the Studio plugin before sending again.",
      );
    if (receipt.status !== "pending") return receipt;
    if (Date.now() >= deadline)
      throw new Error(
        "Your design was sent, but Studio has not confirmed receipt yet. Open Framebridge in Studio to check it before sending again.",
      );
    if (!longPoll) await pause(signal);
  }
}
export async function sendToStudio(
  result: AnalysisResult,
  token: string,
  settings: CloudSettings,
  signal: AbortSignal,
  progress: (label: string, percent: number) => void,
  isCurrent: () => boolean,
  onCommit?: (pkg: TransferPackage) => void,
  onReceipt?: (receipt: StudioReceipt) => void,
  onPublishing?: () => void,
  catalog?: UploadCatalog,
): Promise<TransferPackage> {
  if (result.package.issues.some((issue) => issue.severity === "error"))
    throw new Error(
      "Resolve the conversion errors in Layers before sending to Studio.",
    );
  const pkg = await uploadArtwork(
    result,
    token,
    settings,
    signal,
    (label, percent) => progress(label, percent * 0.9),
    isCurrent,
    onCommit,
    catalog,
  );
  signal.throwIfAborted();
  if (!isCurrent())
    throw new Error("Your design changed. Analyze again before sending.");
  progress("Sending your UI to Studio…", 95);
  onPublishing?.();
  const sent = await relayRequest<{ revision: number }>(
    "/v1/package",
    token,
    pkg,
    signal,
  );
  if (onReceipt) {
    progress("Waiting for Studio…", 98);
    const receipt = await waitForStudio(token, sent.revision, signal);
    if (receipt.status === "failed")
      throw new Error(
        receipt.message ??
          "Studio could not import this design. Review the Studio plugin.",
      );
    if (receipt.status === "superseded")
      throw new Error(
        "This export was replaced by a newer design sent to Studio.",
      );
    onReceipt(receipt);
  }
  progress("Delivered to Studio.", 100);
  return pkg;
}

export function disconnectStudio(token: string) {
  return relayRequest(
    "/v1/session",
    token,
    undefined,
    undefined,
    undefined,
    "DELETE",
  );
}
