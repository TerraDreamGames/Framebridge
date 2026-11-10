import { Checkbox } from "./components/ui/checkbox";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { SelectControl } from "./components/SelectControl";
import { useEffect, useRef, useState } from "react";
import {
  prepareVisionMetadata,
  FULL_VISION_REGION,
  visionChanges,
  type VisionRegion,
} from "../../../packages/core/src/vision-review";
import type {
  AnalysisResult,
  LayerOverride,
} from "../../../packages/core/src/types";
import type { OverrideChange } from "../../../packages/core/src/bulk-editor";
import type { RobloxAccountState } from "./roblox-account-manager";
import {
  createVisionReviewManager,
  type VisionState,
} from "./vision-review-manager";
import { prepareVisionScreenshot } from "./vision-screenshot";
import { RELAY_URL } from "./transfer";
import { Button } from "./components/ui/button";
import { ComponentExport } from "./ComponentExport";
export function VisionReview(props: {
  result?: AnalysisResult;
  overrides: Record<string, LayerOverride>;
  account: RobloxAccountState;
  disabled: boolean;
  canUndo: boolean;
  undoDisabled: boolean;
  undo(): void;
  apply(changes: OverrideChange[]): boolean;
  inspect(id: string): void;
  download(name: string, data: Uint8Array, mime: string): void;
}) {
  const [state, setState] = useState<VisionState>({
      enabled: false,
      busy: false,
      error: "",
      notice: "",
    }),
    [rootId, setRootId] = useState(""),
    [region, setRegion] = useState<VisionRegion>({ ...FULL_VISION_REGION }),
    [includeText, setIncludeText] = useState(false),
    [consent, setConsent] = useState(false),
    [allowance, setAllowance] = useState("0.02"),
    [prepared, setPrepared] = useState<{
      image: string;
      layers: ReturnType<typeof prepareVisionMetadata>["layers"];
      map: Record<string, string>;
      truncated: boolean;
    }>(),
    [preparing, setPreparing] = useState(false),
    [error, setError] = useState(""),
    [applied, setApplied] = useState<string[]>([]),
    [component, setComponent] = useState("");
  const manager = useRef<ReturnType<typeof createVisionReviewManager> | null>(
    null,
  );
  if (!manager.current)
    manager.current = createVisionReviewManager(
      async (path, token, body, method, signal) => {
        if (!RELAY_URL)
          throw new Error(
            "Use the hosted private build for optional AI review.",
          );
        const response = await fetch(RELAY_URL + "/v1/vision-review" + path, {
          method,
          signal: AbortSignal.any([signal, AbortSignal.timeout(32000)]),
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          credentials: "omit",
          redirect: "error",
        });
        const value = await response.json();
        if (!response.ok)
          throw new Error(
            value.error || "AI review failed. Local review is available.",
          );
        return value;
      },
      setState,
    );
  const roots = props.result?.designs ?? [],
    selected = roots.find((r) => r.id === rootId) ?? roots[0];
  const fingerprint = JSON.stringify([
    props.result?.revision,
    props.result?.designs,
    selected?.id,
    region,
    includeText,
  ]);
  const sequence = useRef(0);
  useEffect(() => {
    manager.current!.setContext(
      props.account.account?.needsAuthorization
        ? ""
        : (props.account.accountToken ?? ""),
      fingerprint,
    );
    sequence.current++;
    setPrepared(undefined);
    setConsent(false);
    setApplied([]);
    setComponent("");
    setError("");
    setPreparing(false);
  }, [
    props.account.accountToken,
    props.account.account?.needsAuthorization,
    fingerprint,
  ]);
  useEffect(
    () => () => {
      sequence.current++;
      manager.current!.dispose();
    },
    [],
  );
  useEffect(() => {
    if (props.disabled) {
      manager.current!.cancel();
      sequence.current++;
      setPrepared(undefined);
      setConsent(false);
      setPreparing(false);
    }
  }, [props.disabled]);
  const busy = props.disabled || state.busy || preparing;
  const prepare = async () => {
    setError("");
    setConsent(false);
    const at = ++sequence.current;
    setPreparing(true);
    try {
      if (!props.result || !selected)
        throw new Error("Analyze your selection first.");
      const metadata = prepareVisionMetadata(
          props.result,
          selected.id,
          region,
          includeText,
        ),
        image = await prepareVisionScreenshot(
          props.result.previews[selected.id],
          region,
        );
      if (at === sequence.current) setPrepared({ image, ...metadata });
    } catch (e) {
      if (at === sequence.current)
        setError(e instanceof Error ? e.message : "Could not prepare review.");
    } finally {
      if (at === sequence.current) setPreparing(false);
    }
  };
  return (
    <Disclosure
      className="structure-memory"
      onToggle={(e) => {
        if (!e.currentTarget.open) {
          manager.current!.enable(false);
          sequence.current++;
          setPrepared(undefined);
          setConsent(false);
        }
      }}
    >
      <DisclosureSummary>Optional AI structure review</DisclosureSummary>
      <p>
        Local review remains available below. AI review is off by default and
        sends the approved screenshot and layer metadata to the private service
        and OpenAI. Provider retention policies apply; disabling response
        storage does not guarantee zero retention.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={!props.canUndo || props.undoDisabled}
        onClick={props.undo}
      >
        Undo reviewed correction
      </Button>
      <p>
        Undo uses the shared layer history and also works after review results
        clear.
      </p>
      <label>
        <Checkbox
          checked={state.enabled}
          disabled={busy || !props.account.accountToken || !RELAY_URL}
          onCheckedChange={(checked) => {
            manager.current!.enable(checked === true);
            setConsent(false);
            setPrepared(undefined);
          }}
        />{" "}
        Enable AI review for this session
      </label>
      {(!props.account.accountToken || !RELAY_URL) && (
        <p>
          Use the hosted private build and sign in through Images → Roblox
          sign-in.
        </p>
      )}
      {state.enabled && (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void manager.current!.configure()}
          >
            Check AI service
          </Button>
          {state.config?.available && (
            <p>
              {state.config.simulation ? "Local simulated provider · " : ""}
              {state.config.provider} · {state.config.model} · maximum reserved
              allowance ${(state.config.maxCostMicros! / 1000000).toFixed(4)}{" "}
              per request · {state.config.remainingRequests} daily requests
              remaining. Failed/cancelled requests retain the allowance. Quotas
              reset at 00:00 UTC.
            </p>
          )}
          <label>
            Review screen{" "}
            <SelectControl
              aria-label="AI review screen"
              disabled={busy}
              value={selected?.id ?? ""}
              onChange={(e) => setRootId(e.target.value)}
            >
              {roots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectControl>
          </label>
          <fieldset disabled={busy}>
            <legend>Focused region (% of source screen)</legend>
            {(["x", "y", "width", "height"] as const).map((key) => (
              <label key={key}>
                {key}
                <input
                  aria-label={`AI region ${key}`}
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round(region[key] * 10000) / 100}
                  onChange={(e) =>
                    setRegion({
                      ...region,
                      [key]: Number(e.target.value) / 100,
                    })
                  }
                />
              </label>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRegion({ ...FULL_VISION_REGION })}
            >
              Whole screen
            </Button>
          </fieldset>
          <label>
            <Checkbox
              checked={includeText}
              disabled={busy}
              onCheckedChange={(checked) => setIncludeText(checked === true)}
            />{" "}
            Include up to 120 characters of text metadata per layer
          </label>
          <p>
            Visible text remains present in the screenshot when text metadata is
            off. Names, source types, exported classes, bounds, parent labels
            and compatible classes are included. Source IDs, project IDs,
            artwork files, export packages, saved preferences and credentials
            are excluded.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !selected}
            onClick={() => void prepare()}
          >
            {preparing ? "Preparing preview…" : "Preview shared data"}
          </Button>
          {prepared && (
            <>
              <img
                className="vision-review-image"
                src={prepared.image}
                alt="Exact screenshot crop to share with AI review"
              />
              <Disclosure>
                <DisclosureSummary>
                  Shared metadata ({prepared.layers.length} layers
                  {prepared.truncated ? ", bounded subset only" : ""})
                </DisclosureSummary>
                <pre className="vision-review-metadata">
                  {JSON.stringify(prepared.layers, null, 2)}
                </pre>
              </Disclosure>
              <label>
                Maximum approved allowance (USD)
                <input
                  aria-label="AI review allowance USD"
                  type="number"
                  min="0.000001"
                  max="1"
                  step="0.01"
                  value={allowance}
                  disabled={busy}
                  onChange={(e) => {
                    setAllowance(e.target.value);
                    setConsent(false);
                  }}
                />
              </label>
              <label>
                <Checkbox
                  checked={consent}
                  disabled={busy}
                  onCheckedChange={(checked) => setConsent(checked === true)}
                />{" "}
                I approve sharing this screenshot and metadata
                {includeText ? ", including text" : ""} with the private service
                and OpenAI for this request.
              </label>
              <Button
                size="sm"
                disabled={busy || !consent || !state.config?.available}
                onClick={() => {
                  setConsent(false);
                  void manager.current!.review({
                    version: 1,
                    id: crypto.randomUUID(),
                    consent: {
                      screenshot: true,
                      metadata: true,
                      text: includeText,
                    },
                    maxCostMicros: Math.round(Number(allowance) * 1000000),
                    image: prepared.image,
                    layers: prepared.layers,
                  });
                }}
              >
                Request AI review
              </Button>
            </>
          )}
        </>
      )}
      {state.busy && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            manager.current!.cancel();
            setConsent(false);
          }}
        >
          Cancel AI request
        </Button>
      )}
      {(state.notice || state.error || error) && (
        <p role={state.error || error ? "alert" : "status"}>
          {error || state.error || state.notice}
        </p>
      )}
      {state.result && prepared && (
        <>
          <p>{state.result.summary}</p>
          <p>
            Confidence is the provider's estimate, not verified accuracy. Review
            each correction.
          </p>
          {state.result.suggestions.map((s) => {
            const key = s.layer + ":" + s.kind,
              id = prepared.map[s.layer];
            let blocked = "";
            try {
              if (s.kind !== "component")
                visionChanges(props.result!, prepared.map, s, props.overrides);
            } catch (e) {
              blocked =
                e instanceof Error ? e.message : "This choice is unavailable.";
            }
            return (
              <div className="structure-suggestion" key={key}>
                <strong>
                  {prepared.layers.find((l) => l.token === s.layer)?.name} →{" "}
                  {s.kind}: {s.value}
                </strong>
                <span>{Math.round(s.confidence * 100)}% confidence</span>
                <ul>
                  {s.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                {blocked && <p>{blocked}</p>}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.inspect(id)}
                >
                  Inspect layer
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !!blocked || applied.includes(key)}
                  onClick={() => {
                    setError("");
                    if (s.kind === "component") {
                      setComponent(id);
                      return;
                    }
                    try {
                      if (
                        props.apply(
                          visionChanges(
                            props.result!,
                            prepared.map,
                            s,
                            props.overrides,
                          ),
                        )
                      )
                        setApplied([...applied, key]);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Correction failed.",
                      );
                    }
                  }}
                >
                  {s.kind === "component"
                    ? "Review component candidates"
                    : applied.includes(key)
                      ? "Correction applied"
                      : "Apply reviewed correction"}
                </Button>
              </div>
            );
          })}
        </>
      )}
      {component && props.result && (
        <ComponentExport
          result={props.result}
          selected={component}
          disabled={props.disabled}
          onDownload={props.download}
          onError={setError}
        />
      )}
    </Disclosure>
  );
}
