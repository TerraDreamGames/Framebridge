// Shared build/preview settings. The checked-in origin is public routing data;
// credentials and invitations never belong in this configuration.
export function connectionBuildSettings(config, env = {}, args = []) {
  if (
    !config ||
    typeof config.relayUrl !== "string" ||
    typeof config.privateBeta !== "boolean"
  )
    throw new Error(
      "framebridge.config.json needs relayUrl and privateBeta settings.",
    );
  const offline = args.includes("--offline");
  const local = args.includes("--local");
  if (offline && local) throw new Error("Choose either --offline or --local.");
  const origin = offline
    ? ""
    : (env.FRAMEBRIDGE_RELAY_URL ??
      (local ? "http://localhost:4318" : config.relayUrl));
  if (typeof origin !== "string")
    throw new Error("The transfer origin must be a string.");
  const relayUrl = origin
    .replace(/\/$/, "")
    .replace(/^http:\/\/127\.0\.0\.1(?=:|$)/, "http://localhost");
  if (relayUrl) {
    const url = new URL(relayUrl);
    if (
      url.origin !== relayUrl ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    )
      throw new Error(
        "FRAMEBRIDGE_RELAY_URL must be an HTTPS origin (or localhost for development).",
      );
  }
  if (
    env.FRAMEBRIDGE_PRIVATE_BETA !== undefined &&
    !["0", "1"].includes(env.FRAMEBRIDGE_PRIVATE_BETA)
  )
    throw new Error("FRAMEBRIDGE_PRIVATE_BETA must be 0 or 1.");
  const privateBeta =
    !!relayUrl &&
    !offline &&
    (env.FRAMEBRIDGE_PRIVATE_BETA !== undefined
      ? env.FRAMEBRIDGE_PRIVATE_BETA === "1"
      : !local && config.privateBeta);
  return {
    relayUrl,
    privateBeta,
    mode: !relayUrl ? "offline" : local ? "local" : "connected",
  };
}
