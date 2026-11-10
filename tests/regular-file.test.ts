import {
  mkdtemp,
  writeFile,
  chmod,
  symlink,
  rm,
  rename,
  open,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readRegularFile } from "../scripts/regular-file.mjs";

vi.mock("node:fs/promises", async (original) => {
  const real = await original<typeof import("node:fs/promises")>();
  return {
    ...real,
    open: vi.fn((...args: Parameters<typeof open>) => real.open(...args)),
  };
});
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "framebridge-file-security-"));
  directories.push(dir);
  const path = join(dir, "credentials.json");
  await writeFile(path, "original", { mode: 0o600 });
  return { dir, path };
}
describe("descriptor-bound regular file reads", () => {
  it("rejects symlinks, directories, oversized files and exposed credentials", async () => {
    const { dir, path } = await fixture();
    const link = join(dir, "link");
    await symlink(path, link);
    await expect(readRegularFile(link)).rejects.toThrow();
    await expect(readRegularFile(dir)).rejects.toThrow();
    await expect(readRegularFile(path, { maxBytes: 4 })).rejects.toThrow(
      "size limit",
    );
    await chmod(path, 0o644);
    await expect(readRegularFile(path, { private: true })).rejects.toThrow(
      "owner-only",
    );
  });
  it("reads the checked descriptor even when its pathname is replaced", async () => {
    const { dir, path } = await fixture();
    const real =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      const file = await real.open(...args);
      const stat = file.stat.bind(file);
      vi.spyOn(file, "stat").mockImplementationOnce(async () => {
        const info = await stat();
        await rename(path, join(dir, "original"));
        await writeFile(path, "replacement", { mode: 0o600 });
        return info;
      });
      return file;
    });
    expect((await readRegularFile(path, { private: true })).toString()).toBe(
      "original",
    );
  });
  it("bounds growth that occurs after checking metadata", async () => {
    const { path } = await fixture();
    const real =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      const file = await real.open(...args);
      const stat = file.stat.bind(file);
      vi.spyOn(file, "stat").mockImplementationOnce(async () => {
        const info = await stat();
        await writeFile(path, "original".repeat(100));
        return info;
      });
      return file;
    });
    await expect(readRegularFile(path, { maxBytes: 16 })).rejects.toThrow(
      "File changed",
    );
  });
});
