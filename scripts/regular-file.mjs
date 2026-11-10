import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

/** Inspect and read the same descriptor, rejecting symlinks and replacements. */
export async function readRegularFile(
  path,
  { private: ownerOnly = false, maxBytes = 16 * 1024 * 1024 } = {},
) {
  // Windows does not expose O_NOFOLLOW. Compare the pathname's identity with
  // the opened descriptor there, and never make a security decision from a
  // pathname stat followed by a separate pathname read.
  const before =
    typeof constants.O_NOFOLLOW === "number" ? undefined : await lstat(path);
  if (before && !before.isFile()) throw new Error("Expected a regular file.");
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("Expected a regular file.");
    if (before && (before.dev !== info.dev || before.ino !== info.ino))
      throw new Error("File changed while opening it.");
    if (
      ownerOnly &&
      (info.mode & 0o077 || (process.getuid && info.uid !== process.getuid()))
    )
      throw new Error("Use an owner-only regular file (chmod 600).");
    if (info.size > maxBytes) throw new Error("File exceeds its size limit.");
    // Bound the read too: a concurrent writer may grow the file after fstat.
    const bytes = Buffer.alloc(Math.min(info.size + 1, maxBytes + 1));
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await file.read(bytes, size, bytes.length - size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > info.size || size > maxBytes)
      throw new Error("File changed or exceeds its size limit.");
    return bytes.subarray(0, size);
  } finally {
    await file.close();
  }
}
