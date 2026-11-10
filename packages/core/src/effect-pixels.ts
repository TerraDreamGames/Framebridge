import { decode, encode } from "fast-png";
import { validatePngPixels } from "./image-processing";
export const DECORATION_PIXELS = 4194304;
export const EFFECT_ERROR = 3 / 255;
function pixels(bytes: Uint8Array) {
  const info = validatePngPixels(bytes, DECORATION_PIXELS);
  if (info.depth !== 8 || ![2, 6].includes(info.color))
    throw new Error(
      "Decoration extraction needs an 8-bit sRGB RGB/RGBA render.",
    );
  const decoded = decode(info.bytes);
  if (![3, 4].includes(decoded.channels) || decoded.depth !== 8)
    throw new Error("Unsupported decoration pixel samples.");
  return decoded;
}
/** Encode the effect for its native painter order; source opacity is applied once. */
export async function extractShadowPng(
  withEffect: Uint8Array,
  withoutEffect: Uint8Array,
  check: () => void = () => {},
  placement: { order: "below" | "above"; opacity: number } = {
    order: "below",
    opacity: 1,
  },
) {
  if (
    !["below", "above"].includes(placement.order) ||
    !Number.isFinite(placement.opacity) ||
    placement.opacity < 0 ||
    placement.opacity > 1
  )
    throw new Error("Invalid effect painter order or opacity.");
  check();
  const full = pixels(withEffect),
    base = pixels(withoutEffect);
  if (full.width !== base.width || full.height !== base.height)
    throw new Error("Drop-effect exports must have identical pixel bounds.");
  const count = full.width * full.height,
    out = new Uint8Array(count * 4);
  let maxError = 0,
    opaquePixels = 0;
  for (let i = 0; i < count; i++) {
    if (i % 32768 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      check();
    }
    const fi = i * full.channels,
      bi = i * base.channels,
      oi = i * 4;
    const opacity = placement.order === "above" ? placement.opacity : 1,
      originalBaseAlpha = base.channels === 4 ? base.data[bi + 3] / 255 : 1,
      fa = (full.channels === 4 ? full.data[fi + 3] / 255 : 1) * opacity,
      ba = originalBaseAlpha * opacity,
      rest = 1 - ba;
    let ea = rest ? Math.max(0, Math.min(1, (fa - ba) / rest)) : 0;
    if (originalBaseAlpha === 1) opaquePixels++;
    // Native text already has source opacity. Its child helper receives that same
    // transparency, so encode the inverse factor rather than applying it twice.
    out[oi + 3] = Math.round((opacity ? ea / opacity : 0) * 255);
    ea = (out[oi + 3] / 255) * opacity;
    maxError = Math.max(maxError, Math.abs(ba + ea * rest - fa));
    for (let c = 0; c < 3; c++) {
      const fp = (full.data[fi + c] / 255) * fa,
        bp = (base.data[bi + c] / 255) * ba;
      const sample =
        placement.order === "above"
          ? ea
            ? (fp - (1 - ea) * bp) / ea
            : 0
          : ea && rest
            ? (fp - bp) / rest / ea
            : 0;
      out[oi + c] = Math.round(Math.max(0, Math.min(1, sample)) * 255);
      const reconstructed =
        placement.order === "above"
          ? (out[oi + c] / 255) * ea + (1 - ea) * bp
          : bp + (out[oi + c] / 255) * ea * rest;
      maxError = Math.max(maxError, Math.abs(reconstructed - fp));
    }
    if (maxError > EFFECT_ERROR + 1e-9)
      throw new Error(
        "Drop-effect pixels cannot be separated within the reconstruction limit. Keep the approximation or explicitly render this layer as an image.",
      );
  }
  check();
  return {
    bytes: encode({
      width: full.width,
      height: full.height,
      channels: 4,
      depth: 8,
      data: out,
    }),
    maxError,
    opaquePixels,
  };
}
