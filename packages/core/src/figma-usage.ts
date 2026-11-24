export const FIGMA_USAGE_PATH = "/v1/metrics/figma";
export const UTC_DAY_MS = 86_400_000;
export const FIGMA_USAGE_DAYS = 30;
export const ONBOARDING_FOLLOW_UP_DAYS = 7;

export const ONBOARDING_EVENTS = {
  opened: 1,
  signInStarted: 2,
  continuedWithoutRoblox: 4,
  tutorialOffered: 8,
  tutorialStarted: 16,
  previewReached: 32,
  studioReached: 64,
  tutorialCompleted: 128,
  tutorialSkipped: 256,
  connectedAtTutorial: 512,
} as const;

export type OnboardingEvent = keyof typeof ONBOARDING_EVENTS;
export const ONBOARDING_EVENT_NAMES = Object.keys(
  ONBOARDING_EVENTS,
) as OnboardingEvent[];
const allEvents = Object.values(ONBOARDING_EVENTS).reduce(
  (all, event) => all | event,
  0,
);
export const utcDay = (now = Date.now()) => Math.floor(now / UTC_DAY_MS);
export const usageKey = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function record(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  return Object.keys(value).every((key) => keys.includes(key))
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readOnboardingUsage(value: unknown, day: number) {
  const input = record(value, ["day", "events"]);
  if (!input) return;
  const start = input.day;
  const events = input.events;
  if (
    typeof start !== "number" ||
    !Number.isInteger(start) ||
    start < day - ONBOARDING_FOLLOW_UP_DAYS + 1 ||
    start > day ||
    typeof events !== "number" ||
    !Number.isInteger(events) ||
    events < 1 ||
    events > allEvents ||
    !(events & ONBOARDING_EVENTS.opened)
  )
    return;
  return { day: start, events };
}

export function readFigmaUsage(value: unknown, day: number) {
  const input = record(value, ["day", "key", "onboarding"]);
  if (!input || input.day !== day || !usageKey(input.key)) return;
  if (input.onboarding === undefined) return { day, key: input.key };
  const onboarding = record(input.onboarding, ["day", "key", "events"]);
  if (!onboarding || !usageKey(onboarding.key)) return;
  const cohort = readOnboardingUsage(
    { day: onboarding.day, events: onboarding.events },
    day,
  );
  if (!cohort) return;
  const {
    tutorialOffered,
    tutorialStarted,
    previewReached,
    studioReached,
    tutorialCompleted,
    tutorialSkipped,
    connectedAtTutorial,
  } = ONBOARDING_EVENTS;
  const requirements = [
    [tutorialStarted | tutorialSkipped | connectedAtTutorial, tutorialOffered],
    [previewReached, tutorialStarted],
    [studioReached, previewReached],
    [tutorialCompleted, studioReached],
  ];
  if (
    requirements.some(
      ([later, earlier]) => cohort.events & later && !(cohort.events & earlier),
    )
  )
    return;
  return {
    day,
    key: input.key,
    onboarding: { ...cohort, key: onboarding.key },
  };
}
