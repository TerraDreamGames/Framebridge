import { Checkbox } from "./components/ui/checkbox";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { SelectControl } from "./components/SelectControl";
import { useEffect, useState } from "react";
import { useReviewSync } from "./useReviewSync";
import type { RobloxAccountState } from "./roblox-account-manager";
import type { useReviewPreferences } from "./review-preferences";
import type { ReviewPreferences } from "../../../packages/core/src/structure-review";
import { RELAY_URL } from "./transfer";
import { Button } from "./components/ui/button";
const describe = (p: ReviewPreferences) =>
  `${p.rules.length} saved choices · ${p.hints?.length ?? 0} hints · naming ${p.naming?.style ?? "source"}${p.naming?.prefix ? " / prefix " + p.naming.prefix : ""}`;
function ChoiceSummary({ label, p }: { label: string; p: ReviewPreferences }) {
  return (
    <Disclosure>
      <DisclosureSummary>
        {label}: {describe(p)}
      </DisclosureSummary>
      <ul>
        {p.rules.map((r, i) => (
          <li key={i}>
            {r.name} · {r.sourceType} · {r.family} → {r.decision.kind}:{" "}
            {r.decision.value}
          </li>
        ))}
        {(p.hints ?? []).map((h, i) => (
          <li key={"h" + i}>
            Name contains {h.phrase} → {h.decision.kind}: {h.decision.value}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
export function ReviewSyncPanel({
  memory,
  account,
}: {
  memory: ReturnType<typeof useReviewPreferences>;
  account: RobloxAccountState;
}) {
  const { state, manager } = useReviewSync(memory, account);
  const [scope, setScope] = useState("personal"),
    [consent, setConsent] = useState(false),
    [deleting, setDeleting] = useState(false),
    [resetting, setResetting] = useState(false);
  useEffect(() => {
    setConsent(false);
    setDeleting(false);
    setResetting(false);
  }, [state.connected, account.account?.userId]);
  const disabled =
    state.busy || memory.loading || memory.saving || !!memory.error;
  const signed =
    account.account &&
    account.accountToken &&
    !account.account.needsAuthorization;
  const remote = state.conflict ?? state.snapshot;
  return (
    <Disclosure className="structure-memory editor-preferences">
      <DisclosureSummary>Preference sync</DisclosureSummary>
      <p>
        Local storage is the default. Sync sends only saved review choices,
        manually authored hints and naming conventions. Designs, screenshots,
        text contents, assets and upload credentials are excluded. Layer names
        deliberately remembered as choices are included. Shared Roblox groups
        are separate from Figma teams.
      </p>
      {(!RELAY_URL || account.available === false) && (
        <p>Account sync requires a connected Framebridge service.</p>
      )}
      {!signed && !!RELAY_URL && account.available !== false && (
        <p>Sign in to Roblox in Images → Account to enable sync.</p>
      )}
      {!state.connected && (
        <>
          <label>
            Preference scope{" "}
            <SelectControl
              aria-label="Preference sync scope"
              value={scope}
              disabled={disabled || !signed}
              onChange={(e) => {
                setScope(e.target.value);
                setConsent(false);
              }}
            >
              <option value="personal">Personal Roblox account</option>
              {account.account?.owners
                .filter((o) => o.kind === "group")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </SelectControl>
          </label>
          <label>
            <Checkbox
              checked={consent}
              disabled={disabled || !signed}
              onCheckedChange={(checked) => setConsent(checked === true)}
            />
            I consent to store preferences for this scope in the private
            service.
          </label>
          <Button
            size="sm"
            disabled={disabled || !signed || !consent || !RELAY_URL}
            onClick={() => void manager.connect(scope)}
          >
            Enable preference sync
          </Button>
        </>
      )}
      {remote && (
        <p>
          {remote.scope.kind === "group" ? "Shared " : "Personal "}
          {remote.scope.label} · cloud revision {remote.revision}
        </p>
      )}
      <ChoiceSummary label="Local copy" p={memory.preferences} />
      {remote && <ChoiceSummary label="Cloud copy" p={remote.preferences} />}
      {state.connected && (
        <div className="structure-review-toolbar">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void manager.fetch()}
          >
            Fetch cloud choices
          </Button>
          <Button
            size="sm"
            disabled={disabled || !!state.conflict}
            onClick={() => void manager.publish()}
          >
            Publish local choices
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !remote}
            onClick={() => void manager.useCloud()}
          >
            Use cloud copy locally
          </Button>
          {state.conflict && (
            <Button
              size="sm"
              disabled={disabled}
              onClick={() => void manager.overwrite()}
            >
              Replace cloud with my local copy
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void manager.revoke()}
          >
            Revoke this sync connection
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !!state.conflict}
            onClick={() => setResetting(true)}
          >
            Reset cloud choices…
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !!state.conflict}
            onClick={() => setDeleting(true)}
          >
            Delete cloud preferences…
          </Button>
        </div>
      )}
      {resetting && state.connected && (
        <p>
          Reset {remote?.scope.label}? Peers keep their local copies.{" "}
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              setResetting(false);
              void manager.resetCloud();
            }}
          >
            Confirm cloud reset
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setResetting(false)}>
            Cancel reset
          </Button>
        </p>
      )}
      {deleting && state.connected && (
        <p>
          Delete cloud preferences for {remote?.scope.label} and revoke every
          connection to this record? Local copies stay.{" "}
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              setDeleting(false);
              void manager.deleteCloud();
            }}
          >
            Confirm deletion for {remote?.scope.label}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>
            Cancel deletion
          </Button>
        </p>
      )}
      {state.busy && (
        <p role="status">
          Syncing…{" "}
          <Button size="sm" variant="ghost" onClick={() => manager.cancel()}>
            Cancel sync request
          </Button>
        </p>
      )}
      {state.notice && <p role="status">{state.notice}</p>}
      {state.error && (
        <p role="alert">
          {state.error}{" "}
          <Button
            size="sm"
            variant="outline"
            disabled={state.busy}
            onClick={() => void manager.restore()}
          >
            Retry preference sync
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.busy}
            onClick={() => void manager.forget()}
          >
            Forget this installation's sync access
          </Button>
        </p>
      )}
    </Disclosure>
  );
}
