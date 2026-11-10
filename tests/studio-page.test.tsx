import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudioPage } from "../plugins/figma/src/StudioPage";
import { TooltipProvider } from "../plugins/figma/src/components/ui/tooltip";

type Props = ComponentProps<typeof StudioPage>;
const noop = () => {};
function props(): Props {
  return {
    online: true,
    serviceAvailable: true,
    connection: {
      restoring: false,
      retry: false,
      error: "",
      connecting: false,
      code: "ABCDEF GHIJKL",
      changeCode: noop,
      connect: noop,
      retrySaved: noop,
      disconnect: noop,
    },
    design: {
      name: "Inventory",
      selected: 1,
      instances: 107,
      images: 37,
      unlinked: 0,
      analyzed: true,
    },
    busy: false,
    sending: false,
    sendDisabled: false,
    exportDisabled: false,
    send: noop,
    analyze: noop,
    review: noop,
    properties: noop,
    images: noop,
    sync: { enabled: false, phase: "off", message: "Automatic sync is off." },
    syncMessage: "Automatic sync is off.",
    setSync: noop,
    resumeSync: noop,
    downloadPackage: noop,
    copyJson: noop,
    handoff: <div>Code management</div>,
    exports: <div>Source formats</div>,
  };
}
function render(value: Props) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <StudioPage {...value} />
    </TooltipProvider>,
  );
}
function button(html: string, name: string) {
  const found = [
    ...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
  ].find((match) => match[2].replace(/<[^>]*>/g, "").trim() === name);
  if (!found) throw new Error(`Missing button ${name}`);
  return found[1];
}
describe("Studio transfer page guards", () => {
  it("allows pairing before a design is analyzed", () => {
    const p = props();
    p.design = { ...p.design, analyzed: false, selected: 0 };
    expect(button(render(p), "Connect Studio")).not.toContain(' disabled=""');
  });
  it.each(["restoring", "connecting", "service", "short code"])(
    "prevents pairing during %s",
    (condition) => {
      const p = props();
      if (condition === "restoring") p.connection.restoring = true;
      if (condition === "connecting") p.connection.connecting = true;
      if (condition === "service") p.serviceAvailable = false;
      if (condition === "short code") p.connection.code = "ABCDEF";
      expect(
        button(
          render(p),
          condition === "connecting" ? "Connecting…" : "Connect Studio",
        ),
      ).toContain(' disabled=""');
    },
  );
  it("keeps sync cancellable during transfer while preventing duplicate sends and disconnects", () => {
    const p = props();
    p.connection.expiresAt = Date.now() + 3_600_000;
    p.sending = true;
    p.sendDisabled = true;
    p.sync = {
      enabled: true,
      phase: "sending",
      message: "Sending changes…",
      target: { ids: ["one"], names: ["Inventory"] },
    };
    const html = render(p);
    expect(button(html, "Sending…")).toContain(' disabled=""');
    expect(button(html, "Disconnect")).toContain(' disabled=""');
    const toggle = html.match(/<button\b[^>]*role="switch"[^>]*>/)?.[0];
    expect(toggle).toBeDefined();
    expect(toggle).toContain('aria-checked="true"');
    expect(toggle).not.toContain(' disabled=""');
    expect(html).toContain("Linked: Inventory");
    expect(html).toContain("Connection expires in");
    expect(html).not.toContain("Studio pairing code");
  });
  it("disables resume while another analysis is running", () => {
    const p = props();
    p.connection.expiresAt = Date.now() + 3_600_000;
    p.busy = true;
    p.sync = { enabled: true, phase: "paused", message: "Resolve edits." };
    expect(button(render(p), "Resume sync")).toContain(' disabled=""');
  });
  it("provides a recovery action without allowing a second restore", () => {
    const p = props();
    p.connection = {
      ...p.connection,
      retry: true,
      restoring: true,
      error: "Connection could not be restored.",
    };
    const html = render(p);
    expect(html).toContain(p.connection.error);
    expect(button(html, "Retry saved connection")).toContain(' disabled=""');
  });
  it("makes an offline build export-only with its own readiness guards", () => {
    const p = props();
    p.online = false;
    p.exportDisabled = true;
    const html = render(p);
    expect(html).not.toContain("Studio pairing code");
    expect(html).not.toContain("Code management");
    expect(html).toContain("Source formats");
    expect(button(html, "Download package")).toContain(' disabled=""');
    expect(button(html, "Copy JSON")).toContain(' disabled=""');
  });
});
