const GUIDES = {
  overview: "",
  "getting-started": "/getting-started",
  properties: "/properties",
  images: "/images",
  layouts: "/layouts",
  settings: "/workspace",
  studio: "/connection",
  usability: "/usability",
  structure: "/structure-review",
  notes: "/layers",
} as const;
export type GuideTopic = keyof typeof GUIDES;

/** Only known guide and policy identifiers can open external pages. */
export function documentationUrl(topic: unknown): string | undefined {
  if (topic === "privacy")
    return "https://framebridge.terradream.games/#privacy/plugin-usage";
  return typeof topic === "string" &&
    Object.prototype.hasOwnProperty.call(GUIDES, topic)
    ? `https://framebridge.terradream.games/#docs${GUIDES[topic as GuideTopic]}`
    : undefined;
}
