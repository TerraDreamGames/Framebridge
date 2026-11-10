import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  imageMode,
  numericValue,
  sliceProblem,
  textureSize,
} from "../../../packages/core/src/image-scaling";
import type { Asset, RbxNode, Value } from "../../../packages/core/src/types";
import { ImageArtwork, pngDataUrl } from "./ImageArtwork";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

export function ImageScalingEditor({
  node,
  asset,
  bytes,
  disabled,
  onChange,
}: {
  node: RbxNode;
  asset?: Asset;
  bytes?: number[];
  disabled?: boolean;
  onChange: (name: string, value: Value) => void;
}) {
  const mode = imageMode(node.properties),
    size = textureSize(asset, bytes);
  const source = numericValue(node.properties.SliceCenter, [0, 0, 0, 0]);
  const [guides, setGuides] = useState(source),
    [width, setWidth] = useState(240),
    [height, setHeight] = useState(120);
  const dragging = useRef(false),
    canvas = useRef<HTMLDivElement>(null),
    latestGuides = useRef(guides);
  const url = useMemo(() => (bytes ? pngDataUrl(bytes) : undefined), [bytes]);
  useEffect(() => {
    if (!dragging.current) setGuides(source);
  }, [JSON.stringify(source)]);
  const updateGuides = (next: number[]) => {
    latestGuides.current = next;
    setGuides(next);
  };
  if (!["Slice", "Tile"].includes(mode)) return null;
  const center = mode === "Slice" ? guides : source;
  const problem =
    mode === "Slice" && size ? sliceProblem(center, size) : undefined;
  const previewProperties = {
    ...node.properties,
    SliceCenter: { type: "Rect", value: center } as Value,
  };
  const range = (index: number) => {
    const axis = index % 2;
    return [
      index < 2 ? 0 : Math.min(size![axis], Math.max(0, guides[axis])),
      index < 2
        ? Math.min(size![axis], Math.max(0, guides[index + 2]))
        : size![axis],
    ];
  };
  const clamp = (index: number, n: number) => {
    const [min, max] = range(index);
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  const commit = (next: number[]) =>
    onChange("SliceCenter", { type: "Rect", value: next });
  return (
    <div className="image-scaling-editor editor-section">
      {mode === "Slice" && (
        <Disclosure className="slice-editor">
          <DisclosureSummary>Edit slice guides</DisclosureSummary>
          {url && size ? (
            <>
              <p className="property-note">
                Source texture: {size[0]} × {size[1]} px. Drag a guide or use
                arrow keys. Shift moves 10 px.
              </p>
              <div
                ref={canvas}
                className="slice-source"
                style={{
                  aspectRatio: `${size[0]} / ${size[1]}`,
                  width: `min(100%, ${(300 * size[0]) / size[1]}px)`,
                }}
              >
                <img
                  src={url}
                  alt={`${node.name} source texture`}
                  draggable={false}
                />
                <div
                  className="slice-center-overlay"
                  aria-hidden="true"
                  style={{
                    left: `${(center[0] / size[0]) * 100}%`,
                    top: `${(center[1] / size[1]) * 100}%`,
                    width: `${(Math.max(0, center[2] - center[0]) / size[0]) * 100}%`,
                    height: `${(Math.max(0, center[3] - center[1]) / size[1]) * 100}%`,
                  }}
                />
                {["Left", "Top", "Right", "Bottom"].map((name, index) => (
                  <button
                    type="button"
                    key={name}
                    role="slider"
                    aria-label={`${name} slice guide`}
                    aria-valuemin={range(index)[0]}
                    aria-valuemax={range(index)[1]}
                    aria-orientation={index % 2 ? "vertical" : "horizontal"}
                    aria-valuenow={center[index]}
                    aria-valuetext={`${center[index]} source pixels`}
                    disabled={disabled}
                    className={`slice-guide ${index % 2 ? "horizontal" : "vertical"}`}
                    style={
                      index % 2
                        ? { top: `${(center[index] / size[1]) * 100}%` }
                        : { left: `${(center[index] / size[0]) * 100}%` }
                    }
                    onPointerDown={(event) => {
                      if (disabled || dragging.current || event.button !== 0)
                        return;
                      event.preventDefault();
                      event.currentTarget.focus({ preventScroll: true });
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragging.current = true;
                      latestGuides.current = guides;
                    }}
                    onPointerMove={(event) => {
                      if (
                        disabled ||
                        !event.currentTarget.hasPointerCapture(event.pointerId)
                      )
                        return;
                      const rect = canvas.current!.getBoundingClientRect(),
                        next = [...latestGuides.current];
                      next[index] = clamp(
                        index,
                        index % 2
                          ? ((event.clientY - rect.top) / rect.height) * size[1]
                          : ((event.clientX - rect.left) / rect.width) *
                              size[0],
                      );
                      updateGuides(next);
                    }}
                    onPointerUp={(event) => {
                      if (
                        !event.currentTarget.hasPointerCapture(event.pointerId)
                      )
                        return;
                      dragging.current = false;
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                      if (!disabled) commit(latestGuides.current);
                    }}
                    onPointerCancel={() => {
                      dragging.current = false;
                      updateGuides(source);
                    }}
                    onLostPointerCapture={() => {
                      if (!dragging.current) return;
                      dragging.current = false;
                      updateGuides(source);
                    }}
                    onKeyDown={(event) => {
                      if (
                        ![
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                        ].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      const next = [...guides];
                      next[index] = clamp(
                        index,
                        next[index] +
                          (["ArrowLeft", "ArrowUp"].includes(event.key)
                            ? -1
                            : 1) *
                            (event.shiftKey ? 10 : 1),
                      );
                      updateGuides(next);
                      commit(next);
                    }}
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const left = Math.floor(size[0] / 4),
                    top = Math.floor(size[1] / 4),
                    next = [left, top, size[0] - left, size[1] - top];
                  updateGuides(next);
                  commit(next);
                }}
              >
                Start with 25% borders
              </Button>
              <p className="property-note">
                The center stretches in both directions. Corners keep their
                shape; edges stretch along one axis. Tune Border scale for the
                desired thickness.
              </p>
            </>
          ) : (
            <p className="property-note">
              Analyze this image to edit guides visually. For a manually linked
              texture, enter its source pixel coordinates in Slice guides.
            </p>
          )}
        </Disclosure>
      )}
      {mode === "Tile" && size && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange("TileSize", {
              type: "UDim2",
              value: [0, size[0], 0, size[1]],
            })
          }
        >
          Use texture pixel size
        </Button>
      )}
      {problem && (
        <p className="property-error" role="alert">
          {problem}
        </p>
      )}
      {url && size && (
        <Disclosure className="image-resize-preview">
          <DisclosureSummary>Preview resizing</DisclosureSummary>
          <div className="image-preview-controls">
            {(
              [
                ["width", width, setWidth],
                ["height", height, setHeight],
              ] as const
            ).map(([axis, value, set]) => (
              <label key={axis}>
                {axis === "width" ? "Width" : "Height"} (px)
                <Input
                  aria-label={`Image preview ${axis}`}
                  type="number"
                  min={1}
                  max={960}
                  value={value}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next) && next >= 1 && next <= 960)
                      set(next);
                  }}
                />
              </label>
            ))}
          </div>
          <div className="image-resize-viewport">
            <div className="image-resize-sample" style={{ width, height }}>
              <ImageArtwork
                url={url}
                size={size}
                width={width}
                height={height}
                properties={previewProperties}
                whiteMask={asset?.processing?.whiteMask}
                name={node.name}
              />
            </div>
          </div>
          <p className="property-note">
            Approximate browser preview; these dimensions only change this
            preview. Confirm the uploaded texture in Studio, especially if
            Roblox resizes it.
          </p>
        </Disclosure>
      )}
    </div>
  );
}
