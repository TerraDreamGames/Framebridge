import { BrandMark } from "../BrandMark";
import { BookOpen, CheckCheck, Image, Layers, Link, Settings2 } from "./Glyph";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export type WorkspacePage = "convert" | "assets" | "studio" | "settings";

export function WorkspaceRail({
  page,
  reviewing,
  libraryMode,
  connected,
  onPage,
  onReview,
  onGuide,
}: {
  page: WorkspacePage;
  reviewing: boolean;
  libraryMode: boolean;
  connected: boolean;
  onPage: (page: WorkspacePage) => void;
  onReview: () => void;
  onGuide: () => void;
}) {
  const action = (
    label: string,
    Icon: typeof Layers,
    selected: boolean,
    onClick: () => void,
    indicator = false,
  ) => (
    <Tooltip key={label}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rail-action"
          aria-label={label}
          aria-current={selected ? "page" : undefined}
          onClick={onClick}
        >
          <Icon size={20} />
          {indicator && (
            <span className="rail-connection" aria-label="Connected" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <nav className="workspace-rail" aria-label="Workspace">
      <Button
        variant="ghost"
        className="rail-brand"
        aria-label="Framebridge workspace"
        onClick={() => onPage("convert")}
      >
        <BrandMark />
      </Button>
      <div className="rail-pages">
        {action("Layers", Layers, page === "convert" && !reviewing, () =>
          onPage("convert"),
        )}
        {action("Images", Image, page === "assets", () => onPage("assets"))}
        {action(
          libraryMode ? "Export" : "Studio",
          Link,
          page === "studio",
          () => onPage("studio"),
          connected,
        )}
        {action("Review", CheckCheck, reviewing, onReview)}
      </div>
      <div className="rail-utilities">
        {action("Tutorial", BookOpen, false, onGuide)}
        {action("Settings", Settings2, page === "settings", () =>
          onPage("settings"),
        )}
      </div>
    </nav>
  );
}
