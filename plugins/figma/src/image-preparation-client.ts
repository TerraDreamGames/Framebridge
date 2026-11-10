import {
  prepareImageJob,
  type PreparationJob,
  type PreparationReply,
} from "./image-preparation-job";

declare const __FRAMEBRIDGE_IMAGE_WORKER__: string;
export type PreparationWorker = {
  postMessage(job: PreparationJob): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<PreparationReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
function createWorker(): PreparationWorker | undefined {
  if (typeof Worker === "undefined") return;
  if (import.meta.env.DEV)
    return new Worker(
      new URL("./image-preparation-worker.ts", import.meta.url),
      { type: "module" },
    );
  if (typeof __FRAMEBRIDGE_IMAGE_WORKER__ === "undefined") return;
  const url = URL.createObjectURL(
    new Blob([__FRAMEBRIDGE_IMAGE_WORKER__], { type: "text/javascript" }),
  );
  try {
    return new Worker(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A single worker bounds memory/CPU on weaker machines and keeps the UI usable. */
export function createImagePreparationClient(
  send: (type: string, data: object) => void,
  workerFactory: () => PreparationWorker | undefined = createWorker,
) {
  let closed = false,
    workerDisabled = false;
  let worker: PreparationWorker | undefined, active: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const jobs = new Map<number, PreparationJob>();
  function stopWorker() {
    if (worker) {
      worker.onmessage = worker.onerror = null;
      worker.terminate();
    }
    worker = undefined;
  }
  function finish(reply: PreparationReply) {
    if (
      closed ||
      reply.preparationId !== active ||
      active === undefined ||
      !jobs.has(active)
    )
      return;
    jobs.delete(active);
    active = undefined;
    send("image-prepared", reply);
    pump();
  }
  function fallback() {
    // Compatibility for hosts that do not allow workers: yield between PNGs.
    timer = setTimeout(() => {
      timer = undefined;
      if (!closed && active !== undefined && jobs.has(active))
        finish(prepareImageJob(jobs.get(active)!));
    }, 0);
  }
  function pump() {
    if (closed || active !== undefined || !jobs.size) return;
    active = jobs.keys().next().value!;
    if (!worker && !workerDisabled) {
      try {
        const next = workerFactory();
        worker = next;
        if (next) {
          next.onmessage = (event) => {
            if (worker === next) finish(event.data);
          };
          next.onerror = (event) => {
            event.preventDefault();
            if (worker !== next) return;
            stopWorker();
            workerDisabled = true;
            active = undefined;
            pump();
          };
        } else workerDisabled = true;
      } catch {
        workerDisabled = true;
      }
    }
    if (worker) {
      try {
        worker.postMessage(jobs.get(active)!);
      } catch {
        stopWorker();
        workerDisabled = true;
        fallback();
      }
    } else fallback();
  }
  return {
    receive(message: {
      type: string;
      preparationId?: number;
      preparationIds?: number[];
      png?: unknown;
      processing?: PreparationJob["processing"];
      slice?: PreparationJob["slice"];
    }) {
      if (message.type === "cancel-image-preparation") {
        for (const id of message.preparationIds ?? []) jobs.delete(id);
        if (active !== undefined && !jobs.has(active)) {
          clearTimeout(timer);
          timer = undefined;
          stopWorker();
          active = undefined;
        }
        pump();
        return true;
      }
      if (message.type !== "prepare-image") return false;
      const id = message.preparationId;
      if (closed || !Number.isSafeInteger(id) || id! < 1 || jobs.has(id!))
        return true;
      jobs.set(id!, {
        preparationId: id!,
        png: message.png,
        processing: message.processing,
        slice: message.slice,
      });
      pump();
      return true;
    },
    dispose() {
      closed = true;
      clearTimeout(timer);
      jobs.clear();
      stopWorker();
      active = undefined;
    },
  };
}
