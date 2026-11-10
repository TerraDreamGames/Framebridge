import React, { type CSSProperties } from "react";
import {
  imageMode,
  nineSlice,
  numericValue,
  tileDimensions,
} from "../../../packages/core/src/image-scaling";
import type { Value } from "../../../packages/core/src/types";

export function pngDataUrl(bytes: number[]) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.slice(i, i + 8192));
  return "data:image/png;base64," + btoa(binary);
}
export function ImageArtwork({
  url,
  size,
  width,
  height,
  properties,
  whiteMask,
  name,
  layerId,
}: {
  url: string;
  size?: [number, number];
  width: number;
  height: number;
  properties: Record<string, Value>;
  whiteMask?: boolean;
  name: string;
  layerId?: string;
}) {
  const mode = imageMode(properties),
    opacity = 1 - Number(properties.ImageTransparency ?? 0);
  const color = numericValue(properties.ImageColor3, [1, 1, 1]);
  const tint = `rgb(${color.map((n) => n * 255).join(",")})`;
  const frame: CSSProperties = {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    opacity,
  };
  const paint = (style: CSSProperties) =>
    whiteMask
      ? {
          backgroundColor: tint,
          maskImage: `url("${url}")`,
          maskRepeat: "no-repeat",
          ...style,
        }
      : {
          backgroundImage: `url("${url}")`,
          backgroundRepeat: "no-repeat",
          ...style,
        };
  if (mode === "Tile") {
    const [tw, th] = tileDimensions(properties.TileSize, width, height);
    return (
      <div
        aria-label={`${name} tiled image`}
        data-preview-image-artwork={layerId}
        data-preview-scaling="Tile"
        data-preview-artwork-resting={JSON.stringify({
          backgroundColor: whiteMask ? tint : "",
          backgroundPosition: "",
          maskPosition: "",
        })}
        data-preview-tint-mask={whiteMask ? layerId : undefined}
        style={{
          ...frame,
          ...paint(
            whiteMask
              ? { maskRepeat: "repeat", maskSize: `${tw}px ${th}px` }
              : {
                  backgroundRepeat: "repeat",
                  backgroundSize: `${tw}px ${th}px`,
                },
          ),
        }}
      />
    );
  }
  if (mode === "Slice") {
    const patches = size
      ? nineSlice(
          size,
          numericValue(properties.SliceCenter, [0, 0, 0, 0]),
          Number(properties.SliceScale ?? 1),
          width,
          height,
        )
      : [];
    return (
      <div
        aria-label={`${name} nine-slice image`}
        data-preview-image-artwork={layerId}
        data-preview-scaling="Slice"
        style={frame}
      >
        {patches.length ? (
          patches.map(({ source: s, destination: d }, index) => {
            const scaleX = d[2] / s[2],
              scaleY = d[3] / s[3];
            const scaledSize = `${size![0] * scaleX}px ${size![1] * scaleY}px`,
              position = `${-s[0] * scaleX}px ${-s[1] * scaleY}px`;
            return (
              <div
                key={index}
                data-image-patch={index}
                data-preview-tint-mask={whiteMask ? layerId : undefined}
                data-preview-artwork-resting={JSON.stringify({
                  backgroundColor: whiteMask ? tint : "",
                })}
                style={{
                  position: "absolute",
                  left: d[0],
                  top: d[1],
                  width: d[2],
                  height: d[3],
                  ...paint(
                    whiteMask
                      ? { maskSize: scaledSize, maskPosition: position }
                      : {
                          backgroundSize: scaledSize,
                          backgroundPosition: position,
                        },
                  ),
                }}
              />
            );
          })
        ) : (
          <span className="image-preview-unavailable">
            {size
              ? "Set slice guides to preview"
              : "Texture dimensions unavailable"}
          </span>
        )}
      </div>
    );
  }
  return whiteMask ? (
    <div
      data-preview-tint-mask={layerId}
      data-preview-image-artwork={layerId}
      data-preview-artwork-resting={JSON.stringify({ backgroundColor: tint })}
      style={{
        ...frame,
        ...paint({
          maskPosition: "center",
          maskSize:
            mode === "Fit"
              ? "contain"
              : mode === "Crop"
                ? "cover"
                : "100% 100%",
        }),
      }}
    />
  ) : (
    <img
      alt={name}
      data-preview-image-artwork={layerId}
      src={url}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit:
          mode === "Fit" ? "contain" : mode === "Crop" ? "cover" : "fill",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}
