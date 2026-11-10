import { useState, type ReactNode } from "react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Link } from "./components/Glyph";
import "./image-assets-page.css";

type View =
  "Design images" | "Saved images" | "Import PNG" | "Cloud artwork" | "Account";

export function ImageAssetsPage({
  total,
  unlinked,
  online,
  accountReady,
  refreshAction,
  operationLabel,
  actions,
  authorization,
  library,
  local,
  cloud,
  children,
  initialView = "Design images",
}: {
  total: number;
  unlinked: number;
  online: boolean;
  accountReady: boolean;
  refreshAction?: ReactNode;
  operationLabel?: string;
  actions: ReactNode;
  authorization: ReactNode;
  library: ReactNode;
  local: ReactNode;
  cloud: ReactNode;
  children: ReactNode;
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView);
  const views: View[] = [
    "Design images",
    "Saved images",
    "Import PNG",
    ...(online ? (["Cloud artwork", "Account"] as View[]) : []),
  ];
  return (
    <section
      className="images-inspector image-assets-page"
      aria-label="Image assets"
    >
      <nav
        className="image-assets-navigation"
        aria-label="Image asset sections"
      >
        {views.map((name) => (
          <Button
            key={name}
            variant="ghost"
            shape="rounded"
            aria-pressed={view === name}
            onClick={() => setView(name)}
          >
            {name}
            {name === "Design images" && total > 0 && (
              <Badge variant="secondary">{total}</Badge>
            )}
          </Button>
        ))}
      </nav>
      <div className="image-assets-content">
        <div className="image-assets-view" hidden={view !== "Design images"}>
          <div className="image-assets-toolbar">
            <span className="image-assets-count" role="status">
              {operationLabel ||
                (total
                  ? unlinked
                    ? `${unlinked} unlinked`
                    : "All images linked"
                  : "No design images")}
            </span>
            {!operationLabel &&
              (refreshAction ||
                (online &&
                  unlinked > 0 &&
                  (accountReady ? (
                    actions
                  ) : (
                    <Button size="sm" onClick={() => setView("Account")}>
                      <Link size={14} />
                      Set up uploads
                    </Button>
                  ))))}
          </div>
          {children}
        </div>
        {/* Keep forms mounted so navigation preserves drafts and pending sign-in. */}
        <div className="image-assets-view" hidden={view !== "Saved images"}>
          {library}
          {online && !accountReady && (
            <Button
              variant="outline"
              size="sm"
              className="asset-owner-action"
              onClick={() => setView("Account")}
            >
              Choose image owner
            </Button>
          )}
        </div>
        <div className="image-assets-view" hidden={view !== "Import PNG"}>
          {local}
        </div>
        <div className="image-assets-view" hidden={view !== "Cloud artwork"}>
          {cloud}
        </div>
        <div className="image-assets-view" hidden={view !== "Account"}>
          {authorization}
        </div>
      </div>
    </section>
  );
}
