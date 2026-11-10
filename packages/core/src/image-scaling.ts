import type { Asset, Issue, RbxNode, TransferPackage, Value } from "./types";

export const imageMode = (properties: Record<string, Value>) =>
  properties.ScaleType &&
  typeof properties.ScaleType === "object" &&
  properties.ScaleType.type === "Enum"
    ? properties.ScaleType.value[1]
    : "Stretch";
export const numericValue = (value: Value | undefined, fallback: number[]) =>
  value &&
  typeof value === "object" &&
  "value" in value &&
  Array.isArray(value.value)
    ? (value.value as number[])
    : fallback;

/** Read dimensions without decompressing or copying the PNG's pixel buffer. */
export function pngPixelSize(
  bytes?: ArrayLike<number>,
): [number, number] | undefined {
  if (
    !bytes ||
    bytes.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) ||
    ![0, 0, 0, 13, 73, 72, 68, 82].every((n, i) => bytes[i + 8] === n)
  )
    return;
  const u32 = (offset: number) =>
    bytes[offset] * 16777216 +
    bytes[offset + 1] * 65536 +
    bytes[offset + 2] * 256 +
    bytes[offset + 3];
  const width = u32(16),
    height = u32(20);
  if (width > 0 && height > 0 && width <= 4096 && height <= 4096)
    return [width, height];
}
export function textureSize(asset?: Asset, bytes?: ArrayLike<number>) {
  return pngPixelSize(bytes) ?? asset?.pixelSize;
}
export function sliceProblem(
  center: number[],
  size: [number, number],
): string | undefined {
  if (
    center.length !== 4 ||
    center.some((n) => !Number.isFinite(n) || n < 0) ||
    center[0] > center[2] ||
    center[1] > center[3]
  )
    return "Slice coordinates must be nonnegative and ordered.";
  if (center[2] > size[0] || center[3] > size[1])
    return `Slice guides extend beyond the ${size[0]} × ${size[1]} texture. Adjust the guides for this image.`;
}
export function imageScalingIssues(pkg: TransferPackage): Issue[] {
  const assets = new Map(pkg.assets.map((asset) => [asset.id, asset]));
  const issues: Issue[] = [];
  const visit = (node: RbxNode) => {
    const size = node.assetRef
      ? assets.get(node.assetRef)?.pixelSize
      : undefined;
    if (size && imageMode(node.properties) === "Slice") {
      const problem = sliceProblem(
        numericValue(node.properties.SliceCenter, [0, 0, 0, 0]),
        size,
      );
      if (problem)
        issues.push({
          nodeId: node.id,
          nodeName: node.name,
          code: "image-slice-bounds",
          severity: "error",
          message: problem,
        });
    }
    node.children.forEach(visit);
  };
  pkg.roots.forEach(visit);
  return issues;
}
export function tileDimensions(
  value: Value | undefined,
  width: number,
  height: number,
): [number, number] {
  const v = numericValue(value, [1, 0, 1, 0]);
  return [v[0] * width + Math.trunc(v[1]), v[2] * height + Math.trunc(v[3])];
}
export type ImagePatch = {
  source: [number, number, number, number];
  destination: [number, number, number, number];
};
/** Browser approximation of native nine-slice drawing, in source and destination pixels. */
export function nineSlice(
  size: [number, number],
  center: number[],
  borderScale: number,
  width: number,
  height: number,
): ImagePatch[] {
  if (
    sliceProblem(center, size) ||
    center[0] === center[2] ||
    center[1] === center[3] ||
    borderScale < 0 ||
    !Number.isFinite(borderScale) ||
    width <= 0 ||
    height <= 0
  )
    return [];
  const sx = [0, center[0], center[2], size[0]],
    sy = [0, center[1], center[3], size[1]];
  const edges = (extent: number, first: number, last: number) => {
    const ratio = Math.min(
      1,
      extent / Math.max(1, (first + last) * borderScale),
    );
    return [
      0,
      first * borderScale * ratio,
      extent - last * borderScale * ratio,
      extent,
    ];
  };
  const dx = edges(width, center[0], size[0] - center[2]),
    dy = edges(height, center[1], size[1] - center[3]);
  const patches: ImagePatch[] = [];
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      const source: ImagePatch["source"] = [
        sx[x],
        sy[y],
        sx[x + 1] - sx[x],
        sy[y + 1] - sy[y],
      ];
      const destination: ImagePatch["destination"] = [
        dx[x],
        dy[y],
        dx[x + 1] - dx[x],
        dy[y + 1] - dy[y],
      ];
      if (
        source[2] > 0 &&
        source[3] > 0 &&
        destination[2] > 0 &&
        destination[3] > 0
      )
        patches.push({ source, destination });
    }
  return patches;
}
