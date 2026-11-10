export const PREVIEW_PRESETS = {
  phone: { label: "Phone", size: [390, 844] },
  tablet: { label: "Tablet", size: [1024, 768] },
  desktop: { label: "Desktop", size: [1920, 1080] },
} as const;

export type PreviewViewport = {
  preset: "design" | "custom" | keyof typeof PREVIEW_PRESETS;
  rotated: boolean;
  custom: readonly [number, number];
};

export const DEFAULT_PREVIEW_VIEWPORT: PreviewViewport = {
  preset: "design",
  rotated: false,
  custom: [400, 300],
};

/** UI canvas pixels, rather than physical device pixels or emulated device insets. */
export function previewViewportSize(
  choice: PreviewViewport,
  authored: readonly [number, number],
): [number, number] {
  const size =
    choice.preset === "design"
      ? authored
      : choice.preset === "custom"
        ? choice.custom
        : PREVIEW_PRESETS[choice.preset].size;
  return choice.rotated ? [size[1], size[0]] : [size[0], size[1]];
}

export function parsePreviewDimension(raw: string): number | undefined {
  if (!/^\d+$/.test(raw.trim())) return;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 64 && value <= 8192
    ? value
    : undefined;
}

export function previewFitScale(
  available: readonly [number, number],
  canvas: readonly [number, number],
  zoom: number,
) {
  return (
    Math.max(
      0.01,
      Math.min(
        Math.max(0, available[0] - 24) / Math.max(1, canvas[0]),
        Math.max(0, available[1] - 24) / Math.max(1, canvas[1]),
        1,
      ),
    ) * zoom
  );
}

export type PreviewFrame = { x: number; y: number; w: number; h: number };

/** A camera crop, not a change to the authored screen or exported geometry. */
export function previewArtworkFrame(
  boxes: readonly PreviewFrame[],
  canvas: readonly [number, number],
): PreviewFrame {
  const visible = boxes.filter(
    (box) =>
      [box.x, box.y, box.w, box.h].every(Number.isFinite) &&
      box.w > 0 &&
      box.h > 0,
  );
  const x = Math.max(0, Math.min(...visible.map((box) => box.x)));
  const y = Math.max(0, Math.min(...visible.map((box) => box.y)));
  const right = Math.min(
    canvas[0],
    Math.max(...visible.map((box) => box.x + box.w)),
  );
  const bottom = Math.min(
    canvas[1],
    Math.max(...visible.map((box) => box.y + box.h)),
  );
  return right > x && bottom > y
    ? { x, y, w: right - x, h: bottom - y }
    : { x: 0, y: 0, w: canvas[0], h: canvas[1] };
}

export function previewCamera(
  available: readonly [number, number],
  frame: PreviewFrame,
  zoom: number,
) {
  const scale = previewFitScale(available, [frame.w, frame.h], zoom);
  return {
    scale,
    transform: `translate(${-(frame.x + frame.w / 2) * scale}px, ${-(frame.y + frame.h / 2) * scale}px) scale(${scale})`,
  };
}
