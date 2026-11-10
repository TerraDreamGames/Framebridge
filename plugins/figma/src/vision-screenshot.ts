import {
  VISION_LIMITS,
  validVisionRegion,
  type VisionRegion,
} from "../../../packages/core/src/vision-review";
/** Re-render the approved crop locally: strips PNG ancillary data and excludes pixels outside the region. */
export async function prepareVisionScreenshot(
  source: string,
  region: VisionRegion,
): Promise<string> {
  if (
    !source?.startsWith("data:image/png;base64,") ||
    !validVisionRegion(region)
  )
    throw new Error(
      "Analyze again to obtain a source screenshot for this screen.",
    );
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("Source screenshot could not be decoded."));
    image.src = source;
  });
  const width = Math.max(1, Math.round(image.naturalWidth * region.width)),
    height = Math.max(1, Math.round(image.naturalHeight * region.height));
  const ratio = Math.min(1, VISION_LIMITS.imageEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Screenshot preparation is unavailable. Review locally.");
  context.drawImage(
    image,
    image.naturalWidth * region.x,
    image.naturalHeight * region.y,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const result = canvas.toDataURL("image/png");
  if (result.length > Math.ceil(VISION_LIMITS.imageBytes / 3) * 4 + 22)
    throw new Error("Screenshot is too large. Choose a smaller region.");
  return result;
}
