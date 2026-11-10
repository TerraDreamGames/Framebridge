import {
  readProviderRefreshDiagnostics,
  type ProviderRefreshDiagnostics,
} from "../packages/core/src/provider-refresh";
type Status = Partial<ProviderRefreshDiagnostics> & {
  expiresAt: number;
  userId?: string;
};
/** Application expiry and successful uploads alone cannot attest provider refresh. */
export function providerRefreshObservation(
  before: Status,
  after: Status,
  requestStartedAt?: number,
) {
  const initial = readProviderRefreshDiagnostics(before);
  const final = readProviderRefreshDiagnostics(after);
  const sameAccount =
    typeof before.userId === "string" && before.userId === after.userId;
  const observed = !!(
    initial &&
    final &&
    sameAccount &&
    final.providerRefreshCount > initial.providerRefreshCount &&
    final.providerRefreshedAt !== null &&
    (initial.providerRefreshedAt === null ||
      final.providerRefreshedAt >= initial.providerRefreshedAt)
  );
  const natural = !!(
    observed &&
    initial &&
    final &&
    final.providerRefreshedAt !== null &&
    final.providerRefreshCount - initial.providerRefreshCount === 1 &&
    Number.isSafeInteger(requestStartedAt) &&
    initial.providerAccessExpiresAt > 0 &&
    requestStartedAt! >= initial.providerAccessExpiresAt &&
    requestStartedAt! <= final.providerRefreshedAt
  );
  return {
    providerRefreshObserved: observed,
    naturalRefreshObserved: natural,
    providerRefreshStatus: observed
      ? ("observed" as const)
      : ("unobserved" as const),
    accountExpiryKind: "framebridge-app-capability" as const,
    appCapabilityExpiryChanged: before.expiresAt !== after.expiresAt,
    providerRefreshCountBefore: initial?.providerRefreshCount ?? null,
    providerRefreshCountAfter: final?.providerRefreshCount ?? null,
    providerRefreshedAt: final?.providerRefreshedAt ?? null,
    providerAccessExpiresAt: final?.providerAccessExpiresAt ?? null,
    providerAccessExpiresAtBefore: initial?.providerAccessExpiresAt ?? null,
    requestStartedAt: Number.isSafeInteger(requestStartedAt)
      ? requestStartedAt
      : null,
    providerRefreshEvidence: observed
      ? "The same authenticated account's persisted server refresh count advanced after a successful OAuth refresh. Application expiry is not used as proof."
      : "No comparable successful server refresh was attested between these account observations; application expiry is not provider access expiry.",
  };
}
