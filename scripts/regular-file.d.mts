export function readRegularFile(
  path: string,
  options?: { private?: boolean; maxBytes?: number },
): Promise<Buffer>;
