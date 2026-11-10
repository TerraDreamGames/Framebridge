import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "./components/Glyph";
import {
  DEFAULT_OPTIONS,
  type AnalysisResult,
  type LayerOverride,
} from "../../../packages/core/src/types";
import {
  designIndex,
  prepareScrollbars,
  scrollbarCandidates,
  scrollbarSlicePixels,
  type ScrollbarSettings,
} from "../../../packages/core/src/scrollbar";
import { textureSize } from "../../../packages/core/src/image-scaling";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { SelectControl } from "./components/SelectControl";
import { pngDataUrl } from "./ImageArtwork";

export function ScrollbarEditor({
  id,
  result,
  overrides,
  onChange,
  disabled,
  imageScale = result.package.options.imageScale,
}: {
  id: string;
  result: AnalysisResult;
  overrides: Record<string, LayerOverride>;
  onChange: (value: ScrollbarSettings | false) => void;
  disabled?: boolean;
  imageScale?: number;
}) {
  const designs = result.designs ?? [],
    index = useMemo(() => designIndex(designs), [designs]),
    viewport = index.nodes.get(id);
  const artifacts = useMemo(() => {
      const used = new Set(
        Object.entries(overrides).flatMap(([owner, edit]) =>
          owner !== id && edit.scrollbar ? [edit.scrollbar.artworkId] : [],
        ),
      );
      return scrollbarCandidates(designs, id, true).filter(
        ({ source }) => !used.has(source.id),
      );
    }, [designs, id, overrides]),
    choices = artifacts.filter((item) => item.reason !== "Artwork source"),
    value = overrides[id]?.scrollbar;
  const initial = (): ScrollbarSettings =>
    value || {
      artworkId: choices[0]?.source.id ?? "",
      axis: choices[0]?.axis ?? "Y",
      startCap: 0.1,
      endCap: 0.1,
      thickness: Math.min(
        100,
        Math.max(
          1,
          choices[0]
            ? Math.min(choices[0].source.width, choices[0].source.height)
            : 6,
        ),
      ),
    };
  const [draft, setDraft] = useState(initial),
    [open, setOpen] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setDraft(initial());
    setNotice("");
  }, [id, JSON.stringify(value)]);
  if (
    !viewport ||
    viewport.text ||
    (!viewport.children.length &&
      !["FRAME", "GROUP", "COMPONENT", "INSTANCE", "SECTION"].includes(
        viewport.type,
      ))
  )
    return null;
  const containers = [...index.nodes.values()].filter(
    (n) =>
      n.id !== id &&
      n.id !== draft.artworkId &&
      n.visible &&
      !n.text &&
      n.children.length &&
      index.roots.get(n.id) === index.roots.get(id),
  );
  let problem = "";
  try {
    prepareScrollbars(
      designs,
      {
        ...DEFAULT_OPTIONS,
        layerOverrides: {
          ...overrides,
          [id]: { ...overrides[id], scrollbar: draft },
        },
      },
      true,
    );
    const source = index.nodes.get(draft.artworkId)!;
    const original = result.package.assets.find(
      (asset) =>
        asset.nodeId === source.id &&
        !asset.scrollbarSlice &&
        !asset.renderMode,
    );
    const measured = original
      ? textureSize(original, result.assets[original.id])
      : undefined;
    // Before the first render, use the analyzed source bounds. The renderer
    // still validates the actual PNG, including any extra effect pixels.
    const bounds = source.rasterBounds ?? source;
    const scale = imageScale / result.package.options.imageScale;
    const size = measured
      ? measured.map((n) => Math.ceil(n * scale))
      : [
          Math.ceil(bounds.width * imageScale),
          Math.ceil(bounds.height * imageScale),
        ];
    const length = size[draft.axis === "X" ? 0 : 1];
    for (const [start, end] of [
      [0, draft.startCap],
      [draft.startCap, 1 - draft.endCap],
      [1 - draft.endCap, 1],
    ])
      scrollbarSlicePixels({ axis: draft.axis, start, end }, length);
  } catch (error) {
    problem =
      error instanceof Error
        ? error.message
        : "Review the scrollbar configuration.";
  }
  // Asset identity belongs to the artwork source; the viewport owns its three bindings.
  const pieces = value
    ? result.package.assets.filter(
        (a) => a.nodeId === value.artworkId && a.scrollbarSlice,
      )
    : [];
  const field = (key: "startCap" | "endCap" | "thickness", label: string) => (
    <div className="property-row" key={key}>
      <label htmlFor={`scrollbar-${id}-${key}`}>{label}</label>
      <Input
        id={`scrollbar-${id}-${key}`}
        type="number"
        step={key === "thickness" ? 1 : 0.5}
        min={key === "thickness" ? 1 : 0.1}
        max={key === "thickness" ? 100 : 99.9}
        value={
          key === "thickness"
            ? draft[key]
            : Number((draft[key] * 100).toFixed(4))
        }
        onChange={(e) =>
          setDraft({
            ...draft,
            [key]: Number(e.target.value) / (key === "thickness" ? 1 : 100),
          })
        }
      />
    </div>
  );
  return (
    <Disclosure
      className="export-setup scrollbar-editor editor-section"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <DisclosureSummary>
        <span>Custom scrollbar</span>
        <span className="export-setup-summary">
          {value
            ? "Configured"
            : choices.length
              ? "Review artwork"
              : "Optional"}
        </span>
      </DisclosureSummary>
      <p className="property-note">
        <strong>{viewport.name}</strong> · choose the thumb artwork and
        scrolling direction.
      </p>
      <div className="property-row">
        <label htmlFor={`scrollbar-${id}-artwork`}>Thumb artwork</label>
        <SelectControl
          id={`scrollbar-${id}-artwork`}
          value={draft.artworkId}
          onChange={(e) => {
            const item = artifacts.find((c) => c.source.id === e.target.value);
            setDraft({
              ...draft,
              artworkId: e.target.value,
              axis: item?.axis ?? draft.axis,
            });
          }}
        >
          <option value="">Choose artwork</option>
          {artifacts.map((c) => (
            <option key={c.source.id} value={c.source.id}>
              {c.source.name} · {c.reason}
            </option>
          ))}
        </SelectControl>
      </div>
      <div className="property-row">
        <label htmlFor={`scrollbar-${id}-content`}>Moving content</label>
        <SelectControl
          id={`scrollbar-${id}-content`}
          value={draft.contentId ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, contentId: e.target.value || undefined })
          }
        >
          <option value="">Existing viewport children</option>
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectControl>
      </div>
      {draft.contentId && (
        <p className="property-note">
          The selected content moves into this viewport on export, keeping its
          measured position.
        </p>
      )}
      <div className="property-row">
        <label htmlFor={`scrollbar-${id}-axis`}>Direction</label>
        <SelectControl
          id={`scrollbar-${id}-axis`}
          value={draft.axis}
          onChange={(e) =>
            setDraft({ ...draft, axis: e.target.value as "X" | "Y" })
          }
        >
          <option value="Y">Vertical</option>
          <option value="X">Horizontal</option>
        </SelectControl>
      </div>
      {field("startCap", draft.axis === "Y" ? "Top cap · %" : "Left cap · %")}
      {field("endCap", draft.axis === "Y" ? "Bottom cap · %" : "Right cap · %")}
      {field("thickness", "Thickness · px")}
      <p className="property-note">
        Caps include shadows. Roblox stretches the middle and controls the
        thumb’s length and position; the track is not exported.
      </p>
      {problem && (
        <p className="property-note" role="alert">
          {problem}
        </p>
      )}
      {notice && (
        <p className="property-note" role="status">
          {notice}
        </p>
      )}
      <div className="scrollbar-actions">
        <Button
          size="sm"
          disabled={disabled || !!problem}
          onClick={() => {
            onChange(draft);
            setNotice(
              "Scrollbar confirmed. Review its three images in Images before sending.",
            );
          }}
        >
          Confirm scrollbar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setDraft(initial());
            setOpen(false);
            setNotice("");
          }}
        >
          Cancel
        </Button>
        {value && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onChange(false)}
          >
            Remove scrollbar
          </Button>
        )}
      </div>
      {!!pieces.length && (
        <div className="scrollbar-pieces">
          {pieces.map((asset) => (
            <div key={asset.id}>
              {result.assets[asset.id] && (
                <img
                  src={pngDataUrl(result.assets[asset.id])}
                  alt={asset.name}
                />
              )}
              <span>
                {asset.reason.replace("Native scrollbar ", "")}
                <small>{asset.pixelSize?.join(" × ")} px</small>
              </span>
            </div>
          ))}
        </div>
      )}
    </Disclosure>
  );
}
