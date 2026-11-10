import { prepareImageJob, type PreparationJob } from "./image-preparation-job";
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<PreparationJob>) => void;
  postMessage: (reply: ReturnType<typeof prepareImageJob>) => void;
};
scope.onmessage = (event) => scope.postMessage(prepareImageJob(event.data));
