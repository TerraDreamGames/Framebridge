import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Focus,
  Link,
  LoaderCircle,
} from "./components/Glyph";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import {
  onboardingStep,
  type OnboardingFacts,
  type OnboardingPreferences,
} from "./onboarding";

export type FirstTransferGuideProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  preferences: OnboardingPreferences;
  facts: OnboardingFacts;
  libraryMode: boolean;
  selectionCount: number;
  imageCount: number;
  uploadProblem: string;
  busy: boolean;
  actionBlocked: boolean;
  blocker: string;
  restoringConnection: boolean;
  persistenceError: string;
  onRetrySave(): void;
  onChoose(change: Partial<Omit<OnboardingPreferences, "version">>): void;
  onAnalyze(): void;
  onConnect(): void;
  onImages(): void;
  onReview(): void;
  onSend(): void;
  onDownload(): void;
  onOverview?(): void;
};

export function FirstTransferGuide(props: FirstTransferGuideProps) {
  const { preferences, facts, onChoose, onOpenChange } = props;
  const route = props.libraryMode ? "download" : preferences.route;
  const step = onboardingStep(route, facts);
  const labels = [
    "Preview your design",
    route === "connect" ? "Connect Studio" : "Download package",
    "Import your UI",
  ];
  const dismiss = () => {
    onChoose({ status: "dismissed" });
    onOpenChange(false);
  };
  const finish = () => {
    onChoose({ status: "complete" });
    onOpenChange(false);
  };
  const act = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  const waiting =
    facts.receipt === "pending" ||
    facts.receipt === "ready" ||
    facts.receipt === "queued";
  const action =
    step === 0
      ? props.onAnalyze
      : step === 1
        ? route === "connect"
          ? props.onConnect
          : props.onDownload
        : step === 3 || route === "download"
          ? finish
          : props.uploadProblem && !waiting
            ? props.onImages
            : props.onSend;
  const actionLabel =
    step === 0
      ? "Analyze selection"
      : step === 1
        ? route === "connect"
          ? "Open connection"
          : "Download package"
        : step === 3
          ? "Finish guide"
          : route === "download"
            ? "I imported it in Studio"
            : waiting
              ? "Back to design"
              : props.uploadProblem
                ? "Set up image uploads"
                : "Send to Studio";
  const disabled =
    props.busy ||
    (step === 0
      ? !props.selectionCount
      : step === 1 && route === "connect"
        ? props.restoringConnection
        : step === 3
          ? false
          : props.actionBlocked);

  return (
    <>
      <Dialog open={props.open} onOpenChange={onOpenChange}>
        <DialogContent
          className="onboarding-dialog editor-first-import"
          overlayClassName="onboarding-overlay"
        >
          <DialogHeader>
            <span className="onboarding-eyebrow">First import</span>
            <DialogTitle>
              {step === 3 ? "Your UI is in Studio" : labels[step]}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {step === 3
                ? "You’ve completed your first import. Keep building in Studio, or send another design when you’re ready."
                : "This checklist follows your actual design and connection. Return here whenever you need the next step."}
            </DialogDescription>
          </DialogHeader>
          <ol className="onboarding-steps" aria-label="Import steps">
            {labels.map((label, index) => (
              <li
                key={index}
                data-complete={index < step}
                aria-current={index === step ? "step" : undefined}
              >
                <span aria-hidden="true">
                  {index < step ? <Check size={14} /> : index + 1}
                </span>
                <strong>{label}</strong>
              </li>
            ))}
          </ol>
          <div className="onboarding-detail">
            {step === 0 ? (
              <Focus size={20} />
            ) : step === 1 ? (
              route === "connect" ? (
                <Link size={20} />
              ) : (
                <ArrowDownToLine size={20} />
              )
            ) : (
              <Check size={20} />
            )}
            <div>
              {step === 0 && (
                <>
                  <h3>
                    {props.selectionCount
                      ? `${props.selectionCount === 1 ? "Frame selected" : `${props.selectionCount} frames selected`}`
                      : "Select a UI frame in Figma"}
                  </h3>
                  <p>
                    {props.selectionCount
                      ? "Analyze, then inspect Layers and Properties in the Roblox preview."
                      : "Select the UI frame you want to import on your Figma canvas."}
                  </p>
                </>
              )}
              {step === 1 && route === "connect" && (
                <>
                  <h3>Pair the two plugins</h3>
                  <ol>
                    <li>Open Framebridge in Studio.</li>
                    <li>
                      Click <strong>Connect to Figma</strong> in Studio.
                    </li>
                    <li>Open Studio here and paste the pairing code.</li>
                  </ol>
                  <p className="onboarding-note">
                    Reuse this connection until its displayed expiry.
                  </p>
                </>
              )}
              {step === 1 && route === "download" && (
                <>
                  <h3>Take a copy into Studio</h3>
                  <p>
                    Download the package, then open its JSON in Framebridge for
                    Studio.
                  </p>
                  <p className="onboarding-note">
                    Unuploaded images need Roblox asset IDs before they display
                    in your game.
                  </p>
                </>
              )}
              {step === 2 && route === "download" && (
                <>
                  <h3>Open and import the package</h3>
                  <ol>
                    <li>If you downloaded a ZIP, extract it first.</li>
                    <li>Open its JSON in Framebridge for Studio.</li>
                    <li>
                      Upload any included PNGs to Roblox and link their IDs.
                      Review the preview, then click <strong>Import</strong>.
                    </li>
                  </ol>
                  <p className="onboarding-note">
                    Continue editing with Studio’s Explorer and Properties.
                  </p>
                </>
              )}
              {step === 2 && route === "connect" && (
                <>
                  <h3>
                    {waiting
                      ? facts.receipt === "queued"
                        ? "Queued in Studio"
                        : "Delivered. Finish in Studio."
                      : facts.receipt === "failed"
                        ? "Studio couldn’t import this delivery"
                        : "Send your reviewed design"}
                  </h3>
                  <p>
                    {waiting
                      ? facts.receipt === "queued"
                        ? "Studio has queued the design. Stop Play when you’re ready, then check the import in Edit mode."
                        : "In Framebridge for Studio, review the incoming design and click Import. If Auto-import is on, wait for Studio to finish."
                      : facts.receipt === "failed"
                        ? "Read the error in Studio, fix the reported issue, then send again."
                        : props.imageCount
                          ? `${props.imageCount} ${props.imageCount === 1 ? "image needs" : "images need"} uploading. Send uploads them and delivers the package to Studio.`
                          : "This design’s images are already linked, or its layers are native. Send delivers the package to Studio."}
                  </p>
                  {!waiting && !!props.uploadProblem && (
                    <p className="onboarding-note">
                      {props.uploadProblem} Roblox sign-in or an API key is only
                      needed for unuploaded images.
                    </p>
                  )}
                </>
              )}
              {step === 3 && (
                <>
                  <h3>Make it fit your game</h3>
                  <p>
                    Refine your UI in Studio. Send future updates using the same
                    connection.
                  </p>
                </>
              )}
            </div>
          </div>
          {!props.libraryMode && step < 3 && (
            <div className="onboarding-route">
              <span>Transfer</span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={route}
                aria-label="Import method"
                disabled={props.busy}
                onValueChange={(value) => {
                  if (value === "connect" || value === "download")
                    onChoose({ route: value });
                }}
              >
                <ToggleGroupItem value="connect">
                  <Link size={14} /> Connect Studio
                </ToggleGroupItem>
                <ToggleGroupItem value="download">
                  <ArrowDownToLine size={14} /> Download a copy
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          {props.busy && (
            <p className="onboarding-feedback" role="status">
              <LoaderCircle size={14} className="spin" /> Working on your
              design…
            </p>
          )}
          {props.actionBlocked && !!props.blocker && (
            <div className="onboarding-feedback" role="status">
              <p>{props.blocker}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => act(props.onReview)}
              >
                Review design
              </Button>
            </div>
          )}
          {props.persistenceError && (
            <div className="onboarding-feedback" role="status">
              <p>{props.persistenceError}</p>
              <Button variant="outline" size="sm" onClick={props.onRetrySave}>
                Retry saving preference
              </Button>
            </div>
          )}
          <div className="onboarding-actions">
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Pause checklist
            </Button>
            {step === 2 && route === "download" && (
              <Button
                variant="outline"
                size="sm"
                disabled={props.busy || props.actionBlocked}
                onClick={() => act(props.onDownload)}
              >
                Download again
              </Button>
            )}
            {step === 0 && !props.selectionCount ? (
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Back to Figma <ArrowRight size={14} />
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={disabled}
                onClick={() =>
                  waiting && step === 2 && route === "connect"
                    ? onOpenChange(false)
                    : act(action)
                }
              >
                {actionLabel}{" "}
                {step === 3 ? <Check size={14} /> : <ArrowRight size={14} />}
              </Button>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={props.onOverview}>
            All lessons
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
