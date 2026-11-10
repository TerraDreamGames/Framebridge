import { useMemo, useState } from "react";
import type { Issue } from "../../../packages/core/src/types";
import {
  groupConversionNotes,
  type NoteGroup,
  type NoteView,
} from "./conversion-notes";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import {
  ArrowRight,
  CheckCheck,
  Focus,
  Image,
  Info,
  Search,
  TriangleAlert,
  X,
} from "./components/Glyph";
import { Button } from "./components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import "./conversion-notes.css";

const severityLabels = { error: "Error", warning: "Warning", info: "Info" };

export function ConversionNotes(props: {
  issues: readonly Issue[];
  analyzed: boolean;
  stale: boolean;
  busy: boolean;
  inspect(id: string): void;
  focus(id: string): void;
  openImages(): void;
  openFonts(): void;
  analyze(): void;
}) {
  const [view, setView] = useState<NoteView>(() =>
    props.issues.some((issue) => issue.severity !== "info")
      ? "attention"
      : "all",
  );
  const [search, setSearch] = useState("");
  const counts = {
    attention: props.issues.filter((issue) => issue.severity !== "info").length,
    info: props.issues.filter((issue) => issue.severity === "info").length,
    all: props.issues.length,
  };
  const groups = useMemo(
    () => groupConversionNotes(props.issues, view, search),
    [props.issues, view, search],
  );
  const errors = props.issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const layers = (group: NoteGroup) => (
    <ul className="conversion-note-layers" aria-label={`${group.title} layers`}>
      {group.layers.map((layer) => (
        <li key={layer.id}>
          <span className="conversion-note-layer-name" tabIndex={0}>
            {layer.name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => props.inspect(layer.id)}
            aria-label={`Edit ${layer.name} in Properties`}
          >
            Edit <ArrowRight size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            shape="rounded"
            onClick={() => props.focus(layer.id)}
            aria-label={`Find ${layer.name} in Figma`}
            title="Find in Figma"
          >
            <Focus size={15} />
          </Button>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="conversion-notes" aria-label="Conversion notes">
      {props.analyzed && props.issues.length > 0 && (
        <div className="conversion-notes-toolbar">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(value) => value && setView(value as NoteView)}
            aria-label="Filter conversion notes"
          >
            {(
              [
                ["attention", "Needs review"],
                ["info", "Info"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value}>
                {label} <span>{counts[value]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <InputGroup className="conversion-notes-search">
            <InputGroupAddon>
              <Search size={14} />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search conversion notes"
              placeholder="Search notes or layers…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Clear notes search"
                  size="icon-xs"
                  onClick={() => setSearch("")}
                >
                  <X size={13} />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>
      )}
      <div className="conversion-notes-results">
        {props.stale && (
          <div className="conversion-notes-status" role="status">
            <Info size={15} />
            <span>Design changed. Update these notes.</span>
            <Button
              size="sm"
              variant="outline"
              disabled={props.busy}
              onClick={props.analyze}
            >
              Analyze again
            </Button>
          </div>
        )}
        {errors > 0 && (
          <p className="conversion-notes-blocked" role="status">
            <TriangleAlert size={15} />
            {errors} {errors === 1 ? "error blocks" : "errors block"} export.
          </p>
        )}
        {groups.length > 0 ? (
          <div className="conversion-note-groups">
            {groups.map((group) => (
              <article
                key={group.key}
                className="conversion-note-group"
                data-severity={group.severity}
              >
                <div className="conversion-note-heading">
                  <span className="conversion-note-symbol">
                    {group.severity !== "info" ? (
                      <TriangleAlert size={18} />
                    ) : group.code === "raster-fallback" ? (
                      <Image size={18} />
                    ) : (
                      <Info size={18} />
                    )}
                  </span>
                  <h3>{group.title}</h3>
                  <span className="conversion-note-severity">
                    {severityLabels[group.severity]}
                  </span>
                </div>
                <p className="conversion-note-message">
                  {group.code === "asset-required"
                    ? "Upload these images or link existing Roblox image IDs before importing."
                    : group.message}
                </p>
                {group.action !== "layer" && (
                  <Button
                    className="conversion-note-action"
                    size="sm"
                    onClick={
                      group.action === "images"
                        ? props.openImages
                        : props.openFonts
                    }
                  >
                    {group.action === "images"
                      ? "Open image assets"
                      : "Open font settings"}
                    <ArrowRight size={14} />
                  </Button>
                )}
                {group.layers.length === 1 ? (
                  layers(group)
                ) : (
                  <Disclosure className="conversion-note-affected">
                    <DisclosureSummary>
                      {group.layers.length} affected layers
                    </DisclosureSummary>
                    {layers(group)}
                  </Disclosure>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="conversion-notes-empty" role="status">
            {search ? <Search size={24} /> : <CheckCheck size={26} />}
            <strong>
              {!props.analyzed
                ? "Analyze a design to see conversion notes"
                : search
                  ? "No matching notes"
                  : view === "attention"
                    ? "No warnings or errors"
                    : view === "info"
                      ? "No informational notes"
                      : "No conversion notes"}
            </strong>
            {search ? (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : !props.analyzed ? (
              <Button size="sm" disabled={props.busy} onClick={props.analyze}>
                Analyze selection
              </Button>
            ) : view === "attention" && counts.info > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView("info")}
              >
                View {counts.info} informational notes
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {props.analyzed && props.issues.length > 0 && (
        <footer className="conversion-notes-legend">
          <Info size={13} /> Errors block export. Warnings and info don’t change
          your design.
        </footer>
      )}
    </section>
  );
}
