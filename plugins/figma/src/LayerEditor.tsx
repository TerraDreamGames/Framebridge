import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import type { PropertyDraftReport } from "./property-drafts";
import { PropertyField } from "./PropertyField";
import { SizeAnchorEditor } from "./SizeAnchorEditor";
import { DocumentationLink } from "./DocumentationLink";
import { ThemeLayerEditor } from "./ThemeEditor";
import type { ThemeSettings } from "../../../packages/core/src/theme-tokens";
import { KeyframeEditor } from "./KeyframeEditor";
import { ScrollbarEditor } from "./ScrollbarEditor";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./components/ui/accordion";
import { Badge } from "./components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import { Switch } from "./components/ui/switch";
import { Field, FieldLabel, FieldGroup } from "./components/ui/field";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./components/ui/tooltip";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { SelectControl } from "./components/SelectControl";
import { RobloxClassIcon } from "./components/RobloxClassIcon";
import {
  ResizableWorkbench,
  CloseInspectorButton,
} from "./components/ResizableWorkbench";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  RotateCcw,
  Crosshair,
  Plus,
  X,
  ArrowLeft,
  Undo2,
  Redo2,
  Search,
  MoreHorizontal,
} from "./components/Glyph";
import { BulkProperties } from "./BulkProperties";
import { ImageScalingEditor } from "./ImageScalingEditor";
import { ImagePreparation } from "./ImagePreparation";
import { BehaviorEditor } from "./BehaviorEditor";
import { ConditionalRuleEditor } from "./ConditionalRuleEditor";
import { LayerRuleMatcher } from "./LayerRuleMatcher";
import { MotionEditor } from "./MotionEditor";
import { WorldEditor } from "./WorldEditor";
import { classShortcut, selectLayers } from "./layer-selection";
import { formatShortcut } from "./keyboard-shortcuts";
import {
  classChanges,
  layerClassChoices,
  type OverrideChange,
} from "../../../packages/core/src/bulk-editor";
import {
  COMPONENT_CLASSES,
  PROPERTY_SCHEMAS,
  defaultProperties,
  validProperty,
  type PropertySpec,
} from "../../../packages/core/src/editor";
import {
  type AnalysisResult,
  type LayerOverride,
  type RbxNode,
} from "../../../packages/core/src/types";
import {
  propertyLabel,
  propertiesForView,
  MODIFIER_LABELS,
  studioPropertySchema,
  propertyMatches,
  inspectorSection,
  type InspectorSection,
  type PropertyView,
} from "./property-presentation";
import { entries, recordingNodes, type Entry } from "./layer-entries";
const classOption = (_value: string, label: string) => (
  <span className="roblox-class-option">
    {label !== "Automatic" && label !== "Choose modifier…" && (
      <RobloxClassIcon className={label} />
    )}
    <span>{label}</span>
  </span>
);
function LayoutDetails({
  compact,
  children,
}: {
  compact: boolean;
  children: React.ReactNode;
}) {
  return compact ? (
    <Disclosure className="geometry-more-layout">
      <DisclosureSummary>More layout</DisclosureSummary>
      {children}
    </Disclosure>
  ) : (
    <>{children}</>
  );
}
export function LayerEditor({
  result,
  overrides,
  themes,
  imageScale,
  selected,
  selectedIds,
  selectionAnchor,
  onSelect,
  onChange,
  onBatchChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onFocus,
  onFocusMany,
  disabled,
  children,
  onDraftValidity,
  tourSection,
  tourPanel,
  propertyReveal,
  layersHeaderHost,
  initialTab = "layout",
  initialFilter = "",
}: {
  result: AnalysisResult | undefined;
  overrides: Record<string, LayerOverride>;
  themes?: ThemeSettings;
  imageScale?: number;
  selected: string;
  selectedIds: string[];
  selectionAnchor: string;
  onSelect: (id: string, ids?: string[], anchor?: string) => void;
  onChange: (id: string, value: LayerOverride | undefined) => void;
  onBatchChange: (changes: OverrideChange[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onFocus: (id: string) => void;
  onFocusMany?: (ids: string[]) => void;
  disabled: boolean;
  children?: React.ReactNode;
  onDraftValidity?: PropertyDraftReport;
  tourSection?: "layout" | "behavior" | "properties";
  tourPanel?: "layers" | "properties" | "preview";
  propertyReveal?: number;
  layersHeaderHost?: HTMLElement | null;
  initialTab?: InspectorSection | "all";
  initialFilter?: string;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(initialFilter),
    [propertyView, setPropertyView] = useState<PropertyView>("all"),
    [inspectorTab, setInspectorTab] = useState<InspectorSection | "all">(
      initialTab,
    ),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const propertyFilter = useRef<HTMLInputElement>(null);
  const [searchProperties, setSearchProperties] = useState(false);
  const propertiesPane = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef("");
  const selectionRef = useRef(selectedIds);
  selectionRef.current = selectedIds;
  const anchor = useRef(selectionAnchor);
  anchor.current = selectionAnchor;
  const [selectionMessage, setSelectionMessage] = useState("");
  const roots = useMemo(() => (result ? entries(result) : []), [result]);
  const flat: Entry[] = [];
  const parents = new Map<string, Entry>();
  function collect(rows: Entry[], parent?: Entry) {
    for (const row of rows) {
      flat.push(row);
      if (parent) parents.set(row.node.id, parent);
      collect(row.children, row);
    }
  }
  collect(roots);
  const chosen = flat.find((r) => r.node.id === selected) ?? flat[0];
  useEffect(() => {
    if (!tourSection || !chosen) return;
    setInspectorTab(tourSection === "behavior" ? "behavior" : "layout");
    if (tourSection === "properties") return;
    const pane = propertiesPane.current;
    const frame = requestAnimationFrame(() => {
      const tools = pane?.querySelector<HTMLDetailsElement>(
        ".studio-export-tools",
      );
      if (tools) tools.open = true;
      const target = pane?.querySelector<HTMLDetailsElement>(
        tourSection === "layout" ? ".modifier-tools" : ".behavior-setup",
      );
      if (target) {
        target.open = true;
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [tourSection, chosen?.node.id]);
  const selectedSet = new Set(selectedIds);
  const selectedRows = flat.filter((row) => selectedSet.has(row.node.id));
  const multiple = selectedRows.length > 1;
  const copiedSelection = selectedRows.some((row) => row.repeatOriginalId);
  const original = chosen?.repeatOriginalId
    ? flat.find((row) => row.node.id === chosen.repeatOriginalId)
    : undefined;
  const focusSource = chosen?.source ?? original?.source;
  function selectOriginals(rows: Entry[]) {
    const ids = [
      ...new Set(rows.map((row) => row.repeatOriginalId ?? row.node.id)),
    ];
    if (!ids.length) return;
    setSearch("");
    selectionRef.current = ids;
    anchor.current = ids[0];
    pendingFocus.current = ids[0];
    setSelectionMessage("");
    onSelect(ids[0], ids, anchor.current);
  }
  const ancestors: Entry[] = [];
  for (
    let parent = chosen && parents.get(chosen.node.id);
    parent;
    parent = parents.get(parent.node.id)
  )
    ancestors.unshift(parent);
  const interactionNodes: RbxNode[] = [];
  function collectInteractionNodes(row: Entry) {
    if (!row.repeatOriginalId) interactionNodes.push(row.node);
    row.children.forEach(collectInteractionNodes);
  }
  const interactionRoot = ancestors[0] ?? chosen;
  if (interactionRoot) collectInteractionNodes(interactionRoot);
  useEffect(() => {
    setFilter(initialFilter);
    if (propertiesPane.current) propertiesPane.current.scrollTop = 0;
  }, [chosen?.node.id, initialFilter]);
  useEffect(() => {
    // Preview selections and newly added modifiers reveal their containing layers.
    const ids = new Set(ancestors.map((row) => row.node.id));
    setCollapsed((before) => {
      if (![...ids].some((id) => before.has(id))) return before;
      return new Set([...before].filter((id) => !ids.has(id)));
    });
  }, [chosen?.node.id, roots]);
  const edit = chosen ? (overrides[chosen.node.id] ?? {}) : {};
  const worldRoot = result?.package.roots.find(
    (root) =>
      root.id === chosen?.node.id || root.id === "screen:" + chosen?.source?.id,
  );
  const worldSourceId = worldRoot?.id.slice(7);
  const worldEdit = worldSourceId ? (overrides[worldSourceId] ?? {}) : {};
  const patch = (value: Partial<LayerOverride>) =>
    chosen &&
    !chosen.repeatOriginalId &&
    onChange(chosen.node.id, { ...edit, ...value });
  const query = search.trim().toLowerCase();
  const isMatch = (row: Entry) =>
    (row.node.name + " " + row.node.className).toLowerCase().includes(query);
  const matchCache = new Map<string, boolean>();
  function matches(row: Entry): boolean {
    if (!matchCache.has(row.node.id))
      matchCache.set(row.node.id, isMatch(row) || row.children.some(matches));
    return matchCache.get(row.node.id)!;
  }
  const isExpanded = (row: Entry) => !!query || !collapsed.has(row.node.id);
  const visible: Entry[] = [];
  function collectVisible(rows: Entry[]) {
    for (const row of rows.filter(matches)) {
      visible.push(row);
      if (isExpanded(row)) collectVisible(row.children);
    }
  }
  collectVisible(roots);
  const tabStop =
    chosen && visible.includes(chosen)
      ? chosen
      : (visible.find(isMatch) ?? visible[0]);
  useEffect(() => {
    const item = Array.from(
      tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    ).find((item) => item.dataset.id === chosen?.node.id);
    item?.querySelector(".tree-name")?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    if (item && pendingFocus.current === chosen?.node.id) {
      pendingFocus.current = "";
      item.focus({ preventScroll: true });
    }
  }, [chosen?.node.id, collapsed]);
  function selectAndFocus(
    id: string,
    gesture: { toggle?: boolean; range?: boolean } = {},
  ) {
    const next = selectLayers(
      selectionRef.current.length
        ? selectionRef.current
        : chosen
          ? [chosen.node.id]
          : [],
      visible.map((row) => row.node.id),
      id,
      anchor.current,
      gesture,
    );
    const primary = next.includes(id) ? id : next[next.length - 1];
    if (!primary) return;
    selectionRef.current = next;
    if (!gesture.range) anchor.current = primary;
    setSelectionMessage("");
    onSelect(primary, next, anchor.current);
    const target = Array.from(
      tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    ).find((item) => item.dataset.id === primary);
    target?.focus({ preventScroll: true });
    target?.firstElementChild?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }
  function toggle(row: Entry) {
    if (!query && isExpanded(row) && ancestors.includes(row))
      selectAndFocus(row.node.id);
    setCollapsed((before) => {
      const next = new Set(before);
      next.has(row.node.id) ? next.delete(row.node.id) : next.add(row.node.id);
      return next;
    });
  }
  const typeAhead = useRef({ text: "", time: 0 });
  function render(rows: Entry[], depth = 0): React.ReactNode {
    const siblings = rows.filter(matches);
    return siblings.map((row, siblingIndex) => {
      const active =
        selectedSet.has(row.node.id) || (!selectedIds.length && row === chosen);
      const expanded = isExpanded(row);
      const status = row.baked
        ? "In image"
        : row.node.className === "Skipped"
          ? "Skipped"
          : "";
      const label = `${row.node.name}, ${row.node.className}${row.repeatOriginalId ? ", repeated copy" : ""}${overrides[row.node.id] ? ", customized" : ""}`;
      return (
        <div
          key={row.node.id}
          className="explorer-item"
          role="treeitem"
          aria-label={label}
          aria-level={depth + 1}
          aria-posinset={siblingIndex + 1}
          aria-setsize={siblings.length}
          aria-selected={active}
          aria-expanded={row.children.length ? expanded : undefined}
          tabIndex={row === tabStop ? 0 : -1}
          data-id={row.node.id}
          style={
            { "--tree-indent": `${6 + depth * 10}px` } as React.CSSProperties
          }
          onFocus={(e) => {
            if (
              e.target === e.currentTarget &&
              !selectionRef.current.includes(row.node.id)
            )
              selectAndFocus(row.node.id);
          }}
          onKeyDown={(e) => {
            if (
              (e.target as HTMLElement).closest('[role="treeitem"]') !==
              e.currentTarget
            )
              return;
            const index = visible.indexOf(row);
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? visible.length - 1
                    : index + (e.key === "ArrowDown" ? 1 : -1);
              const target =
                visible[Math.max(0, Math.min(visible.length - 1, next))];
              if (target)
                selectAndFocus(target.node.id, {
                  range: e.shiftKey,
                  toggle: e.ctrlKey || e.metaKey,
                });
            } else if (e.key === "ArrowRight" && row.children.length) {
              e.preventDefault();
              if (expanded) {
                const child = row.children.find(matches);
                if (child) selectAndFocus(child.node.id);
              } else
                setCollapsed(
                  (s) => new Set([...s].filter((id) => id !== row.node.id)),
                );
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              if (row.children.length && expanded && !query)
                setCollapsed((s) => new Set([...s, row.node.id]));
              else {
                const parent = parents.get(row.node.id);
                if (parent) selectAndFocus(parent.node.id);
              }
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectAndFocus(row.node.id, {
                toggle: e.ctrlKey || e.metaKey,
                range: e.shiftKey,
              });
            } else if (
              e.key.length === 1 &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
              const now = Date.now();
              typeAhead.current.text =
                now - typeAhead.current.time < 700
                  ? typeAhead.current.text + e.key.toLowerCase()
                  : e.key.toLowerCase();
              typeAhead.current.time = now;
              const target = [
                ...visible.slice(index + 1),
                ...visible.slice(0, index + 1),
              ].find((item) =>
                item.node.name.toLowerCase().startsWith(typeAhead.current.text),
              );
              if (target) {
                e.preventDefault();
                selectAndFocus(target.node.id);
              }
            }
          }}
        >
          <div
            className={`explorer-row ${active ? "selected" : ""} ${status ? "omitted" : ""}`}
            title={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) =>
              selectAndFocus(row.node.id, {
                toggle: e.ctrlKey || e.metaKey,
                range: e.shiftKey,
              })
            }
          >
            {row.children.length ? (
              <Button
                variant="ghost"
                size="icon-xs"
                className="tree-chevron"
                tabIndex={-1}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${row.node.name}`}
                disabled={!!query}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(row);
                }}
              >
                {expanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </Button>
            ) : (
              <span className="tree-chevron-spacer" aria-hidden="true" />
            )}
            <RobloxClassIcon className={row.node.className} />
            <span className="tree-name">{row.node.name}</span>
            {status && <span className="tree-status">{status}</span>}
            {row.repeatOriginalId && <span className="tree-status">Copy</span>}
            {overrides[row.node.id] && (
              <span
                className="edited-dot"
                title="Export customization"
                aria-hidden="true"
              />
            )}
          </div>
          {expanded && !!row.children.length && (
            <div className="explorer-group" role="group">
              {render(row.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  }
  const actualClass = chosen?.node.className;
  const schema =
    chosen?.node.worldUI || chosen?.repeatOriginalId || chosen?.node.maskBasis
      ? {}
      : (PROPERTY_SCHEMAS[actualClass ?? ""] ?? {});
  const sourceSchema: Record<string, PropertySpec> = {
    ...schema,
    Name: { kind: "string", group: "Data", default: chosen?.node.name ?? "" },
  };
  const compactGeometry =
    inspectorTab === "layout" &&
    !filter.trim() &&
    propertyView !== "changed" &&
    schema.Size?.kind === "UDim2" &&
    schema.AnchorPoint?.kind === "Vector2" &&
    !chosen?.baked;
  const inspectorSchema =
    inspectorTab === "all" || filter.trim()
      ? studioPropertySchema(sourceSchema)
      : Object.fromEntries(
          Object.entries(sourceSchema).map(([name, spec]) => [
            name,
            {
              ...spec,
              group:
                inspectorSection(spec.group) === "layout"
                  ? "Layout"
                  : inspectorSection(spec.group) === "style"
                    ? "Style"
                    : "Behavior",
            },
          ]),
        );
  const inspectorEdits = {
    ...edit.properties,
    ...(edit.name !== undefined ? { Name: edit.name } : {}),
  };
  const shownFields = propertiesForView(
    inspectorSchema,
    propertyView,
    filter,
    inspectorEdits,
    chosen?.node.properties,
  )
    .filter(
      ([name]) =>
        filter.trim() ||
        inspectorTab === "all" ||
        inspectorSection(sourceSchema[name].group) === inspectorTab,
    )
    .filter(
      ([name]) => !compactGeometry || !["Size", "AnchorPoint"].includes(name),
    );
  const changedCount = propertiesForView(
    inspectorSchema,
    "changed",
    "",
    inspectorEdits,
  ).length;
  const metadata = [
    {
      name: "ClassName",
      value: actualClass ?? "",
      help: "The exported Roblox instance type.",
    },
    {
      name: "Parent",
      value: ancestors.at(-1)?.node.name ?? "Assigned in Studio",
      help: "The exported parent. Root destinations are assigned during import.",
    },
  ].filter(
    ({ name }) =>
      (!!filter.trim() || inspectorTab === "all") &&
      (!!filter.trim() || propertyView !== "changed") &&
      (!filter.trim() ||
        propertyMatches(
          name,
          { kind: "string", group: "Data", default: "" },
          filter,
        )),
  );
  const groups = [
    ...new Set([
      ...shownFields.map(([, s]) => s.group),
      ...(metadata.length ? ["Data"] : []),
    ]),
  ].sort((a, b) => {
    const order = ["Appearance", "Data", "Behavior"];
    const rank = (group: string) =>
      order.includes(group) ? order.indexOf(group) : order.length;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const editableType = chosen?.source !== undefined;
  const layoutParent = flat
    .find((row) => row.children.some((child) => child === chosen))
    ?.node.children.some((node) =>
      ["UIListLayout", "UIGridLayout"].includes(node.className),
    );
  const imageMode =
    edit.renderMode === "image" ||
    edit.className?.startsWith("Image") ||
    !!chosen?.node.assetRef;
  const sourceArtwork =
    result?.package.assets.filter(
      (asset) => asset.nodeId === chosen?.node.id,
    ) ?? [];
  const automaticImage =
    imageMode &&
    !chosen?.baked &&
    (!edit.renderMode || edit.renderMode === "auto") &&
    !edit.className;
  const imageReason = result?.package.assets.find(
    (asset) => asset.id === chosen?.node.assetRef,
  )?.reason;
  const showLayout =
    !!filter.trim() || inspectorTab === "all" || inspectorTab === "layout";
  const showStyle =
    !!filter.trim() || inspectorTab === "all" || inspectorTab === "style";
  const showBehavior =
    !!filter.trim() || inspectorTab === "all" || inspectorTab === "behavior";
  useEffect(() => {
    if (inspectorTab === "all" || filter.trim()) return;
    const sections = Object.values(schema).map((spec) =>
      inspectorSection(spec.group),
    );
    if (sections.length && !sections.includes(inspectorTab))
      setInspectorTab(sections[0]);
  }, [chosen?.node.id]);
  const types = chosen ? layerClassChoices(chosen, edit) : [];
  const layersHeading = (
    <div className="workbench-heading layers-heading">
      <strong>Layers</strong>
      <Badge
        variant="secondary"
        title={query ? "Matching layers" : "Layers and UI modifiers"}
      >
        {query ? flat.filter(isMatch).length : flat.length}
      </Badge>
    </div>
  );
  return (
    <ResizableWorkbench
      tourPanel={tourPanel}
      propertyReveal={propertyReveal}
      onSearchProperties={() => setSearchProperties(true)}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (
          (e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          e.key.toLowerCase() === "p"
        ) {
          e.preventDefault();
          propertyFilter.current?.focus();
          return;
        }
        if (
          target.closest(
            'input,textarea,[role="combobox"],[contenteditable="true"]',
          )
        )
          return;
        if (
          (e.metaKey || e.ctrlKey) &&
          e.key.toLowerCase() === "z" &&
          !e.altKey
        ) {
          if (disabled) return;
          e.preventDefault();
          if (e.shiftKey) onRedo();
          else onUndo();
        } else if (
          tree.current?.contains(target) &&
          classShortcut(e) !== undefined
        ) {
          e.preventDefault();
          if (disabled) return;
          try {
            if (copiedSelection || chosen?.repeatOriginalId)
              throw new Error(
                "Select the original repeat layers to edit all copies.",
              );
            onBatchChange(
              classChanges(
                selectedRows.length ? selectedRows : chosen ? [chosen] : [],
                overrides,
                classShortcut(e)!,
              ),
            );
            setSelectionMessage("");
          } catch (error) {
            setSelectionMessage(
              error instanceof Error
                ? error.message
                : "Cannot assign this class.",
            );
          }
        }
      }}
    >
      <div className="explorer-pane" id="framebridge-layers-pane">
        {layersHeaderHost && createPortal(layersHeading, layersHeaderHost)}
        {layersHeading}
        <div className="explorer-search-control">
          <Input
            ref={searchInput}
            className="explorer-search"
            aria-label="Search layers"
            placeholder="Search layers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearch("");
            }}
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear layer search"
              onClick={() => {
                setSearch("");
                searchInput.current?.focus();
              }}
            >
              <X size={12} />
            </Button>
          )}
        </div>
        <div
          className="explorer-tree"
          role="tree"
          aria-label="Export explorer"
          aria-multiselectable="true"
          ref={tree}
        >
          {render(roots)}
          {!!flat.length && !visible.length && (
            <p className="small-empty" role="status">
              No layers match “{search.trim()}”. Try a layer name or Roblox
              class.
            </p>
          )}
          {!flat.length && (
            <p className="small-empty">
              Analyze a selection to configure its layers.
            </p>
          )}
        </div>
        {!!flat.length && (
          <LayerRuleMatcher
            layers={flat.filter((row) => !row.repeatOriginalId)}
            overrides={overrides}
            disabled={disabled}
            onSelect={(ids) =>
              selectOriginals(flat.filter((row) => ids.includes(row.node.id)))
            }
            onSelectFigma={onFocusMany}
          />
        )}
        {!!flat.length && (
          <div className="explorer-selection-help">
            <span>
              {formatShortcut("click")} to add · Shift to select a range
            </span>
            <Disclosure>
              <DisclosureSummary>Class shortcuts</DisclosureSummary>
              <div className="class-shortcut-list">
                {[
                  "Automatic",
                  "Frame",
                  "TextLabel",
                  "ImageLabel",
                  "TextButton",
                  "ImageButton",
                  "ScrollingFrame",
                ].map((name, i) => (
                  <div key={name}>
                    <kbd>{formatShortcut(`Alt+${i}`)}</kbd>
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            </Disclosure>
            {query && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const matches = visible.filter(isMatch);
                  if (!matches.length) return;
                  const ids = matches.map((row) => row.node.id);
                  selectionRef.current = ids;
                  anchor.current = ids[0];
                  onSelect(ids[0], ids, anchor.current);
                }}
              >
                Select matching
              </Button>
            )}
            {selectionMessage && (
              <span className="property-error" role="alert">
                {selectionMessage}
              </span>
            )}
          </div>
        )}
      </div>
      {children}
      <div
        className="properties-pane studio-properties"
        id="framebridge-properties-pane"
      >
        <div className="workbench-heading">
          <div className="inspector-title">
            {chosen && !multiple && (
              <RobloxClassIcon className={actualClass ?? "Frame"} />
            )}
            <strong title={chosen?.node.name}>
              {multiple
                ? `${selectedRows.length} layers`
                : (chosen?.node.name ?? "Properties")}
            </strong>
          </div>
          <div className="inspector-actions">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Search properties"
              title={`Search properties (${formatShortcut("Shift+P")})`}
              aria-pressed={searchProperties}
              onClick={() => {
                setSearchProperties((open) => !open);
                requestAnimationFrame(() => propertyFilter.current?.focus());
              }}
            >
              <Search size={14} />
            </Button>
            <Popover.Root>
              <Popover.Trigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Inspector actions"
                  title="Inspector actions"
                >
                  <MoreHorizontal size={16} />
                </Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="inspector-actions-popover"
                  align="end"
                  sideOffset={8}
                  collisionPadding={12}
                  aria-label="Inspector actions"
                >
                  <Popover.Close asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setInspectorTab("all");
                        setPropertyView("all");
                      }}
                    >
                      All properties
                    </Button>
                  </Popover.Close>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Undo property edit"
                    title={`Undo property edit (${formatShortcut("Z")})`}
                    disabled={disabled || !canUndo}
                    onClick={onUndo}
                  >
                    <Undo2 size={14} /> Undo
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Redo property edit"
                    title={`Redo property edit (${formatShortcut("Shift+Z")})`}
                    disabled={disabled || !canRedo}
                    onClick={onRedo}
                  >
                    <Redo2 size={14} /> Redo
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="icon-button"
                        aria-label="Locate layer in Figma"
                        title="Locate in Figma"
                        disabled={!chosen || !focusSource || multiple}
                        onClick={() => focusSource && onFocus(focusSource.id)}
                      >
                        <Crosshair size={14} /> Locate in Figma
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Locate layer in Figma</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="icon-button"
                        aria-label={
                          multiple
                            ? "Reset selected layer overrides"
                            : "Reset layer overrides"
                        }
                        title="Reset this layer"
                        disabled={
                          !chosen ||
                          copiedSelection ||
                          !!chosen.repeatOriginalId ||
                          !(multiple
                            ? selectedRows.some((row) => overrides[row.node.id])
                            : overrides[chosen.node.id]) ||
                          disabled
                        }
                        onClick={() =>
                          multiple
                            ? onBatchChange(
                                selectedRows.map((row) => ({
                                  id: row.node.id,
                                  value: undefined,
                                })),
                              )
                            : chosen && onChange(chosen.node.id, undefined)
                        }
                      >
                        <RotateCcw size={14} /> Reset overrides
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset this layer</TooltipContent>
                  </Tooltip>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <CloseInspectorButton />
          </div>
        </div>
        {multiple && (
          <div className="selected-layer bulk-selection-heading">
            <strong>{selectedRows.length} layers selected</strong>
            <span className="muted">
              {[...new Set(selectedRows.map((row) => row.node.className))].join(
                " · ",
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!chosen) return;
                selectionRef.current = [chosen.node.id];
                anchor.current = chosen.node.id;
                onSelect(chosen.node.id, selectionRef.current, anchor.current);
              }}
            >
              Keep only {chosen?.node.name}
            </Button>
          </div>
        )}
        {chosen && !multiple && (
          <div className="studio-modifier-navigation">
            {actualClass?.startsWith("UI") && ancestors.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="modifier-back"
                onClick={() => {
                  const parent = ancestors[ancestors.length - 1];
                  pendingFocus.current = parent.node.id;
                  onSelect(parent.node.id);
                }}
              >
                <ArrowLeft size={12} aria-hidden="true" />
                <span>Back to {ancestors[ancestors.length - 1].node.name}</span>
              </Button>
            )}
          </div>
        )}
        {chosen && !multiple && (
          <ToggleGroup
            type="single"
            className="inspector-sections"
            aria-label="Property section"
            value={inspectorTab}
            onValueChange={(value) => {
              if (!value) return;
              setInspectorTab(value as InspectorSection | "all");
              setPropertyView("all");
              setFilter("");
            }}
          >
            <ToggleGroupItem value="layout">Layout</ToggleGroupItem>
            <ToggleGroupItem value="style">Style</ToggleGroupItem>
            <ToggleGroupItem value="behavior">Behavior</ToggleGroupItem>
            {inspectorTab === "all" && (
              <ToggleGroupItem value="all">All</ToggleGroupItem>
            )}
          </ToggleGroup>
        )}
        {chosen && !multiple && (
          <div
            className="property-toolbar"
            data-search-open={
              searchProperties || !!filter || inspectorTab === "all"
            }
          >
            <div className="property-search-control">
              <Input
                ref={propertyFilter}
                className="property-search"
                aria-label="Search properties"
                placeholder="Search properties…"
                title={`Search properties (${formatShortcut("Shift+P")})`}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setFilter("");
                }}
              />
              {filter && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear property search"
                  onClick={() => {
                    setFilter("");
                    propertyFilter.current?.focus();
                  }}
                >
                  <X size={12} />
                </Button>
              )}
              <Popover.Root>
                <Popover.Trigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Property filter options"
                  >
                    <ChevronDown size={12} />
                  </Button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    side="bottom"
                    align="end"
                    sideOffset={4}
                    className="property-help-tooltip"
                    aria-label="Property filter options"
                  >
                    <div
                      className="property-filter-menu"
                      role="group"
                      aria-label="Property view"
                    >
                      {(["all", "common", "changed"] as const).map((view) => (
                        <Popover.Close key={view} asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-pressed={
                              propertyView === view && inspectorTab === "all"
                            }
                            onClick={() => {
                              setPropertyView(view);
                              setInspectorTab("all");
                            }}
                          >
                            {view === "all"
                              ? "All properties"
                              : view === "common"
                                ? "Common properties"
                                : `Changed properties${changedCount ? ` (${changedCount})` : ""}`}
                          </Button>
                        </Popover.Close>
                      ))}
                    </div>
                    <p>
                      Hover a property for guidance. Expand compound values to
                      edit their components. Bold names have export overrides.
                    </p>
                    <DocumentationLink
                      topic="properties"
                      label="Read the Properties guide"
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
            {filter.trim() && (
              <span className="property-search-status" role="status">
                {shownFields.length + metadata.length}{" "}
                {shownFields.length + metadata.length === 1
                  ? "match"
                  : "matches"}{" "}
                across all properties
              </span>
            )}
          </div>
        )}
        <div className="properties-scroll" ref={propertiesPane}>
          {!chosen && (
            <div className="property-empty">
              <SlidersHorizontal size={24} />
              <p>Select a layer to edit its properties.</p>
            </div>
          )}
          {((multiple && copiedSelection) ||
            (chosen?.repeatOriginalId && !multiple)) && (
            <div className="property-no-results" role="status">
              <strong>
                {multiple ? "Repeated copies selected" : "Repeated copy"}
              </strong>
              <p>
                These copies come from a Figma repeat group. Edit the original
                layer to update every copy. After import, you can edit each copy
                independently in Studio.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  selectOriginals(
                    multiple ? selectedRows : chosen ? [chosen] : [],
                  )
                }
              >
                {multiple
                  ? "Select original layers"
                  : `Edit original ${original?.node.name ?? "layer"}`}
              </Button>
            </div>
          )}
          {chosen?.source?.isMask &&
            chosen.node.className === "CanvasGroup" &&
            !multiple && (
              <div className="property-no-results" role="status">
                <strong>Editable mask</strong>
                <p>
                  CanvasGroup keeps the masked layers editable. Keep this
                  instance type to retain clipping. Moving the mask in Figma
                  crops its content independently; in Studio, the content
                  becomes children of the clip. Responsive exports use a
                  transparent coordinate container to preserve the original
                  parent constraints. Edit the visible children normally; keep
                  that container intact.
                </p>
              </div>
            )}
          {multiple && !copiedSelection && (
            <BulkProperties
              key={selectedRows.map((row) => row.node.id).join("|")}
              layers={selectedRows}
              overrides={overrides}
              disabled={disabled}
              onChange={onBatchChange}
            />
          )}
          {chosen && !multiple && !chosen.repeatOriginalId && (
            <fieldset disabled={disabled} className="property-fields">
              {compactGeometry && (
                <SizeAnchorEditor
                  key={`geometry:${chosen.node.id}`}
                  node={{
                    ...chosen.node,
                    properties: {
                      ...chosen.node.properties,
                      ...edit.properties,
                    },
                  }}
                  ancestors={ancestors.map((row) => ({
                    ...row.node,
                    // Motion slots and world/mask helpers are folded in the
                    // explorer. Resolve layout boxes against those same IDs.
                    children: row.children.map((child) => child.node),
                  }))}
                  disabled={disabled}
                  onDraftValidity={onDraftValidity}
                  onChange={(properties) => {
                    for (const [name, value] of Object.entries(properties))
                      if (!validProperty(actualClass!, name, value))
                        throw new Error(`Invalid ${name} value.`);
                    patch({
                      properties: { ...edit.properties, ...properties },
                    });
                  }}
                />
              )}
              {!shownFields.length &&
                !metadata.length &&
                (filter.trim() ||
                  propertyView === "changed" ||
                  inspectorTab === "all") &&
                !chosen.node.worldUI && (
                  <div className="property-no-results" role="status">
                    <strong>
                      {filter.trim()
                        ? `No properties match “${filter}”.`
                        : propertyView === "changed"
                          ? "No changed properties"
                          : "No editable properties"}
                    </strong>
                    <p>
                      {filter.trim()
                        ? "Try a label such as tint, anchor or text, or a Roblox property name."
                        : propertyView === "changed"
                          ? "Your property edits appear here. Export choices are in Export setup."
                          : "Use Export setup to configure how this layer is exported."}
                    </p>
                    {filter.trim() && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFilter("");
                          propertyFilter.current?.focus();
                        }}
                      >
                        Clear search
                      </Button>
                    )}
                  </div>
                )}
              <LayoutDetails compact={compactGeometry}>
                <Accordion
                  type="multiple"
                  key={
                    chosen.node.id +
                    ":" +
                    propertyView +
                    ":" +
                    inspectorTab +
                    (filter.trim() ? ":filter:" + groups.join("|") : "")
                  }
                  className={`studio-property-table ${inspectorTab !== "all" && !filter.trim() ? "section-property-table" : ""}`}
                  defaultValue={groups}
                >
                  {groups.map((group) => {
                    const fields = shownFields.filter(
                      ([, spec]) => spec.group === group,
                    );
                    const readonlyFields = group === "Data" ? metadata : [];
                    return fields.length || readonlyFields.length ? (
                      <AccordionItem
                        className="property-group"
                        key={group}
                        value={group}
                      >
                        <AccordionTrigger
                          className="property-section-trigger"
                          rotateIcon={false}
                        >
                          {group}
                        </AccordionTrigger>
                        <AccordionContent className="pb-1">
                          <FieldGroup className="property-list">
                            {[
                              ...fields.map(([name, spec]) => ({ name, spec })),
                              ...readonlyFields.map((field) => ({
                                ...field,
                                spec: undefined,
                              })),
                            ]
                              .sort((a, b) => {
                                if (inspectorTab === "all" || filter.trim())
                                  return a.name.localeCompare(b.name);
                                const order = [
                                  "FillDirectionMaxCells",
                                  "CellSize",
                                  "CellPadding",
                                  "Size",
                                  "Position",
                                  "AnchorPoint",
                                  "Rotation",
                                  "AutomaticSize",
                                  "LayoutOrder",
                                  "ZIndex",
                                ];
                                const rank = (name: string) =>
                                  order.includes(name)
                                    ? order.indexOf(name)
                                    : order.length;
                                return (
                                  rank(a.name) - rank(b.name) ||
                                  a.name.localeCompare(b.name)
                                );
                              })
                              .map((field) => {
                                const { name, spec } = field;
                                if (!spec) {
                                  const info = readonlyFields.find(
                                    (row) => row.name === name,
                                  )!;
                                  return (
                                    <div
                                      className="property-row property-readonly"
                                      key={name}
                                      title={info.help}
                                    >
                                      <span className="property-label">
                                        {name}
                                      </span>
                                      <span className="property-control">
                                        {info.value}
                                      </span>
                                    </div>
                                  );
                                }
                                return (
                                  <PropertyField
                                    key={chosen.node.id + ":" + name}
                                    name={name}
                                    friendly={
                                      inspectorTab !== "all" && !filter.trim()
                                    }
                                    ownerLabel={chosen.node.name}
                                    onDraftValidity={onDraftValidity}
                                    validate={(value) =>
                                      name === "Name"
                                        ? typeof value === "string" &&
                                          !!value.trim() &&
                                          value.length <= 100
                                        : validProperty(
                                            actualClass!,
                                            name,
                                            value,
                                          )
                                    }
                                    spec={spec}
                                    value={
                                      (name === "Name"
                                        ? chosen.node.name
                                        : chosen.node.properties[name]) ??
                                      (actualClass === "UICorner" &&
                                      name.endsWith("Radius")
                                        ? (chosen.node.properties
                                            .CornerRadius ??
                                          chosen.node.properties.TopLeftRadius)
                                        : undefined) ??
                                      spec.default
                                    }
                                    overridden={
                                      name === "Name"
                                        ? edit.name !== undefined
                                        : edit.properties?.[name] !== undefined
                                    }
                                    onReset={() => {
                                      if (name === "Name") {
                                        patch({ name: undefined });
                                        return;
                                      }
                                      const properties = { ...edit.properties };
                                      delete properties[name];
                                      patch({ properties });
                                    }}
                                    onChange={(value) => {
                                      if (name === "Name") {
                                        patch({ name: String(value).trim() });
                                        return;
                                      }
                                      if (
                                        !validProperty(
                                          actualClass!,
                                          name,
                                          value,
                                        )
                                      )
                                        throw new Error(
                                          `Invalid ${name} value.`,
                                        );
                                      const properties = {
                                        ...edit.properties,
                                        [name]: value,
                                      };
                                      if (
                                        actualClass === "UICorner" &&
                                        name === "CornerRadius"
                                      )
                                        for (const key of [
                                          "TopLeftRadius",
                                          "TopRightRadius",
                                          "BottomRightRadius",
                                          "BottomLeftRadius",
                                        ])
                                          delete properties[key];
                                      patch({
                                        properties,
                                      });
                                    }}
                                  />
                                );
                              })}
                          </FieldGroup>
                        </AccordionContent>
                      </AccordionItem>
                    ) : null;
                  })}
                </Accordion>
                {showLayout &&
                  schema.Position &&
                  !filter.trim() &&
                  propertyView !== "changed" &&
                  schema.Size && (
                    <>
                      <div className="layout-presets">
                        <Button
                          variant="outline"
                          size="sm"
                          className="secondary"
                          disabled={layoutParent}
                          onClick={() =>
                            patch({
                              properties: {
                                ...edit.properties,
                                Position: {
                                  type: "UDim2",
                                  value: [0.5, 0, 0.5, 0],
                                },
                                AnchorPoint: {
                                  type: "Vector2",
                                  value: [0.5, 0.5],
                                },
                              },
                            })
                          }
                        >
                          Center in parent
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="secondary"
                          disabled={layoutParent}
                          onClick={() =>
                            patch({
                              properties: {
                                ...edit.properties,
                                Position: {
                                  type: "UDim2",
                                  value: [0, 0, 0, 0],
                                },
                                AnchorPoint: {
                                  type: "Vector2",
                                  value: [0, 0],
                                },
                                Size: {
                                  type: "UDim2",
                                  value: [1, 0, 1, 0],
                                },
                              },
                            })
                          }
                        >
                          Fill parent
                        </Button>
                      </div>
                      {layoutParent && (
                        <p className="property-note">
                          The parent's list or grid controls this layer's
                          position.
                        </p>
                      )}
                    </>
                  )}
              </LayoutDetails>
              <div className="inspector-tools">
                {showStyle &&
                  imageMode &&
                  !chosen.baked &&
                  result &&
                  !filter.trim() &&
                  propertyView !== "changed" && (
                    <Disclosure className="export-setup">
                      <DisclosureSummary>
                        <span>Image scaling preview</span>
                      </DisclosureSummary>
                      <ImageScalingEditor
                        key={chosen.node.id}
                        node={chosen.node}
                        disabled={disabled}
                        asset={result.package.assets.find(
                          (asset) => asset.id === chosen.node.assetRef,
                        )}
                        bytes={
                          chosen.node.assetRef
                            ? result.assets[chosen.node.assetRef]
                            : undefined
                        }
                        onChange={(name, value) =>
                          patch({
                            properties: {
                              ...edit.properties,
                              [name]: value,
                            },
                          })
                        }
                      />
                    </Disclosure>
                  )}
                {showLayout && worldRoot && worldSourceId && (
                  <WorldEditor
                    key={"world:" + worldRoot.id}
                    root={worldRoot}
                    value={worldEdit.worldUI}
                    onChange={(worldUI) =>
                      onChange(worldSourceId, { ...worldEdit, worldUI })
                    }
                  />
                )}
                {showStyle && (
                  <Disclosure className="export-setup" key={chosen.node.id}>
                    <DisclosureSummary>
                      <span>Export setup</span>
                      <span className="export-setup-summary">
                        {edit.renderMode === "skip"
                          ? "Excluded"
                          : chosen.baked
                            ? "Inside image"
                            : imageMode
                              ? "Image"
                              : actualClass}
                      </span>
                    </DisclosureSummary>
                    {editableType && (
                      <>
                        <div className="property-row">
                          <label htmlFor="render-mode">Render as</label>
                          <SelectControl
                            id="render-mode"
                            value={edit.renderMode ?? "auto"}
                            onChange={(e) =>
                              patch({
                                renderMode: e.target
                                  .value as LayerOverride["renderMode"],
                                className: undefined,
                              })
                            }
                          >
                            <option value="auto">Automatic</option>
                            <option value="native">Editable UI</option>
                            <option value="image">
                              Image / bake appearance
                            </option>
                            <option value="skip">Exclude from export</option>
                          </SelectControl>
                        </div>
                        {edit.renderMode !== "skip" && (
                          <div className="property-row">
                            <label htmlFor="instance-type">Instance type</label>
                            <SelectControl
                              id="instance-type"
                              renderOption={classOption}
                              value={edit.className ?? "auto"}
                              onChange={(e) =>
                                patch({
                                  className:
                                    e.target.value === "auto"
                                      ? undefined
                                      : e.target.value,
                                  renderMode: e.target.value.startsWith("Image")
                                    ? "image"
                                    : e.target.value === "auto"
                                      ? edit.renderMode
                                      : "native",
                                })
                              }
                            >
                              <option value="auto">Automatic</option>
                              {types.map((t) => (
                                <option key={t}>{t}</option>
                              ))}
                            </SelectControl>
                          </div>
                        )}
                      </>
                    )}
                    {imageMode && (
                      <p className="property-note">
                        {automaticImage
                          ? `Automatically uses ${actualClass} to preserve ${imageReason || "this artwork"}.`
                          : "Exports this layer and its children as an image."}{" "}
                        Its appearance is included in the image; size, position
                        and image properties remain editable.
                      </p>
                    )}
                    {actualClass === "ViewportFrame" && (
                      <p className="property-note">
                        Displays a 3D scene. Add a model and Camera in Studio,
                        then assign CurrentCamera. This preview shows UI
                        overlays only. Updates preserve the scene you add in
                        Studio.
                      </p>
                    )}
                    {edit.className && (
                      <p className="property-note">
                        If this layer was already imported with another type,
                        choose New copy in Studio when importing.
                      </p>
                    )}
                  </Disclosure>
                )}
                {showLayout && chosen.source && !chosen.baked && result && (
                  <ScrollbarEditor
                    key={`scrollbar:${chosen.node.id}`}
                    id={chosen.node.id}
                    result={result}
                    imageScale={imageScale}
                    overrides={overrides}
                    disabled={disabled}
                    onChange={(scrollbar) => patch({ scrollbar })}
                  />
                )}
                {showBehavior && chosen.source && (
                  <BehaviorEditor
                    key={`behaviors:${chosen.node.id}`}
                    source={chosen.source}
                    node={chosen.node}
                    nodes={interactionNodes}
                    edit={edit}
                    onChange={(behavior) => patch({ behavior })}
                  />
                )}
                {showStyle &&
                  !chosen.baked &&
                  (chosen.source ||
                    ["UIStroke", "UIShadow"].includes(
                      chosen.node.className,
                    )) && (
                    <ThemeLayerEditor
                      value={edit.theme}
                      themes={themes}
                      onChange={(theme) => patch({ theme })}
                    />
                  )}
                {showBehavior && chosen.source && (
                  <ConditionalRuleEditor
                    key={`rules:${chosen.node.id}`}
                    source={chosen.source}
                    node={chosen.node}
                    nodes={interactionNodes}
                    edit={edit}
                    disabled={disabled}
                    onChange={(behavior) => patch({ behavior })}
                  />
                )}
                {showBehavior && chosen.source && (
                  <KeyframeEditor
                    key={`keyframes:${chosen.node.id}`}
                    source={chosen.source}
                    node={chosen.node}
                    nodes={recordingNodes(interactionRoot)}
                    edit={edit}
                    onChange={(behavior) => patch({ behavior })}
                  />
                )}
                {showBehavior && chosen.source && (
                  <MotionEditor
                    key={`motion:${chosen.node.id}`}
                    source={chosen.source}
                    node={chosen.node}
                    edit={edit}
                    onChange={(behavior) => patch({ behavior })}
                  />
                )}
                {showStyle &&
                  (imageMode || sourceArtwork.length > 0) &&
                  !chosen.baked && (
                    <ImagePreparation
                      value={edit.imageProcessing}
                      allowWhiteMask={
                        imageMode ||
                        sourceArtwork.some((asset) => asset.scrollbarSlice)
                      }
                      onChange={(imageProcessing) => {
                        const properties = { ...edit.properties };
                        delete properties.Image;
                        patch({ properties, imageProcessing });
                      }}
                    />
                  )}
                {chosen.baked && (
                  <p className="property-note">
                    This layer is inside a baked image. Switch its parent to
                    Editable UI to configure it separately.
                  </p>
                )}
              </div>

              {showLayout && schema.Size && (
                <Disclosure
                  className="modifier-tools"
                  data-tour="layout-tools"
                  key={`modifiers:${chosen.node.id}`}
                >
                  <DisclosureSummary>
                    <span>Constraints & modifiers</span>
                    <span className="export-setup-summary">
                      {chosen.children.filter((row) =>
                        row.node.className.startsWith("UI"),
                      ).length || "Add"}
                    </span>
                  </DisclosureSummary>
                  <div className="modifier-list">
                    {chosen.children
                      .filter((row) => row.node.className.startsWith("UI"))
                      .map((row) => (
                        <button
                          type="button"
                          key={row.node.id}
                          onClick={() => {
                            pendingFocus.current = row.node.id;
                            onSelect(row.node.id);
                          }}
                          title={`Edit ${row.node.className}`}
                        >
                          <RobloxClassIcon className={row.node.className} />
                          <span>
                            {MODIFIER_LABELS[row.node.className] ??
                              row.node.className}
                          </span>
                          <ChevronRight size={12} aria-hidden="true" />
                        </button>
                      ))}
                  </div>
                  <label htmlFor="add-modifier">
                    <Plus size={13} /> Add a modifier
                  </label>
                  <SelectControl
                    id="add-modifier"
                    renderOption={(_value, label) =>
                      label === "Choose modifier…" ? (
                        label
                      ) : (
                        <span className="roblox-class-option">
                          <RobloxClassIcon className={label} />
                          <span>
                            {MODIFIER_LABELS[label]}
                            <small className="modifier-class-name">
                              {label}
                            </small>
                          </span>
                        </span>
                      )
                    }
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const key = e.target
                        .value as keyof typeof COMPONENT_CLASSES;
                      onBatchChange([
                        {
                          id: chosen.node.id,
                          value: {
                            ...edit,
                            components: {
                              ...edit.components,
                              [key]: defaultProperties(COMPONENT_CLASSES[key]),
                            },
                          },
                        },
                        { id: `${chosen.node.id}/${key}`, value: undefined },
                      ]);
                      setPropertyView("common");
                      pendingFocus.current = `${chosen.node.id}/${key}`;
                      onSelect(`${chosen.node.id}/${key}`);
                    }}
                  >
                    <option value="">Choose modifier…</option>
                    {Object.entries(COMPONENT_CLASSES).map(([key, cls]) => (
                      <option key={key} value={key}>
                        {cls}
                      </option>
                    ))}
                  </SelectControl>
                  <p className="modifier-guidance">
                    Add corners, outlines or size constraints. Select a modifier
                    above to edit it.
                  </p>
                </Disclosure>
              )}
              {actualClass?.startsWith("UI") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="secondary remove-modifier"
                  onClick={() => {
                    patch({ renderMode: "skip" });
                    const parent = ancestors[ancestors.length - 1];
                    if (parent) {
                      pendingFocus.current = parent.node.id;
                      onSelect(parent.node.id);
                    }
                  }}
                >
                  Remove modifier from export
                </Button>
              )}
            </fieldset>
          )}
        </div>
      </div>
    </ResizableWorkbench>
  );
}
