import { useEffect, useRef, useState } from "react";
import { isHostMessage } from "./bridge";
import {
  SIDEBAR_LAYOUT_KEY,
  defaultSidebarLayout,
  fitSidebarLayout,
  readSidebarLayout,
  sidebarRange,
  type Sidebar,
  type SidebarLayout,
} from "./sidebar-layout";

let restoreSequence = 0;

export function useSidebarLayout() {
  const workbench = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(window.innerWidth);
  const [preferred, setPreferred] = useState<SidebarLayout>({});
  const preferenceRef = useRef(preferred);
  const touched = useRef(false);
  const layout = fitSidebarLayout(preferred, width);
  preferenceRef.current = preferred;

  useEffect(() => {
    // Header alignment follows this pane without lifting drag state into App.
    workbench.current
      ?.closest<HTMLElement>(".focused-app")
      ?.style.setProperty("--workspace-layers-width", `${layout.layers}px`);
  }, [layout.layers]);

  useEffect(() => {
    const element = workbench.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      try {
        const saved = readSidebarLayout(
          JSON.parse(localStorage.getItem(SIDEBAR_LAYOUT_KEY) || "null"),
        );
        if (saved && !touched.current) setPreferred(saved);
      } catch {
        // A storage failure should not prevent resizing or exporting.
      }
      return;
    }
    const revision = ++restoreSequence;
    const restore = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const message = event.data?.pluginMessage;
      if (message?.type !== "sidebar-layout" || message.revision !== revision)
        return;
      const saved = readSidebarLayout(message.layout);
      if (saved && !touched.current) setPreferred(saved);
    };
    window.addEventListener("message", restore);
    parent.postMessage(
      { pluginMessage: { type: "load-sidebar-layout", revision } },
      "*",
    );
    return () => window.removeEventListener("message", restore);
  }, []);

  const resize = (side: Sidebar, value: number, persist: boolean) => {
    if (!Number.isFinite(value)) return;
    touched.current = true;
    const currentWidth = workbench.current?.clientWidth ?? width;
    const current = fitSidebarLayout(preferenceRef.current, currentWidth);
    const { min, max } = sidebarRange(side, current, currentWidth);
    const next = {
      ...current,
      [side]: Math.round(Math.max(min, Math.min(max, value))),
    };
    preferenceRef.current = next;
    setPreferred(next);
    if (!persist) return;
    if (import.meta.env.DEV) {
      try {
        localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(next));
      } catch {
        // Keep this session's layout even if local storage is unavailable.
      }
    } else {
      parent.postMessage(
        { pluginMessage: { type: "save-sidebar-layout", layout: next } },
        "*",
      );
    }
  };

  return {
    workbench,
    layout,
    range: (side: Sidebar) => sidebarRange(side, layout, width),
    resize,
    reset: (side: Sidebar) =>
      resize(side, defaultSidebarLayout(width)[side], true),
  };
}
