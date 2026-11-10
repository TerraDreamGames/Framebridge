import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { readRegularFile } from "./regular-file.mjs";
import { resolve } from "node:path";
import ts from "typescript";
import { visionSettings } from "../packages/relay/src/vision-provider";
import {
  optionalDirectory,
  privateDirectory,
  savePrivate,
  sha256,
} from "./optional-service-files";

// Verified against the official model and image token documentation on 2026-10-03.
// Keys are intentionally excluded: operators install a real project key as a Worker secret.
export const reviewedVisionVars = {
  VISION_ENABLED: "1",
  VISION_MODEL: "gpt-4o-mini-2024-07-18",
  VISION_INPUT_MICROS_PER_MILLION: "150000",
  VISION_OUTPUT_MICROS_PER_MILLION: "600000",
  VISION_IMAGE_TOKEN_BUDGET: "2833",
  VISION_INPUT_TOKEN_BUDGET: "32768",
  VISION_OUTPUT_TOKENS: "2048",
  VISION_DAILY_COST_MICROS: "100000",
  VISION_DAILY_USER_COST_MICROS: "25000",
  VISION_DAILY_INVITE_COST_MICROS: "50000",
};
export function proposedOptionalConfig(
  base: Record<string, any>,
  bucket?: string,
  ai = false,
) {
  if (
    base.name !== "framebridge-private-beta" ||
    base.main !== "packages/relay/cloudflare/worker.ts" ||
    base.routes ||
    base.route ||
    base.env
  )
    throw new Error(
      "Review the exact private relay configuration before preparing optional services.",
    );
  const result = structuredClone(base);
  if (bucket) {
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
      throw new Error(
        "Supply an existing reviewed private Standard R2 bucket name.",
      );
    if (result.r2_buckets?.length)
      throw new Error("Review existing R2 bindings before replacing them.");
    result.r2_buckets = [{ binding: "ARTWORK_BUCKET", bucket_name: bucket }];
    result.vars = { ...result.vars, ARTWORK_ENABLED: "1" };
  }
  if (ai) result.vars = { ...result.vars, ...reviewedVisionVars };
  return result;
}
export async function prepareOptionalPlan(args: string[]) {
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  const bucket = flag("--artwork-bucket"),
    ai = args.includes("--ai"),
    reports = args.includes("--reports");
  if (args.includes("--artwork-bucket") && (!bucket || bucket.startsWith("--")))
    throw new Error("Choose an existing reviewed private Standard R2 bucket.");
  const base = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    await readFile("wrangler.jsonc", "utf8"),
  );
  if (base.error)
    throw new Error("The private Worker configuration is invalid.");
  const proposal = proposedOptionalConfig(base.config, bucket, ai);
  await privateDirectory();
  let reportSecretPrepared = false;
  if (reports) {
    const tokenPath = resolve(optionalDirectory, "feedback-admin-token.txt");
    let token: string;
    try {
      token = (
        await readRegularFile(tokenPath, { private: true, maxBytes: 66 })
      )
        .toString("utf8")
        .trim();
      if (!/^[a-f0-9]{64}$/.test(token))
        throw new Error("Invalid prepared maintainer capability.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      token = randomBytes(32).toString("hex");
      await writeFile(tokenPath, token + "\n", { flag: "wx", mode: 0o600 });
    }
    await writeFile(
      resolve(optionalDirectory, "feedback-admin-hash.txt"),
      sha256(token) + "\n",
      { mode: 0o600 },
    );
    await chmod(resolve(optionalDirectory, "feedback-admin-hash.txt"), 0o600);
    reportSecretPrepared = true;
  }
  // The placeholder checks the numerical proposal locally; it never enters the deployment file.
  const bounds = ai
    ? visionSettings({
        ...reviewedVisionVars,
        VISION_OPENAI_KEY: "local-config-validation-only",
      })
    : undefined;
  if (ai && bounds?.costMicros !== 6144)
    throw new Error("The reviewed AI reservation differs.");
  await savePrivate("wrangler.optional-proposal.json", proposal);
  await savePrivate("optional-plan.json", {
    preparedAt: new Date().toISOString(),
    productionChanged: false,
    accountId: "292a72c7c7ad9a1ef4065cf44437e58e",
    worker: proposal.name,
    artwork: {
      proposed: !!bucket,
      ...(bucket ? { bucket } : {}),
      requires:
        "Existing private Standard R2 bucket and current R2/Workers authorization; no purchase or public access.",
    },
    reports: {
      proposed: reports,
      reportSecretPrepared,
      requires:
        "Install only the prepared digest as FEEDBACK_ADMIN_HASH; retain the separate maintainer token owner-only.",
    },
    ai: {
      proposed: ai,
      model: reviewedVisionVars.VISION_MODEL,
      maxReservationMicros: bounds?.costMicros ?? null,
      dailyReservedMicros: ai ? 100000 : null,
      requires:
        "A real server-only OpenAI project key and explicit reviewed data consent. Never ship the key in a plugin.",
    },
    evidence: {
      realArtwork: false,
      realReportCollector: false,
      realAi: false,
      externalEmitter: false,
      nativeDevMode: false,
    },
  });
  return {
    prepared: true,
    productionChanged: false,
    artworkProposed: !!bucket,
    reportsProposed: reports,
    aiProposed: ai,
    directory: optionalDirectory,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve("scripts/optional-services-plan.ts")
)
  console.log(JSON.stringify(await prepareOptionalPlan(process.argv.slice(2))));
