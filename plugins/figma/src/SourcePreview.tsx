import { useEffect, useRef, useState } from "react";
import { previewCamera } from "./preview-viewport";
import { previewImageSource } from "./preview-image-source";

/** Source and native previews share one fit/zoom convention and the same viewport. */
export function SourcePreview({
  src,
  name,
  authored,
  zoom,
  stale,
}: {
  src: string;
  name: string;
  authored: readonly [number, number];
  zoom: number;
  stale: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number]>([400, 400]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize([entry.contentRect.width, entry.contentRect.height]),
    );
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const camera = previewCamera(
    size,
    { x: 0, y: 0, w: authored[0], h: authored[1] },
    zoom,
  );
  return (
    <div ref={viewport} className="source-preview-viewport">
      <img
        className={`source-preview ${stale ? "stale-preview" : ""}`}
        style={{
          width: authored[0],
          height: authored[1],
          transform: camera.transform,
          transformOrigin: "0 0",
        }}
        src={previewImageSource(src)}
        alt={`Figma source: ${name}`}
      />
    </div>
  );
}
