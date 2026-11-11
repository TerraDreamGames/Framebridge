/** Separate IDs keep the Figma controller's preference reader free of UI copy. */
export const TOUR_STEP_IDS = [
  "analyze",
  "layers",
  "properties",
  "preview",
  "layouts",
  "interactions",
  "images",
  "review",
  "studio",
] as const;
/** Stable IDs let a paused tour survive changes to the lesson copy. */
export const TOUR_STEPS = [
  {
    id: "analyze",
    label: "Analyze a frame",
    icon: "scan",
    target: '[data-tour="preview"]',
    description:
      "Select a UI frame on the Figma canvas, then click Analyze selection.",
  },
  {
    id: "layers",
    label: "Explore layers",
    icon: "layers",
    target: "#framebridge-layers-pane",
    description:
      "Select a layer to see its Roblox properties. Use the arrows to expand its children.",
  },
  {
    id: "properties",
    label: "Check the Roblox preview",
    icon: "sliders",
    target: "#framebridge-properties-pane",
    description:
      "Select a layer to edit its size, position, and layout. Use the device picker to check how it fits on different screens.",
  },
  {
    id: "preview",
    label: "Test different screens",
    icon: "monitor",
    target: '[data-tour="preview"]',
    description:
      "Choose a device preset to check spacing and clipping. Use Test UI to try supported interactions.",
  },
  {
    id: "layouts",
    label: "Scrolling & layouts",
    icon: "grid",
    target: '[data-tour="layout-tools"]',
    description:
      "Select a frame and open Constraints & modifiers to add scrolling, a list, or a grid.",
  },
  {
    id: "interactions",
    label: "Add interactions",
    icon: "pointer",
    target: '[data-tour="interaction-tools"]',
    description:
      "Select a button and open Interactions to set up actions such as opening a panel or switching tabs.",
  },
  {
    id: "images",
    label: "Prepare images",
    icon: "image",
    target: '[data-tour="inspector"]',
    description:
      "Open Images to upload artwork to your Roblox account or link existing image IDs.",
  },
  {
    id: "review",
    label: "Review before sending",
    icon: "check",
    target: '[data-tour="inspector"]',
    description:
      "Open a review note to find its layer. Check the design screen size in Settings before exporting.",
  },
  {
    id: "studio",
    label: "Send to Studio",
    icon: "link",
    target: '[data-tour="inspector"]',
    description:
      "Open Framebridge in Studio and choose Connect to Figma. Paste its pairing code here, then send your design.",
  },
] as const;

export type TourStepId = (typeof TOUR_STEP_IDS)[number];
export type TourLesson = (typeof TOUR_STEPS)[number];
export const QUICK_TOUR_STEPS: readonly TourStepId[] = [
  "analyze",
  "properties",
  "studio",
];

export function isTourStep(value: unknown): value is TourStepId {
  return TOUR_STEP_IDS.some((id) => id === value);
}
export function tourLesson(id: TourStepId | undefined) {
  return TOUR_STEPS.find((step) => step.id === id) ?? TOUR_STEPS[0];
}

export type TourRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
/** Position the coach beside the highlighted control when there is room. */
export function placeTourCard(
  target: TourRect | undefined,
  viewport: { width: number; height: number },
  card: { width: number; height: number },
) {
  const gap = 16,
    edge = 12;
  const maxX = Math.max(edge, viewport.width - card.width - edge);
  const maxY = Math.max(edge, viewport.height - card.height - edge);
  const clampX = (x: number) => Math.max(edge, Math.min(maxX, x));
  const clampY = (y: number) => Math.max(edge, Math.min(maxY, y));
  if (target) {
    if (target.left + target.width + gap + card.width <= viewport.width - edge)
      return {
        left: clampX(target.left + target.width + gap),
        top: clampY(target.top + 16),
      };
    if (target.left - gap - card.width >= edge)
      return {
        left: clampX(target.left - gap - card.width),
        top: clampY(target.top + 16),
      };
    if (
      target.top + target.height + gap + card.height <=
      viewport.height - edge
    )
      return {
        left: clampX(target.left),
        top: clampY(target.top + target.height + gap),
      };
    if (target.top - gap - card.height >= edge)
      return {
        left: clampX(target.left),
        top: clampY(target.top - gap - card.height),
      };
  }
  // Small windows get a compact, scrollable card instead of an off-screen popover.
  return { left: maxX, top: maxY };
}
