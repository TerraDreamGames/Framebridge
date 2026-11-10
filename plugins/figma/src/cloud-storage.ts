export type CreatorPreference = {
  ownerType: "user" | "group";
  ownerId: string;
};
export type CloudSettings = {
  key: string;
  ownerType: "user" | "group";
  ownerId: string;
  betaAccess?: string;
  authMode?: "roblox" | "key";
  /** Current backend account capability. Persisted separately from API-key settings. */
  accountToken?: string;
  keyOwner?: CreatorPreference;
  robloxOwner?: CreatorPreference & { userId: string };
  /** Ephemeral validation from the verified account; never persisted. */
  authorizationError?: string;
};

export const CLOUD_STORAGE_KEY = "framebridge-cloud-settings-v1";

export function readCloudSettings(value: unknown): CloudSettings {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const creator = (v: unknown): CreatorPreference | undefined => {
    if (!v || typeof v !== "object") return;
    const o = v as CreatorPreference;
    if (
      !["user", "group"].includes(o.ownerType) ||
      typeof o.ownerId !== "string" ||
      !/^\d{0,20}$/.test(o.ownerId)
    )
      return;
    return { ownerType: o.ownerType, ownerId: o.ownerId };
  };
  const keyOwner = creator(record.keyOwner);
  const candidate = record.robloxOwner as
    (CreatorPreference & { userId?: unknown }) | undefined;
  const robloxCreator = creator(candidate);
  const robloxOwner =
    robloxCreator &&
    typeof candidate?.userId === "string" &&
    /^[1-9]\d{0,19}$/.test(candidate.userId)
      ? { ...robloxCreator, userId: candidate.userId }
      : undefined;
  return {
    key: typeof record.key === "string" ? record.key : "",
    ownerType: record.ownerType === "group" ? "group" : "user",
    ownerId: typeof record.ownerId === "string" ? record.ownerId : "",
    ...(["roblox", "key"].includes(record.authMode as string)
      ? { authMode: record.authMode as "roblox" | "key" }
      : {}),
    ...(typeof record.betaAccess === "string" && record.betaAccess
      ? { betaAccess: record.betaAccess }
      : {}),
    ...(keyOwner ? { keyOwner } : {}),
    ...(robloxOwner ? { robloxOwner } : {}),
  };
}

export function cloudStorageRecord(value: unknown) {
  const settings = readCloudSettings(value);
  // Clearing a key removes it from the stored record, preserving the creator.
  return {
    ...(settings.key ? { key: settings.key } : {}),
    ownerType: settings.ownerType,
    ownerId: settings.ownerId,
    ...(settings.authMode ? { authMode: settings.authMode } : {}),
    ...(settings.betaAccess ? { betaAccess: settings.betaAccess } : {}),
    ...(settings.keyOwner ? { keyOwner: settings.keyOwner } : {}),
    ...(settings.robloxOwner ? { robloxOwner: settings.robloxOwner } : {}),
  };
}

/** Keep API-key and signed-in creators independent. Permission changes never pick a
 * different destination; a new account must explicitly choose its approved creator. */
export function updateCloudSettings(
  current: CloudSettings,
  patch: Partial<CloudSettings>,
  userId?: string,
): CloudSettings {
  const next = { ...current, ...patch };
  const before = current.authMode ?? "key",
    after = next.authMode ?? "key";
  const previous = { ownerType: current.ownerType, ownerId: current.ownerId };
  if (before === "key") next.keyOwner = previous;
  else if (userId && current.robloxOwner?.userId === userId && current.ownerId)
    next.robloxOwner = { ...previous, userId };
  if (before !== after) {
    const preference =
      after === "key"
        ? next.keyOwner
        : next.robloxOwner?.userId === userId
          ? next.robloxOwner
          : undefined;
    next.ownerType = preference?.ownerType ?? "user";
    next.ownerId = preference?.ownerId ?? "";
  }
  if (after === "roblox" && userId && next.robloxOwner?.userId !== userId) {
    next.ownerType = "user";
    next.ownerId = "";
    next.robloxOwner = { ownerType: "user", ownerId: "", userId };
  } else if (
    after === "roblox" &&
    userId &&
    !next.ownerId &&
    next.robloxOwner?.userId === userId
  ) {
    next.ownerType = next.robloxOwner.ownerType;
    next.ownerId = next.robloxOwner.ownerId;
  }
  if (patch.ownerType !== undefined) next.ownerType = patch.ownerType;
  if (patch.ownerId !== undefined) next.ownerId = patch.ownerId;
  const selected = { ownerType: next.ownerType, ownerId: next.ownerId };
  if (after === "key") next.keyOwner = selected;
  else if (userId) next.robloxOwner = { ...selected, userId };
  return next;
}

export function createCloudStorage(storage: {
  getAsync(key: string): Promise<unknown>;
  setAsync(key: string, value: unknown): Promise<void>;
}) {
  let pending = Promise.resolve();
  return {
    async load() {
      await pending;
      return readCloudSettings(await storage.getAsync(CLOUD_STORAGE_KEY));
    },
    save(value: unknown) {
      const record = cloudStorageRecord(value);
      const write = pending.then(() =>
        storage.setAsync(CLOUD_STORAGE_KEY, record),
      );
      // Serialize writes so a slow save cannot resurrect a cleared key.
      pending = write.catch(() => {});
      return write;
    },
    flush() {
      return pending;
    },
  };
}
