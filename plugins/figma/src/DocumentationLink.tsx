import { CircleHelp } from "./components/Glyph";
import { Button } from "./components/ui/button";
import { openDocumentation } from "./open-documentation";
import type { GuideTopic } from "./documentation";

export function DocumentationLink({
  topic = "overview",
  label = "Guides & documentation",
  compact = false,
}: {
  topic?: GuideTopic;
  label?: string;
  compact?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size={compact ? "icon-sm" : "sm"}
      aria-label={label}
      title={label}
      onClick={() => openDocumentation(topic)}
    >
      <CircleHelp size={14} />
      {!compact && label}
    </Button>
  );
}
