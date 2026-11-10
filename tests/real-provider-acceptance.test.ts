import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { imageBatchPlan } from "../plugins/figma/src/image-batch-plan";
import type { AnalysisResult } from "../packages/core/src/types";
import { providerRefreshObservation } from "../scripts/provider-refresh-evidence";
import { oauthFixture } from "./roblox-oauth-fixture";

const exec = promisify(execFile);
const script = resolve("scripts/real-provider-acceptance.ts");
const tsx = resolve("node_modules/tsx/dist/cli.mjs");
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const temp = async () => {
  const path = await mkdtemp(tmpdir() + "/framebridge-provider-");
  directories.push(path);
  return path;
};
it("does not mistake a renewed 90-day application capability for a provider token refresh", () => {
  const first = { expiresAt: Date.UTC(2027, 0, 1) };
  const renewedCapability = { expiresAt: Date.UTC(2027, 0, 2) };
  expect(providerRefreshObservation(first, renewedCapability)).toMatchObject({
    naturalRefreshObserved: false,
    providerRefreshStatus: "unobserved",
    accountExpiryKind: "framebridge-app-capability",
    appCapabilityExpiryChanged: true,
  });
});
it("keeps provider refresh unobserved when uploads succeed with the same or shortened capability deadline", () => {
  const before = { expiresAt: Date.UTC(2027, 0, 1) };
  for (const expiresAt of [before.expiresAt, before.expiresAt - 86_400_000]) {
    const evidence = providerRefreshObservation(before, { expiresAt });
    expect(evidence.naturalRefreshObserved).toBe(false);
    expect(evidence.providerRefreshStatus).toBe("unobserved");
    expect(evidence.providerRefreshEvidence).toContain(
      "not provider access expiry",
    );
  }
});
it("attests a preemptive provider refresh without claiming natural expiry or using application expiry", async () => {
  const fixture = oauthFixture(),
    ready = await fixture.connect();
  const before = fixture.service.status(ready.accountToken);
  fixture.advance(850000); // Local mock clock only; never production state.
  await fixture.service.credential(ready.accountToken, "invite");
  const after = fixture.service.status(ready.accountToken);
  const evidence = providerRefreshObservation(before, {
    ...after,
    expiresAt: before.expiresAt,
  });
  expect(evidence).toMatchObject({
    providerRefreshObserved: true,
    naturalRefreshObserved: false,
    providerRefreshStatus: "observed",
    appCapabilityExpiryChanged: false,
    providerRefreshCountBefore: 0,
    providerRefreshCountAfter: 1,
    providerRefreshedAt: 1850000,
  });
  expect(providerRefreshObservation(after, after).naturalRefreshObserved).toBe(
    false,
  );
});
it("requires a recorded operation start after the original provider deadline and before refresh completion for natural-expiry evidence", async () => {
  const fixture = oauthFixture(),
    ready = await fixture.connect();
  const before = fixture.service.status(ready.accountToken);
  fixture.advance(900001); // Isolated local mock time, not production acceptance.
  await fixture.service.credential(ready.accountToken, "invite");
  const after = fixture.service.status(ready.accountToken);
  expect(providerRefreshObservation(before, after, 1900001)).toMatchObject({
    providerRefreshObserved: true,
    naturalRefreshObserved: true,
    providerRefreshStatus: "observed",
    providerAccessExpiresAtBefore: 1900000,
    providerRefreshedAt: 1900001,
    requestStartedAt: 1900001,
  });
  expect(
    providerRefreshObservation(
      { ...before, providerAccessExpiresAt: after.providerRefreshedAt! + 1 },
      after,
      1900001,
    ).naturalRefreshObserved,
  ).toBe(false);
  expect(
    providerRefreshObservation(
      { ...before, providerAccessExpiresAt: 0 },
      after,
      1900001,
    ).naturalRefreshObserved,
  ).toBe(false);
});
it("does not classify a delayed preemptive refresh finishing after expiry as natural", () => {
  const before = {
    userId: "123",
    expiresAt: 9000000,
    providerAccessExpiresAt: 1900000,
    providerRefreshCount: 0,
    providerRefreshedAt: null,
  };
  const after = {
    ...before,
    providerAccessExpiresAt: 2810000,
    providerRefreshCount: 1,
    providerRefreshedAt: 1910000,
  };
  expect(providerRefreshObservation(before, after, 1850000)).toMatchObject({
    providerRefreshObserved: true,
    naturalRefreshObserved: false,
    requestStartedAt: 1850000,
    providerRefreshedAt: 1910000,
  });
});
it("keeps natural expiry unobserved without independent valid operation timing", () => {
  const before = {
    userId: "123",
    expiresAt: 9000000,
    providerAccessExpiresAt: 1900000,
    providerRefreshCount: 0,
    providerRefreshedAt: null,
  };
  const after = {
    ...before,
    providerAccessExpiresAt: 2810000,
    providerRefreshCount: 1,
    providerRefreshedAt: 1910000,
  };
  for (const started of [
    undefined,
    NaN,
    Infinity,
    1900000.5,
    1899999,
    1910001,
  ]) {
    expect(providerRefreshObservation(before, after, started)).toMatchObject({
      providerRefreshObserved: true,
      naturalRefreshObserved: false,
    });
  }
  expect(providerRefreshObservation(before, after).requestStartedAt).toBeNull();
  expect(
    providerRefreshObservation(before, after, 1900000).naturalRefreshObserved,
  ).toBe(true);
});
it("does not infer natural expiry from a count jump spanning multiple provider refreshes", () => {
  const before = {
    userId: "123",
    expiresAt: 9000000,
    providerAccessExpiresAt: 1900000,
    providerRefreshCount: 0,
    providerRefreshedAt: null,
  };
  const after = {
    ...before,
    providerAccessExpiresAt: 3800000,
    providerRefreshCount: 2,
    providerRefreshedAt: 2900000,
  };
  expect(providerRefreshObservation(before, after, 2000000)).toMatchObject({
    providerRefreshObserved: true,
    naturalRefreshObserved: false,
    providerRefreshCountBefore: 0,
    providerRefreshCountAfter: 2,
  });
});
it("requires a comparable same-account baseline, consistent diagnostics and a forward server counter", () => {
  const baseline = {
    userId: "123",
    expiresAt: 1000,
    providerAccessExpiresAt: 1900000,
    providerRefreshCount: 1,
    providerRefreshedAt: 1000000,
  };
  const later = {
    ...baseline,
    providerRefreshCount: 2,
    providerRefreshedAt: 1850000,
  };
  expect(
    providerRefreshObservation({ expiresAt: 1000, userId: "123" }, later)
      .naturalRefreshObserved,
  ).toBe(false);
  expect(
    providerRefreshObservation(baseline, { ...later, userId: "456" })
      .naturalRefreshObserved,
  ).toBe(false);
  expect(
    providerRefreshObservation(later, baseline).naturalRefreshObserved,
  ).toBe(false);
  expect(
    providerRefreshObservation(baseline, {
      ...later,
      providerRefreshedAt: 900000,
    }).naturalRefreshObserved,
  ).toBe(false);
  expect(() =>
    providerRefreshObservation(baseline, {
      ...later,
      providerRefreshedAt: null,
    }),
  ).toThrow("Invalid provider refresh diagnostics");
});
it("prepares 1,000 independently bound references with two real PNGs and refuses to replace their resumable identity", async () => {
  const cwd = await temp();
  const run = await exec(process.execPath, [tsx, script, "prepare"], { cwd });
  expect(JSON.parse(run.stdout)).toMatchObject({
    prepared: true,
    references: 1000,
    uniquePngs: 2,
    liveUploads: 0,
  });
  const path = cwd + "/.artifacts/real-provider-acceptance/fixture.json";
  const text = await readFile(path, "utf8");
  const fixture: AnalysisResult = JSON.parse(text);
  const plan = await imageBatchPlan(fixture.package, fixture.assets, () => {});
  expect(plan.totalReferences).toBe(1000);
  expect(plan.groups).toHaveLength(2);
  expect(plan.groups.map((g) => g.assets.length)).toEqual([500, 500]);
  expect((await stat(path)).mode & 0o077).toBe(0);
  await expect(
    exec(process.execPath, [tsx, script, "prepare"], { cwd }),
  ).rejects.toMatchObject({
    stderr: expect.stringContaining("prepared fixture exists"),
  });
  expect(await readFile(path, "utf8")).toBe(text);
}, 30_000);
it("rejects exposed credential files before any provider request and never prints their contents", async () => {
  const cwd = await temp();
  const path = cwd + "/credentials.json";
  const secret = "d".repeat(64);
  await writeFile(
    path,
    JSON.stringify({
      relayUrl: "https://should-not-be-contacted.invalid",
      betaAccess: secret,
      accountToken: secret,
    }),
    { mode: 0o644 },
  );
  await chmod(path, 0o644);
  let failure: { stderr?: string } | undefined;
  try {
    await exec(
      process.execPath,
      [tsx, script, "status", "--credentials", path],
      { cwd },
    );
  } catch (error) {
    failure = error as typeof failure;
  }
  expect(failure?.stderr).toContain("credentials file must be owned");
  expect(failure?.stderr).not.toContain(secret);
  expect(failure?.stderr).not.toContain("should-not-be-contacted");
}, 30_000);
it("redacts malformed owner-only credential JSON instead of exposing the parser's credential excerpt", async () => {
  const cwd = await temp();
  const path = cwd + "/credentials.json";
  const secret = "e".repeat(64);
  await writeFile(path, '{"accountToken":"' + secret + '",', { mode: 0o600 });
  let failure: { stderr?: string } | undefined;
  try {
    await exec(
      process.execPath,
      [tsx, script, "status", "--credentials", path],
      { cwd },
    );
  } catch (error) {
    failure = error as typeof failure;
  }
  expect(failure?.stderr).toContain("credentials file is not valid JSON");
  expect(failure?.stderr).not.toContain(secret);
  expect(failure?.stderr).not.toContain("accountToken");
}, 30_000);
