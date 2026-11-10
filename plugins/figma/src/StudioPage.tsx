import { useState, type ReactNode } from "react";
import type { SyncState } from "./live-sync";
import { ConnectionExpiry } from "./ConnectionExpiry";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Copy,
  FileBox,
  Image,
  Info,
  Layers,
  Link,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "./components/Glyph";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/ui/tooltip";
import "./studio-page.css";

export type StudioDesign = {
  name: string;
  thumbnail?: string;
  selected: number;
  instances: number;
  images: number;
  unlinked: number;
  analyzed: boolean;
  problem?: { message: string; action: "analyze" | "review" | "properties" };
};
type Props = {
  initialPanel?: "connect" | "codes" | "export";
  online: boolean;
  serviceAvailable: boolean;
  connection: {
    expiresAt?: number;
    restoring: boolean;
    retry: boolean;
    error: string;
    connecting: boolean;
    code: string;
    changeCode(value: string): void;
    connect(): void;
    retrySaved(): void;
    disconnect(): void;
  };
  design: StudioDesign;
  busy: boolean;
  sending: boolean;
  sendDisabled: boolean;
  exportDisabled: boolean;
  send(): void;
  analyze(): void;
  review(): void;
  properties(): void;
  images(): void;
  sync: SyncState;
  syncMessage: string;
  setSync(enabled: boolean): void;
  resumeSync(): void;
  downloadPackage(): void;
  copyJson(): void;
  handoff?: ReactNode;
  exports: ReactNode;
};

export function StudioPage(props: Props) {
  const [panel, setPanel] = useState<string>(
    props.initialPanel ?? (props.online ? "connect" : "export"),
  );
  const c = props.connection;
  const connected = c.expiresAt !== undefined;
  const canConnect =
    props.serviceAvailable &&
    !c.restoring &&
    !c.connecting &&
    c.code.replace(/[ -]/g, "").length === 12;
  const state = c.restoring
    ? "Restoring connection"
    : connected
      ? "Connected to Studio"
      : "Not connected";
  const summary = (
    <StudioDesignSummary
      design={props.design}
      busy={props.busy || props.sending}
      analyze={props.analyze}
      review={props.review}
      properties={props.properties}
      images={props.images}
    />
  );
  return (
    <section className="studio-page-v2" aria-label="Studio transfer and export">
      <Tabs className="studio-shell" value={panel} onValueChange={setPanel}>
        <div className="studio-navigation">
          <TabsList aria-label="Studio tools">
            {props.online && (
              <TabsTrigger value="connect">
                <Link size={15} />
                Connection
              </TabsTrigger>
            )}
            {props.online && (
              <TabsTrigger value="codes">
                <FileBox size={15} />
                Design codes
              </TabsTrigger>
            )}
            <TabsTrigger value="export">
              <ArrowDownToLine size={15} />
              Export
            </TabsTrigger>
          </TabsList>
        </div>
        {props.online && (
          <TabsContent
            value="connect"
            forceMount
            className="studio-tab-content"
          >
            <div className="studio-connection-heading">
              <span
                className="studio-connection-icon"
                data-connected={connected}
              >
                {c.restoring || c.connecting ? (
                  <LoaderCircle size={24} className="animate-spin" />
                ) : connected ? (
                  <Check size={24} />
                ) : (
                  <Link size={24} />
                )}
              </span>
              <div>
                <h3>{state}</h3>
                {connected ? (
                  <ConnectionExpiry expiresAt={c.expiresAt!} detail />
                ) : (
                  <p>
                    In Studio, open Framebridge and choose{" "}
                    <strong>Connect to Figma</strong>.
                  </p>
                )}
              </div>
              {connected && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={props.sending}
                  onClick={c.disconnect}
                >
                  Disconnect
                </Button>
              )}
            </div>
            {c.error && (
              <p className="studio-status" role="status">
                <TriangleAlert size={15} />
                {c.error}
              </p>
            )}
            {c.retry && (
              <Button
                variant="outline"
                size="sm"
                onClick={c.retrySaved}
                disabled={c.restoring}
              >
                <RefreshCw size={14} />
                Retry saved connection
              </Button>
            )}
            {!props.serviceAvailable && (
              <p className="studio-status" role="status">
                <Info size={15} />
                Direct transfer is unavailable in this build. You can still
                export files.
              </p>
            )}
            {!connected ? (
              <form
                className="studio-pairing"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canConnect) c.connect();
                }}
              >
                <label htmlFor="studio-pairing-code">Studio pairing code</label>
                <div className="studio-pairing-row">
                  <Input
                    id="studio-pairing-code"
                    aria-label="Studio pairing code"
                    placeholder="XXXXXX XXXXXX"
                    value={c.code}
                    maxLength={16}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={c.connecting || c.restoring}
                    onChange={(event) =>
                      c.changeCode(event.target.value.toUpperCase())
                    }
                  />
                  <Button
                    type="submit"
                    className="studio-primary"
                    size="sm"
                    disabled={!canConnect}
                  >
                    {c.connecting ? "Connecting…" : "Connect Studio"}
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="studio-send-row">
                  <Button
                    className="studio-primary"
                    size="sm"
                    onClick={props.send}
                    disabled={props.sendDisabled}
                  >
                    {props.sending ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <ArrowRight size={15} />
                    )}
                    {props.sending ? "Sending…" : "Send to Studio"}
                  </Button>
                </div>
                <section
                  className="studio-sync"
                  aria-label="Automatic Studio sync"
                >
                  <div className="studio-sync-setting">
                    <label htmlFor="studio-auto-sync">Auto-sync edits</label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          shape="rounded"
                          aria-label="About automatic sync"
                        >
                          <Info size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="sync-help">
                        Keep this plugin open. Sync updates the frames from your
                        last successful Send. Enable Auto-import designs in
                        Studio to apply updates automatically. Turning sync off
                        stops future updates; a design already sent may still be
                        imported.
                      </TooltipContent>
                    </Tooltip>
                    <Switch
                      id="studio-auto-sync"
                      aria-label="Automatically sync Figma edits"
                      checked={props.sync.enabled}
                      onCheckedChange={props.setSync}
                    />
                  </div>
                  <div className="studio-sync-status">
                    <p role="status">{props.syncMessage}</p>
                    {props.sync.enabled && props.sync.target && (
                      <span
                        className="studio-linked-frames"
                        title={props.sync.target.names.join(", ")}
                      >
                        Linked: {props.sync.target.names.join(", ")}
                      </span>
                    )}
                    {props.sync.enabled && props.sync.phase === "paused" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={props.busy || props.sending}
                        onClick={props.resumeSync}
                      >
                        Resume sync
                      </Button>
                    )}
                  </div>
                </section>
              </>
            )}
            {summary}
          </TabsContent>
        )}
        {props.online && (
          <TabsContent value="codes" forceMount className="studio-tab-content">
            {summary}
            {props.handoff}
          </TabsContent>
        )}
        <TabsContent value="export" forceMount className="studio-tab-content">
          {summary}
          <section
            className="studio-package"
            aria-label="Download design files"
          >
            <div className="studio-section-title">
              <ArrowDownToLine size={18} />
              <h3>Download a copy</h3>
            </div>
            <p>
              A package includes your editable UI, images and conversion notes.
            </p>
            <div className="studio-file-actions">
              <Button
                className="studio-primary"
                size="sm"
                disabled={props.exportDisabled}
                onClick={props.downloadPackage}
              >
                <ArrowDownToLine size={14} />
                Download package
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={props.exportDisabled}
                onClick={props.copyJson}
              >
                <Copy size={14} />
                Copy JSON
              </Button>
            </div>
          </section>
          <div className="studio-export-formats">{props.exports}</div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function StudioDesignSummary(props: {
  design: StudioDesign;
  busy: boolean;
  analyze(): void;
  review(): void;
  properties(): void;
  images(): void;
}) {
  const d = props.design;
  const action = d.problem?.action;
  return (
    <section className="studio-design-summary" aria-label="Design to export">
      <div className="studio-design-thumbnail">
        {d.thumbnail ? (
          <img src={d.thumbnail} alt="" draggable={false} />
        ) : (
          <Layers size={24} />
        )}
      </div>
      <div className="studio-design-copy">
        <strong className="studio-design-name" tabIndex={0}>
          {d.name}
        </strong>
        {d.analyzed ? (
          <span>
            {d.instances} instances · {d.images}{" "}
            {d.images === 1 ? "image" : "images"}
          </span>
        ) : (
          <span>
            {d.selected
              ? "Analyze this selection to prepare an export."
              : "Select a frame in Figma to get started."}
          </span>
        )}
        {d.problem?.message && (
          <p className="studio-design-problem">
            <TriangleAlert size={12} />
            {d.problem.message}
          </p>
        )}
        {!d.problem && d.unlinked > 0 && (
          <span className="studio-image-count">
            {d.unlinked} {d.unlinked === 1 ? "image" : "images"} to upload
          </span>
        )}
      </div>
      {action ? (
        <Button
          variant="outline"
          size="sm"
          disabled={props.busy || (action === "analyze" && !d.selected)}
          onClick={
            action === "analyze"
              ? props.analyze
              : action === "review"
                ? props.review
                : props.properties
          }
        >
          {action === "analyze"
            ? "Analyze selection"
            : action === "review"
              ? "Review notes"
              : "Edit properties"}
          <ArrowRight size={13} />
        </Button>
      ) : d.unlinked > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={props.busy}
          onClick={props.images}
        >
          <Image size={14} />
          Manage images
        </Button>
      ) : (
        d.analyzed && (
          <span className="studio-design-ready">
            <Check size={13} />
            Ready
          </span>
        )
      )}
    </section>
  );
}
