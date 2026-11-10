import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./BrandMark";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Focus,
  Grid2X2,
  Image,
  Layers,
  Link,
  Monitor,
  MousePointer2,
  SlidersHorizontal,
  Sparkles,
  X,
} from "./components/Glyph";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import {
  FirstTransferGuide,
  type FirstTransferGuideProps,
} from "./FirstTransferGuide";
import { GuidedTour } from "./GuidedTour";
import { onboardingStep } from "./onboarding";
import { TOUR_STEPS, tourLesson, type TourStepId } from "./onboarding-tour";
import "./editor-pages.css";

export const TOUR_ICONS = {
  scan: Focus,
  layers: Layers,
  sliders: SlidersHorizontal,
  monitor: Monitor,
  grid: Grid2X2,
  pointer: MousePointer2,
  image: Image,
  check: Check,
  link: Link,
};
type Props = FirstTransferGuideProps & {
  onVisit(step: TourStepId): void;
  onTourEnd(): void;
  onSettings(): void;
  onExample(kind: "layout" | "control"): void;
  examplesAvailable: boolean;
};
const FEATURES: { id: TourStepId; title: string }[] = [
  {
    id: "layers",
    title: "Layers",
  },
  {
    id: "properties",
    title: "Properties",
  },
  {
    id: "preview",
    title: "Device previews",
  },
  {
    id: "layouts",
    title: "Scrolling & layouts",
  },
  {
    id: "interactions",
    title: "Interactions",
  },
  {
    id: "images",
    title: "Artwork",
  },
];

export function OnboardingGuide(props: Props) {
  const [page, setPage] = useState<"hub" | "transfer">("hub");
  const requestedPage = useRef<"hub" | "transfer" | undefined>(undefined);
  const [touring, setTouring] = useState(false);
  const { preferences, onChoose } = props;
  const lesson = tourLesson(preferences.tourStep);
  const index = TOUR_STEPS.findIndex((step) => step.id === lesson.id);
  const route = props.libraryMode ? "download" : preferences.route;
  const importStep = onboardingStep(route, props.facts);
  useEffect(() => {
    if (props.open) {
      setPage(requestedPage.current ?? "hub");
      requestedPage.current = undefined;
      setTouring(false);
    }
  }, [props.open]);
  const visit = (id: TourStepId) => {
    onChoose({ status: "active", tourStep: id, tourDone: false });
    props.onVisit(id);
    props.onOpenChange(false);
    setTouring(true);
  };
  const pause = () => {
    setTouring(false);
    props.onTourEnd();
  };
  const firstImport = () => {
    pause();
    onChoose({ status: "active" });
    setPage("transfer");
    if (!props.open) requestedPage.current = "transfer";
    props.onOpenChange(true);
  };
  const finish = () => {
    onChoose({ tourDone: true });
    pause();
    setPage("hub");
    props.onOpenChange(true);
  };
  const dismiss = () => {
    pause();
    onChoose({ status: "dismissed" });
    props.onOpenChange(false);
  };
  const createExample = (kind: "layout" | "control") => {
    pause();
    onChoose({
      status: "active",
      tourStep: kind === "layout" ? "layouts" : "interactions",
    });
    props.onOpenChange(false);
    props.onExample(kind);
  };
  return (
    <>
      {preferences.status === "active" && !touring && (
        <section
          className="onboarding-bar editor-guide-bar"
          aria-label="Getting started guide"
        >
          <span className="onboarding-bar-marker" aria-hidden="true">
            <Sparkles size={15} />
          </span>
          <div className="onboarding-bar-copy">
            <strong>
              {importStep === 3
                ? "Import complete"
                : preferences.tourStep && !preferences.tourDone
                  ? lesson.label
                  : "Tutorial"}
            </strong>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => props.onOpenChange(true)}
          >
            {preferences.tourStep && !preferences.tourDone
              ? "Resume"
              : "Open tutorial"}{" "}
            <ArrowRight size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss getting started guide"
            onClick={dismiss}
          >
            <X size={14} />
          </Button>
        </section>
      )}
      <Dialog
        open={props.open && page === "hub"}
        onOpenChange={(open) => {
          if (!open && preferences.status === "new")
            onChoose({ status: "dismissed" });
          props.onOpenChange(open);
        }}
      >
        <DialogContent
          className="welcome-dialog editor-tutorial"
          overlayClassName="onboarding-overlay"
          onCloseAutoFocus={(event) => {
            if (touring) {
              event.preventDefault();
              document
                .querySelector<HTMLElement>(".tour-card h2")
                ?.focus({ preventScroll: true });
            }
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document
              .querySelector<HTMLButtonElement>("[data-onboarding-start]")
              ?.focus();
          }}
        >
          <DialogHeader>
            <span className="onboarding-eyebrow">
              <BrandMark className="welcome-brand-mark" /> Framebridge
            </span>
            <DialogTitle>Tutorial</DialogTitle>
            <DialogDescription className="sr-only">
              Choose a lesson to practice in the editor, or follow your first
              import.
            </DialogDescription>
          </DialogHeader>
          <div className="welcome-start">
            <div>
              <h3>
                {preferences.tourStep && !preferences.tourDone
                  ? lesson.label
                  : "Editor tour"}
              </h3>
              <p>{TOUR_STEPS.length} hands-on lessons</p>
            </div>
            <Button
              data-onboarding-start
              onClick={() =>
                visit(preferences.tourDone ? "analyze" : lesson.id)
              }
            >
              {preferences.tourStep && !preferences.tourDone
                ? "Resume tour"
                : preferences.tourDone
                  ? "Replay tour"
                  : "Start tour"}
              <ArrowRight size={15} />
            </Button>
          </div>
          <section
            className="welcome-features"
            aria-label="Explore Framebridge features"
          >
            {FEATURES.map((feature) => {
              const step = tourLesson(feature.id),
                Icon = TOUR_ICONS[step.icon];
              return (
                <button
                  key={feature.id}
                  className="welcome-feature"
                  aria-current={
                    preferences.tourStep === feature.id ? "step" : undefined
                  }
                  onClick={() => visit(feature.id)}
                >
                  <span className="welcome-feature-icon">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{feature.title}</strong>
                  </span>
                  <ChevronRight size={14} />
                </button>
              );
            })}
          </section>
          <div className="welcome-paths">
            <button className="welcome-path" onClick={firstImport}>
              <span className="welcome-feature-icon">
                <Link size={18} />
              </span>
              <span>
                <strong>First import</strong>
              </span>
              <ArrowRight size={15} />
            </button>
            <div className="welcome-example">
              <Grid2X2 size={18} />
              <div>
                <strong>Example frames</strong>
                <div className="welcome-example-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!props.examplesAvailable || props.busy}
                    onClick={() => createExample("layout")}
                  >
                    Lists & grids
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!props.examplesAvailable || props.busy}
                    onClick={() => createExample("control")}
                  >
                    Controls
                  </Button>
                </div>
                <small>
                  {props.examplesAvailable
                    ? "Adds example frames to your current Figma page."
                    : "Open the installed Figma plugin to create examples."}
                </small>
              </div>
            </div>
          </div>
          {props.persistenceError && (
            <div className="onboarding-feedback" role="status">
              <p>{props.persistenceError}</p>
              <Button variant="outline" size="sm" onClick={props.onRetrySave}>
                Retry saving
              </Button>
            </div>
          )}
          <div className="welcome-footer">
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {preferences.status === "new" ? "Skip for now" : "Close tutorial"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <FirstTransferGuide
        {...props}
        open={props.open && page === "transfer"}
        onOverview={() => setPage("hub")}
      />
      {touring && (
        <GuidedTour
          lesson={lesson}
          index={index}
          ready={props.facts.analyzed}
          libraryMode={props.libraryMode}
          busy={props.busy}
          selectionCount={props.selectionCount}
          onPause={pause}
          onJump={visit}
          onFinish={finish}
          onFirstImport={firstImport}
          onAnalyze={props.onAnalyze}
          onSettings={props.onSettings}
          onExamples={createExample}
          examplesAvailable={props.examplesAvailable}
        />
      )}
    </>
  );
}
