import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Lightbulb,
  X,
} from "./components/Glyph";
import { Button } from "./components/ui/button";
import { SelectControl } from "./components/SelectControl";
import {
  TOUR_STEPS,
  placeTourCard,
  type TourLesson,
  type TourRect,
  type TourStepId,
} from "./onboarding-tour";

type Props = {
  lesson: TourLesson;
  index: number;
  ready: boolean;
  libraryMode: boolean;
  busy: boolean;
  selectionCount: number;
  examplesAvailable: boolean;
  onPause(): void;
  onJump(id: TourStepId): void;
  onFinish(): void;
  onFirstImport(): void;
  onAnalyze(): void;
  onSettings(): void;
  onExamples(kind: "layout" | "control"): void;
};
export function GuidedTour(props: Props) {
  const { lesson, index } = props;
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusedLesson = useRef("");
  const [minimized, setMinimized] = useState(false);
  useEffect(() => setMinimized(false), [lesson.id]);
  const [layout, setLayout] = useState<{
    target?: TourRect;
    left: number;
    top: number;
    found: boolean;
  }>({ left: 12, top: 12, found: false });
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const element = document.querySelector<HTMLElement>(lesson.target);
      const visible = element && element.getBoundingClientRect();
      const found = !!visible && visible.width > 0 && visible.height > 0;
      const bounds = found
        ? visible
        : document
            .querySelector('[data-tour="preview"]')
            ?.getBoundingClientRect();
      const target = bounds
        ? {
            left: Math.max(4, bounds.left),
            top: Math.max(4, bounds.top),
            width: Math.min(
              bounds.width,
              innerWidth - Math.max(4, bounds.left) - 4,
            ),
            height: Math.min(
              bounds.height,
              innerHeight - Math.max(4, bounds.top) - 4,
            ),
          }
        : undefined;
      const box = card.current?.getBoundingClientRect();
      const position = placeTourCard(
        target,
        { width: innerWidth, height: innerHeight },
        { width: box?.width ?? 340, height: box?.height ?? 420 },
      );
      const next = { ...position, target, found };
      setLayout((last) =>
        JSON.stringify(last) === JSON.stringify(next) ? last : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    if (card.current) observer.observe(card.current);
    const target = document.querySelector(lesson.target);
    if (target) observer.observe(target);
    // Pane navigation can mount the lesson's target after this effect runs.
    const mutations = new MutationObserver(schedule);
    const workspace = document.querySelector("main");
    if (workspace)
      mutations.observe(workspace, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    schedule();
    if (focusedLesson.current !== lesson.id) {
      focusedLesson.current = lesson.id;
      heading.current?.focus({ preventScroll: true });
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
    };
  }, [lesson.id, props.ready]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      // Let a property dropdown or another modal consume Escape first.
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector(
          '[data-slot="select-content"], [data-slot="dialog-content"], [data-slot="dropdown-menu-content"]',
        )
      ) {
        event.preventDefault();
        props.onPause();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [props.onPause]);
  const last = index === TOUR_STEPS.length - 1;
  return createPortal(
    <div className="guided-tour editor-guided-tour">
      {layout.target && layout.target.width > 0 && layout.target.height > 0 && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{
            left: layout.target.left,
            top: layout.target.top,
            width: layout.target.width,
            height: layout.target.height,
          }}
        />
      )}
      <section
        ref={card}
        className="tour-card"
        data-minimized={minimized}
        aria-label="Framebridge feature tour"
        style={{ left: layout.left, top: layout.top }}
      >
        <div className="tour-topline">
          <span>{lesson.chapter}</span>
          <div className="tour-top-actions">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={minimized ? "Expand tour tips" : "Minimize tour tips"}
              aria-expanded={!minimized}
              onClick={() => setMinimized(!minimized)}
            >
              <ChevronDown
                size={15}
                style={{ transform: minimized ? "rotate(180deg)" : undefined }}
              />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Pause feature tour"
              onClick={props.onPause}
            >
              <X size={15} />
            </Button>
          </div>
        </div>
        <div className="tour-details" hidden={minimized}>
          <div
            className="tour-progress"
            aria-label={`Tour step ${index + 1} of ${TOUR_STEPS.length}`}
          >
            {TOUR_STEPS.map((step, n) => (
              <span
                key={step.id}
                data-passed={n < index}
                data-current={n === index}
              />
            ))}
          </div>
          <div className="tour-lesson-picker">
            <span>
              {String(index + 1).padStart(2, "0")} / {TOUR_STEPS.length}
            </span>
            <SelectControl
              aria-label="Tour lesson"
              value={lesson.id}
              onChange={(e) => props.onJump(e.target.value as TourStepId)}
            >
              {TOUR_STEPS.map((step) => (
                <option key={step.id} value={step.id}>
                  {step.label}
                </option>
              ))}
            </SelectControl>
          </div>
        </div>
        <h2 ref={heading} tabIndex={-1}>
          {minimized ? lesson.label : lesson.title}
        </h2>
        <div className="tour-details" hidden={minimized}>
          <p>
            {props.libraryMode && lesson.id === "studio"
              ? "Download the package and open its JSON in Framebridge for Studio."
              : props.libraryMode && lesson.id === "images"
                ? "Link Roblox image IDs or download unuploaded artwork with the package."
                : lesson.description}
          </p>
          <div className="tour-try">
            <Lightbulb size={16} />
            <div>
              <strong>Try it</strong>
              <p>{lesson.try}</p>
            </div>
          </div>
          {!props.ready && lesson.id !== "analyze" && (
            <p className="tour-context-note">
              Analyze a frame to try this with your design.
            </p>
          )}
          {lesson.id === "analyze" && props.ready && (
            <p className="tour-context-note" role="status">
              Preview ready. Continue to Layers.
            </p>
          )}
          {lesson.id === "analyze" && (
            <Button
              variant="outline"
              size="sm"
              disabled={!props.selectionCount || props.busy}
              onClick={props.onAnalyze}
            >
              {props.busy
                ? "Analyzing…"
                : props.ready
                  ? "Analyze again"
                  : "Analyze selection"}
            </Button>
          )}
          {lesson.id === "analyze" &&
            !props.ready &&
            props.examplesAvailable && (
              <Button
                variant="ghost"
                size="sm"
                disabled={props.busy}
                onClick={() => props.onExamples("layout")}
              >
                Try layout examples instead
              </Button>
            )}
          {lesson.id === "review" && (
            <Button variant="outline" size="sm" onClick={props.onSettings}>
              Open Settings
            </Button>
          )}
          {(lesson.id === "layouts" || lesson.id === "interactions") &&
            props.examplesAvailable && (
              <Button
                variant="outline"
                size="sm"
                disabled={props.busy}
                onClick={() =>
                  props.onExamples(
                    lesson.id === "layouts" ? "layout" : "control",
                  )
                }
              >
                Create {lesson.id === "layouts" ? "layout" : "control"} examples
              </Button>
            )}
          {lesson.id === "studio" && (
            <Button variant="outline" size="sm" onClick={props.onFirstImport}>
              First import <ArrowRight size={14} />
            </Button>
          )}
        </div>
        <div className="tour-navigation">
          <Button
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={() => props.onJump(TOUR_STEPS[index - 1].id)}
          >
            <ArrowLeft size={14} /> Back
          </Button>
          <Button
            size="sm"
            onClick={() =>
              last ? props.onFinish() : props.onJump(TOUR_STEPS[index + 1].id)
            }
          >
            {last ? "Finish tour" : "Next"}
            {last ? <Check size={14} /> : <ArrowRight size={14} />}
          </Button>
        </div>
        <small className="tour-footnote" hidden={minimized}>
          Esc to pause
        </small>
      </section>
    </div>,
    document.body,
  );
}
