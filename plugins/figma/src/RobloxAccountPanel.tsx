import { Link, ExternalLink, LoaderCircle, Check } from "./components/Glyph";
import { Button } from "./components/ui/button";
import { SelectControl } from "./components/SelectControl";
import { ConnectionExpiry } from "./ConnectionExpiry";
import type {
  createRobloxAccountManager,
  RobloxAccountState,
} from "./roblox-account-manager";
import type { CloudSettings } from "./cloud-storage";
import { PRIVATE_BETA } from "./transfer";

export function RobloxAccountPanel({
  state,
  manager,
  cloud,
  update,
  disabled,
}: {
  state: RobloxAccountState;
  manager: ReturnType<typeof createRobloxAccountManager>;
  cloud: CloudSettings;
  update(patch: Partial<CloudSettings>): void;
  disabled: boolean;
}) {
  const blocked =
    disabled ||
    state.busy ||
    state.loading ||
    (state.simulation && !import.meta.env.DEV);
  const account = state.account;
  const expired =
    !!account &&
    (account.needsAuthorization || account.expiresAt <= Date.now());
  const approved = account?.owners.some(
    (o) => o.kind === cloud.ownerType && o.id === cloud.ownerId,
  );
  return (
    <section
      className="roblox-account-panel artwork-account"
      aria-label="Roblox account connection"
    >
      {state.simulation && (
        <p className="account-simulation" role="status">
          Sign-in demo · Uses a sample account. No real Roblox authorization or
          image uploads.
        </p>
      )}
      <div className="roblox-account-heading">
        <strong>
          {state.loading ? (
            "Checking Roblox connection…"
          ) : account ? (
            <>
              <Check size={14} /> {state.simulation ? "Test account " : ""}@
              {account.username}
            </>
          ) : state.simulation ? (
            "Try the connection workflow"
          ) : (
            "Roblox account"
          )}
        </strong>
        {state.loading && <LoaderCircle size={15} className="animate-spin" />}
      </div>
      {account && (
        <p>
          {expired ? (
            "Roblox authorization ended. Reconnect to upload images."
          ) : (
            <>
              <ConnectionExpiry
                label={
                  state.simulation
                    ? "Simulated authorization"
                    : "Roblox authorization"
                }
                calendar
                expiresAt={account.expiresAt}
                detail
              />
            </>
          )}
        </p>
      )}
      {!account && !state.loading && !state.simulation && (
        <p className="artwork-hint">Sign in to upload images.</p>
      )}
      {state.pending ? (
        <>
          <p role="status">
            {state.simulation
              ? "Simulating approval"
              : "Waiting for Roblox approval"}{" "}
            ·{" "}
            <ConnectionExpiry
              expiresAt={state.pending.expiresAt}
              label="Sign-in link"
              detail
            />
          </p>
          <div className="roblox-account-actions">
            {!state.simulation && (
              <Button
                size="sm"
                variant="outline"
                disabled={blocked}
                onClick={() => void manager.reopen()}
              >
                <ExternalLink size={14} /> Open Roblox
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={blocked}
              onClick={() => void manager.cancel()}
            >
              Cancel sign-in
            </Button>
          </div>
        </>
      ) : (
        <div className="roblox-account-actions">
          <Button
            size="sm"
            variant={account && !expired ? "outline" : "default"}
            disabled={
              blocked ||
              state.available !== true ||
              (PRIVATE_BETA && !cloud.betaAccess?.trim())
            }
            onClick={() => void manager.start(cloud.betaAccess?.trim() ?? "")}
          >
            <Link size={14} />{" "}
            {state.simulation
              ? account
                ? "Reconnect demo"
                : "Try sign-in demo"
              : account
                ? "Reconnect Roblox"
                : "Sign in with Roblox"}
          </Button>
          {account && (
            <Button
              size="sm"
              variant="outline"
              disabled={blocked}
              onClick={() => void manager.recheck()}
            >
              Check connection
            </Button>
          )}
          {account && (
            <Button
              size="sm"
              variant="ghost"
              disabled={blocked}
              onClick={() => void manager.disconnect()}
            >
              Disconnect
            </Button>
          )}
        </div>
      )}
      {PRIVATE_BETA && !cloud.betaAccess?.trim() && (
        <p>Enter your private beta access code above to sign in.</p>
      )}
      {(state.available === false || expired || state.retry) && (
        <p>
          {state.available === false
            ? "This service has not enabled Roblox sign-in."
            : "You can also upload using your own API key."}{" "}
          <Button
            variant="link"
            size="sm"
            disabled={blocked}
            onClick={() => update({ authMode: "key" })}
          >
            Use an API key
          </Button>
        </p>
      )}
      {account && (
        <label className="roblox-owner-field">
          Image owner
          <SelectControl
            aria-label="Approved Roblox image owner"
            disabled={blocked || expired}
            value={`${cloud.ownerType}:${cloud.ownerId}`}
            onChange={(event) => {
              const [ownerType, ownerId] = event.target.value.split(":");
              update({ ownerType: ownerType as "user" | "group", ownerId });
            }}
          >
            {!approved && (
              <option value={`${cloud.ownerType}:${cloud.ownerId}`} disabled>
                Choose a creator
              </option>
            )}
            {account.owners.map((owner) => (
              <option
                key={`${owner.kind}:${owner.id}`}
                value={`${owner.kind}:${owner.id}`}
              >
                {owner.kind === "user"
                  ? `Personal · ${owner.label}`
                  : owner.label}
              </option>
            ))}
          </SelectControl>
        </label>
      )}
      {account && !expired && !approved && (
        <p role="status">
          {cloud.ownerId
            ? "Your selected creator is no longer approved. Choose a creator or reconnect to approve it again."
            : "Choose Personal or an approved group before uploading images."}
        </p>
      )}
      {state.error && (
        <p role="alert" className="account-error">
          {state.error}
        </p>
      )}
      {state.notice && <p role="status">{state.notice}</p>}
      {state.retry && (
        <Button
          variant="outline"
          size="sm"
          disabled={blocked}
          onClick={() => void manager.retry()}
        >
          Retry account action
        </Button>
      )}
      <p className="account-help">
        {account &&
          !state.simulation &&
          "Creators are approved during sign-in. "}
        <a
          href="https://www.roblox.com/my/account"
          target="_blank"
          rel="noreferrer"
        >
          Roblox account settings <ExternalLink size={11} />
        </a>
      </p>
    </section>
  );
}
