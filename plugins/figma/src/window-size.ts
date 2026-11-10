export const WINDOW_SIZE_KEY = "framebridge-window-size";
export const DEFAULT_WINDOW_SIZE = { width: 900, height: 720 };
export const MIN_WINDOW_SIZE = { width: 600, height: 420 };
export const MAX_WINDOW_SIZE = { width: 1800, height: 1400 };

export function windowSize(
  value: unknown,
): { width: number; height: number } | undefined {
  if (!value || typeof value !== "object") return;
  const { width, height } = value as { width?: unknown; height?: unknown };
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  )
    return;
  return {
    width: Math.round(
      Math.max(MIN_WINDOW_SIZE.width, Math.min(MAX_WINDOW_SIZE.width, width)),
    ),
    height: Math.round(
      Math.max(
        MIN_WINDOW_SIZE.height,
        Math.min(MAX_WINDOW_SIZE.height, height),
      ),
    ),
  };
}
