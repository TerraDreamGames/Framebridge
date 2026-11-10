import type { OAuthOwner } from "./roblox-oauth";

const DAY = 86_400_000;
const GROUPS = "https://groups.roblox.com/v2/groups";
const groupId = (value: unknown): string | undefined =>
  typeof value === "string" && /^[1-9]\d{0,19}$/.test(value)
    ? value
    : typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : undefined;

/** Public display metadata only. OAuth resource grants remain the source of creator access. */
export class RobloxGroupNames {
  private cache = new Map<string, { name?: string; expires: number }>();
  private pending = new Map<string, Promise<void>>();
  constructor(
    private request: typeof fetch,
    private now: () => number,
  ) {}

  async resolve(owners: readonly OAuthOwner[]): Promise<OAuthOwner[]> {
    const ids = [
      ...new Set(owners.filter((o) => o.kind === "group").map((o) => o.id)),
    ];
    for (const [id, value] of this.cache)
      if (value.expires <= this.now()) this.cache.delete(id);
    const missing = ids.filter((id) => !this.cache.has(id)).sort();
    const requests: Promise<void>[] = [];
    for (let i = 0; i < missing.length; i += 50) {
      const batch = missing.slice(i, i + 50),
        key = batch.join(",");
      let work = this.pending.get(key);
      if (!work) {
        work = this.lookup(batch).finally(() => this.pending.delete(key));
        this.pending.set(key, work);
      }
      requests.push(work);
    }
    await Promise.all(requests);
    return owners.map((owner) => ({
      ...owner,
      label:
        owner.kind === "group"
          ? (this.cache.get(owner.id)?.name ?? owner.label)
          : owner.label,
    }));
  }

  private async lookup(ids: string[]) {
    const names = new Map<string, string>();
    try {
      // This endpoint is public: never attach an OAuth token, API key, or cookie.
      const response = await this.request(
        `${GROUPS}?groupIds=${ids.join(",")}`,
        {
          headers: { Accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(2000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Group names unavailable");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing group names");
      const decoder = new TextDecoder();
      let bytes = 0,
        text = "";
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > 524288) throw new Error("Group response limit");
          text += decoder.decode(next.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel();
      }
      const value = JSON.parse(text) as { data?: unknown[] };
      if (!Array.isArray(value?.data) || value.data.length > 200)
        throw new Error("Invalid group response");
      const requested = new Set(ids);
      for (const row of value.data) {
        if (!row || typeof row !== "object") continue;
        const group = row as { id?: unknown; name?: unknown },
          id = groupId(group.id);
        if (id && requested.has(id) && typeof group.name === "string") {
          const name = group.name.trim();
          if (name && name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name))
            names.set(id, name);
        }
      }
    } catch {
      // A directory outage must not interrupt sign-in or remove an approved creator.
    }
    for (const id of ids) {
      this.cache.set(id, {
        name: names.get(id),
        expires: this.now() + (names.has(id) ? DAY : 60_000),
      });
    }
    while (this.cache.size > 2000)
      this.cache.delete(this.cache.keys().next().value!);
  }
}
