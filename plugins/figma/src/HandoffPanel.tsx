import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { SelectControl } from "./components/SelectControl";
import { ConnectionExpiry } from "./ConnectionExpiry";
import {
  HANDOFF_STORAGE_KEY,
  readHandoffs,
  type SavedHandoff,
} from "./handoff-storage";
import {
  handoffCapability,
  inspectHandoff,
  revokeHandoff,
  type HandoffSummary,
} from "./handoff-transfer";
import { PRIVATE_BETA, RELAY_URL, RelayError } from "./transfer";
import { isHostMessage } from "./bridge";
import {
  Check,
  Copy,
  FileBox,
  LoaderCircle,
  RefreshCw,
  X,
} from "./components/Glyph";

function CopyDesignCode(props: {
  code: string;
  expiresAt: number;
  busy: boolean;
  onCopyFallback(text: string): void;
}) {
  const [expired, setExpired] = useState(() => props.expiresAt <= Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    const remaining = props.expiresAt - Date.now();
    setExpired(remaining <= 0);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setExpired(true), remaining + 10);
    return () => clearTimeout(timer);
  }, [props.expiresAt]);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={props.busy || expired}
      onClick={() => {
        if (props.expiresAt <= Date.now()) return;
        void navigator.clipboard
          .writeText(props.code)
          .then(() => setCopied(true))
          .catch(() => props.onCopyFallback(props.code));
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {expired ? "Code expired" : copied ? "Copied" : "Copy code"}
    </Button>
  );
}

export function HandoffPanel(props: {
  disabled: boolean;
  name: string;
  betaAccess?: string;
  onAccessChange(value: string): void;
  onCreate(
    ownerToken: string,
    ttl: 60 | 1440,
  ): Promise<Omit<HandoffSummary, "receipts">>;
  onCopyFallback(text: string): void;
}) {
  const [records, setRecords] = useState<SavedHandoff[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [ttl, setTtl] = useState<60 | 1440>(60),
    [receipts, setReceipts] = useState<
      Record<string, HandoffSummary["receipts"]>
    >({});
  const current = useRef<SavedHandoff[]>([]),
    sequence = useRef(0),
    working = useRef(false);
  const requests = useRef(
    new Map<
      number,
      {
        resolve(value: unknown): void;
        reject(error: Error): void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const request = (type: string, handoffs?: SavedHandoff[]) =>
    new Promise<unknown>((resolve, reject) => {
      const revision = ++sequence.current;
      const timer = setTimeout(() => {
        requests.current.delete(revision);
        reject(new Error("Saved design codes did not respond."));
      }, 8000);
      requests.current.set(revision, { resolve, reject, timer });
      parent.postMessage({ pluginMessage: { type, revision, handoffs } }, "*");
    });
  const save = async (next: SavedHandoff[]) => {
    const clean = readHandoffs(next);
    if (import.meta.env.DEV)
      localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(clean));
    else await request("save-handoffs", clean);
    current.current = clean;
    setRecords(clean);
  };
  const restore = async () => {
    setLoaded(false);
    setError("");
    try {
      const raw = import.meta.env.DEV
        ? JSON.parse(localStorage.getItem(HANDOFF_STORAGE_KEY) || "null")
        : await request("load-handoffs");
      const clean = readHandoffs(raw);
      current.current = clean;
      setRecords(clean);
      setLoaded(true);
    } catch {
      setError(
        "Could not restore saved design codes. Retry storage before creating another code.",
      );
    }
  };
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const message = event.data.pluginMessage;
      if (message?.type !== "handoffs-response") return;
      const pending = requests.current.get(message.revision);
      if (!pending) return;
      clearTimeout(pending.timer);
      requests.current.delete(message.revision);
      message.error
        ? pending.reject(new Error(message.error))
        : pending.resolve(message.handoffs);
    };
    window.addEventListener("message", handler);
    void restore();
    return () => {
      window.removeEventListener("message", handler);
      for (const pending of requests.current.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Design code panel closed."));
      }
      requests.current.clear();
    };
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update the design code.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const create = () =>
    run(async () => {
      const owned = readHandoffs(current.current);
      if (owned.filter((r) => r.origin === RELAY_URL).length >= 4)
        throw new Error(
          "Check or revoke a saved code before creating another.",
        );
      const pending: SavedHandoff = {
        origin: RELAY_URL,
        ownerToken: handoffCapability(),
        name: props.name.slice(0, 1000),
        expiresAt: Date.now() + 86_435_000,
      };
      // Persist the management capability before the request. An unknown network
      // outcome can then be recovered with Check status after reopening.
      await save([...owned, pending]);
      const created = await props.onCreate(pending.ownerToken, ttl);
      const next = {
        ...pending,
        ...created,
        name: created.name.slice(0, 1000),
      };
      current.current = current.current.map((r) =>
        r.ownerToken === pending.ownerToken ? next : r,
      );
      setRecords(current.current);
      try {
        await save(current.current);
      } catch {
        throw new Error(
          "Code created. Its access was saved before sending, but its details could not be saved. Check status after reopening.",
        );
      }
    });
  const refresh = (record: SavedHandoff) =>
    run(async () => {
      try {
        const summary = await inspectHandoff(record.ownerToken);
        setReceipts((value) => ({
          ...value,
          [record.ownerToken]: summary.receipts,
        }));
        await save(
          current.current.map((r) =>
            r.ownerToken === record.ownerToken
              ? {
                  ...r,
                  code: summary.code,
                  name: summary.name.slice(0, 1000),
                  expiresAt: summary.expiresAt,
                }
              : r,
          ),
        );
      } catch (e) {
        if (e instanceof RelayError && e.status === 404) {
          await save(
            current.current.filter((r) => r.ownerToken !== record.ownerToken),
          );
          throw new Error(
            "This code is expired, revoked, or was never created. It was removed from this device.",
          );
        }
        throw e;
      }
    });
  const revoke = (record: SavedHandoff) =>
    run(async () => {
      try {
        await revokeHandoff(record.ownerToken);
      } catch (e) {
        if (!(e instanceof RelayError && e.status === 404)) throw e;
      }
      await save(
        current.current.filter((r) => r.ownerToken !== record.ownerToken),
      );
    });
  return (
    <section className="studio-handoff handoff-panel" aria-label="Design codes">
      <div className="studio-section-title">
        <FileBox size={18} />
        <h3>Share a snapshot</h3>
      </div>
      <p className="handoff-description">
        Send a design code to someone to import in Framebridge for Studio.
      </p>
      {PRIVATE_BETA && (
        <label>
          Tester access code
          <Input
            aria-label="Tester access for design codes"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={props.betaAccess ?? ""}
            disabled={busy || props.disabled}
            onChange={(event) =>
              props.onAccessChange(event.target.value.trim())
            }
            placeholder="Your private beta access code"
          />
          <span className="muted">
            Saved on this device. This is separate from the design code.
          </span>
        </label>
      )}
      <div className="handoff-create">
        <label htmlFor="handoff-lifetime">Code expires after</label>
        <div className="handoff-create-actions">
          <SelectControl
            id="handoff-lifetime"
            aria-label="Design code lifetime"
            value={String(ttl)}
            onChange={(event) =>
              setTtl(event.target.value === "1440" ? 1440 : 60)
            }
            disabled={busy || props.disabled}
          >
            <option value="60">1 hour</option>
            <option value="1440">24 hours</option>
          </SelectControl>
          <Button
            size="sm"
            className="studio-primary"
            disabled={!loaded || busy || props.disabled || !RELAY_URL}
            onClick={create}
          >
            {busy ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <FileBox size={14} />
            )}
            Create design code
          </Button>
        </div>
      </div>
      {error && (
        <p className="studio-status" role="alert">
          {error}
        </p>
      )}
      {!loaded && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void restore()}
        >
          <RefreshCw size={14} />
          Retry saved codes
        </Button>
      )}
      {records
        .filter((r) => r.origin === RELAY_URL)
        .map((record) => (
          <div className="handoff-record" key={record.ownerToken}>
            <strong className="handoff-name" tabIndex={0}>
              {record.name}
            </strong>
            {record.code ? (
              <code className="handoff-code selectable-text">
                {record.code}
              </code>
            ) : (
              <p className="handoff-description">
                Creation outcome unknown. Check status to recover the code.
              </p>
            )}
            {record.code && (
              <ConnectionExpiry
                expiresAt={record.expiresAt}
                detail
                label="Design code"
              />
            )}
            {receipts[record.ownerToken] && (
              <p className="handoff-receipts" role="status">
                {receipts[record.ownerToken].length === 0
                  ? "No imports yet."
                  : `${receipts[record.ownerToken].filter((r) => r.status === "imported").length} imported · ${receipts[record.ownerToken].filter((r) => r.status === "opened" || r.status === "ready" || r.status === "queued").length} awaiting import · ${receipts[record.ownerToken].filter((r) => r.status === "failed").length} failed`}
              </p>
            )}
            <div className="studio-file-actions">
              {record.code && (
                <CopyDesignCode
                  code={record.code}
                  expiresAt={record.expiresAt}
                  busy={busy}
                  onCopyFallback={props.onCopyFallback}
                />
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => refresh(record)}
              >
                <RefreshCw size={14} />
                Check status
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => revoke(record)}
              >
                <X size={14} />
                Revoke code
              </Button>
            </div>
          </div>
        ))}
      <p className="handoff-footnote">
        Image permissions still apply to shared designs.
      </p>
    </section>
  );
}
