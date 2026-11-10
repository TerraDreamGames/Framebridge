import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { imageBatchFixture, batchPng } from "../tests/image-batch-fixtures";
import { createAssetCatalog } from "../plugins/figma/src/asset-catalog";
import { imageBatchPlan } from "../plugins/figma/src/image-batch-plan";
import {
  flatten,
  type AnalysisResult,
  type TransferPackage,
} from "../packages/core/src/types";
import { validatePackage } from "../packages/relay/src/protocol";
import type { CloudSettings } from "../plugins/figma/src/cloud-storage";
import type { RobloxAccount } from "../plugins/figma/src/roblox-login-api";
import type { UploadSession } from "../plugins/figma/src/transfer";
import { providerRefreshObservation } from "./provider-refresh-evidence";
import { readProviderRefreshDiagnostics } from "../packages/core/src/provider-refresh";

type Credentials = {
  relayUrl: string;
  betaAccess: string;
  accountToken: string;
};
type State = UploadSession & { relayUrl: string; owner: string };
const directory = resolve(".artifacts/real-provider-acceptance");
const sha = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const exists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};
async function save(name: string, value: unknown) {
  const path = `${directory}/${name}`;
  await writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  await chmod(path, 0o600);
}
async function secretFile(path: string) {
  const info = await stat(path);
  if (
    !info.isFile() ||
    (info.mode & 0o077) !== 0 ||
    info.uid !== process.getuid?.()
  )
    throw new Error(
      "The credentials file must be owned by this user with mode 600.",
    );
  let value: Credentials;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("The owner-only credentials file is not valid JSON.");
  }
  let url: URL;
  try {
    url = new URL(value.relayUrl);
  } catch {
    throw new Error("Credentials need the exact private HTTPS relay origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== value.relayUrl ||
    url.username ||
    url.password ||
    !/^[a-f0-9]{64}$/.test(value.accountToken) ||
    !/^[a-f0-9]{64}$/.test(value.betaAccess)
  )
    throw new Error(
      "Credentials need a HTTPS relay origin and current invitation/account capabilities.",
    );
  return value;
}
const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
if (command === "prepare") {
  if (await exists(`${directory}/fixture.json`))
    throw new Error(
      "The prepared fixture exists. Retain its PNG identity for resumable uploads.",
    );
  const fixture = imageBatchFixture(2, 1000);
  const seed = randomBytes(3).readUIntBE(0, 3);
  for (const [i, asset] of fixture.package.assets.entries())
    fixture.assets[asset.id] = Array.from(
      batchPng((seed + (i % 2)) & 0xffffff),
    );
  fixture.package.sourceId =
    "framebridge-real-provider-batch-" + randomBytes(8).toString("hex");
  fixture.package.createdAt = new Date().toISOString();
  const plan = await imageBatchPlan(fixture.package, fixture.assets, () => {});
  if (plan.groups.length !== 2 || plan.totalReferences !== 1000)
    throw new Error("Prepared batch grouping differs.");
  await save("fixture.json", fixture);
  await save("prepared.json", {
    preparedAt: new Date().toISOString(),
    sourceId: fixture.package.sourceId,
    references: plan.totalReferences,
    uniquePngs: plan.groups.length,
    pngs: plan.groups.map((g) => ({
      bytes: g.bytes.length,
      sha256: sha(new Uint8Array(g.bytes)),
    })),
    liveUploads: 0,
    providerValidation: false,
  });
  console.log(
    JSON.stringify({
      prepared: true,
      references: 1000,
      uniquePngs: 2,
      liveUploads: 0,
      directory,
    }),
  );
} else if (command === "run" || command === "status") {
  const credentialPath = flag("--credentials");
  if (!credentialPath)
    throw new Error(
      "Supply --credentials with an existing owner-only JSON file. Never supply secrets as arguments.",
    );
  const credentials = await secretFile(resolve(credentialPath));
  const owner = flag("--owner");
  if (command === "run" && !/^(user|group):[1-9]\d{0,19}$/.test(owner ?? ""))
    throw new Error(
      "Supply --owner user:<id> or group:<id> after approving that creator on Roblox.",
    );
  const response = await fetch(credentials.relayUrl + "/v1/roblox/config", {
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok)
    throw new Error("Private Roblox configuration is unavailable.");
  const config = (await response.json()) as {
    available?: boolean;
    simulation?: boolean;
  };
  if (config.available !== true || config.simulation === true)
    throw new Error(
      "This runner requires the real configured Roblox provider.",
    );
  const healthResponse = await fetch(credentials.relayUrl + "/health", {
    redirect: "error",
    signal: AbortSignal.timeout(35_000),
  });
  if (!healthResponse.ok)
    throw new Error("Private backend health cannot be established.");
  const health = (await healthResponse.json()) as unknown;
  // Bundle the production browser client with only its build-time origin flags.
  // Fetch remains the real process fetch; no provider interception is installed.
  const bundlePath = `${directory}/production-client.mjs`;
  await build({
    entryPoints: ["plugins/figma/src/transfer.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundlePath,
    define: {
      "import.meta.env.VITE_FRAMEBRIDGE_RELAY_URL": JSON.stringify(
        credentials.relayUrl,
      ),
      "import.meta.env.VITE_FRAMEBRIDGE_PRIVATE_BETA": JSON.stringify("1"),
    },
  });
  await chmod(bundlePath, 0o600);
  const client = (await import(
    pathToFileURL(bundlePath).href + "?" + Date.now()
  )) as typeof import("../plugins/figma/src/transfer");
  const inspect = async () => {
    const account = await client.relayRequest<RobloxAccount>(
      "/v1/roblox/account",
      credentials.accountToken,
    );
    if (
      !account ||
      typeof account.needsAuthorization !== "boolean" ||
      !Number.isSafeInteger(account.expiresAt) ||
      !Array.isArray(account.owners)
    )
      throw new Error("Invalid account inspection response.");
    readProviderRefreshDiagnostics(account);
    return account;
  };
  const before = await inspect();
  if (command === "status") {
    await save("account-status.json", {
      checkedAt: new Date().toISOString(),
      health,
      account: before,
    });
    console.log(
      JSON.stringify({
        checked: true,
        needsAuthorization: before.needsAuthorization,
        expiresAt: before.expiresAt,
        ...readProviderRefreshDiagnostics(before),
        owners: before.owners,
      }),
    );
  } else {
    if (before.needsAuthorization)
      throw new Error(
        "The saved Roblox grant is not current. Authorize the real provider first.",
      );
    const [ownerType, ownerId] = owner!.split(":") as [
      "user" | "group",
      string,
    ];
    if (!before.owners.some((o) => o.kind === ownerType && o.id === ownerId))
      throw new Error(
        "This creator is absent from the current provider-approved account.",
      );
    const key = owner!.replace(":", "-");
    const fixture: AnalysisResult = JSON.parse(
      await readFile(`${directory}/fixture.json`, "utf8"),
    );
    const linkedPath = `${directory}/${key}-linked.framebridge.json`;
    if (await exists(linkedPath))
      fixture.package = JSON.parse(await readFile(linkedPath, "utf8"));
    let writes = Promise.resolve();
    const queue = (name: string, value: unknown) => {
      writes = writes.then(() => save(name, value));
      return writes;
    };
    const catalogPath = `${directory}/${key}-catalog.json`;
    const catalog = createAssetCatalog({
      load: async () =>
        (await exists(catalogPath))
          ? JSON.parse(await readFile(catalogPath, "utf8"))
          : [],
      save: (entries) => queue(`${key}-catalog.json`, entries),
    });
    const settings: CloudSettings = {
      key: "",
      ownerType,
      ownerId,
      authMode: "roblox",
      accountToken: credentials.accountToken,
    };
    const statePath = `${directory}/${key}-session.json`;
    let state: State | undefined = (await exists(statePath))
      ? JSON.parse(await readFile(statePath, "utf8"))
      : undefined;
    if (
      state &&
      (state.relayUrl !== credentials.relayUrl || state.owner !== owner)
    )
      throw new Error(
        "Retained upload session belongs to another relay or owner.",
      );
    const unlinked = fixture.package.assets.some((a) => !a.robloxId);
    if (unlinked && state && state.expiresAt <= Date.now())
      throw new Error(
        "The prior upload session ended with unlinked artwork. Inspect Creator Dashboard before preparing another upload; this runner never blindly creates a replacement.",
      );
    if (!state && unlinked) {
      const created = await client.createUploadSession(
        undefined,
        credentials.betaAccess,
      );
      state = { ...created, relayUrl: credentials.relayUrl, owner: owner! };
      await save(`${key}-session.json`, state);
    }
    const requests: {
      path: string;
      method: string;
      status?: number;
      elapsedMs?: number;
    }[] = [];
    const actualFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      if (url.origin !== credentials.relayUrl)
        throw new Error("Upload client attempted an unexpected origin.");
      const event = {
        path: url.pathname,
        method: init?.method ?? "GET",
        status: undefined as number | undefined,
        elapsedMs: undefined as number | undefined,
      };
      requests.push(event);
      const started = performance.now();
      try {
        const res = await actualFetch(input, init);
        event.status = res.status;
        return res;
      } finally {
        event.elapsedMs = Math.round((performance.now() - started) * 100) / 100;
      }
    };
    const started = performance.now();
    let result: TransferPackage | undefined;
    let succeeded = false;
    try {
      const requestStartedAt = Date.now();
      result = await client.uploadArtwork(
        fixture,
        state?.uploadToken ?? "",
        settings,
        new AbortController().signal,
        () => {},
        () => true,
        (pkg) => {
          void queue(`${key}-linked.framebridge.json`, pkg);
        },
        catalog,
      );
      await writes;
      validatePackage(result);
      const byId = new Map(
        result.assets.map((a) => [a.id, "rbxassetid://" + a.robloxId]),
      );
      if (
        result.assets.length !== 1000 ||
        result.assets.some((a) => !/^[1-9]\d{0,19}$/.test(a.robloxId ?? ""))
      )
        throw new Error("Provider result did not link every reference.");
      for (const node of flatten(result.roots))
        if (node.assetRef && node.properties.Image !== byId.get(node.assetRef))
          throw new Error("Native image binding differs from provider result.");
      const after = await inspect();
      const refreshObservation = providerRefreshObservation(
        before,
        after,
        requestStartedAt,
      );
      await save(`${key}-result.json`, {
        checkedAt: new Date().toISOString(),
        succeeded: true,
        health,
        localClientSha256: sha(await readFile(bundlePath)),
        elapsedMs: Math.round(performance.now() - started),
        references: result.assets.length,
        linkedIds: [...new Set(result.assets.map((a) => a.robloxId))],
        moderationWarnings: result.issues.filter(
          (i) => i.code === "asset-moderation",
        ).length,
        accountBefore: before,
        accountAfter: after,
        ...refreshObservation,
        requests,
        packageSha256: sha(JSON.stringify(result)),
        claims: {
          realConfiguredRelay: true,
          productionUploadClient: true,
          providerMock: false,
          nativeLoaded: false,
          physicalDevice: false,
          publishedPlace: false,
        },
      });
      succeeded = true;
      console.log(
        JSON.stringify({
          succeeded,
          owner,
          references: result.assets.length,
          uniqueIds: new Set(result.assets.map((a) => a.robloxId)).size,
          imageSubmissions: requests.filter(
            (r) => r.path === "/v1/assets" && r.method === "POST",
          ).length,
          ...refreshObservation,
          elapsedMs: Math.round(performance.now() - started),
          directory,
        }),
      );
    } finally {
      globalThis.fetch = actualFetch;
      await writes;
      if (!succeeded)
        await save(`${key}-incomplete.json`, {
          checkedAt: new Date().toISOString(),
          succeeded: false,
          requests,
          completedReferences:
            result?.assets.filter((a) => a.robloxId).length ?? null,
          retainUploadSession: true,
          instruction:
            "Inspect accepted jobs/Creator Dashboard before creating another upload session.",
        });
    }
  }
} else {
  throw new Error(
    "Use prepare, status --credentials <owner-only-file>, or run --credentials <owner-only-file> --owner user:<id>|group:<id>.",
  );
}
