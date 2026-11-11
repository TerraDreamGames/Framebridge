import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  X,
} from "./components/Glyph";
import { Button } from "./components/ui/button";
import {
  placeTourCard,
  type TourLesson,
  type TourRect,
  type TourStepId,
} from "./onboarding-tour";

type Props = {
  lesson: TourLesson;
  sequence: readonly TourStepId[];
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
  const { lesson, sequence } = props;
  const index = sequence.indexOf(lesson.id);
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
  const previous = sequence[index - 1];
  const next = sequence[index + 1];
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
          <span>
            {sequence.length > 1
              ? `Step ${index + 1} of ${sequence.length}`
              : "Tutorial"}
          </span>
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
        {sequence.length > 1 && !minimized && (
          <div className="tour-progress" aria-hidden="true">
            {sequence.map((id, n) => (
              <span
                key={id}
                data-passed={n < index}
                data-current={n === index}
              />
            ))}
          </div>
        )}
        <h2 ref={heading} tabIndex={-1}>
          {props.libraryMode && lesson.id === "studio"
            ? "Download and import"
            : lesson.label}
        </h2>
        <div className="tour-details" hidden={minimized}>
          <p role={lesson.id === "analyze" ? "status" : undefined}>
            {props.libraryMode && lesson.id === "studio"
              ? "Download the package and open its JSON in Framebridge for Studio."
              : props.libraryMode && lesson.id === "images"
                ? "Link Roblox image IDs or download unuploaded artwork with the package."
                : lesson.id === "analyze" && props.ready
                  ? "Your preview is ready. Continue to check its layers and layout."
                  : lesson.description}
          </p>
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
                Use an example frame
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
              Open import checklist <ArrowRight size={14} />
            </Button>
          )}
        </div>
        {!minimized && (
          <div className="tour-navigation">
            {previous && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => props.onJump(previous)}
              >
                <ArrowLeft size={14} /> Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => (next ? props.onJump(next) : props.onFinish())}
            >
              {next ? "Next" : "Done"}
              {next ? <ArrowRight size={14} /> : <Check size={14} />}
            </Button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
