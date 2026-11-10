import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { cloneSettings } from "../../../packages/core/src/clone-settings";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "./components/Glyph";
import {
  captureLayerPose,
  captureRecordingBasis,
  compileKeyframes,
  KEYFRAME_DEFAULTS,
  KEYFRAME_EASINGS,
  KEYFRAME_TRIGGERS,
  keyframeTotalDuration,
  REST_POSE,
  sampleKeyframes,
  validKeyframes,
  validPose,
  type Keyframe,
  type KeyframePose,
  type KeyframeSettings,
} from "../../../packages/core/src/keyframes";
import { layerBehavior } from "../../../packages/core/src/behaviors";
import type {
  DesignNode,
  LayerOverride,
  RbxNode,
} from "../../../packages/core/src/types";
import { SelectControl } from "./components/SelectControl";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
export function KeyframeEditor({
  source,
  node,
  nodes,
  edit,
  onChange,
}: {
  source: DesignNode;
  node: RbxNode;
  nodes: RbxNode[];
  edit: LayerOverride;
  onChange: (behavior: LayerOverride["behavior"]) => void;
}) {
  const behavior = layerBehavior(source, edit) ?? {};
  const value = behavior.keyframes;
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<KeyframePose>(REST_POSE);
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [clock, setClock] = useState(0),
    [completed, setCompleted] = useState(false);
  const clockRef = useRef(0);
  const drag = useRef<{ x: number; y: number; pose: KeyframePose } | null>(
    null,
  );
  const patch = (next: KeyframeSettings) => {
    if (!validKeyframes(next)) {
      setError(
        "Use 2–32 ordered frames, starting at 0, with at least .01 seconds between frames. Check the transform, trigger and playback limits. This edit was not saved.",
      );
      return false;
    }
    setError("");
    onChange({
      ...behavior,
      ...(behavior.action?.target && node.behavior?.action
        ? { action: node.behavior.action }
        : {}),
      keyframes: next,
    });
    return true;
  };
  const hash = JSON.stringify(value);
  useEffect(() => {
    setPlaying(false);
    clockRef.current = 0;
    setClock(0);
    setCompleted(false);
  }, [hash]);
  useEffect(() => {
    if (!playing || !value) return;
    let frame = 0,
      last = performance.now();
    const total = keyframeTotalDuration(value);
    const tick = (now: number) => {
      const dt = document.hidden
        ? 0
        : Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      clockRef.current = Math.min(total, clockRef.current + dt);
      setClock(clockRef.current);
      if (clockRef.current >= total) {
        setPlaying(false);
        setCompleted(true);
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, hash]);
  const record = (pose: KeyframePose) => {
    if (!value) return;
    const frames = value.frames.filter(
      (f) => Math.abs(f.time - time) > 0.000001,
    );
    const existing = value.frames.find(
      (f) => Math.abs(f.time - time) <= 0.000001,
    );
    frames.push({
      ...pose,
      time,
      easing: existing?.easing ?? "cubic",
      direction: existing?.direction ?? "out",
    });
    frames.sort((a, b) => a.time - b.time);
    patch({ ...value, frames });
  };
  const frame = value?.frames.find((f) => Math.abs(f.time - time) < 0.000001);
  const preview =
    playing || completed
      ? completed && value?.finish === "restore"
        ? REST_POSE
        : sampleKeyframes(value!, clock).pose
      : draft;
  const setPose = (next: KeyframePose) => {
    if (validPose(next)) {
      setDraft(next);
      setCompleted(false);
      setError("");
    } else setError("Pose is outside the transform limits.");
  };
  return (
    <Disclosure className="export-setup keyframe-setup editor-section">
      <DisclosureSummary>
        <span>Keyframe timeline</span>
        <span className="export-setup-summary">
          {value
            ? `${value.frames.length} frames · ${value.trigger}`
            : "Optional"}
        </span>
      </DisclosureSummary>
      <p className="property-note">
        Record poses, scrub the timeline, then choose a Play-mode trigger.
      </p>
      <div className="property-row">
        <label htmlFor="keyframes-enabled">Enable chain</label>
        <Switch
          id="keyframes-enabled"
          checked={!!value}
          onCheckedChange={(on) => {
            setError("");
            onChange({
              ...behavior,
              keyframes: on ? cloneSettings(KEYFRAME_DEFAULTS) : undefined,
            });
          }}
        />
      </div>
      {value && (
        <>
          <div className="property-row">
            <label htmlFor="keyframes-trigger">Trigger</label>
            <SelectControl
              id="keyframes-trigger"
              value={value.trigger}
              onChange={(e) =>
                patch({
                  ...value,
                  trigger: e.target.value as KeyframeSettings["trigger"],
                  attribute:
                    e.target.value === "attribute"
                      ? (value.attribute ?? "FramebridgeAnimate")
                      : undefined,
                })
              }
            >
              {KEYFRAME_TRIGGERS.map((k) => (
                <option key={k} value={k}>
                  {
                    {
                      mount: "On mount",
                      visible: "When visible",
                      activate: "On activate",
                      hover: "Hover / focus",
                      pressed: "Pressed",
                      selected: "Selected",
                      attribute: "Layer attribute",
                    }[k]
                  }
                </option>
              ))}
            </SelectControl>
          </div>
          {value.trigger === "attribute" && (
            <div className="property-row">
              <label htmlFor="keyframes-attribute">Trigger key</label>
              <Input
                id="keyframes-attribute"
                defaultValue={value.attribute}
                key={value.attribute}
                maxLength={128}
                onBlur={(e) => patch({ ...value, attribute: e.target.value })}
              />
            </div>
          )}
          {["activate", "hover", "pressed", "selected"].includes(
            value.trigger,
          ) && (
            <div className="property-row">
              <label htmlFor="keyframes-input">Input owner</label>
              <SelectControl
                id="keyframes-input"
                value={value.input ?? "auto"}
                onChange={(e) =>
                  patch({
                    ...value,
                    input: e.target.value as KeyframeSettings["input"],
                  })
                }
              >
                <option value="auto">This button or nearest parent</option>
                <option value="parent">Nearest parent button</option>
              </SelectControl>
            </div>
          )}
          <div className="property-row">
            <label htmlFor="keyframes-interruption">Retrigger</label>
            <SelectControl
              id="keyframes-interruption"
              value={value.interruption}
              onChange={(e) =>
                patch({
                  ...value,
                  interruption: e.target
                    .value as KeyframeSettings["interruption"],
                })
              }
            >
              <option value="restart">Restart chain</option>
              <option value="ignore">Finish current chain</option>
            </SelectControl>
          </div>
          <div className="property-row">
            <label htmlFor="keyframes-finish">At completion</label>
            <SelectControl
              id="keyframes-finish"
              value={value.finish}
              onChange={(e) =>
                patch({
                  ...value,
                  finish: e.target.value as KeyframeSettings["finish"],
                })
              }
            >
              <option value="restore">Restore authored pose</option>
              <option value="hold">Hold final pose</option>
            </SelectControl>
          </div>
          <div className="property-row">
            <label htmlFor="keyframes-repeats">Extra repeats</label>
            <Input
              id="keyframes-repeats"
              type="number"
              min={0}
              max={20}
              step={1}
              defaultValue={value.repeats}
              key={value.repeats}
              onBlur={(e) =>
                patch({ ...value, repeats: Number(e.target.value) })
              }
            />
          </div>
          <div className="property-row">
            <label htmlFor="keyframes-yoyo">Return each cycle</label>
            <Switch
              id="keyframes-yoyo"
              checked={value.yoyo}
              onCheckedChange={(yoyo) => patch({ ...value, yoyo })}
            />
          </div>
          <div
            className="keyframe-preview"
            aria-label="Keyframe transform preview"
            onPointerDown={(e) => {
              if (playing) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, pose: { ...draft } };
            }}
            onPointerMove={(e) => {
              if (drag.current)
                setPose({
                  ...drag.current.pose,
                  x: drag.current.pose.x + (e.clientX - drag.current.x) * 2,
                  y: drag.current.pose.y + (e.clientY - drag.current.y) * 2,
                });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <div
              className="keyframe-preview-pose"
              style={{
                transform: `translate(${preview.x / 2}px,${preview.y / 2}px) rotate(${preview.rotation}deg) scale(${preview.scale})`,
                opacity: Math.min(1, preview.opacity),
              }}
            >
              {node.name}
            </div>
          </div>
          <div className="keyframe-playback">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clockRef.current = 0;
                setClock(0);
                setCompleted(false);
                setPlaying(true);
              }}
            >
              Play chain
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPlaying(false);
                setCompleted(false);
                setDraft(REST_POSE);
              }}
            >
              Stop
            </Button>
            <output aria-live="off">
              {clock.toFixed(2)} / {keyframeTotalDuration(value).toFixed(2)}s
            </output>
          </div>
          <input
            aria-label="Scrub keyframe timeline"
            type="range"
            min={0}
            max={keyframeTotalDuration(value)}
            step={0.01}
            value={clock}
            onChange={(e) => {
              setPlaying(false);
              setCompleted(false);
              const t = Number(e.target.value);
              setClock(t);
              clockRef.current = t;
              setTime(
                Math.min(
                  value.frames[value.frames.length - 1].time,
                  sampleKeyframes(value, t).time,
                ),
              );
              setDraft(sampleKeyframes(value, t).pose);
            }}
          />
          <div className="keyframe-list" aria-label="Recorded keyframes">
            {value.frames.map((f, index) => (
              <div className="keyframe-row" key={f.time}>
                <Button
                  size="sm"
                  variant={frame === f ? "secondary" : "ghost"}
                  onClick={() => {
                    setPlaying(false);
                    setCompleted(false);
                    setTime(f.time);
                    setDraft({
                      x: f.x,
                      y: f.y,
                      scale: f.scale,
                      rotation: f.rotation,
                      opacity: f.opacity,
                    });
                    setClock(f.time);
                    clockRef.current = f.time;
                  }}
                >
                  {f.time.toFixed(2)}s · {f.easing} {f.direction}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove frame at ${f.time}s`}
                  disabled={index === 0 || value.frames.length <= 2}
                  onClick={() =>
                    patch({
                      ...value,
                      frames: value.frames.filter((n) => n !== f),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <div className="property-row">
            <label htmlFor="keyframes-time">Record at seconds</label>
            <Input
              id="keyframes-time"
              type="number"
              min={0}
              max={120}
              step={0.01}
              value={time}
              onChange={(e) => setTime(Number(e.target.value))}
            />
          </div>
          {(["x", "y", "scale", "rotation", "opacity"] as const).map((key) => (
            <div className="property-row" key={key}>
              <label htmlFor={`keyframes-${key}`}>
                {
                  {
                    x: "Move X · px",
                    y: "Move Y · px",
                    scale: "Scale multiplier",
                    rotation: "Rotation · °",
                    opacity: "Opacity multiplier",
                  }[key]
                }
              </label>
              <Input
                id={`keyframes-${key}`}
                type="number"
                defaultValue={draft[key]}
                key={String(draft[key])}
                step={key === "scale" || key === "opacity" ? 0.01 : 1}
                onBlur={(e) => {
                  const next = {
                    ...draft,
                    [key]: e.target.value.trim() ? Number(e.target.value) : NaN,
                  };
                  setPose(next);
                }}
              />
            </div>
          ))}
          {frame && (
            <>
              <div className="property-row">
                <label htmlFor="keyframes-easing">Arrive with easing</label>
                <SelectControl
                  id="keyframes-easing"
                  value={frame.easing}
                  onChange={(e) =>
                    patch({
                      ...value,
                      frames: value.frames.map((f) =>
                        f === frame
                          ? {
                              ...f,
                              easing: e.target.value as Keyframe["easing"],
                            }
                          : f,
                      ),
                    })
                  }
                >
                  {KEYFRAME_EASINGS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </SelectControl>
              </div>
              <div className="property-row">
                <label htmlFor="keyframes-direction">Ease direction</label>
                <SelectControl
                  id="keyframes-direction"
                  value={frame.direction}
                  onChange={(e) =>
                    patch({
                      ...value,
                      frames: value.frames.map((f) =>
                        f === frame
                          ? {
                              ...f,
                              direction: e.target
                                .value as Keyframe["direction"],
                            }
                          : f,
                      ),
                    })
                  }
                >
                  <option value="in">In</option>
                  <option value="out">Out</option>
                  <option value="inOut">In / out</option>
                </SelectControl>
              </div>
            </>
          )}
          <div className="keyframe-playback">
            <Button size="sm" onClick={() => record(draft)}>
              Record pose
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                try {
                  if (!value.recording)
                    throw new Error(
                      "Set a layer reference first, then edit the layer in Figma and analyze again.",
                    );
                  const pose = captureLayerPose(
                    value.recording,
                    captureRecordingBasis(node, nodes, source.opacity),
                  );
                  setDraft(pose);
                  record(pose);
                } catch (e) {
                  setError(String(e instanceof Error ? e.message : e));
                }
              }}
            >
              Capture layer
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              try {
                patch({
                  ...value,
                  recording: captureRecordingBasis(node, nodes, source.opacity),
                });
              } catch (e) {
                setError(String(e instanceof Error ? e.message : e));
              }
            }}
          >
            {value.recording ? "Reset layer reference" : "Set layer reference"}
          </Button>
          {value.recording && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                try {
                  patch(
                    compileKeyframes(value, node, nodes, source.opacity ?? 1),
                  );
                } catch (e) {
                  setError(String(e instanceof Error ? e.message : e));
                }
              }}
            >
              Use manual poses
            </Button>
          )}
          <p className="property-note">
            Drag the preview to position a pose. Record at an existing time to
            replace it. Capture layer records analyzed native geometry relative
            to your saved reference; uniform scale and the same parent are
            required. Recorded geometry rebases on export. State triggers
            restore on release; hidden layers stop; reduced motion keeps the
            authored pose.
          </p>
        </>
      )}
      {error && (
        <p className="property-error" role="alert">
          {error}
        </p>
      )}
    </Disclosure>
  );
}
