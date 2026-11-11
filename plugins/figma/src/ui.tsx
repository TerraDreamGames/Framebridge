import { ImageAssetsPage } from "./ImageAssetsPage";
import { StudioPage } from "./StudioPage";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { usePropertyDrafts } from "./property-drafts";
import { BrandMark } from "./BrandMark";
import { formatShortcut } from "./keyboard-shortcuts";
import { createImagePreparationClient } from "./image-preparation-client";
import { IMAGE_PREPARATION_VERSION } from "./image-preparation-bridge";
import {
  applyPluginTheme,
  initialPluginTheme,
  PluginThemeContext,
  usePluginTheme,
} from "./usePluginTheme";
import { SettingsPage, type SettingsSection } from "./SettingsPage";
import { ArtworkImport } from "./ArtworkImport";
import { CloudArtworkLibrary } from "./CloudArtworkLibrary";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "./components/ui/input-group";
import {
  preparePng,
  artworkAssetId,
} from "../../../packages/core/src/image-processing";
import { pngPixelSize } from "../../../packages/core/src/image-scaling";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./components/ui/accordion";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "./components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "./components/ui/dialog";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./components/ui/dropdown-menu";
import { Progress } from "./components/ui/progress";
import { Switch } from "./components/ui/switch";
import { Badge } from "./components/ui/badge";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Toaster, toast as notify } from "sonner";
import { MoreHorizontal } from "./components/Glyph";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { SelectControl } from "./components/SelectControl";
import { PluginResizeHandle } from "./components/PluginResizeHandle";
import { LayerEditor } from "./LayerEditor";
import { DevicePreviewControls } from "./DevicePreviewControls";
import { SourcePreview } from "./SourcePreview";
import { entries } from "./layer-entries";
import {
  reconcileLayerSelection,
  type LayerSelection,
} from "./layer-selection";
import { createOverrideHistory } from "./override-history";
import {
  applyOverrideChanges,
  type OverrideChange,
} from "../../../packages/core/src/bulk-editor";
import { SourceExport } from "./SourceExport";
import { ComponentExport } from "./ComponentExport";
import { ModelExport } from "./ModelExport";
import { ReportFeedback } from "./ReportFeedback";
import { PrivateFeedbackPanel } from "./PrivateFeedbackPanel";
import { HandoffPanel } from "./HandoffPanel";
import { RobloxAccountPanel } from "./RobloxAccountPanel";
import { useRobloxAccount } from "./useRobloxAccount";
import { createHandoff } from "./handoff-transfer";
import { UsabilityChecks, type SavedCheckReport } from "./UsabilityChecks";
import { StructureReview } from "./StructureReview";
import { ConversionNotes } from "./ConversionNotes";
import { VisionReview } from "./VisionReview";
import { useReviewPreferences } from "./review-preferences";
import { ReviewSyncPanel } from "./ReviewSyncPanel";
import { DEFAULT_CHECKS, type CheckSettings } from "./usability";
import { RobloxPreview } from "./RobloxPreview";
import { DEFAULT_PREVIEW_VIEWPORT } from "./preview-viewport";
import { compile } from "../../../packages/core/src/compiler";
import { retainLinkedAssets } from "../../../packages/core/src/editor";
import {
  CLOUD_STORAGE_KEY,
  readCloudSettings,
  cloudStorageRecord,
} from "./cloud-storage";
import { updateCloudSettings } from "./cloud-storage";
import { robloxUploadSettings } from "./roblox-upload-settings";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  CircleHelp,
  ChevronDown,
  Copy,
  ExternalLink,
  FileBox,
  Focus,
  Eye,
  EyeOff,
  Info,
  Link,
  Upload,
  Image,
  Layers,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Moon,
  Maximize2,
  Sparkles,
  TriangleAlert,
  X,
} from "./components/Glyph";
import { buildExport } from "../../../packages/core/src/export";
import {
  type AnalysisResult,
  type ExportOptions,
  type SelectionSummary,
  type LayerOverride,
} from "../../../packages/core/src/types";
import { validAssetId } from "../../../packages/core/src/geometry";
import { DEFAULT_FIGMA_OPTIONS } from "./design-screen";
import "./ui.css";
import "./artwork-pages.css";
import "./editor-pages.css";
import "./settings-panels.css";
import "./focused-theme.css";
import "./panel-controls.css";
import "./workspace-chrome.css";
import "./workspace-motion.css";
import { WorkspaceRail } from "./components/WorkspaceRail";
import { isHostMessage } from "./bridge";
import { OnboardingGuide } from "./OnboardingGuide";
import { DocumentationLink } from "./DocumentationLink";
import { openDocumentation } from "./open-documentation";
import { useOnboarding } from "./useOnboarding";
import { firstLaunchStage } from "./onboarding";
import { type TourStepId } from "./onboarding-tour";
import { ImageLibrary, useImageLibrary } from "./ImageLibrary";
import { imagePage } from "./image-pages";
import { ImagePages } from "./ImagePages";
import { reuseArtwork } from "./asset-catalog";
import { ConnectionExpiry } from "./ConnectionExpiry";
import { createLiveSync, type SyncRun, type SyncState } from "./live-sync";
import { createSyncAnalysis } from "./sync-analysis";
import {
  createStudioReceiptWatch,
  studioReceiptMessage,
} from "./studio-receipt-watch";
import {
  CONNECTION_STORAGE_KEY,
  createConnectionManager,
  type ConnectionState,
  type SavedConnection,
} from "./studio-connection";
import {
  guardUploadConnection,
  recoverUnauthorizedUpload,
  selectUploadAccess,
  uploadConnectionProblem,
  UploadConnectionError,
  type UploadAccess,
} from "./upload-connection";
import {
  RELAY_URL,
  PRIVATE_BETA,
  RelayError,
  relayRequest,
  pairStudio,
  studioSession,
  disconnectStudio,
  sendToStudio,
  uploadArtwork,
  uploadAuthorization,
  createUploadSession,
  type UploadSession,
  type StudioReceipt,
  type CloudSettings,
} from "./transfer";
import { ArtworkUploadError } from "./upload-diagnostics";
const LIBRARY_MODE =
  import.meta.env.VITE_FRAMEBRIDGE_LIBRARY_MODE === "true" || !RELAY_URL;
const send = (type: string, data: object = {}) =>
  parent.postMessage({ pluginMessage: { type, ...data } }, "*");
const download = (
  name: string,
  data: Uint8Array | string,
  mime = "application/octet-stream",
) => {
  const blob = new Blob(
    [typeof data === "string" ? data : new Uint8Array(data).buffer],
    { type: mime },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
async function loadPreview(options: ExportOptions): Promise<{
  data: AnalysisResult;
  selected: SelectionSummary[];
  overrides?: Record<string, LayerOverride>;
  themes?: ExportOptions["themes"];
}> {
  if (
    [
      "keyframes",
      "image-batches",
      "theme-tokens",
      "ui-particles",
      "materials",
      "image-history",
      "usability",
      "image-scaling",
      "ui-behaviors",
      "motion-presets",
      "world-space",
      "device-preview",
      "structure-review",
      "vision-review",
      "scrollbar-artwork",
      "reusable-components",
      "native-repeats",
      "native-masks",
      "native-backgrounds",
      ...(import.meta.env.DEV ? ["native-effects"] : []),
      "conditional-rules",
    ].includes(new URLSearchParams(location.search).get("fixture") ?? "")
  ) {
    const response = await fetch(
      new URLSearchParams(location.search).get("fixture") === "vision-review"
        ? "/.artifacts/vision-review/preview.json"
        : new URLSearchParams(location.search).get("fixture") ===
            "image-batches"
          ? "/.artifacts/image-batches/preview.json"
          : new URLSearchParams(location.search).get("fixture") ===
              "native-effects"
            ? "/.artifacts/effects/preview.json"
            : new URLSearchParams(location.search).get("fixture") ===
                "ui-particles"
              ? "/.artifacts/ui-particles/preview.json"
              : new URLSearchParams(location.search).get("fixture") ===
                  "theme-tokens"
                ? "/.artifacts/theme-tokens/preview.json"
                : new URLSearchParams(location.search).get("fixture") ===
                    "conditional-rules"
                  ? "/.artifacts/conditional-rules/preview.json"
                  : new URLSearchParams(location.search).get("fixture") ===
                      "keyframes"
                    ? "/.artifacts/keyframes/preview.json"
                    : new URLSearchParams(location.search).get("fixture") ===
                        "image-batches"
                      ? "/.artifacts/image-batches/preview.json"
                      : new URLSearchParams(location.search).get("fixture") ===
                          "native-backgrounds"
                        ? "/.artifacts/decoration/preview.json"
                        : new URLSearchParams(location.search).get(
                              "fixture",
                            ) === "native-masks"
                          ? "/.artifacts/masks/preview.json"
                          : new URLSearchParams(location.search).get(
                                "fixture",
                              ) === "native-repeats"
                            ? "/.artifacts/repeats/preview.json"
                            : new URLSearchParams(location.search).get(
                                  "fixture",
                                ) === "reusable-components"
                              ? "/.artifacts/reusable-components/preview.json"
                              : new URLSearchParams(location.search).get(
                                    "fixture",
                                  ) === "scrollbar-artwork"
                                ? "/.artifacts/scrollbar-artwork/preview.json"
                                : new URLSearchParams(location.search).get(
                                      "fixture",
                                    ) === "device-preview"
                                  ? "/.artifacts/device-preview/preview.json"
                                  : new URLSearchParams(location.search).get(
                                        "fixture",
                                      ) === "structure-review"
                                    ? "/.artifacts/structure-review/preview.json"
                                    : new URLSearchParams(location.search).get(
                                          "fixture",
                                        ) === "world-space"
                                      ? "/.artifacts/world-space/preview.json"
                                      : new URLSearchParams(
                                            location.search,
                                          ).get("fixture") === "motion-presets"
                                        ? "/.artifacts/motion-presets/preview.json"
                                        : new URLSearchParams(
                                              location.search,
                                            ).get("fixture") === "ui-behaviors"
                                          ? "/.artifacts/ui-behaviors/preview.json"
                                          : new URLSearchParams(
                                                location.search,
                                              ).get("fixture") ===
                                              "image-scaling"
                                            ? "/.artifacts/image-scaling-preview.json"
                                            : new URLSearchParams(
                                                  location.search,
                                                ).get("fixture") === "usability"
                                              ? "/.artifacts/usability-preview.json"
                                              : new URLSearchParams(
                                                    location.search,
                                                  ).get("fixture") ===
                                                  "image-history"
                                                ? "/.artifacts/image-history-preview.json"
                                                : "/.artifacts/materials-preview.json",
    );
    if (!response.ok)
      throw new Error("The requested preview fixture is unavailable.");
    const fixture = await response.json();
    if (fixture.data.designs)
      fixture.data.package = compile(
        fixture.data.designs,
        fixture.data.package.sourceId,
        {
          ...options,
          themes: options.themes ?? fixture.themes,
          layerOverrides: { ...fixture.overrides, ...options.layerOverrides },
        },
      );
    const sourceAssets = fixture.data.assets;
    fixture.data.assets = {};
    for (const asset of fixture.data.package.assets) {
      const bytes =
        sourceAssets[asset.id] ?? sourceAssets[artworkAssetId(asset.nodeId)];
      if (bytes) {
        const prepared = preparePng(
          new Uint8Array(bytes),
          asset.processing,
          asset.scrollbarSlice,
        );
        fixture.data.assets[asset.id] = Array.from(prepared);
        asset.pixelSize = pngPixelSize(prepared);
      }
    }
    return fixture;
  }
  const { demoResult, demoDesign, demoSvg } =
    await import("../../../packages/core/src/demo");
  const { loadDemoArtwork } = await import("./demo-artwork");
  const artwork = await loadDemoArtwork();
  const data = demoResult(options, artwork);
  // Browser QA renders the bundled example. Production artwork comes from Figma.
  const findDesign = (
    nodes: import("../../../packages/core/src/types").DesignNode[],
    id: string,
  ): import("../../../packages/core/src/types").DesignNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const child = findDesign(node.children, id);
      if (child) return child;
    }
  };
  for (const asset of data.package.assets) {
    const source = findDesign(data.designs ?? [], asset.nodeId);
    if (!source) continue;
    const local = {
      ...source,
      transform: [
        [1, 0, 0],
        [0, 1, 0],
      ] as import("../../../packages/core/src/types").Transform,
    };
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Could not render the demo image."));
      image.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(demoSvg([local], artwork));
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(source.width * options.imageScale));
    canvas.height = Math.max(1, Math.ceil(source.height * options.imageScale));
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    data.assets[asset.id] = Array.from(
      preparePng(
        new Uint8Array(
          Array.from(
            atob(canvas.toDataURL("image/png").split(",")[1]),
            (character) => character.charCodeAt(0),
          ),
        ),
        asset.processing,
      ),
    );
    asset.pixelSize = pngPixelSize(new Uint8Array(data.assets[asset.id]));
  }
  return {
    data,
    selected: demoDesign(artwork).map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      width: n.width,
      height: n.height,
      layers: data.package.stats.layers,
    })),
  };
}
function App() {
  const appearance = usePluginTheme();
  return (
    <PluginThemeContext.Provider value={appearance.theme}>
      <PluginApp appearance={appearance} />
    </PluginThemeContext.Provider>
  );
}
function PluginApp({
  appearance,
}: {
  appearance: ReturnType<typeof usePluginTheme>;
}) {
  const onboarding = useOnboarding();
  useEffect(() => {
    if (onboarding.error)
      notify.error(onboarding.error, {
        action: { label: "Retry", onClick: onboarding.retry },
      });
  }, [onboarding.error, onboarding.retry]);
  const [propertyReveal, setPropertyReveal] = useState(0);
  const [tourSection, setTourSection] = useState<
    "layout" | "behavior" | "properties"
  >();
  const [tourPanel, setTourPanel] = useState<
    "layers" | "properties" | "preview"
  >();
  const [guideDownload, setGuideDownload] = useState<AnalysisResult>();
  const propertyDrafts = usePropertyDrafts();
  const roblox = useRobloxAccount(!LIBRARY_MODE);
  const firstLaunch = onboarding.loaded
    ? firstLaunchStage(onboarding.preferences, {
        accountEnabled: !LIBRARY_MODE,
        connected:
          !roblox.state.loading &&
          !roblox.state.pending &&
          !!roblox.state.account &&
          !roblox.state.account.needsAuthorization,
      })
    : undefined;
  const [checkSettings, setCheckSettings] = useState<CheckSettings>({
    ...DEFAULT_CHECKS,
  });
  const [checkReport, setCheckReport] = useState<SavedCheckReport>();
  const imageLibrary = useImageLibrary();
  const [imageSearch, setImageSearch] = useState(""),
    [imagePageIndex, setImagePageIndex] = useState(0);
  const reviewMemory = useReviewPreferences();
  const overrideHistory = useRef(createOverrideHistory());
  const [layerSelection, setLayerSelection] = useState<LayerSelection>({
    primary: "",
    ids: [],
    anchor: "",
  });
  const selectedLayer = layerSelection.primary;
  const [previewMode, setPreviewMode] = useState<"source" | "roblox">("source");
  const [previewToolbarHost, setPreviewToolbarHost] =
    useState<HTMLDivElement | null>(null);
  const [layersHeaderHost, setLayersHeaderHost] =
    useState<HTMLDivElement | null>(null);
  const [previewViewport, setPreviewViewport] = useState(
    DEFAULT_PREVIEW_VIEWPORT,
  );
  const [configureVersion, setConfigureVersion] = useState(0);
  const [settingsEntry, setSettingsEntry] =
    useState<SettingsSection>("Workspace");
  const latestResult = useRef<AnalysisResult | undefined>(undefined);
  const analysisVersion = useRef(0);
  const [options, setOptions] = useState<ExportOptions>(() =>
      // The browser's inventory example demonstrates native layouts. Installed
      // plugins retain their existing defaults and load saved user preferences.
      import.meta.env.DEV &&
      !new URLSearchParams(location.search).has("fixture")
        ? { ...DEFAULT_FIGMA_OPTIONS, layout: "responsive" }
        : DEFAULT_FIGMA_OPTIONS,
    ),
    [selection, setSelection] = useState<SelectionSummary[]>([]),
    [result, setResult] = useState<AnalysisResult>(),
    [tab, setTab] = useState<"assets" | "convert" | "studio" | "settings">(
      "convert",
    ),
    [detail, setDetail] = useState("layers"),
    [active, setActive] = useState(""),
    [busy, setBusyState] = useState(false),
    [progress, setProgress] = useState(0),
    [progressLabel, setProgressLabel] = useState(""),
    [error, setError] = useState(""),
    [uploadFailure, setUploadFailure] = useState<ArtworkUploadError | null>(
      null,
    ),
    [stale, setStale] = useState(false),
    [toast, setToast] = useState(""),
    [help, setHelp] = useState(false),
    [feedbackOpen, setFeedbackOpen] = useState(false),
    [zoom, setZoom] = useState(1),
    [manualCopy, setManualCopy] = useState("");
  const openGuide = () => setHelp(true);
  const layerIds = useMemo(() => {
    const ids: string[] = [];
    function collect(rows: ReturnType<typeof entries>) {
      for (const row of rows) {
        ids.push(row.node.id);
        collect(row.children);
      }
    }
    if (result) collect(entries(result));
    return ids;
  }, [result]);
  useEffect(() => {
    setLayerSelection((previous) =>
      reconcileLayerSelection(previous, result?.package.sourceId, layerIds),
    );
  }, [result?.package.sourceId, layerIds, layerSelection]);
  function setSelectedLayer(id: string, ids = [id], anchor = id) {
    setLayerSelection({
      primary: id,
      ids,
      anchor,
      sourceId: result?.package.sourceId,
    });
  }
  const [showKey, setShowKey] = useState(false);
  const keyInput = useRef<HTMLInputElement>(null);
  const creatorInput = useRef<HTMLInputElement>(null);
  const [pairCode, setPairCode] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    restoring: !LIBRARY_MODE,
    retry: false,
    error: "",
  });
  const connectionStateRef = useRef(connectionState);
  const [studioReceipt, setStudioReceipt] = useState<StudioReceipt>();
  const receiptWatch = useRef<ReturnType<
    typeof createStudioReceiptWatch
  > | null>(null);
  const receiptEpoch = useRef(0);
  function clearStudioReceipt() {
    receiptEpoch.current++;
    receiptWatch.current?.cancel();
    setStudioReceipt(undefined);
  }
  const connection = connectionState.connection;
  const connectionRequests = useRef(
    new Map<
      number,
      {
        resolve(value: unknown): void;
        reject(error: Error): void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const connectionRequestId = useRef(0);
  function connectionRequest(type: string, value?: SavedConnection | null) {
    return new Promise<unknown>((resolve, reject) => {
      const revision = ++connectionRequestId.current;
      const timer = setTimeout(() => {
        connectionRequests.current.delete(revision);
        reject(new Error("Connection storage did not respond."));
      }, 8000);
      connectionRequests.current.set(revision, { resolve, reject, timer });
      send(type, { connection: value, revision });
    });
  }
  const connectionManager = useRef<ReturnType<
    typeof createConnectionManager
  > | null>(null);
  if (!connectionManager.current)
    connectionManager.current = createConnectionManager(
      RELAY_URL,
      {
        async load() {
          if (import.meta.env.DEV)
            return JSON.parse(
              localStorage.getItem(CONNECTION_STORAGE_KEY) || "null",
            );
          return connectionRequest("load-studio-connection");
        },
        async save(value) {
          if (import.meta.env.DEV)
            localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(value));
          else await connectionRequest("save-studio-connection", value);
        },
      },
      studioSession,
      (state) => {
        if (
          state.connection?.senderToken !==
            connectionStateRef.current.connection?.senderToken ||
          state.restoring ||
          state.retry
        )
          clearStudioReceipt();
        connectionStateRef.current = state;
        setConnectionState(state);
      },
    );
  if (!receiptWatch.current)
    receiptWatch.current = createStudioReceiptWatch({
      readReceipt: (token, revision, signal) =>
        relayRequest<StudioReceipt>(
          `/v1/receipt?revision=${revision}&wait=15000`,
          token,
          undefined,
          signal,
        ),
      changed: (receipt) => {
        setStudioReceipt(receipt);
        const message = studioReceiptMessage(receipt);
        if (receipt.status === "imported") setToast(message);
        else if (receipt.status === "failed" || receipt.status === "superseded")
          setError(message);
      },
      expired: () => clearStudioReceipt(),
      authorizationLost: () => {
        clearStudioReceipt();
        void connectionManager.current!.restore();
      },
    });
  const forgetConnection = (token?: string) =>
    connectionManager.current!.forget(token);
  useEffect(() => {
    if (!connection) return;
    const timer = setTimeout(
      () => {
        void forgetConnection(connection.senderToken);
        setError(
          "Your Studio connection expired. Enter a new code to reconnect.",
        );
      },
      Math.max(0, connection.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [connection]);
  const [connecting, setConnecting] = useState(false);
  const [cloud, setCloud] = useState<CloudSettings>({
    key: "",
    ownerType: "user",
    ownerId: "",
  });
  const cloudRef = useRef(cloud);
  const cloudRevision = useRef(0);
  const [cloudLoaded, setCloudLoaded] = useState(LIBRARY_MODE);
  const [cloudSaveState, setCloudSaveState] = useState<
    "loading" | "saved" | "saving" | "load-error" | "save-error"
  >("loading");
  function restoreCloud() {
    setCloudSaveState("loading");
    const revision = ++cloudRevision.current;
    if (import.meta.env.DEV) {
      try {
        const saved = readCloudSettings(
          JSON.parse(localStorage.getItem(CLOUD_STORAGE_KEY) || "null"),
        );
        cloudRef.current = saved;
        setCloud(saved);
        setCloudLoaded(true);
        setCloudSaveState("saved");
      } catch {
        setCloudLoaded(true);
        setCloudSaveState("load-error");
      }
    } else {
      send("load-cloud-settings", { revision });
    }
  }
  function updateCloud(patch: Partial<CloudSettings>) {
    const next = updateCloudSettings(
      cloudRef.current,
      patch,
      roblox.state.account?.userId,
    );
    cloudRef.current = next;
    setCloud(next);
    const revision = ++cloudRevision.current;
    setCloudSaveState("saving");
    if (import.meta.env.DEV) {
      try {
        localStorage.setItem(
          CLOUD_STORAGE_KEY,
          JSON.stringify(cloudStorageRecord(next)),
        );
        setCloudSaveState("saved");
      } catch {
        setCloudSaveState("save-error");
      }
    } else {
      send("save-cloud-settings", { cloud: next, revision });
    }
  }
  useEffect(() => {
    if (LIBRARY_MODE || !cloudLoaded || roblox.state.loading) return;
    if (!cloud.authMode && !cloud.key && roblox.state.available === true) {
      updateCloud({ authMode: "roblox" });
      return;
    }
    if (cloud.authMode !== "roblox" || !roblox.state.account) return;
    if (
      cloud.robloxOwner?.userId !== roblox.state.account.userId ||
      (!cloud.ownerId && cloud.robloxOwner?.ownerId)
    )
      updateCloud({});
  }, [
    cloudLoaded,
    cloud.authMode,
    cloud.ownerType,
    cloud.ownerId,
    cloud.robloxOwner?.userId,
    roblox.state,
  ]);
  function uploadSettings(): CloudSettings {
    return robloxUploadSettings(cloudRef.current, roblox.manager.snapshot());
  }
  const [transferring, setTransferring] = useState(false);
  const busyRef = useRef(false);
  const transferAbort = useRef<AbortController | null>(null);
  function setBusy(value: boolean) {
    busyRef.current = value;
    setBusyState(value);
    liveSync.current?.hold(
      value || !!transferAbort.current || propertyDrafts.isBlocked(),
    );
  }
  const uploadSession = useRef<UploadSession | null>(null);
  const handoffUploadAccess = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (toast) notify.success(toast);
  }, [toast]);
  const pendingSend = useRef(false);
  const generation = useRef(0);
  const transferRef = useRef<
    (value: AnalysisResult, sync?: SyncRun) => Promise<string | undefined>
  >(async () => undefined);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  latestResult.current = result;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const syncResult = useRef<AnalysisResult | undefined>(undefined);
  const [syncState, setSyncState] = useState<SyncState>({
    enabled: false,
    phase: "off",
    message: "Automatic sync is off.",
  });
  const syncPipeline = useRef<(job: SyncRun) => Promise<string>>(
    async () => "",
  );
  const syncAnalysis = useRef<ReturnType<typeof createSyncAnalysis> | null>(
    null,
  );
  if (!syncAnalysis.current)
    syncAnalysis.current = createSyncAnalysis(
      send,
      setBusy,
      (label, percent) => {
        setProgressLabel(label);
        setProgress(percent);
      },
    );
  const liveSync = useRef<ReturnType<typeof createLiveSync> | null>(null);
  if (!liveSync.current)
    liveSync.current = createLiveSync(
      (job) => syncPipeline.current(job),
      setSyncState,
      (target) => send("watch-sync", { rootIds: target?.ids ?? [] }),
    );
  const syncConnection = useRef(connection?.senderToken);
  useEffect(() => {
    if (syncConnection.current !== connection?.senderToken) {
      syncConnection.current = connection?.senderToken;
      liveSync.current!.setEnabled(false);
      liveSync.current!.reset();
      syncResult.current = undefined;
    }
  }, [connection?.senderToken]);
  useEffect(() => {
    liveSync.current!.hold(
      busyRef.current || !!transferAbort.current || propertyDrafts.isBlocked(),
    );
  }, [busy, transferring, propertyDrafts.blocked]);
  const sameRoots = (value: AnalysisResult, ids: string[]) =>
    value.designs?.length === ids.length &&
    value.designs.every((n, i) => n.id === ids[i]);
  const showSyncResult = (value: AnalysisResult) => {
    syncResult.current = value;
    if (
      sameRoots(
        value,
        selectionRef.current.map((n) => n.id),
      )
    ) {
      latestResult.current = value;
      setResult(value);
      setStale(false);
    }
  };
  useEffect(() => {
    const imagePreparation = createImagePreparationClient(send);
    const handler = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const m = event.data.pluginMessage;
      if (!m) return;
      if (imagePreparation.receive(m)) return;
      if (syncAnalysis.current!.receive(m)) return;
      if (m.type === "sync-source-changed") {
        liveSync.current!.edited();
        return;
      }
      if (m.type === "sync-target-unavailable") {
        liveSync.current!.pause(m.message);
        return;
      }
      if (
        [
          "studio-connection",
          "studio-connection-saved",
          "studio-connection-storage-error",
        ].includes(m.type)
      ) {
        const pending = connectionRequests.current.get(m.revision);
        if (pending) {
          clearTimeout(pending.timer);
          connectionRequests.current.delete(m.revision);
          if (m.type === "studio-connection-storage-error")
            pending.reject(new Error("Connection storage failed."));
          else pending.resolve(m.connection);
        }
        return;
      }
      if (m.revision === cloudRevision.current) {
        if (m.type === "cloud-settings") {
          const saved = readCloudSettings(m.cloud);
          cloudRef.current = saved;
          setCloud(saved);
          setCloudLoaded(true);
          setCloudSaveState("saved");
        }
        if (m.type === "cloud-settings-saved") setCloudSaveState("saved");
        if (m.type === "cloud-storage-error") {
          setCloudLoaded(true);
          setCloudSaveState(m.action === "load" ? "load-error" : "save-error");
        }
      }
      if (m.type === "selection") {
        generation.current++;
        selectionRef.current = m.selection;
        setSelection(m.selection);
        setActive(m.selection[0]?.id || "");
        setStale(true);
      }
      if (m.type === "settings") {
        overrideHistory.current.clear();
        setOptions(m.options);
      }
      if (m.type === "examples-created") {
        overrideHistory.current.clear();
        setOptions(m.options);
        setTab("convert");
        setResult(undefined);
        setStale(true);
        setToast(
          m.placement === "section"
            ? `${m.roots.length} editable example${m.roots.length === 1 ? "" : "s"} created in a new section on this page. Analyze to export.`
            : `${m.roots.length} editable example${m.roots.length === 1 ? "" : "s"} created on a new page. Analyze to export.`,
        );
      }
      if (m.type === "stale") {
        generation.current++;
        setStale(true);
      }
      if (m.type === "progress") {
        setProgress(m.progress);
        setProgressLabel(m.label);
      }
      if (m.type === "result") {
        if (analysisVersion.current !== generation.current) {
          pendingSend.current = false;
          setStale(true);
          return;
        }
        const next = retainLinkedAssets(
          latestResult.current,
          m.result,
          optionsRef.current.layerOverrides,
        );
        setResult(next);
        setStale(false);
        setError("");
        if (pendingSend.current) {
          pendingSend.current = false;
          void transferRef.current(next);
        }
      }
      if (m.type === "error") {
        pendingSend.current = false;
        setError(m.message);
      }
      if (m.type === "idle") setBusy(false);
    };
    window.addEventListener("message", handler);
    send("ready", { imagePreparation: IMAGE_PREPARATION_VERSION });
    if (!LIBRARY_MODE) {
      restoreCloud();
      void connectionManager.current!.restore();
    }
    if (import.meta.env.DEV) {
      void loadPreview(optionsRef.current).then(
        ({ data, selected, overrides, themes }) => {
          if (overrides)
            setOptions((current) => ({
              ...current,
              themes: current.themes ?? themes,
              layerOverrides: { ...overrides, ...current.layerOverrides },
            }));
          setResult(data);
          setSelection(selected);
          setActive(selected[0]?.id || "");
          setStale(false);
        },
      );
    }
    return () => {
      imagePreparation.dispose();
      window.removeEventListener("message", handler);
      liveSync.current!.dispose();
      syncAnalysis.current!.dispose();
      transferAbort.current?.abort();
      receiptWatch.current!.destroy();
      connectionManager.current!.dispose();
      for (const pending of connectionRequests.current.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Plugin closed."));
      }
      connectionRequests.current.clear();
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const update = (patch: Partial<ExportOptions>) => {
    generation.current++;
    setOptions((o) => ({ ...o, ...patch }));
    setStale(true);
    liveSync.current!.edited();
  };
  const analyze = async () => {
    if (busy || transferring) return;
    liveSync.current!.hold(true);
    setError("");
    setConfigureVersion(0);
    analysisVersion.current = generation.current;
    setBusy(true);
    setProgress(5);
    setProgressLabel("Reading your selection…");
    if (import.meta.env.DEV) {
      const { data: loaded } = await loadPreview(optionsRef.current);
      const value = retainLinkedAssets(
        latestResult.current,
        loaded,
        optionsRef.current.layerOverrides,
      );
      setResult(value);
      if (pendingSend.current) {
        pendingSend.current = false;
        void transferRef.current(value);
      }
      setStale(false);
      setBusy(false);
      return;
    }
    send("analyze", { options: optionsRef.current });
  };
  useEffect(() => {
    if (!configureVersion || busy || transferring) return;
    const timer = setTimeout(() => void analyze(), 450);
    return () => clearTimeout(timer);
  }, [configureVersion, busy, transferring]);
  const applyOverrides = (
    layerOverrides: Record<string, LayerOverride>,
    record = true,
  ) => {
    const nextOptions = { ...optionsRef.current, layerOverrides };
    try {
      if (result?.designs) {
        const packageValue = compile(
          result.designs,
          result.package.sourceId,
          nextOptions,
        );
        setResult(
          retainLinkedAssets(
            result,
            { ...result, package: packageValue },
            layerOverrides,
          ),
        );
      }
      if (
        record &&
        !overrideHistory.current.record(
          optionsRef.current.layerOverrides,
          layerOverrides,
        )
      )
        return true;
      optionsRef.current = nextOptions;
      update({ layerOverrides });
      setConfigureVersion((v) => v + 1);
      setPreviewMode("roblox");
      setError("");
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not apply the layer settings.",
      );
      return false;
    }
  };
  const configureLayers = (changes: OverrideChange[]) => {
    try {
      applyOverrides(
        applyOverrideChanges(optionsRef.current.layerOverrides, changes),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not apply the layer settings.",
      );
    }
  };
  const configureLayer = (id: string, value: LayerOverride | undefined) =>
    configureLayers([{ id, value }]);
  const undoLayerEdit = () => {
    const before = optionsRef.current.layerOverrides;
    const next = overrideHistory.current.peekUndo();
    if (next && applyOverrides(next, false))
      overrideHistory.current.undo(before);
  };
  const redoLayerEdit = () => {
    const before = optionsRef.current.layerOverrides;
    const next = overrideHistory.current.peekRedo();
    if (next && applyOverrides(next, false))
      overrideHistory.current.redo(before);
  };
  const pkg = result?.package;
  const issues = pkg?.issues || [];
  const notices = issues.filter((i) => i.severity !== "info");
  const blocked = issues.some((i) => i.severity === "error");
  const screen = selection.find((n) => n.id === active) || selection[0];
  const previewRoot =
    result?.package.roots.find((root) => root.id === `screen:${active}`) ??
    result?.package.roots[0];
  const analysisReady = !!result && !busy && !stale && !blocked;
  const ready = analysisReady && !propertyDrafts.blocked;
  const syncStatusMessage =
    studioReceipt &&
    !busy &&
    !transferring &&
    (syncState.phase === "idle" || syncState.phase === "off")
      ? studioReceiptMessage(studioReceipt)
      : syncState.enabled
        ? syncState.message
        : "Send manually, or enable updates after edits.";
  const assetCount = pkg?.assets.filter((a) => !a.robloxId).length || 0;
  const imageRows = imagePage(
    (pkg?.assets ?? []).filter((asset) =>
      (asset.name + " " + asset.filename)
        .toLowerCase()
        .includes(imageSearch.toLowerCase()),
    ),
    imagePageIndex,
  );
  const copy = async () => {
    if (!ready || propertyDrafts.isBlocked()) return;
    const raw = JSON.stringify(pkg);
    try {
      await navigator.clipboard.writeText(raw);
      setToast("Package copied. Paste it into the Studio plugin.");
    } catch {
      setManualCopy(raw);
    }
  };
  const copyUploadReport = async () => {
    if (!uploadFailure || error !== uploadFailure.message) return;
    try {
      await navigator.clipboard.writeText(uploadFailure.report);
      setToast("Upload diagnostic report copied.");
    } catch {
      download(
        "Framebridge-upload-diagnostic.txt",
        uploadFailure.report,
        "text/plain",
      );
      setToast("Upload diagnostic report downloaded.");
    }
  };
  const exportPackage = () => {
    if (!ready || !result || propertyDrafts.isBlocked()) return;
    try {
      const file = buildExport(result);
      download(file.name, file.data, file.mime);
      setGuideDownload(result);
      setToast("Export prepared. Open the downloaded package in Studio.");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const connect = async () => {
    connectionManager.current!.beginPair();
    setConnecting(true);
    setError("");
    try {
      await connectionManager.current!.remember(await pairStudio(pairCode));
      setPairCode("");
      setTab(
        result?.package.assets.some((asset) => !asset.robloxId)
          ? "assets"
          : "convert",
      );
      setToast("Connected to Studio. Send your design in one step.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Studio.");
    } finally {
      setConnecting(false);
    }
  };
  transferRef.current = async (value, sync) => {
    if (propertyDrafts.isBlocked()) {
      if (sync)
        throw new Error(
          "Fix or revert the highlighted Properties values before syncing.",
        );
      return;
    }
    if (connectionState.restoring || connectionState.retry) {
      setTab("studio");
      setError("Check your saved Studio connection before sending.");
      if (sync)
        throw new Error(
          "Check your saved Studio connection before resuming sync.",
        );
      return;
    }
    if (LIBRARY_MODE || !connection) {
      if (sync)
        throw new Error("Connect Studio before resuming automatic sync.");
      try {
        const file = buildExport(value);
        download(file.name, file.data, file.mime);
        setGuideDownload(value);
        setToast("Export ready. Open the package in Framebridge for Studio.");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not export the package.",
        );
      }
      return;
    }
    if (connection.expiresAt <= Date.now()) {
      void forgetConnection(connection.senderToken);
      setTab("studio");
      setError(
        "Your Studio connection expired. Enter a new code to reconnect.",
      );
      if (sync)
        throw new Error(
          "The Studio connection expired. Reconnect, then send your design again.",
        );
      return;
    }
    const abort = sync
      ? {
          signal: sync.signal,
          abort: () => liveSync.current!.setEnabled(false),
        }
      : new AbortController();
    clearStudioReceipt();
    const atReceiptEpoch = receiptEpoch.current;
    transferAbort.current = abort;
    const atGeneration = generation.current;
    setTransferring(true);
    liveSync.current!.hold(true);
    setError("");
    try {
      let delivery =
        "Delivered to Studio. Review the design and click Import there.";
      const uploaded = await sendToStudio(
        value,
        connection.senderToken,
        uploadSettings(),
        abort.signal,
        (label, percent) => {
          setProgressLabel(label);
          setProgress(percent);
        },
        () =>
          !propertyDrafts.isBlocked() &&
          (sync ? !sync.signal.aborted : atGeneration === generation.current),
        (uploaded) =>
          sync
            ? showSyncResult({ ...value, package: uploaded })
            : setResult({ ...value, package: uploaded }),
        (receipt) => {
          delivery = studioReceiptMessage(receipt);
          if (
            abort.signal.aborted ||
            atReceiptEpoch !== receiptEpoch.current ||
            connectionStateRef.current.restoring ||
            connectionStateRef.current.retry ||
            connectionStateRef.current.connection?.senderToken !==
              connection.senderToken ||
            connection.expiresAt <= Date.now()
          )
            return;
          setStudioReceipt(receipt);
          receiptWatch.current!.replace(
            {
              senderToken: connection.senderToken,
              expiresAt: connection.expiresAt,
              revision: receipt.revision,
            },
            receipt,
          );
          if (!sync) setToast(delivery);
        },
        sync?.publishing,
        imageLibrary.catalog,
      );
      const committed = { ...value, package: uploaded };
      if (sync) showSyncResult(committed);
      else {
        setResult(committed);
        syncResult.current = committed;
        if (value.designs?.length)
          liveSync.current!.delivered(
            {
              ids: value.designs.map((n) => n.id),
              names: value.designs.map((n) => n.name),
            },
            delivery,
          );
      }
      return delivery;
    } catch (e) {
      if (!abort.signal.aborted && cloudRef.current.authMode === "roblox")
        void roblox.manager.recheck();
      if (e instanceof RelayError && e.status === 401) {
        if (e.path?.startsWith("/v1/assets")) {
          // An upload credential can expire independently of Studio pairing.
          void connectionManager.current!.restore();
          setTab("assets");
        } else {
          void forgetConnection(connection.senderToken);
          setTab("studio");
        }
      }
      setUploadFailure(e instanceof ArtworkUploadError ? e : null);
      if (sync) {
        if (e instanceof ArtworkUploadError) setError(e.message);
        throw e;
      }
      setError(
        abort.signal.aborted
          ? "Stopped waiting. Uploaded images remain linked. Check Studio before sending again."
          : e instanceof Error
            ? e.message
            : "Could not send to Studio.",
      );
    } finally {
      if (transferAbort.current === abort) transferAbort.current = null;
      setTransferring(false);
      liveSync.current!.hold(busyRef.current || propertyDrafts.isBlocked());
    }
  };
  syncPipeline.current = async (job) => {
    if (propertyDrafts.isBlocked())
      throw new Error(
        "Fix or revert the highlighted Properties values before syncing.",
      );
    clearStudioReceipt();
    const analyzed = await syncAnalysis.current!.request(
      optionsRef.current,
      job.target.ids,
      job.signal,
    );
    job.signal.throwIfAborted();
    const next = retainLinkedAssets(
      syncResult.current,
      analyzed,
      optionsRef.current.layerOverrides,
    );
    showSyncResult(next);
    job.sending();
    const message = await transferRef.current(next, job);
    if (!message)
      throw new Error("Sync did not receive a delivery confirmation.");
    return message;
  };
  const transfer = () => {
    if (propertyDrafts.isBlocked()) return;
    if (connectionState.restoring || connectionState.retry) {
      setTab("studio");
      return;
    }
    if (LIBRARY_MODE || !connection) {
      if (stale || !result) {
        pendingSend.current = true;
        void analyze();
      } else void transferRef.current(result);
      return;
    }
    if (connection.expiresAt <= Date.now()) {
      void forgetConnection(connection.senderToken);
      setTab("studio");
      setError(
        "Your Studio connection expired. Enter a new code to reconnect.",
      );
      return;
    }
    clearStudioReceipt();
    if (stale || !result) {
      pendingSend.current = true;
      void analyze();
    } else void transferRef.current(result);
  };
  const uploadAll = async () => {
    if (
      !cloudLoaded ||
      !ready ||
      propertyDrafts.isBlocked() ||
      !result ||
      transferring ||
      connecting ||
      !assetCount
    )
      return;
    const value = result;
    const abort = new AbortController();
    transferAbort.current = abort;
    liveSync.current!.hold(true);
    const atGeneration = generation.current;
    setTransferring(true);
    setError("");
    setProgress(2);
    setProgressLabel("Connecting to Roblox uploads…");
    let access: UploadAccess | undefined;
    try {
      const connectionGuard = guardUploadConnection(
        () => connectionStateRef.current,
      );
      const guard = () => {
        abort.signal.throwIfAborted();
        if (propertyDrafts.isBlocked())
          throw new Error(
            "Fix or revert the highlighted Properties values before uploading.",
          );
        if (atGeneration !== generation.current)
          throw new Error("Your design changed. Analyze again.");
        connectionGuard();
      };
      guard();
      const prepared = {
        ...value,
        package: await reuseArtwork(value, cloud, imageLibrary.catalog, guard),
      };
      guard();
      setResult(prepared);
      if (prepared.package.assets.every((a) => a.robloxId)) {
        setToast("Saved images reused. No upload was needed.");
        return;
      }
      uploadAuthorization(uploadSettings());
      access = await selectUploadAccess(
        connectionGuard,
        uploadSession.current,
        () => createUploadSession(abort.signal, cloud.betaAccess?.trim()),
      );
      guard();
      if (access.kind === "standalone") uploadSession.current = access.session;
      const uploaded = await uploadArtwork(
        prepared,
        access.token,
        uploadSettings(),
        abort.signal,
        (label, percent) => {
          setProgressLabel(label);
          setProgress(percent);
        },
        () =>
          atGeneration === generation.current && !propertyDrafts.isBlocked(),
        (uploaded) => {
          if (!propertyDrafts.isBlocked())
            setResult({ ...value, package: uploaded });
        },
        imageLibrary.catalog,
      );
      guard();
      setResult({ ...value, package: uploaded });
      setToast(
        access.kind === "paired"
          ? "All images uploaded and linked. Send to Studio when ready."
          : "All images uploaded and linked. Export for Studio to finish.",
      );
    } catch (e) {
      if (e instanceof RelayError && e.status === 401)
        recoverUnauthorizedUpload(
          access,
          () => {
            void connectionManager.current!.restore();
          },
          () => {
            uploadSession.current = null;
          },
        );
      if (e instanceof UploadConnectionError) setTab("studio");
      setUploadFailure(e instanceof ArtworkUploadError ? e : null);
      if (!abort.signal.aborted && cloudRef.current.authMode === "roblox")
        void roblox.manager.recheck();
      setError(
        abort.signal.aborted
          ? "Upload stopped. Completed images stay linked. Upload again to continue in this session."
          : e instanceof Error
            ? e.message
            : "Could not upload the images.",
      );
    } finally {
      if (transferAbort.current === abort) transferAbort.current = null;
      setTransferring(false);
      liveSync.current!.hold(busyRef.current || propertyDrafts.isBlocked());
    }
  };
  const shareDesign = async (ownerToken: string, ttl: 60 | 1440) => {
    if (!cloudLoaded)
      throw new Error("Restore saved upload details before sharing.");
    if (propertyDrafts.isBlocked())
      throw new Error(
        "Fix or revert the highlighted Properties values before sharing.",
      );
    if (!ready || !result || transferring || busyRef.current)
      throw new Error("Analyze the current selection before sharing.");
    const value = result,
      atGeneration = generation.current,
      abort = new AbortController();
    transferAbort.current = abort;
    liveSync.current!.hold(true);
    setTransferring(true);
    setError("");
    setProgress(2);
    setProgressLabel("Preparing private design code…");
    const current = () =>
      atGeneration === generation.current && !propertyDrafts.isBlocked();
    try {
      if (
        !uploadSession.current ||
        uploadSession.current.expiresAt <= Date.now() ||
        handoffUploadAccess.current !== cloud.betaAccess
      ) {
        uploadSession.current = await createUploadSession(
          abort.signal,
          cloud.betaAccess?.trim(),
        );
        handoffUploadAccess.current = cloud.betaAccess;
      }
      const pkg = await uploadArtwork(
        value,
        uploadSession.current.uploadToken,
        uploadSettings(),
        abort.signal,
        (label, percent) => {
          setProgressLabel(label);
          setProgress(percent);
        },
        current,
        (uploaded) => {
          if (current()) setResult({ ...value, package: uploaded });
        },
        imageLibrary.catalog,
      );
      abort.signal.throwIfAborted();
      if (!current())
        throw new Error("Your design changed. Analyze again before sharing.");
      setResult({ ...value, package: pkg });
      const created = await createHandoff(
        uploadSession.current.uploadToken,
        pkg,
        ownerToken,
        ttl,
        abort.signal,
      );
      setToast("Design code created. Your teammate can open it in Studio.");
      return created;
    } catch (e) {
      if (e instanceof RelayError && e.status === 401)
        uploadSession.current = null;
      if (!abort.signal.aborted && cloudRef.current.authMode === "roblox")
        void roblox.manager.recheck();
      throw e;
    } finally {
      if (transferAbort.current === abort) transferAbort.current = null;
      setTransferring(false);
      liveSync.current!.hold(busyRef.current || propertyDrafts.isBlocked());
    }
  };
  const preview = (
    <section
      className="preview-pane"
      aria-label="Design preview"
      data-tour="preview"
    >
      <div className="canvas">
        <div className="preview-content">
          {previewMode === "roblox" && result ? (
            <RobloxPreview
              result={result}
              active={active}
              selected={selectedLayer}
              onSelect={(id) => {
                setSelectedLayer(id);
                setPropertyReveal((revision) => revision + 1);
                setTab("convert");
                setDetail("layers");
              }}
              zoom={zoom}
              viewportChoice={previewViewport}
              toolbarHost={previewToolbarHost}
            />
          ) : result?.previews[active] ? (
            <SourcePreview
              src={result.previews[active]}
              name={screen?.name ?? "Design"}
              authored={[screen?.width ?? 400, screen?.height ?? 300]}
              zoom={zoom}
              stale={stale}
            />
          ) : (
            <div className="canvas-empty">
              <Focus size={32} />
              <h2>
                {selection.length
                  ? "Preview your selection"
                  : "Select a frame in Figma"}
              </h2>
              <p>
                {selection.length
                  ? "Analyze to review your artwork and editable layers."
                  : "Select one or more frames, then analyze your UI."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="secondary"
                disabled={!selection.length || busy || transferring}
                onClick={analyze}
              >
                <RefreshCw size={15} /> Analyze selection
              </Button>
            </div>
          )}
        </div>
        {stale && result && (
          <div className="preview-notice">
            <RefreshCw size={14} />
            <span>Selection or settings changed</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-button"
              disabled={busy || transferring}
              onClick={analyze}
            >
              Analyze again
            </Button>
          </div>
        )}
        <div ref={setPreviewToolbarHost} className="preview-runtime-tools" />
        <div className="zoom-controls">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
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
            size="sm"
            aria-label="Zoom in"
            disabled={zoom >= 2}
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
          >
            <Plus size={14} />
          </Button>
        </div>
      </div>
    </section>
  );
  return (
    <div
      className={`app focused-app page-${tab} ${tab === "convert" && detail !== "layers" ? "reviewing" : ""}`}
      data-busy={busy || transferring}
    >
      <WorkspaceRail
        page={tab}
        reviewing={tab === "convert" && detail !== "layers"}
        libraryMode={LIBRARY_MODE}
        connected={!!connection}
        onPage={(page) => {
          setTab(page);
          setDetail("layers");
        }}
        onReview={() => {
          setTab("convert");
          setDetail("issues");
        }}
        onGuide={openGuide}
      />
      <header
        className="header"
        data-workspace={tab === "convert" && detail === "layers"}
      >
        {tab === "convert" && detail === "layers" && (
          <div className="layers-header-host" ref={setLayersHeaderHost} />
        )}
        <div className="workspace-title">
          {tab === "assets"
            ? "Images"
            : tab === "settings"
              ? "Settings"
              : tab === "studio"
                ? LIBRARY_MODE
                  ? "Export"
                  : "Studio"
                : detail === "layers"
                  ? "Workspace"
                  : "Review"}
        </div>
        <div className="selection-picker">
          <SelectControl
            aria-label="Preview frame"
            value={active}
            disabled={!selection.length || busy || transferring}
            onChange={(e) => {
              setActive(e.target.value);
              setZoom(1);
            }}
          >
            {!selection.length && <option value="">No frame selected</option>}
            {selection.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </SelectControl>
        </div>
        {tab === "convert" && detail === "layers" && (
          <div className="workspace-preview-tools" aria-label="Preview toolbar">
            <ToggleGroup
              type="single"
              value={previewMode}
              onValueChange={(value) => {
                if (value) setPreviewMode(value as "source" | "roblox");
              }}
              size="sm"
              className="preview-switch"
              aria-label="Preview mode"
            >
              <ToggleGroupItem value="source">Source</ToggleGroupItem>
              <ToggleGroupItem value="roblox" disabled={!result}>
                Roblox
              </ToggleGroupItem>
            </ToggleGroup>
            {previewRoot?.className === "ScreenGui" && (
              <DevicePreviewControls
                choice={previewViewport}
                authored={previewRoot.referenceSize ?? [1920, 1080]}
                onChange={(choice) => {
                  setPreviewViewport(choice);
                  setPreviewMode("roblox");
                }}
              />
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="preview-fit"
              aria-label="Fit preview"
              title="Fit preview"
              onClick={() => setZoom(1)}
            >
              <Maximize2 size={15} />
            </Button>
          </div>
        )}
        <div className="header-right">
          {!LIBRARY_MODE && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="studio-connect"
                  aria-label={
                    connection ? "Studio connected" : "Connect Studio"
                  }
                  disabled={transferring || connecting}
                  onClick={() => setTab("studio")}
                >
                  <span
                    className={`connection-dot ${connection ? "connected" : ""}`}
                  />
                  <span className="connection-label">
                    {connection ? "Connected" : "Studio"}
                  </span>
                  {connection && (
                    <ConnectionExpiry expiresAt={connection.expiresAt} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {connection ? "Studio connected" : "Connect to Roblox Studio"}
              </TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {appearance.theme === "light" ? <Sun /> : <Moon />}
                    Appearance
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={appearance.theme}
                      onValueChange={appearance.choose}
                      aria-label="Plugin theme"
                    >
                      <DropdownMenuRadioItem value="dark">
                        <Moon />
                        Dark
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="light">
                        <Sun />
                        Light
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => {
                    setTab("convert");
                    setDetail("issues");
                  }}
                >
                  <CheckCheck />
                  Conversion notes{" "}
                  <Badge variant="secondary">{notices.length}</Badge>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTab("studio")}>
                  <FileBox />
                  {LIBRARY_MODE ? "Export options" : "Connection & export"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setTab("convert");
                    setDetail("usability");
                  }}
                >
                  <ShieldCheck />
                  Check usability
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setTab("convert");
                    setDetail("structure");
                  }}
                >
                  <CheckCheck />
                  Review structure
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  disabled={busy || import.meta.env.DEV}
                  onSelect={() => {
                    liveSync.current!.hold(true);
                    setBusy(true);
                    setError("");
                    send("create-layout-examples", {
                      options: optionsRef.current,
                    });
                  }}
                >
                  <FileBox />
                  Create layout examples
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={busy || import.meta.env.DEV}
                  onSelect={() => {
                    liveSync.current!.hold(true);
                    setBusy(true);
                    setError("");
                    send("create-control-examples", {
                      options: optionsRef.current,
                    });
                  }}
                >
                  <FileBox />
                  Create control examples
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={busy || import.meta.env.DEV}
                  onSelect={() => {
                    liveSync.current!.hold(true);
                    setBusy(true);
                    setError("");
                    send("create-artwork-examples", {
                      options: optionsRef.current,
                    });
                  }}
                >
                  <FileBox />
                  Create artwork examples
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
                  <CircleHelp />
                  Report an issue
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openGuide}>
                  <CircleHelp />
                  Getting started
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openDocumentation()}>
                  <CircleHelp />
                  Guides & documentation
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <OnboardingGuide
        open={help}
        onOpenChange={setHelp}
        setup={
          firstLaunch && {
            stage: firstLaunch,
            roblox,
            betaAccess: cloud.betaAccess?.trim() ?? "",
          }
        }
        preferences={onboarding.preferences}
        facts={{
          analyzed: analysisReady,
          connected:
            !!connection &&
            connection.expiresAt > Date.now() &&
            !connectionState.restoring &&
            !connectionState.retry,
          downloaded: !!result && guideDownload === result && ready,
          receipt: studioReceipt?.status,
        }}
        libraryMode={LIBRARY_MODE}
        selectionCount={selection.length}
        imageCount={assetCount}
        uploadProblem={(() => {
          if (!assetCount || LIBRARY_MODE) return "";
          if (!cloudLoaded)
            return "Wait for your image upload settings to load.";
          try {
            uploadAuthorization(uploadSettings());
            return "";
          } catch (error) {
            return error instanceof Error
              ? error.message
              : "Set up image uploads in Images.";
          }
        })()}
        busy={busy || transferring || connecting}
        actionBlocked={!ready}
        blocker={
          propertyDrafts.blocked
            ? "Fix or revert the highlighted Properties values before exporting."
            : blocked
              ? "Resolve the conversion errors before exporting."
              : ""
        }
        restoringConnection={connectionState.restoring}
        persistenceError={onboarding.error}
        onRetrySave={onboarding.retry}
        onChoose={onboarding.choose}
        onAnalyze={() => void analyze()}
        onConnect={() => setTab("studio")}
        onImages={() => setTab("assets")}
        onReview={() => {
          setTab("convert");
          setDetail(blocked ? "issues" : "layers");
        }}
        onSend={transfer}
        onDownload={exportPackage}
        onSettings={() => setTab("settings")}
        examplesAvailable={!import.meta.env.DEV}
        onExample={(kind) => {
          if (busy || transferring || import.meta.env.DEV) return;
          setTab("convert");
          setDetail("layers");
          liveSync.current!.hold(true);
          setBusy(true);
          setError("");
          send(
            kind === "layout"
              ? "create-layout-examples"
              : "create-control-examples",
            { options: optionsRef.current },
          );
        }}
        onTourEnd={() => {
          setTourSection(undefined);
          setTourPanel(undefined);
        }}
        onVisit={(step: TourStepId) => {
          setTourSection(undefined);
          setTourPanel(
            step === "layers"
              ? "layers"
              : ["properties", "layouts", "interactions"].includes(step)
                ? "properties"
                : "preview",
          );
          if (step === "images") setTab("assets");
          else if (step === "studio") setTab("studio");
          else if (step === "review") {
            setTab("convert");
            setDetail("issues");
          } else {
            setTab("convert");
            setDetail("layers");
            if ((step === "preview" || step === "properties") && result)
              setPreviewMode("roblox");
            if (
              ["properties", "layouts", "interactions"].includes(step) &&
              result
            ) {
              const rows = entries(result);
              const frame = rows
                .flatMap((row) => row.children)
                .find((row) => row.node.properties.Size);
              if (
                frame &&
                (step !== "properties" ||
                  !selectedLayer ||
                  rows.some((row) => row.node.id === selectedLayer))
              )
                setSelectedLayer(frame.node.id);
              if (step === "properties") setTourSection("properties");
              if (step === "layouts") setTourSection("layout");
              if (step === "interactions") setTourSection("behavior");
            }
          }
        }}
      />
      {!LIBRARY_MODE && connection && (
        <div className="sync-bar">
          <label className="sync-toggle">
            <Switch
              aria-label="Automatically sync Figma edits"
              checked={syncState.enabled}
              onCheckedChange={(enabled) =>
                liveSync.current!.setEnabled(enabled)
              }
            />
            <span>Auto-sync</span>
          </label>
          <span className="sync-status" role="status" title={syncStatusMessage}>
            {syncStatusMessage}
            {syncState.enabled && syncState.target && (
              <small title={syncState.target.names.join(", ")}>
                Linked: {syncState.target.names.join(", ")}
              </small>
            )}
          </span>
          {syncState.enabled && syncState.phase === "paused" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || transferring}
              onClick={() => liveSync.current!.resume()}
            >
              Resume
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="About automatic sync"
              >
                <Info size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="sync-help">
              Keep this plugin open. Sync uses the frames from your last
              successful Send, even when you select other layers. Enable
              Auto-import designs in Studio to apply deliveries automatically.
              Turning sync off stops future updates; a sent design may already
              be in Studio. Sync starts off when you reopen the plugin.
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      {error && (
        <Alert variant="destructive" className="error-banner">
          <TriangleAlert size={16} />
          <AlertDescription>{error}</AlertDescription>
          {uploadFailure && error === uploadFailure.message && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyUploadReport()}
            >
              Copy diagnostic report
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={14} />
          </Button>
        </Alert>
      )}
      {propertyDrafts.blocked && (
        <Alert
          variant="destructive"
          className="error-banner"
          data-property-draft-guard="true"
          id="property-draft-export-blocker"
        >
          <TriangleAlert size={16} />
          <AlertDescription>
            Fix or revert the highlighted Properties values before exporting or
            sending.
            {propertyDrafts.issues.map((issue) => (
              <div key={issue.id}>
                {issue.label}: {issue.message}
              </div>
            ))}
            <small>
              Changing layers or hiding a property discards its unfinished
              draft. Your saved values stay intact.
            </small>
          </AlertDescription>
        </Alert>
      )}
      <main
        className={`workspace ${tab === "convert" && detail === "layers" ? "editing-workspace" : ""}`}
      >
        {tab === "convert" && detail === "layers" ? (
          <LayerEditor
            layersHeaderHost={layersHeaderHost}
            result={result}
            tourSection={tourSection}
            tourPanel={tourPanel}
            propertyReveal={propertyReveal}
            overrides={options.layerOverrides}
            themes={options.themes}
            imageScale={options.imageScale}
            selected={selectedLayer}
            selectedIds={layerSelection.ids}
            selectionAnchor={layerSelection.anchor}
            onSelect={setSelectedLayer}
            onChange={configureLayer}
            onBatchChange={configureLayers}
            canUndo={overrideHistory.current.canUndo}
            canRedo={overrideHistory.current.canRedo}
            onUndo={undoLayerEdit}
            onRedo={redoLayerEdit}
            disabled={transferring}
            onDraftValidity={propertyDrafts.report}
            onFocus={(id) => send("focus", { id })}
            onFocusMany={(ids) => send("select-rule-layers", { ids })}
          >
            {preview}
          </LayerEditor>
        ) : (
          <>
            {preview}
            <aside
              className="inspector"
              aria-label="Conversion inspector"
              data-tour="inspector"
            >
              <div className="inspector-heading">
                <strong>
                  {tab === "assets"
                    ? "Image assets"
                    : tab === "settings"
                      ? "Settings"
                      : tab === "studio"
                        ? "Studio"
                        : detail === "usability"
                          ? "Usability checks"
                          : detail === "structure"
                            ? "Structure review"
                            : "Conversion notes"}
                </strong>
                <DocumentationLink
                  compact
                  topic={
                    tab === "assets"
                      ? "images"
                      : tab === "settings"
                        ? "settings"
                        : tab === "studio"
                          ? "studio"
                          : detail === "usability"
                            ? "usability"
                            : detail === "structure"
                              ? "structure"
                              : "notes"
                  }
                  label="Open guides for this section"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Back to layers"
                  onClick={() => {
                    setTab("convert");
                    setDetail("layers");
                  }}
                >
                  <X />
                </Button>
              </div>
              {tab === "convert" && detail !== "layers" && (
                <Tabs
                  className="review-tabs"
                  value={detail}
                  onValueChange={setDetail}
                >
                  <TabsList aria-label="Review tools">
                    <TabsTrigger value="issues">
                      Notes <Badge variant="secondary">{notices.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="usability">Usability</TabsTrigger>
                    <TabsTrigger value="structure">Structure</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              {tab === "convert" && detail === "usability" && (
                <UsabilityChecks
                  result={result}
                  settings={checkSettings}
                  report={checkReport}
                  disabled={busy || stale || transferring}
                  configure={setCheckSettings}
                  record={setCheckReport}
                  inspect={(id) => {
                    setSelectedLayer(id);
                    setPropertyReveal((revision) => revision + 1);
                    setDetail("layers");
                  }}
                  focus={(id) => send("focus", { id })}
                  download={(report) =>
                    download(
                      "Framebridge-usability-report.json",
                      JSON.stringify(report, null, 2),
                      "application/json",
                    )
                  }
                />
              )}
              {tab === "convert" && detail === "structure" && (
                <StructureReview
                  result={result}
                  stale={stale}
                  analyze={() => void analyze()}
                  overrides={options.layerOverrides}
                  disabled={busy || stale || transferring}
                  memory={reviewMemory}
                  visionReview={
                    !LIBRARY_MODE && (
                      <VisionReview
                        result={result}
                        overrides={options.layerOverrides}
                        account={roblox.state}
                        disabled={busy || stale || transferring}
                        canUndo={overrideHistory.current.canUndo}
                        undoDisabled={busy || transferring}
                        undo={undoLayerEdit}
                        apply={(changes) =>
                          applyOverrides(
                            applyOverrideChanges(
                              optionsRef.current.layerOverrides,
                              changes,
                            ),
                          )
                        }
                        inspect={(id) => {
                          setSelectedLayer(id);
                          setPropertyReveal((revision) => revision + 1);
                          setDetail("layers");
                        }}
                        download={download}
                      />
                    )
                  }
                  cloudSync={
                    !LIBRARY_MODE && (
                      <ReviewSyncPanel
                        memory={reviewMemory}
                        account={roblox.state}
                      />
                    )
                  }
                  apply={(changes) =>
                    applyOverrides(
                      applyOverrideChanges(
                        optionsRef.current.layerOverrides,
                        changes,
                      ),
                    )
                  }
                  inspect={(id) => {
                    setSelectedLayer(id);
                    setPropertyReveal((revision) => revision + 1);
                    setDetail("layers");
                  }}
                  canUndo={overrideHistory.current.canUndo}
                  undoDisabled={busy || transferring}
                  undo={undoLayerEdit}
                />
              )}
              {tab === "convert" && detail === "issues" && (
                <ConversionNotes
                  issues={issues}
                  analyzed={!!result}
                  stale={stale}
                  busy={busy || transferring}
                  analyze={() => void analyze()}
                  inspect={(id) => {
                    setSelectedLayer(id);
                    setPropertyReveal((revision) => revision + 1);
                    setDetail("layers");
                  }}
                  focus={(id) => send("focus", { id })}
                  openImages={() => setTab("assets")}
                  openFonts={() => {
                    setSettingsEntry("Fonts");
                    setTab("settings");
                  }}
                />
              )}
              {tab === "assets" && (
                <ImageAssetsPage
                  total={pkg?.assets.length ?? 0}
                  unlinked={assetCount}
                  online={!LIBRARY_MODE}
                  operationLabel={
                    busy || transferring
                      ? progressLabel || "Working…"
                      : undefined
                  }
                  refreshAction={
                    !busy && !transferring && (!result || stale) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void analyze()}
                      >
                        <RefreshCw size={14} />
                        {result ? "Update images" : "Analyze selection"}
                      </Button>
                    ) : undefined
                  }
                  accountReady={
                    cloud.authMode === "roblox"
                      ? !!roblox.state.account &&
                        !roblox.state.account.needsAuthorization &&
                        roblox.state.account.expiresAt > Date.now() &&
                        roblox.state.account.owners.some(
                          (owner) =>
                            owner.kind === cloud.ownerType &&
                            owner.id === cloud.ownerId,
                        ) &&
                        !roblox.state.simulation
                      : !!cloud.key && !!validAssetId(cloud.ownerId)
                  }
                  actions={
                    <>
                      {!LIBRARY_MODE && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            !cloudLoaded ||
                            !ready ||
                            transferring ||
                            connecting ||
                            !!uploadConnectionProblem(connectionState) ||
                            !assetCount ||
                            (cloud.authMode === "roblox" &&
                              roblox.state.simulation)
                          }
                          onClick={uploadAll}
                        >
                          <Upload data-icon="inline-start" />
                          Upload all
                        </Button>
                      )}
                    </>
                  }
                  authorization={
                    <>
                      {!LIBRARY_MODE && (
                        <section
                          className="cloud-settings"
                          aria-label="Roblox image upload settings"
                        >
                          <h2>
                            <Link size={18} /> Image uploads
                          </h2>
                          <ToggleGroup
                            type="single"
                            value={cloud.authMode ?? "key"}
                            onValueChange={(value) => {
                              if (value)
                                updateCloud({
                                  authMode: value as "roblox" | "key",
                                });
                            }}
                            disabled={
                              transferring || !cloudLoaded || roblox.state.busy
                            }
                            variant="outline"
                            size="sm"
                            aria-label="Image upload authorization"
                            className="upload-auth-mode"
                          >
                            <ToggleGroupItem value="roblox">
                              Roblox sign-in
                            </ToggleGroupItem>
                            <ToggleGroupItem value="key">
                              API key
                            </ToggleGroupItem>
                          </ToggleGroup>
                          {PRIVATE_BETA && (
                            <div className="setting beta-access-setting">
                              <label htmlFor="beta-access">
                                Private beta access
                              </label>
                              <Input
                                id="beta-access"
                                type="password"
                                aria-label="Private beta access code"
                                autoComplete="off"
                                disabled={
                                  transferring ||
                                  !cloudLoaded ||
                                  roblox.state.busy
                                }
                                value={cloud.betaAccess ?? ""}
                                placeholder="Your tester access code"
                                onChange={(e) => {
                                  uploadSession.current = null;
                                  updateCloud({
                                    betaAccess: e.target.value.trim(),
                                  });
                                }}
                              />
                              <p>
                                Needed for sign-in or Upload all without Studio
                                pairing. Stored on this device.
                              </p>
                            </div>
                          )}
                          {cloud.authMode === "roblox" ? (
                            <RobloxAccountPanel
                              state={roblox.state}
                              manager={roblox.manager}
                              cloud={cloud}
                              update={updateCloud}
                              disabled={transferring || !cloudLoaded}
                            />
                          ) : (
                            <>
                              <label
                                className="field-label sr-only"
                                htmlFor="cloud-key"
                              >
                                API key
                              </label>
                              <InputGroup>
                                <InputGroupInput
                                  id="cloud-key"
                                  ref={keyInput}
                                  aria-label="Roblox Open Cloud API key"
                                  type={showKey ? "text" : "password"}
                                  autoComplete="off"
                                  spellCheck={false}
                                  placeholder="Paste your API key"
                                  value={cloud.key}
                                  disabled={transferring || !cloudLoaded}
                                  onChange={(e) =>
                                    updateCloud({ key: e.target.value })
                                  }
                                />
                                <InputGroupAddon align="inline-end">
                                  <InputGroupButton
                                    size="icon-xs"
                                    aria-label={
                                      showKey ? "Hide API key" : "Show API key"
                                    }
                                    aria-pressed={showKey}
                                    onClick={() => setShowKey(!showKey)}
                                  >
                                    {showKey ? (
                                      <EyeOff size={17} />
                                    ) : (
                                      <Eye size={17} />
                                    )}
                                  </InputGroupButton>
                                </InputGroupAddon>
                              </InputGroup>
                              <div className="key-caption">
                                <span role="status" aria-live="polite">
                                  {cloudSaveState === "loading"
                                    ? "Restoring saved details…"
                                    : cloudSaveState === "saving"
                                      ? "Saving locally…"
                                      : cloudSaveState === "load-error"
                                        ? "Couldn’t restore saved details."
                                        : cloudSaveState === "save-error"
                                          ? "Couldn’t save locally."
                                          : "Saved locally on this device."}
                                </span>
                                {(cloudSaveState === "load-error" ||
                                  cloudSaveState === "save-error") && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={transferring}
                                    onClick={() =>
                                      cloudSaveState === "load-error"
                                        ? restoreCloud()
                                        : updateCloud({})
                                    }
                                  >
                                    Retry
                                  </Button>
                                )}
                                {cloud.key && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-button"
                                    disabled={transferring}
                                    onClick={() => {
                                      updateCloud({ key: "" });
                                      setShowKey(false);
                                    }}
                                  >
                                    Clear key
                                  </Button>
                                )}
                              </div>
                              <div className="creator-fields">
                                <label>
                                  Creator
                                  <SelectControl
                                    aria-label="Asset owner type"
                                    value={cloud.ownerType}
                                    disabled={transferring || !cloudLoaded}
                                    onChange={(e) =>
                                      updateCloud({
                                        ownerType: e.target.value as
                                          "user" | "group",
                                      })
                                    }
                                  >
                                    <option value="user">My Roblox user</option>
                                    <option value="group">Roblox group</option>
                                  </SelectControl>
                                </label>
                                <label>
                                  {cloud.ownerType === "group"
                                    ? "Group ID"
                                    : "Creator ID"}
                                  <Input
                                    ref={creatorInput}
                                    aria-label="Roblox creator ID"
                                    inputMode="numeric"
                                    placeholder="User or group ID"
                                    value={cloud.ownerId}
                                    disabled={transferring || !cloudLoaded}
                                    onChange={(e) =>
                                      updateCloud({
                                        ownerId: e.target.value.trim(),
                                      })
                                    }
                                  />
                                </label>
                              </div>
                              <Accordion
                                type="single"
                                collapsible
                                className="upload-help"
                              >
                                <AccordionItem value="credentials-help">
                                  <AccordionTrigger className="py-2">
                                    Where do I find these?
                                  </AccordionTrigger>
                                  <AccordionContent>
                                    <p>
                                      Use the number in your Roblox profile or
                                      group URL. Your Open Cloud key needs
                                      Assets read/write access. Images may stay
                                      blank until Roblox moderation finishes.
                                    </p>
                                    <p>
                                      Up to 1,000 unique images per design,
                                      uploaded two at a time. The private
                                      service may have a lower daily allowance.
                                      Completed links stay available when you
                                      retry.
                                    </p>
                                    <a
                                      href="https://create.roblox.com/dashboard/credentials"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Create an Open Cloud key{" "}
                                      <ExternalLink size={12} />
                                    </a>
                                  </AccordionContent>
                                </AccordionItem>
                              </Accordion>
                            </>
                          )}
                        </section>
                      )}
                    </>
                  }
                  library={
                    <>
                      <ImageLibrary
                        defaultOpen
                        library={imageLibrary}
                        owner={cloud}
                        result={result}
                        disabled={transferring || busy || stale}
                        assign={(id, binding) =>
                          update({
                            assetIds: {
                              ...optionsRef.current.assetIds,
                              [id]: binding,
                            },
                          })
                        }
                        locate={(id) => {
                          setSelectedLayer(id);
                          setTab("convert");
                          setPreviewMode("roblox");
                        }}
                      />
                    </>
                  }
                  local={
                    <>
                      <ArtworkImport
                        defaultOpen
                        disabled={transferring || busy}
                      />
                    </>
                  }
                  cloud={
                    <>
                      {!LIBRARY_MODE && (
                        <CloudArtworkLibrary
                          defaultOpen
                          account={roblox.state}
                          disabled={transferring || busy}
                        />
                      )}
                    </>
                  }
                >
                  {!!pkg?.assets.length && (
                    <Input
                      aria-label="Search analyzed images"
                      placeholder="Find an image by layer or filename"
                      value={imageSearch}
                      onChange={(e) => {
                        setImageSearch(e.target.value);
                        setImagePageIndex(0);
                      }}
                    />
                  )}
                  <Accordion type="multiple" className="asset-list">
                    {imageRows.items.map((a) => {
                      const binding =
                        options.assetIds[a.id] ?? a.robloxId ?? "";
                      const invalid = !!binding && !validAssetId(binding);
                      return (
                        <AccordionItem
                          className="asset-row"
                          key={a.id}
                          value={a.id}
                          onDragOver={(e) => {
                            if (!transferring) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (transferring || busy || stale) return;
                            try {
                              const dropped = JSON.parse(
                                e.dataTransfer.getData(
                                  "application/x-framebridge-image",
                                ),
                              );
                              const saved = imageLibrary.entries.find(
                                (entry) =>
                                  entry.owner === dropped.owner &&
                                  entry.fingerprint === dropped.fingerprint,
                              );
                              if (saved)
                                update({
                                  assetIds: {
                                    ...optionsRef.current.assetIds,
                                    [a.id]: saved.assetId,
                                  },
                                });
                            } catch {}
                          }}
                        >
                          <AccordionTrigger className="asset-trigger">
                            <span className="asset-thumb">
                              {result?.assets[a.id] ? (
                                <AssetImage bytes={result.assets[a.id]} />
                              ) : (
                                <Image size={22} />
                              )}
                            </span>
                            <span className="asset-name">
                              <strong title={a.name}>{a.name}</strong>
                              <small title={a.filename}>{a.filename}</small>
                            </span>
                            <span className="asset-meta">
                              <small>
                                {a.width} × {a.height}
                              </small>
                              <span
                                className={`asset-status ${invalid ? "invalid" : binding ? "linked" : ""}`}
                              >
                                {invalid ? (
                                  <TriangleAlert size={11} />
                                ) : binding ? (
                                  <Check size={12} />
                                ) : null}
                                {invalid
                                  ? "Invalid ID"
                                  : binding
                                    ? "Linked"
                                    : "Ready"}
                              </span>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="asset-detail">
                            <code className="asset-filename">{a.filename}</code>
                            <p>
                              {a.reason} · PNG at {a.scale}×
                              {a.processing?.whiteMask ? " · White mask" : ""}
                              {a.processing?.edgeCleanup
                                ? " · Edge cleanup"
                                : ""}
                            </p>
                            <label>
                              Roblox image asset ID
                              <Input
                                value={binding}
                                aria-invalid={invalid}
                                disabled={transferring}
                                aria-label={`Asset ID for ${a.name}`}
                                placeholder="rbxassetid://123456789"
                                onChange={(e) =>
                                  update({
                                    assetIds: {
                                      ...options.assetIds,
                                      [a.id]: e.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                            {invalid && (
                              <p className="amber-text">
                                Enter a valid numeric image asset ID.
                              </p>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                    {!pkg?.assets.length && (
                      <Empty className="px-4 py-10">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Image />
                          </EmptyMedia>
                          <EmptyTitle>
                            {result
                              ? "No images to upload"
                              : "No artwork analyzed yet"}
                          </EmptyTitle>
                          <EmptyDescription>
                            {result
                              ? "This selection uses editable Roblox instances."
                              : "Analyze your selection to see its artwork here."}
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </Accordion>
                  {!!pkg?.assets.length && !imageRows.total && (
                    <p role="status">No images match your search.</p>
                  )}
                  <ImagePages
                    value={imageRows}
                    onChange={setImagePageIndex}
                    label="Analyzed image pages"
                  />
                </ImageAssetsPage>
              )}
              {tab === "studio" && (
                <StudioPage
                  online={!LIBRARY_MODE}
                  serviceAvailable={!!RELAY_URL}
                  connection={{
                    expiresAt: connection?.expiresAt,
                    restoring: connectionState.restoring,
                    retry: connectionState.retry,
                    error: connectionState.error,
                    connecting,
                    code: pairCode,
                    changeCode: setPairCode,
                    connect: () => void connect(),
                    retrySaved: () => void connectionManager.current!.restore(),
                    disconnect: () => {
                      if (!connection) return;
                      void disconnectStudio(connection.senderToken).catch(
                        () => {},
                      );
                      void forgetConnection(connection.senderToken);
                    },
                  }}
                  design={{
                    name:
                      pkg?.name ?? selection[0]?.name ?? "No design selected",
                    thumbnail:
                      result?.previews[active] ??
                      Object.values(result?.previews ?? {})[0],
                    selected: selection.length,
                    instances: pkg?.stats.instances ?? 0,
                    images: pkg?.assets.length ?? 0,
                    unlinked: assetCount,
                    analyzed: !!result,
                    problem: propertyDrafts.blocked
                      ? {
                          message: "Finish or discard your property edits.",
                          action: "properties",
                        }
                      : stale || !result
                        ? {
                            message: result
                              ? "Changes need a new analysis."
                              : "",
                            action: "analyze",
                          }
                        : blocked
                          ? {
                              message:
                                "Resolve conversion errors before exporting.",
                              action: "review",
                            }
                          : undefined,
                  }}
                  busy={busy}
                  sending={transferring}
                  sendDisabled={
                    !selection.length ||
                    busy ||
                    transferring ||
                    propertyDrafts.blocked ||
                    (blocked && !stale)
                  }
                  exportDisabled={!ready || transferring}
                  send={transfer}
                  analyze={() => void analyze()}
                  review={() => {
                    setTab("convert");
                    setDetail("issues");
                  }}
                  properties={() => {
                    setTab("convert");
                    setDetail("layers");
                  }}
                  images={() => setTab("assets")}
                  sync={syncState}
                  syncMessage={syncStatusMessage}
                  setSync={(enabled) => liveSync.current!.setEnabled(enabled)}
                  resumeSync={() => liveSync.current!.resume()}
                  downloadPackage={exportPackage}
                  copyJson={copy}
                  handoff={
                    !LIBRARY_MODE && (
                      <HandoffPanel
                        disabled={
                          !ready || transferring || busy || !cloudLoaded
                        }
                        name={result?.package.name ?? "Design"}
                        betaAccess={cloud.betaAccess}
                        onAccessChange={(betaAccess) => {
                          uploadSession.current = null;
                          updateCloud({ betaAccess });
                        }}
                        onCreate={shareDesign}
                        onCopyFallback={setManualCopy}
                      />
                    )
                  }
                  exports={
                    <>
                      <ModelExport
                        result={result}
                        disabled={!ready || transferring}
                        onDownload={download}
                        beforeExport={() => !propertyDrafts.isBlocked()}
                        onOpenImages={() => setTab("assets")}
                        onError={setError}
                      />
                      <SourceExport
                        result={result}
                        disabled={!ready || transferring}
                        onDownload={download}
                        beforeExport={() => !propertyDrafts.isBlocked()}
                        onCopyFallback={setManualCopy}
                        onError={setError}
                      />
                      <ComponentExport
                        result={result}
                        selected={selectedLayer}
                        disabled={!ready || transferring}
                        onDownload={download}
                        beforeExport={() => !propertyDrafts.isBlocked()}
                        onError={setError}
                      />
                    </>
                  }
                />
              )}
              {tab === "settings" && (
                <SettingsPage
                  initialSection={settingsEntry}
                  options={options}
                  onChange={update}
                  appearance={appearance}
                  disabled={busy || transferring}
                  onRestore={() => {
                    update({ ...DEFAULT_FIGMA_OPTIONS });
                    setToast("Default settings restored.");
                  }}
                />
              )}
            </aside>
          </>
        )}
      </main>
      <footer className="footer">
        <div className="footer-note">
          {busy || transferring ? (
            <>
              <LoaderCircle className="spin" size={16} />
              <div>
                <strong>{progressLabel}</strong>
                <Progress
                  value={progress}
                  aria-label={progressLabel}
                  className="progress-track"
                />
              </div>
            </>
          ) : (
            <>
              <Info size={20} />
              <div>
                <strong>
                  {!selection.length
                    ? "Select a frame to get started."
                    : propertyDrafts.blocked
                      ? "Fix the highlighted Properties values."
                      : stale || !result
                        ? "Analyze your selection to continue."
                        : blocked
                          ? "Resolve conversion errors before exporting."
                          : assetCount
                            ? `${assetCount} ${assetCount === 1 ? "image" : "images"} ${LIBRARY_MODE ? "included in your export." : "ready to upload."}`
                            : "Your UI is ready for Studio."}
                </strong>
              </div>
            </>
          )}
        </div>
        <div className="footer-actions">
          {busy || transferring ? (
            <Button
              variant="outline"
              size="sm"
              className="secondary"
              onClick={() => {
                clearStudioReceipt();
                pendingSend.current = false;
                if (
                  syncState.phase === "analyzing" ||
                  syncState.phase === "sending"
                )
                  liveSync.current!.setEnabled(false);
                if (transferring) transferAbort.current?.abort();
                else send("cancel");
              }}
            >
              Cancel
            </Button>
          ) : (
            <>
              {!LIBRARY_MODE && !connection && (
                <Button
                  variant="outline"
                  size="sm"
                  className="secondary"
                  onClick={analyze}
                  disabled={!selection.length}
                >
                  <RefreshCw size={16} /> Analyze selection
                </Button>
              )}
              {ready && !assetCount && !!connection && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="secondary icon-button"
                  aria-label="Analyze again"
                  title="Analyze again"
                  onClick={analyze}
                >
                  <RefreshCw size={16} />
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="primary"
                aria-describedby={
                  propertyDrafts.blocked
                    ? "property-draft-export-blocker"
                    : undefined
                }
                disabled={
                  propertyDrafts.blocked ||
                  ((LIBRARY_MODE || !!connection) &&
                    (!selection.length || (blocked && !stale)))
                }
                onClick={() => {
                  if (propertyDrafts.isBlocked()) return;
                  if (!LIBRARY_MODE) {
                    if (!connection) {
                      setTab("studio");
                      return;
                    }
                    transfer();
                  } else if (!analysisReady) void analyze();
                  else transfer();
                }}
              >
                {!LIBRARY_MODE ? (
                  <Link size={16} />
                ) : !analysisReady ? (
                  <RefreshCw size={16} />
                ) : (
                  <ArrowDownToLine size={16} />
                )}
                {!LIBRARY_MODE
                  ? connection
                    ? "Send to Studio"
                    : "Connect Studio"
                  : !analysisReady
                    ? "Analyze selection"
                    : "Export for Studio"}
              </Button>
            </>
          )}
        </div>
      </footer>
      <Toaster
        theme={appearance.theme}
        position="bottom-center"
        customAriaLabel={`Notifications (${formatShortcut("Alt+T")})`}
        richColors
        closeButton
        icons={{
          success: <Check size={20} />,
          info: <Info size={20} />,
          warning: <TriangleAlert size={20} />,
          error: <TriangleAlert size={20} />,
          loading: <LoaderCircle size={20} className="spin" />,
          close: <X size={12} />,
        }}
      />
      <PluginResizeHandle
        onResize={(size, persist) => send("resize", { ...size, persist })}
      />
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="feedback-dialog">
          <DialogHeader>
            <DialogTitle>
              <span className="report-dialog-icon">
                <CircleHelp size={20} />
              </span>
              Report an issue
            </DialogTitle>
            <DialogDescription className="sr-only">
              Describe an issue, choose optional attachments, and review the
              report before sharing.
            </DialogDescription>
          </DialogHeader>
          <ReportFeedback
            pkg={pkg}
            knownSecrets={[
              cloud.key,
              cloud.betaAccess || "",
              connection?.senderToken || "",
              roblox.state.accountToken || "",
            ]}
            onExport={(report) =>
              download(
                "framebridge-feedback.json",
                JSON.stringify(report, null, 2),
                "application/json",
              )
            }
            renderPrivate={
              !LIBRARY_MODE
                ? (report, reviewed, onReview, localActions) => (
                    <PrivateFeedbackPanel
                      report={report}
                      reviewed={reviewed}
                      onReview={onReview}
                      localActions={localActions}
                      beta={cloud.betaAccess || ""}
                      onBeta={(betaAccess) => updateCloud({ betaAccess })}
                    />
                  )
                : undefined
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!manualCopy}
        onOpenChange={(open) => {
          if (!open) setManualCopy("");
        }}
      >
        <DialogContent className="help-dialog">
          <DialogHeader>
            <DialogTitle>Copy your export</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Clipboard access isn’t available in this window. Select the export
            below and copy it with {formatShortcut("C")}.
          </DialogDescription>
          <Textarea
            aria-label="Export to copy"
            readOnly
            value={manualCopy}
            onFocus={(e) => e.target.select()}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
function AssetImage({ bytes }: { bytes: number[] }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const object = URL.createObjectURL(
      new Blob([new Uint8Array(bytes).buffer], { type: "image/png" }),
    );
    setUrl(object);
    return () => URL.revokeObjectURL(object);
  }, [bytes]);
  return <img src={url || undefined} alt="" />;
}
applyPluginTheme(initialPluginTheme());
createRoot(document.getElementById("root")!).render(
  <TooltipProvider delayDuration={350}>
    <App />
  </TooltipProvider>,
);
