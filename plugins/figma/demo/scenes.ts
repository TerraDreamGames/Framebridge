export const DEMO_SCENES = [
  { id: "workspace", label: "Workspace", width: 1440, height: 900 },
  { id: "properties", label: "Properties", width: 620, height: 460 },
  { id: "layers", label: "Layers", width: 420, height: 720 },
  { id: "images", label: "Image assets", width: 1200, height: 820 },
  { id: "settings", label: "Settings", width: 1100, height: 780 },
  { id: "layout", label: "Layout settings", width: 1100, height: 780 },
  { id: "studio", label: "Studio", width: 1100, height: 720 },
  { id: "export", label: "Export", width: 1100, height: 720 },
  { id: "notes", label: "Conversion notes", width: 1100, height: 780 },
  { id: "usability", label: "Usability checks", width: 1100, height: 820 },
  { id: "structure", label: "Structure review", width: 1100, height: 820 },
  { id: "tutorial", label: "Tutorial", width: 1100, height: 820 },
  { id: "welcome", label: "First launch", width: 1100, height: 820 },
  { id: "scrolling", label: "Scrolling frame", width: 620, height: 760 },
  { id: "grid", label: "Grid layout", width: 620, height: 680 },
  { id: "list", label: "List layout", width: 620, height: 680 },
  { id: "typography", label: "Typography", width: 620, height: 760 },
  {
    id: "modifiers",
    label: "Constraints & modifiers",
    width: 620,
    height: 760,
  },
  { id: "bulk", label: "Bulk editing", width: 620, height: 650 },
  { id: "select-rules", label: "Select by rule", width: 500, height: 820 },
  {
    id: "image-preparation",
    label: "Image preparation",
    width: 620,
    height: 620,
  },
  { id: "image-scaling", label: "Nine-slice images", width: 620, height: 760 },
  { id: "interactions", label: "Interactions", width: 620, height: 900 },
  { id: "progress", label: "Progress bar", width: 620, height: 900 },
  { id: "toggle", label: "Toggle", width: 620, height: 900 },
  { id: "slider", label: "Slider", width: 620, height: 960 },
  { id: "cooldown", label: "Cooldown", width: 620, height: 900 },
  { id: "tooltip", label: "Tooltip", width: 620, height: 900 },
  { id: "window", label: "Draggable window", width: 620, height: 900 },
  { id: "skill", label: "Skill tree", width: 620, height: 900 },
  { id: "roulette", label: "Roulette", width: 620, height: 960 },
  { id: "tabs", label: "Tab group", width: 620, height: 760 },
  { id: "data", label: "Live text binding", width: 620, height: 900 },
  { id: "motion", label: "Motion & sound", width: 620, height: 960 },
  { id: "keyframes", label: "Keyframe timeline", width: 820, height: 1000 },
  { id: "rules", label: "Conditional rules", width: 720, height: 1000 },
  { id: "particles", label: "Particles", width: 620, height: 1000 },
  { id: "world", label: "World output", width: 620, height: 760 },
  { id: "account", label: "Roblox account", width: 1000, height: 600 },
  { id: "saved-images", label: "Saved images", width: 1000, height: 660 },
  { id: "local-png", label: "Import PNG", width: 1000, height: 660 },
  { id: "cloud-artwork", label: "Cloud artwork", width: 1000, height: 660 },
  { id: "fonts", label: "Font settings", width: 1000, height: 680 },
  { id: "themes", label: "Theme tokens", width: 1000, height: 760 },
  { id: "report", label: "Report an issue", width: 1000, height: 900 },
  { id: "codes", label: "Design codes", width: 1100, height: 720 },
] as const;
export type DemoScene = (typeof DEMO_SCENES)[number]["id"];
export type DemoTheme = "light" | "dark";
export const isDemoScene = (value: unknown): value is DemoScene =>
  DEMO_SCENES.some((scene) => scene.id === value);
export function demoRoute(search: string) {
  const query = new URLSearchParams(search);
  return {
    scene: isDemoScene(query.get("view"))
      ? (query.get("view") as DemoScene)
      : ("workspace" as DemoScene),
    theme:
      query.get("theme") === "dark" ? ("dark" as const) : ("light" as const),
    capture: query.get("capture") === "1",
  };
}
