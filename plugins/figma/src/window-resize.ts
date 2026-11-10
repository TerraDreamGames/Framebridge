import { windowSize } from "./window-size";

type Size = { width: number; height: number };
export type ResizePlugin = (size: Size, persist: boolean) => void;

// Use iframe CSS coordinates, not desktop screen coordinates. Keep the grabbed
// inset fixed even as Figma resizes the iframe and moves its corner underneath us.
export function installWindowResize(
  handle: HTMLButtonElement,
  resize: ResizePlugin,
  dragging: (active: boolean) => void,
  host: Window = window,
) {
  let drag:
    | { pointer: number; right: number; bottom: number; initial: Size }
    | undefined;
  let pending: Size | undefined;
  let sent: Size | undefined;
  let frame: number | undefined;
  let sentAt = -Infinity;
  const equal = (a: Size | undefined, b: Size | undefined) =>
    a?.width === b?.width && a?.height === b?.height;
  const cancelFrame = () => {
    if (frame !== undefined) host.cancelAnimationFrame(frame);
    frame = undefined;
  };
  const capture = (pointer: number) => {
    try {
      handle.setPointerCapture(pointer);
    } catch {
      // Some desktop hosts interrupt capture when the iframe changes size.
      // Window listeners still handle movement, release and cancellation.
    }
  };
  const detach = () => {
    host.removeEventListener("pointermove", move, true);
    host.removeEventListener("pointerup", up, true);
    host.removeEventListener("pointercancel", cancel, true);
    host.removeEventListener("blur", cancel);
    host.document.removeEventListener("visibilitychange", visibility);
  };
  const release = (pointer: number) => {
    try {
      if (handle.hasPointerCapture(pointer))
        handle.releasePointerCapture(pointer);
    } catch {
      // Capture may already have been released by the native window.
    }
  };
  const finish = () => {
    if (!drag) return;
    const { pointer, initial } = drag;
    drag = undefined;
    detach();
    cancelFrame();
    release(pointer);
    // Flush the final size immediately, including movement since the last frame.
    if (pending && (!equal(pending, initial) || !equal(sent, initial)))
      resize(pending, true);
    pending = sent = undefined;
    dragging(false);
  };
  const flush = (timestamp: number) => {
    frame = undefined;
    if (!drag || !pending || equal(pending, sent)) return;
    // Avoid flooding the native host with resize/repaint requests at 120–240 Hz.
    if (timestamp - sentAt < 1000 / 30) {
      frame = host.requestAnimationFrame(flush);
      return;
    }
    sentAt = timestamp;
    sent = pending;
    resize(sent, false);
  };
  const measure = (event: PointerEvent) => {
    if (!drag) return;
    pending = windowSize({
      width: event.clientX + drag.right,
      height: event.clientY + drag.bottom,
    });
  };
  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    // Recover from a release outside the iframe if the host missed pointerup.
    if (event.buttons === 0) return finish();
    event.preventDefault();
    measure(event);
    if (frame === undefined && !equal(pending, sent))
      frame = host.requestAnimationFrame(flush);
  }
  function up(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    measure(event);
    finish();
  }
  function cancel(event: Event) {
    if ("pointerId" in event && event.pointerId !== drag?.pointer) return;
    finish();
  }
  function visibility() {
    if (host.document.hidden) finish();
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || drag) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    const initial = { width: host.innerWidth, height: host.innerHeight };
    drag = {
      pointer: event.pointerId,
      right: initial.width - event.clientX,
      bottom: initial.height - event.clientY,
      initial,
    };
    sent = pending = initial;
    sentAt = -Infinity;
    host.addEventListener("pointermove", move, true);
    host.addEventListener("pointerup", up, true);
    host.addEventListener("pointercancel", cancel, true);
    host.addEventListener("blur", cancel);
    host.document.addEventListener("visibilitychange", visibility);
    capture(event.pointerId);
    dragging(true);
  };
  const lost = (event: PointerEvent) => {
    if (drag?.pointer === event.pointerId) capture(event.pointerId);
  };
  handle.addEventListener("pointerdown", down);
  handle.addEventListener("lostpointercapture", lost);
  return () => {
    handle.removeEventListener("pointerdown", down);
    handle.removeEventListener("lostpointercapture", lost);
    const pointer = drag?.pointer;
    drag = undefined;
    detach();
    cancelFrame();
    if (pointer !== undefined) release(pointer);
  };
}
