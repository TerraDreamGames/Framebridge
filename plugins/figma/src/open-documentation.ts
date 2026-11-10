import { documentationUrl, type GuideTopic } from "./documentation";

export function openDocumentation(topic: GuideTopic = "overview") {
  const url = documentationUrl(topic)!;
  if (import.meta.env.DEV) window.open(url, "_blank", "noopener,noreferrer");
  else
    parent.postMessage(
      { pluginMessage: { type: "open-documentation", topic } },
      "*",
    );
}
