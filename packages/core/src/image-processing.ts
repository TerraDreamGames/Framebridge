import { decode, encode, hasPngSignature } from "fast-png";
import { Unzlib, zlibSync } from "fflate";
import type { ImageProcessing } from "./types";
import {
  scrollbarSlice,
  scrollbarSlicePixels,
  type ScrollbarSlice,
} from "./scrollbar";

/** Canonical settings also version the image identity and render cache. */
export function imageProcessing(
  value?: ImageProcessing,
): ImageProcessing | undefined {
  if (value === undefined) return;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["whiteMask", "edgeCleanup"].includes(key),
    ) ||
    Object.values(value).some((flag) => typeof flag !== "boolean")
  )
    throw new Error("Invalid image preparation settings.");
  const normalized = {
    whiteMask: value.whiteMask === true,
    edgeCleanup: value.edgeCleanup === true,
  };
  return normalized.whiteMask || normalized.edgeCleanup
    ? normalized
    : undefined;
}
export function artworkAssetId(nodeId: string, settings?: ImageProcessing) {
  const p = imageProcessing(settings);
  return `image:${nodeId}${p?.whiteMask ? ":mask-v1" : ""}${p?.edgeCleanup ? ":bleed-v2" : ""}`;
}
/** New exports clean transparent edges unless the layer explicitly opts out.
 * Keep the byte processor's defaults unchanged for already prepared/legacy assets.
 */
export function exportImageProcessing(value?: ImageProcessing) {
  imageProcessing(value);
  return imageProcessing({
    whiteMask: value?.whiteMask === true,
    edgeCleanup: value?.edgeCleanup !== false,
  });
}

/** Fill hidden RGB from the nearest visible pixel, retaining every alpha sample.
 * A separable squared-distance transform avoids searching all seeds per pixel.
 */
function bleedTransparentRgb(
  rgba: Uint8Array | Uint16Array,
  width: number,
  height: number,
) {
  let seed = -1,
    transparent = false,
    uniform = true;
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) transparent = true;
    else if (seed === -1) seed = i;
    else if (
      rgba[i] !== rgba[seed] ||
      rgba[i + 1] !== rgba[seed + 1] ||
      rgba[i + 2] !== rgba[seed + 2]
    )
      uniform = false;
  }
  if (!transparent || seed === -1) return false;
  let modified = false;
  const copy = (to: number, from: number) => {
    if (
      rgba[to] !== rgba[from] ||
      rgba[to + 1] !== rgba[from + 1] ||
      rgba[to + 2] !== rgba[from + 2]
    )
      modified = true;
    rgba[to] = rgba[from];
    rgba[to + 1] = rgba[from + 1];
    rgba[to + 2] = rgba[from + 2];
  };
  // Monochrome icons need neither the distance map nor its column pass.
  if (uniform) {
    for (let i = 0; i < rgba.length; i += 4) if (!rgba[i + 3]) copy(i, seed);
    return modified;
  }
  // PNG dimensions are bounded to 4096, so a signed 16-bit x coordinate fits.
  const nearestX = new Int16Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let nearest = -1;
    for (let x = 0; x < width; x++) {
      if (rgba[(row + x) * 4 + 3]) nearest = x;
      nearestX[row + x] = nearest;
    }
    nearest = -1;
    for (let x = width - 1; x >= 0; x--) {
      if (rgba[(row + x) * 4 + 3]) nearest = x;
      const left = nearestX[row + x];
      if (nearest !== -1 && (left === -1 || nearest - x < x - left))
        nearestX[row + x] = nearest;
    }
  }
  const rows = new Int16Array(height),
    boundaries = new Float64Array(height + 1);
  for (let x = 0; x < width; x++) {
    let last = -1;
    for (let y = 0; y < height; y++) {
      const sourceX = nearestX[y * width + x];
      if (sourceX === -1) continue;
      const cost = y * y + (x - sourceX) ** 2;
      let start = -Infinity;
      while (last >= 0) {
        const previous = rows[last],
          previousX = nearestX[previous * width + x];
        start =
          (cost - previous * previous - (x - previousX) ** 2) /
          (2 * (y - previous));
        if (start > boundaries[last]) break;
        last--;
      }
      rows[++last] = y;
      boundaries[last] = last === 0 ? -Infinity : start;
      boundaries[last + 1] = Infinity;
    }
    let candidate = 0;
    for (let y = 0; y < height; y++) {
      while (boundaries[candidate + 1] < y) candidate++;
      const to = (y * width + x) * 4;
      if (rgba[to + 3]) continue;
      const sourceY = rows[candidate],
        sourceX = nearestX[sourceY * width + x];
      copy(to, (sourceY * width + sourceX) * 4);
    }
  }
  return modified;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc(bytes: Uint8Array) {
  let n = 0xffffffff;
  for (const byte of bytes) n = crcTable[(n ^ byte) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
}
function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
const COLOR_CHUNKS = new Set([
  "cHRM",
  "gAMA",
  "iCCP",
  "sRGB",
  "cICP",
  "mDCV",
  "cLLI",
]);
/** Private library format: bounded decoded PNG, retaining samples but no ancillary metadata. */
export function libraryPng(bytes: Uint8Array) {
  if (bytes.length > 512 * 1024 || bytes.length < 45)
    throw new Error("Choose a PNG no larger than 512 KiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    width = view.getUint32(16),
    height = view.getUint32(20);
  if (
    !width ||
    !height ||
    width > 1024 ||
    height > 1024 ||
    width * height > 1048576
  )
    throw new Error(
      "Cloud artwork is limited to 1024 px per edge and one million pixels.",
    );
  let chunks = 0;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length || ++chunks > 1024)
      throw new Error("Invalid or excessive PNG chunks.");
    offset += view.getUint32(offset) + 12;
  }
  const png = inspect(bytes);
  let palette = 0,
    transparency = false,
    pixels = false;
  for (const chunk of png.chunks) {
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(chunk.name))
      throw new Error("Invalid PNG chunk name.");
    if (chunk.name === "IDAT") pixels = true;
    if (chunk.name === "PLTE") {
      if (
        pixels ||
        palette ||
        [0, 4].includes(png.color) ||
        !chunk.data.length ||
        chunk.data.length % 3 ||
        chunk.data.length > 768 ||
        (png.color === 3 && chunk.data.length / 3 > 2 ** png.depth)
      )
        throw new Error("Invalid PNG palette.");
      palette = chunk.data.length / 3;
    }
    if (chunk.name === "tRNS") {
      if (
        pixels ||
        transparency ||
        (png.color === 0
          ? chunk.data.length !== 2
          : png.color === 2
            ? chunk.data.length !== 6
            : png.color === 3
              ? !palette || !chunk.data.length || chunk.data.length > palette
              : true)
      )
        throw new Error("Invalid PNG transparency.");
      transparency = true;
    }
  }
  if (png.color === 3 && !palette)
    throw new Error("Indexed PNG needs a palette.");
  const clean = concat([
    bytes.subarray(0, 8),
    ...png.chunks
      .filter((c) => ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(c.name))
      .map((c) => c.raw),
  ]);
  const decoded = decode(clean);
  if (decoded.width !== width || decoded.height !== height)
    throw new Error("PNG dimensions do not match its pixels.");
  if (png.color === 3)
    for (let i = 0; i < width * height; i++) {
      const x = i % width,
        y = Math.floor(i / width),
        depth = decoded.depth,
        row = Math.ceil((width * depth) / 8);
      const index =
        depth >= 8
          ? decoded.data[i]
          : (decoded.data[y * row + Math.floor((x * depth) / 8)] >>
              (8 - depth - ((x * depth) % 8))) &
            ((1 << depth) - 1);
      if (!decoded.palette?.[index])
        throw new Error("Invalid PNG palette index.");
    }
  return { bytes: clean, width, height };
}
/** Structurally validate a small screenshot and remove text, EXIF and ancillary metadata. */
export function screenshotPng(bytes: Uint8Array) {
  if (bytes.length > 512 * 1024)
    throw new Error("Choose a PNG screenshot smaller than 512 KB.");
  if (bytes.length >= 24) {
    const header = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    if (header.getUint32(16) * header.getUint32(20) > 4194304)
      throw new Error(
        "Choose a cropped PNG screenshot under 4 million pixels.",
      );
  }
  const png = inspect(bytes);
  return concat([
    bytes.subarray(0, 8),
    ...png.chunks
      .filter((chunk) =>
        ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(chunk.name),
      )
      .map((chunk) => chunk.raw),
  ]);
}
/** Bound pixels before validating/decompressing an independently rendered decoration. */
export function validatePngPixels(bytes: Uint8Array, maximumPixels: number) {
  if (bytes.length < 33 || !hasPngSignature(bytes))
    throw new Error("Decoration extraction needs a valid PNG.");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(16) * header.getUint32(20) > maximumPixels)
    throw new Error(
      "Decoration exceeds the 4 million pixel limit. Reduce image resolution.",
    );
  const info = inspect(bytes);
  const { width, height, depth, color } = info;
  return {
    width,
    height,
    depth,
    color,
    bytes: concat([
      bytes.subarray(0, 8),
      ...info.chunks
        .filter((c) =>
          ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(c.name),
        )
        .map((c) => c.raw),
    ]),
  };
}
function inspect(bytes: Uint8Array, retainRgba = false) {
  if (bytes.length < 45 || bytes.length > 20_000_000 || !hasPngSignature(bytes))
    throw new Error("Image preparation needs a PNG smaller than 20 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { name: string; raw: Uint8Array; data: Uint8Array }[] = [];
  let ended = false,
    pixels = false,
    afterPixels = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error("Truncated PNG chunk.");
    const length = view.getUint32(offset),
      end = offset + length + 12;
    if (end > bytes.length) throw new Error("Truncated PNG chunk.");
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (crc(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4))
      throw new Error("PNG checksum mismatch. Analyze the artwork again.");
    if (
      (!chunks.length && (name !== "IHDR" || length !== 13)) ||
      (chunks.length && name === "IHDR")
    )
      throw new Error("Invalid PNG header.");
    if (["acTL", "fcTL", "fdAT"].includes(name))
      throw new Error("Animated PNG preparation is unsupported.");
    if (/^[A-Z]/.test(name) && !["IHDR", "PLTE", "IDAT", "IEND"].includes(name))
      throw new Error("Unsupported critical PNG chunk.");
    if (name === "IDAT") {
      if (afterPixels) throw new Error("PNG image chunks must be consecutive.");
      pixels = true;
    } else if (pixels) afterPixels = true;
    if (name === "IEND") {
      if (length || end !== bytes.length)
        throw new Error("Invalid PNG end marker.");
      ended = true;
    }
    chunks.push({
      name,
      raw: bytes.subarray(offset, end),
      data: bytes.subarray(offset + 8, end - 4),
    });
    offset = end;
  }
  if (!ended || !pixels) throw new Error("Incomplete PNG image.");
  const width = view.getUint32(16),
    height = view.getUint32(20),
    depth = bytes[24],
    color = bytes[25];
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[
    color
  ];
  const allowedDepths =
    color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
  if (
    !width ||
    !height ||
    width > 4096 ||
    height > 4096 ||
    !channels ||
    !allowedDepths.includes(depth) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] > 1
  )
    throw new Error(
      "Unsupported PNG format or dimensions. Use a PNG no larger than 4096 px per edge.",
    );
  const passes =
    bytes[28] === 1
      ? [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ]
      : [[0, 0, 1, 1]];
  const expected = passes.reduce((sum, [x, y, sx, sy]) => {
    const w = Math.max(0, Math.ceil((width - x) / sx)),
      h = Math.max(0, Math.ceil((height - y) / sy));
    return sum + (w && h ? (Math.ceil((w * channels * depth) / 8) + 1) * h : 0);
  }, 0);
  // Bound decompression before the third-party decoder allocates pixel data.
  const compressed = concat(
    chunks.filter((c) => c.name === "IDAT").map((c) => c.data),
  );
  // Reuse the bounded validation inflate for the common native Figma format.
  // Other formats retain the existing precision/palette/Adam7 decoder.
  const scanlines =
    retainRgba && depth === 8 && color === 6 && bytes[28] === 0
      ? new Uint8Array(expected)
      : undefined;
  let count = 0;
  const inflater = new Unzlib((chunk) => {
    if (count + chunk.length > expected)
      throw new Error("PNG pixels exceed their declared dimensions.");
    scanlines?.set(chunk, count);
    count += chunk.length;
  });
  for (let offset = 0; offset < compressed.length; offset += 1024)
    inflater.push(
      compressed.subarray(offset, offset + 1024),
      offset + 1024 >= compressed.length,
    );
  if (count !== expected) throw new Error("PNG pixel data is incomplete.");
  return { width, height, depth, color, chunks, scanlines };
}
/** Decode already validated RGBA8 rows without a second decompression. */
function decodeRgbaRows(rows: Uint8Array, width: number, height: number) {
  const stride = width * 4,
    pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const start = y * stride,
      encoded = y * (stride + 1),
      filter = rows[encoded];
    if (filter > 4) throw new Error("Unsupported PNG filter.");
    pixels.set(rows.subarray(encoded + 1, encoded + 1 + stride), start);
    if (!filter) continue;
    for (let x = 0; x < stride; x++) {
      const i = start + x,
        a = x >= 4 ? pixels[i - 4] : 0,
        b = y ? pixels[i - stride] : 0,
        c = y && x >= 4 ? pixels[i - stride - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >>> 1;
      else {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[i] += predictor;
    }
  }
  return {
    width,
    height,
    depth: 8,
    channels: 4,
    data: pixels,
    palette: undefined,
  };
}
function pngChunk(name: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 12),
    view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) bytes[i + 4] = name.charCodeAt(i);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc(bytes.subarray(4, -4)));
  return bytes;
}
/** Bulk scanline writes and Up prediction avoid per-sample IOBuffer overhead. */
function encodeRgba8(pixels: Uint8Array, width: number, height: number) {
  const stride = width * 4,
    rows = new Uint8Array((stride + 1) * height);
  rows.set(pixels.subarray(0, stride), 1);
  for (let y = 1; y < height; y++) {
    const start = y * stride,
      row = y * (stride + 1);
    rows[row] = 2;
    for (let x = 0; x < stride; x++)
      rows[row + 1 + x] = pixels[start + x] - pixels[start + x - stride];
  }
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlibSync(rows, { level: 1 })),
    pngChunk("IEND", new Uint8Array()),
  ]);
}
/** Preserves sample precision and color profiles; never premultiplies alpha. */
export function preparePng(
  bytes: Uint8Array,
  options?: ImageProcessing,
  slice?: ScrollbarSlice,
): Uint8Array {
  const settings = imageProcessing(options);
  if (slice) scrollbarSlice(slice);
  if (!settings && !slice) return bytes;
  const info = inspect(bytes, true);
  const transparent = info.chunks.find((c) => c.name === "tRNS")?.data;
  if (
    transparent &&
    ((info.color === 0 && transparent.length !== 2) ||
      (info.color === 2 && transparent.length !== 6))
  )
    throw new Error("Invalid PNG transparency key.");
  const decoded = info.scanlines
    ? decodeRgbaRows(info.scanlines, info.width, info.height)
    : decode(
        concat([
          bytes.subarray(0, 8),
          ...info.chunks
            .filter(
              (c) =>
                ["IHDR", "PLTE", "IDAT", "IEND"].includes(c.name) ||
                (c.name === "tRNS" && info.color === 3),
            )
            .map((c) => c.raw),
        ]),
      );
  const depth = decoded.depth === 16 ? 16 : 8,
    maximum = depth === 16 ? 65535 : 255;
  const indexed = info.color === 3;
  const source = decoded.data;
  const channels = decoded.channels;
  const rgba =
    !indexed &&
    channels === 4 &&
    (source instanceof Uint8Array || source instanceof Uint16Array)
      ? source
      : depth === 16
        ? new Uint16Array(info.width * info.height * 4)
        : new Uint8Array(info.width * info.height * 4);
  const key =
    transparent && info.color !== 3
      ? Array.from({ length: transparent.length / 2 }, (_, i) =>
          new DataView(
            transparent.buffer,
            transparent.byteOffset,
            transparent.byteLength,
          ).getUint16(i * 2),
        )
      : undefined;
  function sample(index: number, channel: number) {
    if (decoded.depth >= 8) return source[index * channels + channel];
    const x = index % info.width,
      y = Math.floor(index / info.width),
      row = Math.ceil((info.width * decoded.depth) / 8);
    return (
      (source[y * row + Math.floor((x * decoded.depth) / 8)] >>
        (8 - decoded.depth - ((x * decoded.depth) % 8))) &
      ((1 << decoded.depth) - 1)
    );
  }
  for (let i = 0; rgba !== source && i < info.width * info.height; i++) {
    if (indexed) {
      const color = decoded.palette?.[sample(i, 0)];
      if (!color || (color.length !== 3 && color.length !== 4))
        throw new Error("Invalid PNG palette index.");
      rgba.set([color[0], color[1], color[2], color[3] ?? 255], i * 4);
      continue;
    }
    const r = sample(i, 0),
      g = channels >= 3 ? sample(i, 1) : r,
      b = channels >= 3 ? sample(i, 2) : r;
    const factor = decoded.depth < 8 ? 255 / ((1 << decoded.depth) - 1) : 1;
    rgba[i * 4] = r * factor;
    rgba[i * 4 + 1] = g * factor;
    rgba[i * 4 + 2] = b * factor;
    rgba[i * 4 + 3] =
      channels === 2 || channels === 4
        ? sample(i, channels - 1)
        : key &&
            (info.color === 0
              ? r === key[0]
              : r === key[0] && g === key[1] && b === key[2])
          ? 0
          : maximum;
  }
  let modified = false;
  if (settings?.whiteMask) {
    for (let i = 0; i < rgba.length; i += 4) {
      if (
        rgba[i] !== maximum ||
        rgba[i + 1] !== maximum ||
        rgba[i + 2] !== maximum
      )
        modified = true;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = maximum;
    }
  } else if (settings?.edgeCleanup) {
    modified = bleedTransparentRgb(rgba, info.width, info.height);
  }
  // Opaque, fully transparent and already-clean artwork needs no re-encoding.
  if (!modified && !slice) return bytes;
  let width = info.width,
    height = info.height,
    pixels = rgba;
  if (slice) {
    const horizontal = slice.axis === "X",
      length = horizontal ? width : height;
    const [start, end] = scrollbarSlicePixels(slice, length);
    const sourceWidth = width,
      sourceHeight = height;
    width = horizontal ? sourceHeight : sourceWidth;
    height = end - start;
    pixels =
      depth === 16
        ? new Uint16Array(width * height * 4)
        : new Uint8Array(width * height * 4);
    // Clockwise rotation undoes Roblox's horizontal counterclockwise rotation.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const sourceX = horizontal ? start + y : x,
          sourceY = horizontal ? sourceHeight - 1 - x : start + y;
        const offset = (sourceY * sourceWidth + sourceX) * 4;
        pixels.set(rgba.subarray(offset, offset + 4), (y * width + x) * 4);
      }
  }
  const output =
    pixels instanceof Uint8Array
      ? encodeRgba8(pixels, width, height)
      : encode(
          { width, height, data: pixels, channels: 4, depth },
          { zlib: { level: 6 } },
        );
  // Ancillary color information remains byte-identical; stale palette/text metadata does not.
  return concat([
    output.subarray(0, 33),
    ...info.chunks.filter((c) => COLOR_CHUNKS.has(c.name)).map((c) => c.raw),
    output.subarray(33),
  ]);
}
