import { preparePng } from "../../../packages/core/src/image-processing";
import { IMAGE_BATCH_LIMITS } from "../../../packages/core/src/image-batches";
import type { ImageProcessing } from "../../../packages/core/src/types";
import type { ScrollbarSlice } from "../../../packages/core/src/scrollbar";

export type PreparationJob = {
  preparationId: number;
  png?: unknown;
  processing?: ImageProcessing;
  slice?: ScrollbarSlice;
};
export type PreparationReply = {
  preparationId: number;
  png?: string;
  unchanged?: true;
  error?: string;
};
/** Identical lossless work in a worker or the compatibility fallback. */
export function prepareImageJob(job: PreparationJob): PreparationReply {
  const id = job.preparationId;
  try {
    if (
      typeof job.png !== "string" ||
      job.png.length > Math.ceil(IMAGE_BATCH_LIMITS.pngBytes / 3) * 4
    )
      throw Error("Invalid PNG preparation request.");
    const binary = atob(job.png),
      raw = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) raw[i] = binary.charCodeAt(i);
    const prepared = preparePng(raw, job.processing, job.slice);
    if (prepared === raw) return { preparationId: id, unchanged: true };
    let output = "";
    for (let i = 0; i < prepared.length; i += 8192)
      output += String.fromCharCode(...prepared.subarray(i, i + 8192));
    return { preparationId: id, png: btoa(output) };
  } catch (error) {
    return {
      preparationId: id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
