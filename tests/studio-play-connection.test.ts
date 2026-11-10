import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const available = spawnSync("lune", ["--version"], { stdio: "ignore" }).status === 0;
it.skipIf(!available)("keeps Play connection commands scoped to the original Edit controller", async () => {
  const { stdout } = await promisify(execFile)("lune", ["run", "tests/studio-play-connection.test.luau"], { timeout: 30_000 });
  const report = JSON.parse(stdout.trim());
  expect(report.failed).toBe(0);
  expect(report.passed).toBe(14);
});
