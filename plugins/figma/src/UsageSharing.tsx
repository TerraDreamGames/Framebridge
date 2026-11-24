import { useId } from "react";
import type { OnboardingEvent } from "../../../packages/core/src/figma-usage";
import { Checkbox } from "./components/ui/checkbox";
import { Button } from "./components/ui/button";
import { openDocumentation } from "./open-documentation";
import type { useFigmaUsage } from "./useFigmaUsage";

export function UsageSharing({
  usage,
  initialEvents,
}: {
  usage: ReturnType<typeof useFigmaUsage>;
  initialEvents?: OnboardingEvent[];
}) {
  const id = useId();
  return (
    <div className="usage-sharing">
      <label htmlFor={id}>
        <Checkbox
          id={id}
          aria-describedby={id + "-description"}
          checked={usage.checked}
          disabled={usage.saving || usage.failedChoice === false}
          onCheckedChange={(value) =>
            usage.choose(value === true, initialEvents)
          }
        />
        Share usage statistics
      </label>
      <p id={id + "-description"}>
        Help improve Framebridge by sharing daily activity and tutorial steps.
        Design contents and account details stay out of these reports.{" "}
        <Button
          variant="link"
          className="usage-privacy-link"
          onClick={() => openDocumentation("privacy")}
        >
          Privacy notice
        </Button>
      </p>
      {usage.error && (
        <p role="alert" className="property-error">
          {usage.error}
          {usage.failedChoice === false && (
            <>
              {" "}
              <Button
                variant="link"
                className="usage-privacy-link"
                disabled={usage.saving}
                onClick={() => usage.choose(false)}
              >
                Retry
              </Button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
