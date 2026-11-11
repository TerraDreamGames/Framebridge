import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./BrandMark";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Focus,
  Grid2X2,
  Image,
  Layers,
  Link,
  LoaderCircle,
  Monitor,
  MousePointer2,
  SlidersHorizontal,
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
import { ConnectionExpiry } from "./ConnectionExpiry";
import {
  FirstTransferGuide,
  type FirstTransferGuideProps,
} from "./FirstTransferGuide";
import { GuidedTour } from "./GuidedTour";
import {
  QUICK_TOUR_STEPS,
  tourLesson,
  type TourStepId,
} from "./onboarding-tour";
import { PRIVATE_BETA } from "./transfer";
import type { useRobloxAccount } from "./useRobloxAccount";
import "./editor-pages.css";

const TOUR_ICONS = {
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

type Setup = {
  stage: "sign-in" | "tutorial";
  roblox: {
    state: ReturnType<typeof useRobloxAccount>["state"];
    manager: Pick<
      ReturnType<typeof useRobloxAccount>["manager"],
      "start" | "retry" | "reopen" | "cancel"
    >;
  };
  betaAccess: string;
};
type Props = FirstTransferGuideProps & {
  setup?: Setup;
  onVisit(step: TourStepId): void;
  onTourEnd(): void;
  onSettings(): void;
  onExample(kind: "layout" | "control"): void;
  examplesAvailable: boolean;
};
const EXTRA_LESSONS: TourStepId[] = [
  "layers",
  "preview",
  "layouts",
  "interactions",
  "images",
  "review",
];

function SignInActions({
  roblox: { state, manager },
  betaAccess,
  onSkip,
}: Pick<Setup, "roblox" | "betaAccess"> & { onSkip(): void }) {
  const blocked = state.loading || state.busy;
  const needsCode = PRIVATE_BETA && !betaAccess;
  const simulatedInPlugin = state.simulation && !import.meta.env.DEV;
  const waiting = state.loading ? undefined : state.pending;
  return (
    <>
      {(state.loading || state.busy || waiting) && (
        <p className="setup-status" role="status">
          <LoaderCircle size={15} className="animate-spin" />
          {state.loading
            ? "Checking your connection…"
            : waiting
              ? state.simulation
                ? "Waiting for simulated approval"
                : "Finish in your browser"
              : "Starting Roblox sign-in…"}
          {waiting && (
            <ConnectionExpiry
              label="Sign-in link"
              expiresAt={waiting.expiresAt}
            />
          )}
        </p>
      )}
      {state.error && (
        <p className="setup-error" role="alert">
          {state.error}
        </p>
      )}
      {!blocked &&
        !state.error &&
        (state.available === false || simulatedInPlugin || needsCode) && (
          <p className="setup-status" role="status">
            {needsCode
              ? "Enter your access code in Images → Account to sign in later."
              : "Roblox sign-in is unavailable. You can continue and connect later in Images."}
          </p>
        )}
      <div className="setup-sign-in-actions">
        {waiting ? (
          <>
            {(!state.simulation || state.retry) && (
              <Button
                disabled={blocked}
                onClick={() =>
                  void (state.retry ? manager.retry() : manager.reopen())
                }
              >
                <ExternalLink size={15} />{" "}
                {state.retry ? "Retry sign-in" : "Open Roblox"}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={blocked}
              onClick={() => void manager.cancel()}
            >
              Cancel sign-in
            </Button>
          </>
        ) : (
          <Button
            disabled={
              blocked ||
              simulatedInPlugin ||
              needsCode ||
              (!state.retry && state.available !== true)
            }
            onClick={() =>
              void (state.retry ? manager.retry() : manager.start(betaAccess))
            }
          >
            <Link size={15} />
            {state.retry
              ? "Retry sign-in"
              : state.simulation
                ? "Try sign-in demo"
                : "Sign in with Roblox"}
          </Button>
        )}
        <Button variant="ghost" onClick={onSkip}>
          Continue without Roblox
        </Button>
      </div>
    </>
  );
}

export function OnboardingGuide(props: Props) {
  const [page, setPage] = useState<"hub" | "transfer">("hub");
  const [activeStep, setActiveStep] = useState<TourStepId>();
  const heading = useRef<HTMLHeadingElement>(null);
  const { preferences, onChoose, setup } = props;
  const firstLaunch = setup?.stage;
  const signIn = setup?.stage === "sign-in";
  const hubOpen = !!firstLaunch || (props.open && page === "hub");
  const lesson = tourLesson(activeStep ?? preferences.tourStep);
  const touring = !!activeStep;
  const resume = !!preferences.tourStep && !preferences.tourDone;
  const sequence = QUICK_TOUR_STEPS.includes(lesson.id)
    ? QUICK_TOUR_STEPS
    : [lesson.id];

  useEffect(() => {
    if (!props.open) setPage("hub");
    else setActiveStep(undefined);
  }, [props.open]);

  // A successful or skipped sign-in replaces the content of the open dialog.
  useEffect(() => {
    if (firstLaunch === "tutorial")
      heading.current?.focus({ preventScroll: true });
  }, [firstLaunch]);

  const pause = () => {
    setActiveStep(undefined);
    props.onTourEnd();
  };
  const visit = (id: TourStepId) => {
    if (QUICK_TOUR_STEPS.includes(id))
      onChoose({ status: "active", tourStep: id, tourDone: false });
    props.onVisit(id);
    props.onOpenChange(false);
    setActiveStep(id);
  };
  const firstImport = () => {
    pause();
    onChoose({
      status: "active",
      ...(activeStep === "studio" && { tourDone: true }),
    });
    setPage("transfer");
    props.onOpenChange(true);
  };
  const finish = () => {
    if (sequence === QUICK_TOUR_STEPS)
      onChoose({ status: "complete", tourDone: true });
    else if (preferences.tourStep === activeStep)
      onChoose({ status: "dismissed", tourStep: undefined });
    pause();
  };
  const dismiss = () => {
    pause();
    onChoose({ status: "dismissed" });
    props.onOpenChange(false);
  };
  const closeHub = () => {
    if (firstLaunch === "tutorial") dismiss();
    else props.onOpenChange(false);
  };
  const skipSignIn = () => {
    if (setup?.roblox.state.pending || setup?.roblox.state.busy)
      void setup.roblox.manager.cancel();
    onChoose({ skippedSignIn: true });
  };

  return (
    <>
      {preferences.status === "active" && !touring && (
        <section
          className="onboarding-bar editor-guide-bar"
          aria-label="Getting started guide"
        >
          <div className="onboarding-bar-copy">
            <strong>{resume ? lesson.label : "First import"}</strong>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (resume ? visit(lesson.id) : firstImport())}
          >
            Resume <ArrowRight size={14} />
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
        open={hubOpen}
        onOpenChange={(open) => {
          if (!open && !signIn) closeHub();
        }}
      >
        <DialogContent
          className="editor-tutorial setup-dialog"
          data-stage={signIn ? "sign-in" : "tutorial"}
          overlayClassName="onboarding-overlay"
          showCloseButton={!signIn}
          onPointerDownOutside={(event) => {
            if (firstLaunch) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (signIn) {
              event.preventDefault();
              skipSignIn();
            }
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            heading.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            if (touring) event.preventDefault();
          }}
        >
          <DialogHeader className="setup-heading">
            {signIn && (
              <div className="setup-bridge" aria-hidden="true">
                <BrandMark />
                <span className="setup-bridge-line" />
                <span className="setup-bridge-device">
                  <Monitor size={22} />
                </span>
              </div>
            )}
            {firstLaunch === "tutorial" &&
              !preferences.skippedSignIn &&
              setup?.roblox.state.account && (
                <p className="setup-account">
                  <Check size={14} />{" "}
                  {setup.roblox.state.simulation
                    ? "Demo account @"
                    : "Connected as @"}
                  {setup.roblox.state.account.username}
                </p>
              )}
            <DialogTitle ref={heading} tabIndex={-1}>
              {signIn ? "Welcome to Framebridge" : "Tutorial"}
            </DialogTitle>
            <DialogDescription>
              {signIn
                ? "Sign in with Roblox to upload your design’s images."
                : "Bring a Figma design into Roblox Studio in three steps."}
            </DialogDescription>
          </DialogHeader>
          {signIn ? (
            <SignInActions
              roblox={setup.roblox}
              betaAccess={setup.betaAccess}
              onSkip={skipSignIn}
            />
          ) : (
            <>
              <ol className="setup-tutorial-steps">
                <li>
                  <Focus size={17} />{" "}
                  <span>
                    <strong>Analyze a frame</strong>
                    <small>Select your UI in Figma.</small>
                  </span>
                </li>
                <li>
                  <SlidersHorizontal size={17} />{" "}
                  <span>
                    <strong>Check the Roblox preview</strong>
                    <small>Inspect layers, size, and layout.</small>
                  </span>
                </li>
                <li>
                  <Link size={17} />{" "}
                  <span>
                    <strong>
                      {props.libraryMode
                        ? "Download and import"
                        : "Send to Studio"}
                    </strong>
                    <small>
                      {props.libraryMode
                        ? "Open your export in Studio."
                        : "Pair the plugins and import your UI."}
                    </small>
                  </span>
                </li>
              </ol>
              <div className="setup-tutorial-actions">
                <Button variant="ghost" onClick={closeHub}>
                  {firstLaunch ? "Skip tutorial" : "Back to workspace"}
                </Button>
                <Button onClick={() => visit(resume ? lesson.id : "analyze")}>
                  {resume
                    ? "Resume tutorial"
                    : preferences.tourDone
                      ? "Replay tutorial"
                      : "Start tutorial"}
                  <ArrowRight size={15} />
                </Button>
              </div>
              {!firstLaunch && (
                <details className="setup-extra-lessons">
                  <summary>
                    <ChevronDown size={14} /> More lessons
                  </summary>
                  <div>
                    {EXTRA_LESSONS.map((id) => {
                      const step = tourLesson(id);
                      const Icon = TOUR_ICONS[step.icon];
                      return (
                        <Button
                          key={id}
                          variant="ghost"
                          size="sm"
                          onClick={() => visit(id)}
                        >
                          <Icon size={15} /> {step.label}{" "}
                          <ChevronRight size={13} />
                        </Button>
                      );
                    })}
                    <Button variant="ghost" size="sm" onClick={firstImport}>
                      <Link size={15} /> First import checklist{" "}
                      <ChevronRight size={13} />
                    </Button>
                  </div>
                </details>
              )}
            </>
          )}
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
          sequence={sequence}
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
          onExamples={props.onExample}
          examplesAvailable={props.examplesAvailable}
        />
      )}
    </>
  );
}
