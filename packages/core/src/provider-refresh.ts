/** Safe diagnostics returned only with the authenticated Framebridge account status. */
export type ProviderRefreshDiagnostics = {
  providerAccessExpiresAt: number;
  providerRefreshCount: number;
  providerRefreshedAt: number | null;
};

/** Older backends omit all three fields; a partial or inconsistent attestation is rejected. */
export function readProviderRefreshDiagnostics(
  value: unknown,
): ProviderRefreshDiagnostics | undefined {
  const fields = [
    "providerAccessExpiresAt",
    "providerRefreshCount",
    "providerRefreshedAt",
  ] as const;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid provider refresh diagnostics.");
  const data = value as Partial<ProviderRefreshDiagnostics>;
  if (fields.every((field) => data[field] === undefined)) return;
  if (
    typeof data.providerAccessExpiresAt !== "number" ||
    !Number.isFinite(data.providerAccessExpiresAt) ||
    data.providerAccessExpiresAt < 0 ||
    data.providerAccessExpiresAt > Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(data.providerRefreshCount) ||
    data.providerRefreshCount! < 0 ||
    (data.providerRefreshCount === 0
      ? data.providerRefreshedAt !== null
      : !Number.isSafeInteger(data.providerRefreshedAt) ||
        data.providerRefreshedAt! <= 0)
  )
    throw new Error("Invalid provider refresh diagnostics.");
  return {
    providerAccessExpiresAt: data.providerAccessExpiresAt,
    providerRefreshCount: data.providerRefreshCount!,
    providerRefreshedAt: data.providerRefreshedAt!,
  };
}
