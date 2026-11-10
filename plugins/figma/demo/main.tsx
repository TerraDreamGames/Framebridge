import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { buildExport } from "../../../packages/core/src/export";
import { compile } from "../../../packages/core/src/compiler";
import {
  applyOverrideChanges,
  type OverrideChange,
} from "../../../packages/core/src/bulk-editor";
import { createOverrideHistory } from "../src/override-history";
import type {
  AnalysisResult,
  ExportOptions,
  LayerOverride,
} from "../../../packages/core/src/types";
import { DEFAULT_FIGMA_OPTIONS } from "../src/design-screen";
import { LayerEditor } from "../src/LayerEditor";
import { DevicePreviewControls } from "../src/DevicePreviewControls";
import { RobloxPreview } from "../src/RobloxPreview";
import { SourcePreview } from "../src/SourcePreview";
import { DEFAULT_PREVIEW_VIEWPORT } from "../src/preview-viewport";
import {
  WorkspaceRail,
  type WorkspacePage,
} from "../src/components/WorkspaceRail";
import { Button } from "../src/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../src/components/ui/toggle-group";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "../src/components/ui/tabs";
import { PluginThemeContext, applyPluginTheme } from "../src/usePluginTheme";
import { SettingsPage } from "../src/SettingsPage";
import { ImageAssetsPage } from "../src/ImageAssetsPage";
import { StudioPage } from "../src/StudioPage";
import { SourceExport } from "../src/SourceExport";
import { ModelExport } from "../src/ModelExport";
import { ComponentExport } from "../src/ComponentExport";
import { ConversionNotes } from "../src/ConversionNotes";
import { UsabilityChecks, type SavedCheckReport } from "../src/UsabilityChecks";
import { DEFAULT_CHECKS, type CheckSettings } from "../src/usability";
import { HandoffPanel } from "../src/HandoffPanel";
import { ReviewSyncPanel } from "../src/ReviewSyncPanel";
import { VisionReview } from "../src/VisionReview";
import { StructureReview } from "../src/StructureReview";
import { EMPTY_REVIEW_PREFERENCES } from "../../../packages/core/src/structure-review";
import type { useReviewPreferences } from "../src/review-preferences";
import { OnboardingGuide } from "../src/OnboardingGuide";
import { DEFAULT_ONBOARDING } from "../src/onboarding";
import {
  Moon,
  Sun,
  RefreshCw,
  Minus,
  Plus,
  Maximize2,
  ArrowRight,
  Link,
  Image as ImageIcon,
} from "../src/components/Glyph";
import { pngDataUrl } from "../src/ImageArtwork";
import { prepareDemo } from "./data";
import {
  DEMO_SCENES,
  demoRoute,
  type DemoScene,
  type DemoTheme,
} from "./scenes";
import "../src/ui.css";
import "../src/artwork-pages.css";
import "../src/editor-pages.css";
import "../src/settings-panels.css";
import "../src/focused-theme.css";
import "../src/panel-controls.css";
import "../src/workspace-chrome.css";
import "../src/workspace-motion.css";
import "../src/review-pages.css";
import "./demo.css";
import {
  FeatureStory,
  featureIds,
  DemoAccount,
  DemoLibrary,
  DemoLocal,
  DemoCloud,
} from "./FeatureStories";

const route = demoRoute(location.search);
const noop = () => {};
const editorScenes = new Set<DemoScene>([
  "workspace",
  "properties",
  "layers",
  "grid",
  "list",
  "scrolling",
  "typography",
  "modifiers",
  "bulk",
]);
const assetScenes = new Set<DemoScene>([
  "images",
  "account",
  "saved-images",
  "local-png",
  "cloud-artwork",
]);
const editorSelection: Record<string, string> = {
  grid: "demo:item-grid/grid",
  list: "demo:categories/layout",
  scrolling: "demo:item-grid",
  modifiers: "demo:inventory",
  typography: "demo:116",
  bulk: "demo:inventory",
};
const baseOptions: ExportOptions = {
  ...DEFAULT_FIGMA_OPTIONS,
  layout: "responsive",
};
function saveFile(
  name: string,
  bytes: Uint8Array | string,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof bytes === "string" ? bytes : new Uint8Array(bytes).buffer],
      { type },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [theme, setTheme] = useState<DemoTheme>(route.theme);
  const [scene, setScene] = useState<DemoScene>(route.scene);
  const [options, setOptions] = useState(baseOptions);
  const [base, setBase] = useState<AnalysisResult>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("demo:inventory");
  const [selectedIds, setSelectedIds] = useState(["demo:inventory"]);
  const [overrides, setOverrides] = useState<Record<string, LayerOverride>>({});
  const history = useRef(createOverrideHistory());
  const [mode, setMode] = useState("roblox");
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState(DEFAULT_PREVIEW_VIEWPORT);
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [layersHeading, setLayersHeading] = useState<HTMLDivElement | null>(
    null,
  );
  const [checks, setChecks] = useState<CheckSettings>({ ...DEFAULT_CHECKS });
  const [report, setReport] = useState<SavedCheckReport>();
  const [preferences, setPreferences] = useState({
    ...EMPTY_REVIEW_PREFERENCES,
    rules: [...EMPTY_REVIEW_PREFERENCES.rules],
  });
  const [tourOpen, setTourOpen] = useState(route.scene === "tutorial");
  const [onboarding, setOnboarding] = useState({
    ...DEFAULT_ONBOARDING,
    status: "dismissed" as "active" | "complete" | "dismissed",
  });
  const [captureBusy, setCaptureBusy] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const [captureSize, setCaptureSize] = useState<{
    width: number;
    height: number;
  }>();
  useEffect(() => {
    applyPluginTheme(theme);
  }, [theme]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== parent) return;
      if (
        event.data?.type === "framebridge-demo-theme" &&
        (event.data.theme === "light" || event.data.theme === "dark")
      )
        setTheme(event.data.theme);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    let live = true;
    prepareDemo(baseOptions)
      .then(({ data }) => {
        if (live) setBase(data);
      })
      .catch((cause) => {
        if (live) setError(String(cause));
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    select(editorSelection[scene] ?? "demo:inventory");
    if (scene === "scrolling")
      setOverrides({
        "demo:item-grid": {
          className: "ScrollingFrame",
          properties: {
            AutomaticCanvasSize: {
              type: "Enum",
              value: ["AutomaticSize", "Y"],
            },
            CanvasSize: { type: "UDim2", value: [0, 0, 0, 0] },
            ScrollingDirection: {
              type: "Enum",
              value: ["ScrollingDirection", "Y"],
            },
          },
        },
      });
    else setOverrides({});
  }, [scene]);
  const result = useMemo(() => {
    if (!base?.designs) return undefined;
    const pkg = compile(
      base.designs,
      "website-inventory",
      { ...options, layerOverrides: overrides },
      "2026-11-10T00:00:00.000Z",
    );
    pkg.createdAt = "2026-11-10T00:00:00.000Z";
    const assets: AnalysisResult["assets"] = {};
    for (const asset of pkg.assets) {
      const original = base.package.assets.find(
        (candidate) =>
          candidate.nodeId === asset.nodeId &&
          candidate.renderMode === asset.renderMode,
      );
      if (!original) continue;
      asset.pixelSize = original.pixelSize;
      if (base.assets[original.id]) assets[asset.id] = base.assets[original.id];
    }
    return { ...base, package: pkg, assets };
  }, [base, options, overrides]);
  useEffect(() => {
    if (!result) return;
    let live = true;
    setReady(false);
    (async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map((image) => image.decode().catch(noop)),
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (live) setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [result, scene, theme]);
  const change = (changes: OverrideChange[]) => {
    try {
      const next = applyOverrideChanges(overrides, changes);
      history.current.record(overrides, next);
      setOverrides(next);
      return true;
    } catch (cause) {
      setNotice(String(cause));
      return false;
    }
  };
  const undo = () => {
    const next = history.current.undo(overrides);
    if (next) setOverrides(next);
  };
  const redo = () => {
    const next = history.current.redo(overrides);
    if (next) setOverrides(next);
  };
  const select = (id: string, ids = [id]) => {
    setSelected(id);
    setSelectedIds(ids);
  };
  const inspect = (id: string) => {
    select(id);
    setScene("workspace");
  };
  const unavailable = () =>
    setNotice(
      "This is a local sample. Open Framebridge in Figma to connect or upload.",
    );
  const page: WorkspacePage =
    scene === "images"
      ? "assets"
      : scene === "settings" || scene === "layout"
        ? "settings"
        : scene === "studio" || scene === "export"
          ? "studio"
          : "convert";
  const reviewing = ["notes", "usability", "structure"].includes(scene);
  const navigate = (next: WorkspacePage) =>
    setScene(
      next === "assets" ? "images" : next === "convert" ? "workspace" : next,
    );
  const reset = () => {
    setOverrides({});
    setOptions(baseOptions);
    history.current = createOverrideHistory();
    setZoom(1);
    select("demo:inventory");
    setNotice("");
  };
  const memory: ReturnType<typeof useReviewPreferences> = {
    preferences,
    loading: false,
    saving: false,
    error: "",
    save: async (value) => {
      setPreferences(value);
      return true;
    },
    restore: async () => {},
  };
  const sceneData = DEMO_SCENES.find((item) => item.id === scene)!;
  const embedded =
    (editorScenes.has(scene) && scene !== "workspace") ||
    featureIds.has(scene) ||
    (!route.capture && scene !== "workspace");
  async function capture(all: boolean) {
    if (!frame.current || !result || captureBusy) return;
    const restore = {
      scene,
      theme,
      selected,
      overrides,
      options,
      mode,
      tourOpen,
    };
    setCaptureBusy(true);
    // Source artwork rasterizes faithfully in browser image exports; the live native preview remains interactive.
    setMode("source");
    setNotice("");
    try {
      const { toBlob, getFontEmbedCSS } = await import("html-to-image");
      const { zipSync, strToU8 } = await import("fflate");
      const screenshots: Record<string, Uint8Array> = {};
      const fontEmbedCSS = await getFontEmbedCSS(frame.current);
      const batch = Number(
        new URLSearchParams(location.search).get("batch") ?? -1,
      );
      const scenes = all
        ? batch >= 0
          ? DEMO_SCENES.slice(batch * 6, batch * 6 + 6)
          : DEMO_SCENES
        : [sceneData];
      for (const item of scenes)
        for (const appearance of all ? (["light", "dark"] as const) : [theme]) {
          setNotice(`Capturing ${item.label} · ${appearance}`);
          const dimensions =
            item.id === "tutorial"
              ? { width: innerWidth, height: innerHeight }
              : { width: item.width, height: item.height };
          setCaptureSize(dimensions);
          setScene(item.id);
          setTheme(appearance);
          setTourOpen(item.id === "tutorial");
          select(editorSelection[item.id] ?? "demo:inventory");
          setOverrides(
            item.id === "scrolling"
              ? {
                  "demo:item-grid": {
                    className: "ScrollingFrame",
                    properties: {
                      AutomaticCanvasSize: {
                        type: "Enum",
                        value: ["AutomaticSize", "Y"],
                      },
                      CanvasSize: { type: "UDim2", value: [0, 0, 0, 0] },
                      ScrollingDirection: {
                        type: "Enum",
                        value: ["ScrollingDirection", "Y"],
                      },
                    },
                  },
                }
              : {},
          );
          setOptions(baseOptions);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          await Promise.all(
            Array.from(document.images).map((image) =>
              image.decode().catch(noop),
            ),
          );
          const blob = await toBlob(
            item.id === "tutorial" ? document.body : frame.current,
            {
              pixelRatio: 1,
              width: dimensions.width,
              height: dimensions.height,
              fontEmbedCSS,
              filter: (element) =>
                !element.hasAttribute?.("data-capture-exclude"),
            },
          );
          if (!blob) throw new Error(`Could not capture ${item.id}.`);
          screenshots[`${item.id}-${appearance}.png`] = new Uint8Array(
            await blob.arrayBuffer(),
          );
        }
      screenshots["manifest.json"] = strToU8(
        JSON.stringify(
          {
            capturedAt: new Date().toISOString(),
            source:
              "Framebridge production components · local InventoryUI sample",
            cursor: false,
            settlingMs: 1200,
            files: Object.keys(screenshots),
          },
          null,
          2,
        ),
      );
      saveFile(
        "framebridge-website-screenshots.zip",
        zipSync(screenshots),
        "application/zip",
      );
      setNotice("Screenshot pack downloaded.");
    } catch (cause) {
      setNotice(`Screenshot export failed: ${String(cause)}`);
    } finally {
      setCaptureSize(undefined);
      setTourOpen(restore.tourOpen);
      setMode(restore.mode);
      setScene(restore.scene);
      setTheme(restore.theme);
      select(restore.selected);
      setOverrides(restore.overrides);
      setOptions(restore.options);
      setCaptureBusy(false);
    }
  }
  const mainEditor = editorScenes.has(scene);
  return (
    <PluginThemeContext.Provider value={theme}>
      <TooltipProvider delayDuration={300}>
        {route.capture && (
          <div className="demo-capture-tools" data-capture-exclude>
            <label>
              View{" "}
              <select
                value={scene}
                disabled={captureBusy}
                onChange={(event) => setScene(event.target.value as DemoScene)}
              >
                {DEMO_SCENES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={!ready || captureBusy}
              onClick={() => void capture(false)}
            >
              Capture this view
            </Button>
            <Button
              size="sm"
              disabled={!ready || captureBusy}
              onClick={() => void capture(true)}
            >
              Download both themes
            </Button>
            <span role="status">
              {notice ||
                (ready
                  ? "Ready · waits 1.2 seconds per view"
                  : "Preparing artwork…")}
            </span>
          </div>
        )}
        <div
          ref={frame}
          data-demo-ready={ready}
          data-demo-scene={scene}
          className={`demo-root demo-section-${scene} ${embedded ? "demo-embedded" : ""} ${mainEditor && scene !== "workspace" && scene !== "layers" ? "demo-inspector" : ""}`}
          style={captureSize}
        >
          <div
            className={`app focused-app page-${mainEditor ? "convert" : page} ${reviewing ? "reviewing" : ""}`}
          >
            <WorkspaceRail
              page={page}
              reviewing={reviewing}
              libraryMode={false}
              connected={false}
              onPage={navigate}
              onReview={() => setScene("notes")}
              onGuide={() => {
                setScene("workspace");
                setTourOpen(true);
              }}
            />
            <header className="header">
              {mainEditor && (
                <div
                  ref={setLayersHeading}
                  className="workspace-layers-heading"
                />
              )}
              <strong className="workspace-title">
                {mainEditor
                  ? "InventoryUI"
                  : reviewing
                    ? "Review"
                    : sceneData.label}
              </strong>
              {mainEditor && (
                <div className="workspace-preview-tools">
                  <ToggleGroup
                    type="single"
                    aria-label="Preview mode"
                    className="preview-switch"
                    value={mode}
                    onValueChange={(value) => {
                      if (value) setMode(value);
                    }}
                  >
                    <ToggleGroupItem value="source">Source</ToggleGroupItem>
                    <ToggleGroupItem value="roblox">Roblox</ToggleGroupItem>
                  </ToggleGroup>
                  <DevicePreviewControls
                    choice={viewport}
                    authored={[1920, 1080]}
                    onChange={setViewport}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Fit preview"
                    onClick={() => setZoom(1)}
                  >
                    <Maximize2 size={16} />
                  </Button>
                </div>
              )}
              <div className="header-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Reset sample"
                  onClick={reset}
                >
                  <RefreshCw size={15} />
                </Button>
              </div>
            </header>
            <main
              className={`workspace ${mainEditor ? "editing-workspace" : ""}`}
            >
              {error ? (
                <p role="alert">{error}</p>
              ) : !result ? (
                <p className="demo-loading" role="status">
                  Preparing InventoryUI…
                </p>
              ) : mainEditor ? (
                <LayerEditor
                  key={scene}
                  initialTab={scene === "typography" ? "style" : "layout"}
                  initialFilter={scene === "scrolling" ? "canvas" : ""}
                  tourSection={scene === "modifiers" ? "layout" : undefined}
                  result={result}
                  overrides={overrides}
                  themes={options.themes}
                  selected={selected}
                  selectedIds={
                    scene === "bulk"
                      ? ["demo:inventory", "demo:categories"]
                      : selectedIds
                  }
                  selectionAnchor={selectedIds[0]}
                  onSelect={select}
                  onChange={(id, value) => change([{ id, value }])}
                  onBatchChange={change}
                  onUndo={undo}
                  onRedo={redo}
                  canUndo={history.current.canUndo}
                  canRedo={history.current.canRedo}
                  onFocus={select}
                  disabled={false}
                  layersHeaderHost={layersHeading}
                  propertyReveal={1}
                >
                  <section className="preview-pane" aria-label="Design preview">
                    <div className="canvas">
                      <div className="preview-runtime-tools" ref={setToolbar} />
                      <div className="preview-content">
                        {mode === "source" ? (
                          <SourcePreview
                            src={Object.values(result.previews)[0]}
                            name="InventoryUI"
                            authored={[820, 532]}
                            zoom={zoom}
                            stale={false}
                          />
                        ) : (
                          <RobloxPreview
                            result={result}
                            active={result.designs![0].id}
                            selected={selected}
                            onSelect={select}
                            zoom={zoom}
                            viewportChoice={viewport}
                            onViewportChange={setViewport}
                            toolbarHost={toolbar}
                          />
                        )}
                      </div>
                      <div className="zoom-controls">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Zoom out"
                          onClick={() =>
                            setZoom((value) => Math.max(0.25, value - 0.25))
                          }
                        >
                          <Minus size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Reset zoom"
                          onClick={() => setZoom(1)}
                        >
                          {Math.round(zoom * 100)}%
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Zoom in"
                          onClick={() =>
                            setZoom((value) => Math.min(3, value + 0.25))
                          }
                        >
                          <Plus size={14} />
                        </Button>
                      </div>
                    </div>
                  </section>
                </LayerEditor>
              ) : (
                <aside className="inspector demo-page-panel">
                  <div className="inspector-heading">
                    <strong>
                      {reviewing
                        ? {
                            notes: "Conversion notes",
                            usability: "Usability checks",
                            structure: "Structure review",
                          }[scene as "notes"]
                        : sceneData.label}
                    </strong>
                  </div>
                  {reviewing && (
                    <Tabs
                      value={scene}
                      onValueChange={(value) => setScene(value as DemoScene)}
                      className="review-tabs"
                    >
                      <TabsList aria-label="Review tools">
                        <TabsTrigger value="notes">Notes</TabsTrigger>
                        <TabsTrigger value="usability">Usability</TabsTrigger>
                        <TabsTrigger value="structure">Structure</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                  {["settings", "layout", "fonts", "themes"].includes(
                    scene,
                  ) && (
                    <SettingsPage
                      key={scene}
                      initialSection={
                        scene === "layout"
                          ? "Layout"
                          : scene === "fonts"
                            ? "Fonts"
                            : scene === "themes"
                              ? "Themes"
                              : "Workspace"
                      }
                      options={options}
                      onChange={(patch) =>
                        setOptions((before) => ({ ...before, ...patch }))
                      }
                      appearance={{
                        theme,
                        choose: (value) =>
                          setTheme(value === "dark" ? "dark" : "light"),
                        error: "",
                      }}
                      onRestore={reset}
                    />
                  )}
                  {featureIds.has(scene) && (
                    <FeatureStory
                      key={scene}
                      scene={scene}
                      result={result}
                      notice={setNotice}
                    />
                  )}
                  {assetScenes.has(scene) && (
                    <ImageAssetsPage
                      key={scene}
                      initialView={
                        scene === "account"
                          ? "Account"
                          : scene === "saved-images"
                            ? "Saved images"
                            : scene === "local-png"
                              ? "Import PNG"
                              : scene === "cloud-artwork"
                                ? "Cloud artwork"
                                : "Design images"
                      }
                      total={result.package.assets.length}
                      unlinked={result.package.assets.length}
                      online
                      accountReady={false}
                      actions={null}
                      authorization={<DemoAccount notice={setNotice} />}
                      library={<DemoLibrary result={result} />}
                      local={<DemoLocal />}
                      cloud={<DemoCloud />}
                    >
                      <div className="demo-asset-grid">
                        {result.package.assets.map((asset) => (
                          <article key={asset.id} className="demo-asset">
                            <div>
                              {result.assets[asset.id] ? (
                                <img
                                  src={pngDataUrl(result.assets[asset.id])}
                                  alt={asset.name}
                                />
                              ) : (
                                <ImageIcon size={24} />
                              )}
                            </div>
                            <strong title={asset.name}>{asset.name}</strong>
                            <span>
                              {asset.width} × {asset.height}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => inspect(asset.nodeId)}
                            >
                              Edit layer <ArrowRight size={13} />
                            </Button>
                          </article>
                        ))}
                      </div>
                    </ImageAssetsPage>
                  )}
                  {["studio", "export", "codes"].includes(scene) && (
                    <StudioPage
                      key={scene}
                      initialPanel={
                        scene === "export"
                          ? "export"
                          : scene === "codes"
                            ? "codes"
                            : "connect"
                      }
                      online
                      serviceAvailable={false}
                      connection={{
                        restoring: false,
                        retry: false,
                        error: "",
                        connecting: false,
                        code: "",
                        changeCode: noop,
                        connect: unavailable,
                        retrySaved: unavailable,
                        disconnect: noop,
                      }}
                      design={{
                        name: result.package.name,
                        thumbnail: Object.values(result.previews)[0],
                        selected: 1,
                        instances: result.package.stats.instances,
                        images: result.package.assets.length,
                        unlinked: result.package.assets.length,
                        analyzed: true,
                      }}
                      busy={false}
                      sending={false}
                      sendDisabled
                      exportDisabled={false}
                      send={unavailable}
                      analyze={reset}
                      review={() => setScene("notes")}
                      properties={() => setScene("properties")}
                      images={() => setScene("images")}
                      sync={{
                        enabled: false,
                        phase: "off",
                        message: "Automatic sync is off.",
                      }}
                      syncMessage="Automatic sync is off."
                      setSync={noop}
                      resumeSync={noop}
                      downloadPackage={() => {
                        try {
                          const file = buildExport(result);
                          saveFile(file.name, file.data, file.mime);
                        } catch (error) {
                          setNotice(String(error));
                        }
                      }}
                      copyJson={() => {
                        void navigator.clipboard
                          .writeText(JSON.stringify(result.package))
                          .then(() => setNotice("Sample JSON copied."))
                          .catch(() =>
                            setNotice(
                              "Use Download package to save the sample.",
                            ),
                          );
                      }}
                      handoff={
                        <HandoffPanel
                          disabled
                          name={result.package.name}
                          onAccessChange={noop}
                          onCreate={async () => {
                            throw new Error(
                              "Create design codes in the installed plugin.",
                            );
                          }}
                          onCopyFallback={unavailable}
                        />
                      }

                      exports={
                        <>
                          <ModelExport
                            result={result}
                            disabled={false}
                            onDownload={saveFile}
                            onOpenImages={() => setScene("images")}
                            onError={setNotice}
                          />
                          <SourceExport
                            result={result}
                            disabled={false}
                            onDownload={saveFile}
                            onCopyFallback={() =>
                              setNotice(
                                "Use Download source to save the sample.",
                              )
                            }
                            onError={setNotice}
                          />
                          <ComponentExport
                            result={result}
                            selected={selected}
                            disabled={false}
                            onDownload={saveFile}
                            onError={setNotice}
                          />
                        </>
                      }
                    />
                  )}
                  {scene === "notes" && (
                    <ConversionNotes
                      issues={result.package.issues}
                      analyzed
                      stale={false}
                      busy={false}
                      inspect={inspect}
                      focus={inspect}
                      openImages={() => setScene("images")}
                      openFonts={() => setScene("settings")}
                      analyze={reset}
                    />
                  )}
                  {scene === "usability" && (
                    <UsabilityChecks
                      result={result}
                      settings={checks}
                      report={report}
                      disabled={false}
                      configure={setChecks}
                      record={setReport}
                      inspect={inspect}
                      focus={inspect}
                      download={(data) =>
                        saveFile(
                          "inventory-usability.json",
                          JSON.stringify(data),
                          "application/json",
                        )
                      }
                    />
                  )}
                  {scene === "structure" && (
                    <StructureReview
                      result={result}
                      overrides={overrides}
                      disabled={false}
                      memory={memory}
                      cloudSync={
                        <ReviewSyncPanel
                          memory={memory}
                          account={{
                            loading: false,
                            busy: false,
                            retry: false,
                            error: "",
                            notice: "",
                            available: false,
                          }}
                        />
                      }
                      visionReview={
                        <VisionReview
                          result={result}
                          overrides={overrides}
                          account={{
                            loading: false,
                            busy: false,
                            retry: false,
                            error: "",
                            notice: "",
                            available: false,
                          }}
                          disabled
                          canUndo={history.current.canUndo}
                          undoDisabled={false}
                          undo={undo}
                          apply={change}
                          inspect={inspect}
                          download={saveFile}
                        />
                      }
                      apply={change}
                      inspect={inspect}
                      canUndo={history.current.canUndo}
                      undo={undo}
                    />
                  )}
                  {scene === "tutorial" && (
                    <Button onClick={() => setTourOpen(true)}>
                      Open tutorial
                    </Button>
                  )}
                </aside>
              )}
            </main>
            <footer className="footer demo-footer">
              <span>
                {notice && !captureBusy
                  ? notice
                  : "Interactive sample · edits stay in this demo"}
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                Reset sample
              </Button>
            </footer>
            <OnboardingGuide
              open={tourOpen}
              onOpenChange={setTourOpen}
              preferences={onboarding}
              facts={{
                analyzed: !!result,
                connected: false,
                downloaded: false,
              }}
              libraryMode={false}
              selectionCount={1}
              imageCount={result?.package.assets.length ?? 0}
              uploadProblem=""
              busy={false}
              actionBlocked={false}
              blocker=""
              restoringConnection={false}
              persistenceError=""
              onRetrySave={noop}
              onChoose={(patch) =>
                setOnboarding((before) => ({
                  ...before,
                  ...patch,
                  status:
                    patch.status === "new"
                      ? "active"
                      : (patch.status ?? before.status),
                }))
              }
              onAnalyze={reset}
              onConnect={() => setScene("studio")}
              onImages={() => setScene("images")}
              onReview={() => setScene("notes")}
              onSend={unavailable}
              onDownload={unavailable}
              onVisit={(step) => {
                setScene(step === "images" ? "images" : "workspace");
                setTourOpen(false);
              }}
              onTourEnd={noop}
              onSettings={() => setScene("settings")}
              onExample={unavailable}
              examplesAvailable={false}
            />
          </div>
        </div>
      </TooltipProvider>
    </PluginThemeContext.Provider>
  );
}
applyPluginTheme(route.theme);
class DemoBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <pre role="alert">Demo error: {this.state.error}</pre>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <DemoBoundary>
    <App />
  </DemoBoundary>,
);
