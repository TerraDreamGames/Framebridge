/** Previews are local image data, never remote URLs or navigation targets. */
export function previewImageSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (
    /^data:image\/(?:png|jpeg|webp|svg\+xml)(?:;base64|;charset=utf-8)?,/i.test(
      value,
    )
  )
    return value;
  // Object URLs are minted locally for decoded image bytes. They are rendered
  // only as <img>, which cannot execute an SVG document as a browsing context.
  if (value.startsWith("blob:")) {
    try {
      const url = new URL(value);
      if (url.protocol === "blob:") return value;
    } catch {
      /* Malformed object URL. */
    }
  }
  return undefined;
}
