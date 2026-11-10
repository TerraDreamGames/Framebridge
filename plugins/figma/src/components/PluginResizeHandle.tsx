import { useEffect, useRef, useState } from "react";
import { MoveDiagonal2 } from "./Glyph";
import { windowSize } from "../window-size";
import { installWindowResize, type ResizePlugin } from "../window-resize";

export function PluginResizeHandle({ onResize }: { onResize: ResizePlugin }) {
  const handle = useRef<HTMLButtonElement>(null);
  const resize = useRef(onResize);
  resize.current = onResize;
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    if (!handle.current) return;
    return installWindowResize(
      handle.current,
      (size, persist) => resize.current(size, persist),
      setResizing,
    );
  }, []);
  return (
    <button
      type="button"
      ref={handle}
      className={`plugin-resize-handle ${resizing ? "resizing" : ""}`}
      aria-label="Resize plugin"
      title="Drag to resize. Arrow keys resize by 20px; Shift + arrow by 100px."
      onKeyDown={(e) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        )
          return;
        e.preventDefault();
        const step = e.shiftKey ? 100 : 20;
        const size = windowSize({
          width:
            window.innerWidth +
            (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0),
          height:
            window.innerHeight +
            (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0),
        });
        if (size) onResize(size, true);
      }}
    >
      <MoveDiagonal2 size={14} aria-hidden="true" />
    </button>
  );
}
