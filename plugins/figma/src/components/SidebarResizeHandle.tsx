import { useEffect, useRef, useState } from "react";
import type { Sidebar } from "../sidebar-layout";

export function SidebarResizeHandle({
  side,
  width,
  min,
  max,
  onResize,
  onReset,
}: {
  side: Sidebar;
  width: number;
  min: number;
  max: number;
  onResize: (width: number, persist: boolean) => void;
  onReset: () => void;
}) {
  const name = side === "layers" ? "Layers" : "Properties";
  const drag = useRef<
    { pointer: number; x: number; width: number } | undefined
  >(undefined);
  const pending = useRef<number | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const resize = useRef(onResize);
  resize.current = onResize;
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    if (!resizing) return;
    document.body.classList.add("sidebar-resizing");
    return () => document.body.classList.remove("sidebar-resizing");
  }, [resizing]);
  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const finish = () => {
    if (!drag.current) return;
    drag.current = undefined;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    if (pending.current !== undefined) resize.current(pending.current, true);
    pending.current = undefined;
    setResizing(false);
  };
  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${name} sidebar`}
      aria-controls={`framebridge-${side}-pane`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      title={`Drag to resize ${name}. Double-click to reset. Arrow keys adjust by 10px; Shift + arrow by 40px.`}
      className={`sidebar-resize-handle ${resizing ? "resizing" : ""}`}
      onDoubleClick={onReset}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, x: event.clientX, width };
        pending.current = undefined;
        setResizing(true);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.pointer !== event.pointerId) return;
        pending.current =
          start.width +
          (event.clientX - start.x) * (side === "layers" ? 1 : -1);
        if (frame.current === undefined)
          frame.current = requestAnimationFrame(() => {
            frame.current = undefined;
            if (pending.current !== undefined)
              resize.current(pending.current, false);
          });
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        const delta =
          (event.shiftKey ? 40 : 10) *
          (event.key === "ArrowRight" ? 1 : -1) *
          (side === "layers" ? 1 : -1);
        onResize(
          event.key === "Home"
            ? min
            : event.key === "End"
              ? max
              : width + delta,
          true,
        );
      }}
    />
  );
}
