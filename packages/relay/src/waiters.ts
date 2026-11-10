import { PublicError } from "./roblox";

export function waitMilliseconds(url: URL) {
  const value = url.searchParams.get("wait") ?? "0";
  return /^\d+$/.test(value) ? Math.min(15000, Number(value)) : 0;
}

/** Disposable notification listeners; the authoritative state always stays in session storage. */
export class Waiters {
  private listeners = new Map<string, Set<() => void>>();
  wait(key: string, milliseconds: number, signal?: AbortSignal) {
    if (milliseconds <= 0 || signal?.aborted) return Promise.resolve();
    const listeners = this.listeners.get(key) ?? new Set<() => void>();
    if (listeners.size >= 2)
      throw new PublicError(
        "This connection already has two waiting requests. Retry shortly.",
        429,
      );
    this.listeners.set(key, listeners);
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", done);
        listeners.delete(done);
        if (!listeners.size) this.listeners.delete(key);
        resolve();
      };
      const timer = setTimeout(done, milliseconds);
      listeners.add(done);
      signal?.addEventListener("abort", done, { once: true });
    });
  }
  notify(session: string) {
    for (const kind of ["inbox", "receipt"])
      for (const done of this.listeners.get(`${session}:${kind}`) ?? []) done();
  }
}
