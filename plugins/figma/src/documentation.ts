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

/** Only product guide identifiers cross the iframe boundary, never arbitrary URLs. */
export function documentationUrl(topic: unknown): string | undefined {
  return typeof topic === "string" &&
    Object.prototype.hasOwnProperty.call(GUIDES, topic)
    ? `https://framebridge.terradream.games/#docs${GUIDES[topic as GuideTopic]}`
    : undefined;
}
