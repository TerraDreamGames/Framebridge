import {
  preparePng,
  imageProcessing,
} from "../../../packages/core/src/image-processing";
import { IMAGE_BATCH_LIMITS } from "../../../packages/core/src/image-batches";
import { pngPixelSize } from "../../../packages/core/src/image-scaling";
import {
  scrollbarSlicePixels,
  type ScrollbarSlice,
} from "../../../packages/core/src/scrollbar";
import type { ImageProcessing } from "../../../packages/core/src/types";

export const IMAGE_PREPARATION_VERSION = 1;

/** Keep expensive pixel work in the plugin's browser, with a legacy/headless fallback. */
export function createImagePreparationBridge(
  send: (type: string, data: object) => void,
  codec: {
    encode: (bytes: Uint8Array) => string;
    decode: (png: string) => Uint8Array;
  },
  timeout = 30_000,
) {
  let supported = false,
    sequence = 0;
  const pending = new Map<
    number,
    {
      input: Uint8Array;
      allowUnchanged: boolean;
      size: [number, number];
      timer: ReturnType<typeof setTimeout>;
      resolve: (bytes: Uint8Array) => void;
      reject: (error: Error) => void;
    }
  >();
  return {
    configure: (version: unknown) => {
      supported = version === IMAGE_PREPARATION_VERSION;
    },
    prepare(
      bytes: Uint8Array,
      options?: ImageProcessing,
      slice?: ScrollbarSlice,
    ): Promise<Uint8Array> {
      const settings = imageProcessing(options);
      if (!settings && !slice) return Promise.resolve(bytes);
      if (!supported)
        return Promise.resolve(preparePng(bytes, settings, slice));
      const size = pngPixelSize(bytes);
      if (!size || bytes.length > IMAGE_BATCH_LIMITS.pngBytes)
        throw Error("Invalid artwork for image preparation.");
      const expected: [number, number] = [...size];
      if (slice) {
        const horizontal = slice.axis === "X";
        const [start, end] = scrollbarSlicePixels(
          slice,
          horizontal ? size[0] : size[1],
        );
        expected[0] = horizontal ? size[1] : size[0];
        expected[1] = end - start;
      }
      const preparationId = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(preparationId);
          send("cancel-image-preparation", { preparationIds: [preparationId] });
          reject(
            Error(
              "Image preparation timed out. Reopen the plugin and analyze again.",
            ),
          );
        }, timeout);
        pending.set(preparationId, {
          input: bytes,
          allowUnchanged: !slice,
          size: expected,
          timer,
          resolve,
          reject,
        });
        try {
          send("prepare-image", {
            preparationId,
            png: codec.encode(bytes),
            processing: settings,
            slice,
          });
        } catch (error) {
          clearTimeout(timer);
          pending.delete(preparationId);
          reject(error instanceof Error ? error : Error(String(error)));
        }
      });
    },
    receive(message: {
      type: string;
      preparationId?: number;
      png?: unknown;
      unchanged?: unknown;
      error?: unknown;
    }) {
      if (message.type !== "image-prepared") return false;
      const job = pending.get(message.preparationId!);
      if (!job) return true; // Late/cancelled replies cannot complete another analysis.
      pending.delete(message.preparationId!);
      clearTimeout(job.timer);
      try {
        if (typeof message.error === "string") throw Error(message.error);
        let bytes: Uint8Array;
        if (message.unchanged === true) {
          if (!job.allowUnchanged)
            throw Error("A scrollbar slice must be prepared.");
          bytes = job.input;
        } else {
          if (
            typeof message.png !== "string" ||
            message.png.length > Math.ceil(IMAGE_BATCH_LIMITS.pngBytes / 3) * 4
          )
            throw Error("Invalid prepared PNG response.");
          bytes = codec.decode(message.png);
        }
        const size = pngPixelSize(bytes);
        if (
          bytes.length > IMAGE_BATCH_LIMITS.pngBytes ||
          !size ||
          size[0] !== job.size[0] ||
          size[1] !== job.size[1]
        )
          throw Error("Prepared artwork dimensions changed unexpectedly.");
        job.resolve(bytes);
      } catch (error) {
        job.reject(error instanceof Error ? error : Error(String(error)));
      }
      return true;
    },
    cancel() {
      const preparationIds = [...pending.keys()];
      for (const job of pending.values()) {
        clearTimeout(job.timer);
        job.reject(Error("Export cancelled."));
      }
      pending.clear();
      if (preparationIds.length)
        send("cancel-image-preparation", { preparationIds });
    },
  };
}
