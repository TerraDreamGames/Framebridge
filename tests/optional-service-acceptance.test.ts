import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  optionalCredentials,
  privateJson,
} from "../scripts/optional-service-files";
import {
  proposedOptionalConfig,
  reviewedVisionVars,
} from "../scripts/optional-services-plan";
import { visionSettings } from "../packages/relay/src/vision-provider";

const dirs: string[] = [];
async function file(body: string, mode = 0o600) {
  const directory = await mkdtemp(join(tmpdir(), "framebridge-optional-"));
  dirs.push(directory);
  const path = join(directory, "private.json");
  await writeFile(path, body, { mode });
  await chmod(path, mode);
  return path;
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const base = () => ({
  name: "framebridge-private-beta",
  main: "packages/relay/cloudflare/worker.ts",
  workers_dev: true,
  preview_urls: false,
  vars: { MAX_SESSIONS: "20", DAILY_UPLOADS: "200" },
});
describe("optional service acceptance preparation", () => {
  it("keeps production flags disabled unless specifically proposed and never mutates its source", () => {
    const source = base();
    const result = proposedOptionalConfig(source);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.vars).not.toHaveProperty("ARTWORK_ENABLED");
    expect(result.vars).not.toHaveProperty("VISION_ENABLED");
    const proposal = proposedOptionalConfig(
      source,
      "framebridge-reviewed-private",
      true,
    );
    expect(source).toEqual(base());
    expect(proposal.r2_buckets).toEqual([
      {
        binding: "ARTWORK_BUCKET",
        bucket_name: "framebridge-reviewed-private",
      },
    ]);
    expect(proposal.vars.DAILY_UPLOADS).toBe("200");
    expect(JSON.stringify(proposal)).not.toContain("VISION_OPENAI_KEY");
    expect(JSON.stringify(proposal)).not.toContain("FEEDBACK_ADMIN_HASH");
  });
  it("requires review for route/environment changes and existing buckets", () => {
    expect(() =>
      proposedOptionalConfig({ ...base(), routes: [] }, "private-bucket"),
    ).toThrow("Review");
    expect(() =>
      proposedOptionalConfig(
        { ...base(), r2_buckets: [{ binding: "OLD" }] },
        "private-bucket",
      ),
    ).toThrow("Review");
    expect(() => proposedOptionalConfig(base(), "public/url")).toThrow(
      "existing reviewed private",
    );
  });
  it("computes the verified model's bounded maximum reservation", () => {
    const settings = visionSettings({
      ...reviewedVisionVars,
      VISION_OPENAI_KEY: "local-validation-key",
    });
    expect(settings?.costMicros).toBe(6144);
    expect(settings?.dailyCost).toBe(100000);
    expect(visionSettings(reviewedVisionVars)).toBeUndefined();
  });
  it("rejects exposed private files and redacts parser diagnostics", async () => {
    const secret = "private-capability-that-must-never-appear";
    const exposed = await file(JSON.stringify({ secret }), 0o644);
    await expect(privateJson(exposed)).rejects.toThrow("owner-only");
    const malformed = await file('{"token":"' + secret + '" INVALID');
    try {
      await privateJson(malformed);
      throw new Error("unexpected success");
    } catch (error) {
      expect(String(error)).toContain("not valid JSON");
      expect(String(error)).not.toContain(secret);
    }
  });
  it("accepts only exact HTTPS origins and current-format capabilities", async () => {
    const capabilities = {
      betaAccess: "a".repeat(64),
      accountToken: "b".repeat(64),
    };
    const valid = await file(
      JSON.stringify({ relayUrl: "https://private.example", ...capabilities }),
    );
    expect((await optionalCredentials(valid)).relayUrl).toBe(
      "https://private.example",
    );
    const invalid = await file(
      JSON.stringify({
        relayUrl: "https://user:password@private.example",
        ...capabilities,
      }),
    );
    await expect(optionalCredentials(invalid)).rejects.toThrow("exact HTTPS");
  });
});
