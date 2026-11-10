import { randomBytes } from "node:crypto";
import { chmod, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createCloudArtworkManager } from "../plugins/figma/src/cloud-artwork-manager";
import { createVisionReviewManager } from "../plugins/figma/src/vision-review-manager";
import type { SavedArtworkAccess } from "../plugins/figma/src/artwork-access-storage";
import type { RobloxAccount } from "../plugins/figma/src/roblox-login-api";
import {
  validateVisionRequest,
  type VisionRequest,
} from "../packages/core/src/vision-review";
import type { FeedbackReport } from "../packages/core/src/feedback";
import { batchPng } from "../tests/image-batch-fixtures";
import {
  optionalCredentials,
  optionalDirectory,
  privateDirectory,
  privateJson,
  savePrivate,
  sha256,
} from "./optional-service-files";

const args = process.argv.slice(2),
  command = args[0];
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const requests: {
  path: string;
  method: string;
  status: number;
  elapsedMs: number;
}[] = [];
const exists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};
await privateDirectory();
const credentialsPath = flag("--credentials");
const credentials = credentialsPath
  ? await optionalCredentials(resolve(credentialsPath))
  : undefined;
const origin = credentials?.relayUrl ?? flag("--origin");
if (
  !origin ||
  !/^https:\/\/[^/]+$/.test(origin) ||
  new URL(origin).origin !== origin
)
  throw new Error(
    "Supply the exact private HTTPS --origin or an owner-only --credentials file.",
  );
const request = async (
  path: string,
  token = "",
  grant = "",
  body?: unknown,
  method = "GET",
  signal = AbortSignal.timeout(35_000),
) => {
  const start = performance.now();
  const response = await fetch(origin + path, {
    method,
    redirect: "error",
    credentials: "omit",
    signal,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(grant ? { "X-Framebridge-Artwork-Grant": grant } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(credentials ? { "X-Framebridge-Beta": credentials.betaAccess } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  requests.push({
    path: path.replace(/[a-f0-9]{32,64}/g, ":owned-id"),
    method,
    status: response.status,
    elapsedMs: Math.round(performance.now() - start),
  });
  if (!response.ok && !(response.status === 409 && path === "/v1/artwork/edit"))
    throw new Error(
      "Private service request failed (HTTP " +
        response.status +
        "). Inspect the owner-only journal before retrying.",
    );
  if (response.headers.get("content-type")?.startsWith("image/png")) {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length > 524288)
      throw new Error("Private PNG exceeds the client bound.");
    return data;
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Private service returned invalid JSON.");
  }
};
const checked = (error: string) => {
  if (error)
    throw new Error(
      "The production manager rejected this operation. Inspect the private journal; no automatic retry was performed.",
    );
};
try {
  if (command === "inspect") {
    const health = await request("/health"),
      artwork = await request("/v1/artwork/config"),
      feedback = await request("/v1/feedback/config");
    let vision: unknown = {
      checked: false,
      requiresCurrentRobloxAccount: true,
    };
    if (credentials)
      vision = await request(
        "/v1/vision-review/config",
        credentials.accountToken,
      );
    await savePrivate("live-service-inspection.json", {
      checkedAt: new Date().toISOString(),
      origin,
      health,
      artwork,
      feedback,
      vision,
      requests,
      liveMutations: 0,
    });
    console.log(
      JSON.stringify({
        inspected: true,
        artworkEnabled: artwork.enabled === true,
        feedbackAvailable: feedback.available === true,
        vision,
        liveMutations: 0,
        directory: optionalDirectory,
      }),
    );
  } else {
    if (!credentials)
      throw new Error(
        "Use an owner-only --credentials file; never put capabilities in arguments.",
      );
    const provider = await request("/v1/roblox/config");
    if (provider.available !== true || provider.simulation === true)
      throw new Error(
        "Real provider acceptance requires a live configured Roblox provider.",
      );
    const account = (await request(
      "/v1/roblox/account",
      credentials.accountToken,
    )) as RobloxAccount;
    if (
      !/^[1-9]\d{0,19}$/.test(account.userId) ||
      account.needsAuthorization !== false ||
      !Array.isArray(account.owners)
    )
      throw new Error(
        "A currently authorized real Roblox account is required.",
      );
    if (command === "report") {
      const bundlePath = resolve(
        optionalDirectory,
        "production-feedback-client.mjs",
      );
      await build({
        entryPoints: ["plugins/figma/src/feedback-api.ts"],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: bundlePath,
        define: {
          "import.meta.env.VITE_FRAMEBRIDGE_RELAY_URL": JSON.stringify(origin),
          "import.meta.env.VITE_FRAMEBRIDGE_PRIVATE_BETA": JSON.stringify("1"),
        },
      });
      await chmod(bundlePath, 0o600);
      const client = (await import(
        pathToFileURL(bundlePath).href + "?" + Date.now()
      )) as typeof import("../plugins/figma/src/feedback-api");
      if (!(await client.feedbackConfig(AbortSignal.timeout(35_000))))
        throw new Error("The actual private report collector is disabled.");
      const path = resolve(optionalDirectory, "owned-report-journal.json");
      let journal: {
        token: string;
        origin: string;
        report: FeedbackReport;
        attempted: boolean;
        withdrawn?: boolean;
      };
      if (await exists(path)) {
        journal = (await privateJson(path)) as typeof journal;
        if (journal.origin !== origin || !/^[a-f0-9]{64}$/.test(journal.token))
          throw new Error(
            "The retained report capability belongs to another origin.",
          );
        if (journal.withdrawn)
          throw new Error(
            "This owned report already completed acceptance. Retain its evidence.",
          );
      } else {
        journal = {
          token: randomBytes(32).toString("hex"),
          origin,
          attempted: false,
          report: {
            format: "framebridge-feedback",
            version: 1,
            clientVersion: "private-acceptance",
            category: "other",
            title:
              "Owned private collector acceptance " +
              randomBytes(4).toString("hex"),
            steps:
              "Submit this deliberately owned QA report, inspect it, then withdraw it.",
            expected: "The private report persists until explicitly withdrawn.",
            actual:
              "Acceptance probe; no user design, screenshot, or credentials are included.",
          },
        };
      }
      if (!journal.attempted) {
        journal.attempted = true;
        await savePrivate("owned-report-journal.json", journal); // Survives an uncertain response; never create a replacement.
        await client.submitFeedback(
          journal.token,
          journal.report,
          credentials.betaAccess,
          AbortSignal.timeout(35_000),
        );
      }
      const read = await client.inspectFeedback(
        journal.token,
        AbortSignal.timeout(35_000),
      );
      if (read.report.title !== journal.report.title)
        throw new Error(
          "Private report content does not match this owned test.",
        );
      await client.withdrawFeedback(
        journal.token,
        credentials.betaAccess,
        false,
        AbortSignal.timeout(35_000),
      );
      journal.withdrawn = true;
      await savePrivate("owned-report-journal.json", journal);
      await savePrivate("real-report-result.json", {
        completedAt: new Date().toISOString(),
        origin,
        receipt: read.receipt,
        inspected: true,
        withdrawn: true,
        productionClientSha256: sha256(await readFile(bundlePath)),
        realCollector: true,
        screenshotIncluded: false,
      });
      console.log(
        JSON.stringify({
          realCollector: true,
          inspected: true,
          withdrawn: true,
          directory: optionalDirectory,
        }),
      );
    } else if (command === "ai") {
      const inputPath = flag("--reviewed-request");
      if (!inputPath)
        throw new Error(
          "Supply an owner-only --reviewed-request JSON containing the exact explicitly consented screenshot and metadata.",
        );
      const review = (await privateJson(resolve(inputPath))) as VisionRequest;
      validateVisionRequest(review);
      const markerPath = resolve(
        optionalDirectory,
        "ai-" + review.id + "-attempt.json",
      );
      if (await exists(markerPath))
        throw new Error(
          "This paid review was already attempted. No automatic retry or replacement ID is allowed.",
        );
      const manager = createVisionReviewManager(
        (path, token, body, method, signal) =>
          request("/v1/vision-review" + path, token, "", body, method, signal),
        () => {},
      );
      manager.setContext(
        credentials.accountToken,
        "owned-real-service-acceptance",
      );
      manager.enable(true);
      await manager.configure();
      checked(manager.state.error);
      if (
        manager.state.config?.available !== true ||
        manager.state.config.simulation === true
      )
        throw new Error("The actual AI provider is disabled or simulated.");
      if (
        review.maxCostMicros > 6144 ||
        review.maxCostMicros < (manager.state.config.maxCostMicros ?? Infinity)
      )
        throw new Error(
          "This bounded acceptance allows at most the reviewed 6144 micro-USD reservation.",
        );
      await savePrivate("ai-" + review.id + "-attempt.json", {
        origin,
        requestSha256: sha256(JSON.stringify(review)),
        requestId: review.id,
        attemptedAt: new Date().toISOString(),
        config: manager.state.config,
        automaticRetry: false,
      });
      await manager.review(review);
      checked(manager.state.error);
      if (!manager.state.result)
        throw new Error("No validated provider response was received.");
      await savePrivate("real-ai-result.json", {
        completedAt: new Date().toISOString(),
        origin,
        requestSha256: sha256(JSON.stringify(review)),
        model: manager.state.config?.model,
        result: manager.state.result,
        sourceModified: false,
        requests,
        realProvider: true,
      });
      manager.dispose();
      console.log(
        JSON.stringify({
          realAiProvider: true,
          sourceModified: false,
          directory: optionalDirectory,
        }),
      );
    } else if (command === "artwork" || command === "artwork-cleanup") {
      const scope = flag("--scope");
      if (scope !== "personal" && !/^[1-9]\d{0,19}$/.test(scope ?? ""))
        throw new Error(
          "Choose --scope personal or an explicitly authorized group ID.",
        );
      const kind = scope === "personal" ? "user" : "group",
        ownerId = scope === "personal" ? account.userId : scope!;
      if (
        !account.owners.some(
          (owner) => owner.kind === kind && owner.id === ownerId,
        )
      )
        throw new Error("The current account has not authorized this creator.");
      const suffix = kind + "-" + ownerId;
      const accessName = "artwork-access-" + suffix + ".json";
      const journalName = "artwork-journal-" + suffix + ".json";
      const accessPath = resolve(optionalDirectory, accessName),
        journalPath = resolve(optionalDirectory, journalName);
      const manager = createCloudArtworkManager(
        origin,
        {
          load: async () =>
            (await exists(accessPath)) ? await privateJson(accessPath) : null,
          save: async (value: SavedArtworkAccess | null) =>
            savePrivate(accessName, value),
        },
        (path, token, grant, body, method, signal) =>
          request("/v1/artwork" + path, token, grant, body, method, signal),
        () => {},
      );
      await manager.setAccount({
        userId: account.userId,
        token: credentials.accountToken,
      });
      await manager.restore();
      checked(manager.snapshot().error);
      if (!manager.snapshot().enabled)
        throw new Error("The actual private R2 artwork service is disabled.");
      if (!manager.snapshot().connected) {
        await manager.connect(scope!);
        checked(manager.snapshot().error);
      }
      await manager.fetch();
      checked(manager.snapshot().error);
      type Journal = {
        origin: string;
        scope: string;
        name: string;
        baselineItems: string[];
        folder?: string;
        item?: string;
        uploadAttempted?: boolean;
        completed?: boolean;
        cleaned?: boolean;
      };
      let journal: Journal;
      if (command === "artwork") {
        if (await exists(journalPath))
          throw new Error(
            "The owned artwork journal already exists. Fetch/review it and use artwork-cleanup; do not blindly retry an uncertain upload.",
          );
        journal = {
          origin,
          scope: scope!,
          name: "Owned QA " + randomBytes(8).toString("hex"),
          baselineItems: manager
            .snapshot()
            .snapshot!.items.map((item) => item.id),
        };
        await savePrivate(journalName, journal);
        await manager.edit("create-folder", { name: journal.name });
        checked(manager.snapshot().error);
        journal.folder = manager
          .snapshot()
          .snapshot!.folders.find((folder) => folder.name === journal.name)?.id;
        if (!journal.folder)
          throw new Error("The owned QA folder was not returned.");
        await savePrivate(journalName, journal);
        const png = batchPng(randomBytes(3).readUIntBE(0, 3));
        journal.uploadAttempted = true;
        await savePrivate(journalName, journal);
        await manager.upload({
          name: journal.name,
          folder: journal.folder,
          bytes: png,
        });
        checked(manager.snapshot().error);
        const item = manager
          .snapshot()
          .snapshot!.items.find(
            (image) =>
              image.folder === journal.folder &&
              image.name === journal.name &&
              !journal.baselineItems.includes(image.id),
          );
        if (!item)
          throw new Error(
            "The PNG reused an existing item or ownership is uncertain. No foreign image will be edited/deleted.",
          );
        journal.item = item.id;
        await savePrivate(journalName, journal);
        const downloaded = await manager.download(item.id);
        checked(manager.snapshot().error);
        if (!downloaded || sha256(downloaded.bytes) !== item.sha256)
          throw new Error("Actual R2 download integrity differs.");
        await manager.edit("edit-image", {
          id: item.id,
          name: journal.name + " renamed",
          folder: journal.folder,
        });
        checked(manager.snapshot().error);
        journal.completed = true;
        await savePrivate(journalName, journal);
        await savePrivate("real-artwork-result-" + suffix + ".json", {
          completedAt: new Date().toISOString(),
          origin,
          scope: manager.snapshot().snapshot!.scope,
          upload: true,
          verifiedDownload: true,
          metadataEdit: true,
          pngSha256: item.sha256,
          requests,
          realR2: true,
          cleanupRequired: true,
        });
      } else {
        journal = (await privateJson(journalPath)) as Journal;
        if (journal.origin !== origin || journal.scope !== scope)
          throw new Error("The owned journal belongs to another connection.");
      }
      // Resolve only this unique QA folder after a lost response. Never delete a library or baseline image.
      const current = manager.snapshot().snapshot!;
      const ownedFolder = current.folders.find((folder) =>
        journal.folder
          ? folder.id === journal.folder
          : folder.name === journal.name,
      );
      if (ownedFolder) {
        if (ownedFolder.name !== journal.name)
          throw new Error(
            "The owned QA folder was changed in another session. Review before cleanup.",
          );
        const candidates = current.items.filter(
          (image) =>
            image.folder === ownedFolder.id &&
            !journal.baselineItems.includes(image.id) &&
            (image.name === journal.name ||
              image.name === journal.name + " renamed"),
        );
        for (const item of candidates) {
          await manager.edit("delete-image", { id: item.id });
          checked(manager.snapshot().error);
        }
        await manager.edit("delete-folder", { id: ownedFolder.id });
        checked(manager.snapshot().error);
      }
      await manager.revoke();
      checked(manager.snapshot().error);
      journal.cleaned = true;
      await savePrivate(journalName, journal);
      manager.dispose();
      console.log(
        JSON.stringify({
          realR2: journal.completed === true,
          cleanedOwnedObjects: true,
          scope: kind,
          directory: optionalDirectory,
        }),
      );
    } else
      throw new Error("Use inspect, report, ai, artwork or artwork-cleanup.");
  }
} finally {
  await savePrivate("last-real-optional-requests.json", {
    command,
    origin,
    requests,
  });
}
