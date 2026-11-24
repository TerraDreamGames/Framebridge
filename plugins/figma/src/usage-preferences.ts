import {
  readOnboardingUsage,
  usageKey,
  utcDay,
} from "../../../packages/core/src/figma-usage";

export const USAGE_PREFERENCES_KEY = "framebridge-usage-sharing-v1";
export type UsagePreferences = {
  seed: string;
  onboarding?: { day: number; events: number };
};

export function readUsagePreferences(
  value: unknown,
  day = utcDay(),
): UsagePreferences | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("seed" in value) ||
    !usageKey(value.seed)
  )
    return;
  const onboarding =
    "onboarding" in value
      ? readOnboardingUsage(value.onboarding, day)
      : undefined;
  return { seed: value.seed, ...(onboarding && { onboarding }) };
}
