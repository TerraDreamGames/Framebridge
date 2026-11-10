export function connectionBuildSettings(
  config: { relayUrl: string; privateBeta: boolean },
  env?: { FRAMEBRIDGE_RELAY_URL?: string; FRAMEBRIDGE_PRIVATE_BETA?: string },
  args?: string[],
): {
  relayUrl: string;
  privateBeta: boolean;
  mode: "offline" | "local" | "connected";
};
