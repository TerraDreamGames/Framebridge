export const SIDEBAR_LAYOUT_KEY = "framebridge-sidebar-layout";
export type Sidebar = "layers" | "properties";
export type SidebarLayout = Partial<Record<Sidebar, number>>;
export const SIDEBAR_MIN = { layers: 160, properties: 260 };
export const SIDEBAR_MAX = { layers: 480, properties: 700 };
export const SIDEBAR_DIVIDER_WIDTH = 4;
export const PREVIEW_MIN_WIDTH = 160;

export function readSidebarLayout(value: unknown): SidebarLayout | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const clean: SidebarLayout = {};
  for (const side of ["layers", "properties"] as const) {
    const width = (value as SidebarLayout)[side];
    if (width === undefined) continue;
    if (typeof width !== "number" || !Number.isFinite(width)) return;
    clean[side] = Math.round(
      Math.max(SIDEBAR_MIN[side], Math.min(SIDEBAR_MAX[side], width)),
    );
  }
  return clean;
}

export function defaultSidebarLayout(width: number): Record<Sidebar, number> {
  return {
    layers: width >= 1100 ? 240 : width <= 820 ? 180 : 210,
    properties: Math.round(Math.max(300, Math.min(380, width * 0.25))),
  };
}

// Keep preferred sizes separately, so shrinking the plugin temporarily does
// not discard the user's wider layout. Only a deliberate resize changes it.
export function fitSidebarLayout(
  preferred: SidebarLayout,
  width: number,
): Record<Sidebar, number> {
  const layout = { ...defaultSidebarLayout(width), ...preferred };
  const available = Math.max(0, width - SIDEBAR_DIVIDER_WIDTH * 2);
  const preview = Math.min(PREVIEW_MIN_WIDTH, available * 0.3);
  const budget = Math.max(0, available - preview);
  const minimum = SIDEBAR_MIN.layers + SIDEBAR_MIN.properties;
  if (budget < minimum) {
    const layers = Math.round((budget * SIDEBAR_MIN.layers) / minimum);
    return { layers, properties: Math.floor(budget) - layers };
  }
  const excess = layout.layers + layout.properties - budget;
  if (excess > 0) {
    const flexible = layout.layers + layout.properties - minimum;
    layout.layers = Math.round(
      layout.layers -
        (excess * (layout.layers - SIDEBAR_MIN.layers)) / flexible,
    );
    layout.properties = Math.floor(budget) - layout.layers;
  }
  return layout;
}

export function sidebarRange(
  side: Sidebar,
  layout: Record<Sidebar, number>,
  width: number,
) {
  const opposite = side === "layers" ? "properties" : "layers";
  const available = Math.max(0, width - SIDEBAR_DIVIDER_WIDTH * 2);
  const preview = Math.min(PREVIEW_MIN_WIDTH, available * 0.3);
  const max = Math.max(
    0,
    Math.floor(
      Math.min(SIDEBAR_MAX[side], available - preview - layout[opposite]),
    ),
  );
  return { min: Math.min(SIDEBAR_MIN[side], max), max };
}
