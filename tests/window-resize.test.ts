import { describe, expect, it, vi } from "vitest";
import { installWindowResize } from "../plugins/figma/src/window-resize";

function fixture() {
  const host = Object.assign(new EventTarget(), {
    innerWidth: 900,
    innerHeight: 720,
    document: Object.assign(new EventTarget(), { hidden: false }),
    // Simulate Windows scaling and a monitor origin unrelated to the iframe.
    devicePixelRatio: 1.5,
    screen: { availWidth: 500, availHeight: 300 },
  });
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  Object.assign(host, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const handle = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  const resize = vi.fn();
  const dragging = vi.fn();
  const dispose = installWindowResize(
    handle as unknown as HTMLButtonElement,
    resize,
    dragging,
    host as unknown as Window,
  );
  const pointer = (
    target: EventTarget,
    type: string,
    fields: Partial<PointerEvent> = {},
  ) =>
    target.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), {
        pointerId: 1,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: 890,
        clientY: 710,
        screenX: 2500,
        screenY: 1500,
        ...fields,
      }),
    );
  const tick = (timestamp = 0) => {
    const ready = [...frames.values()];
    frames.clear();
    ready.forEach((callback) => callback(timestamp));
  };
  const down = () => pointer(handle, "pointerdown");
  const move = (clientX: number, clientY = 710) =>
    pointer(host, "pointermove", { clientX, clientY });
  const up = (clientX: number, clientY = 710) =>
    pointer(host, "pointerup", { clientX, clientY });
  return {
    host,
    handle,
    resize,
    dragging,
    frames,
    dispose,
    pointer,
    tick,
    down,
    move,
    up,
  };
}

describe("plugin window resizing", () => {
  it("uses iframe coordinates through Windows scaling, monitor changes and host resizes", () => {
    const f = fixture();
    f.down();
    f.pointer(f.host, "pointermove", {
      clientX: 990,
      clientY: 760,
      screenX: -4000,
      screenY: 9000,
    });
    f.tick();
    expect(f.resize).toHaveBeenLastCalledWith(
      { width: 1000, height: 770 },
      false,
    );
    // Host resize has taken effect; do not accumulate it again on the next move.
    f.host.innerWidth = 1000;
    f.host.innerHeight = 770;
    f.move(1030, 780);
    f.tick(40);
    expect(f.resize).toHaveBeenLastCalledWith(
      { width: 1040, height: 790 },
      false,
    );
    f.up(1030, 780);
    expect(f.resize).toHaveBeenLastCalledWith(
      { width: 1040, height: 790 },
      true,
    );
    f.dispose();
  });

  it("keeps dragging after a native resize drops capture and retries capture", () => {
    const f = fixture();
    f.down();
    f.move(920);
    f.tick();
    f.pointer(f.handle, "lostpointercapture");
    expect(f.dragging.mock.calls).toEqual([[true]]);
    expect(f.handle.setPointerCapture).toHaveBeenCalledTimes(2);
    f.move(1010);
    f.up(1040);
    expect(f.resize).toHaveBeenLastCalledWith(
      { width: 1050, height: 720 },
      true,
    );
    expect(f.dragging.mock.calls).toEqual([[true], [false]]);
    f.dispose();
  });

  it("can finish the gesture when the host rejects pointer capture", () => {
    const f = fixture();
    f.handle.setPointerCapture.mockImplementation(() => {
      throw new Error("capture interrupted");
    });
    expect(() => f.down()).not.toThrow();
    f.move(950, 750);
    f.up(980, 780);
    expect(f.resize.mock.calls).toEqual([[{ width: 990, height: 790 }, true]]);
    expect(f.frames.size).toBe(0);
    f.dispose();
  });

  it("coalesces rapid input to 30 host calls per second and flushes release immediately", () => {
    const f = fixture();
    f.down();
    for (let index = 0; index < 120; index++) {
      f.move(891 + index);
      f.tick(index * (1000 / 120));
    }
    const live = f.resize.mock.calls.filter((call) => !call[1]);
    expect(live.length).toBeGreaterThan(20);
    expect(live.length).toBeLessThanOrEqual(30);
    f.up(1100, 800);
    expect(f.resize).toHaveBeenLastCalledWith(
      { width: 1110, height: 810 },
      true,
    );
    expect(f.frames.size).toBe(0);
    f.tick(2000);
    expect(f.resize).toHaveBeenCalledTimes(live.length + 1);
    f.dispose();
  });

  it("does not redraw or save a stationary grab", () => {
    const f = fixture();
    f.down();
    for (let index = 0; index < 10; index++) {
      f.move(890);
      f.tick(index * 40);
    }
    f.up(890);
    expect(f.resize).not.toHaveBeenCalled();
    f.dispose();
  });

  it("bounds the window without repeatedly submitting identical dimensions", () => {
    const f = fixture();
    f.down();
    f.move(-1000, -1000);
    f.tick();
    f.move(-2000, -2000);
    f.tick(40);
    expect(f.resize.mock.calls).toEqual([[{ width: 600, height: 420 }, false]]);
    f.up(10000, 10000);
    expect(f.resize).toHaveBeenLastCalledWith(
      { width: 1800, height: 1400 },
      true,
    );
    f.dispose();
  });

  it.each(["pointercancel", "blur", "visibilitychange", "missed release"])(
    "ends cleanly after %s and ignores later movement",
    (reason) => {
      const f = fixture();
      f.down();
      f.move(940);
      if (reason === "visibilitychange") {
        f.host.document.hidden = true;
        f.host.document.dispatchEvent(new Event(reason));
      } else if (reason === "missed release") {
        f.pointer(f.host, "pointermove", {
          buttons: 0,
          clientX: 0,
          clientY: 0,
        });
      } else {
        f.pointer(f.host, reason);
      }
      expect(f.resize).toHaveBeenLastCalledWith(
        { width: 950, height: 720 },
        true,
      );
      f.move(1100);
      f.tick();
      expect(f.resize).toHaveBeenCalledTimes(1);
      expect(f.frames.size).toBe(0);
      f.dispose();
    },
  );

  it("ignores other pointers and removes pending work when unmounted", () => {
    const f = fixture();
    f.pointer(f.handle, "pointerdown", { button: 2 });
    expect(f.dragging).not.toHaveBeenCalled();
    f.down();
    f.pointer(f.host, "pointermove", { pointerId: 2, clientX: 1000 });
    f.pointer(f.host, "pointerup", { pointerId: 2 });
    expect(f.resize).not.toHaveBeenCalled();
    f.move(920);
    f.dispose();
    f.tick();
    f.move(1000);
    f.up(1000);
    expect(f.resize).not.toHaveBeenCalled();
    expect(f.frames.size).toBe(0);
  });
});
