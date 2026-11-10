import {
  createArtworkPool,
  createRenderCache,
  IMAGE_BATCH_LIMITS,
} from "../../../packages/core/src/image-batches";
import { FEEDBACK_STORAGE_KEY, readFeedbackRecords } from "./feedback-storage";
import { consumedScrollbarArtwork } from "../../../packages/core/src/scrollbar";
import { compile } from "../../../packages/core/src/compiler";
import { mapConcurrent } from "../../../packages/core/src/concurrency";
import { createImagePreparationBridge } from "./image-preparation-bridge";
import {
  DECORATION_PIXELS,
  extractShadowPng,
} from "../../../packages/core/src/effect-pixels";
import {
  imageScalingIssues,
  pngPixelSize,
} from "../../../packages/core/src/image-scaling";
import {
  type AnalysisResult,
  type Asset,
  type DesignNode,
  type ExportOptions,
  type Transform,
} from "../../../packages/core/src/types";
import { snapshot } from "./snapshot";
import { DEFAULT_FIGMA_OPTIONS } from "./design-screen";
import { vectorRenderKey } from "./vector-render-key";
import { artworkRenderContext } from "./artwork-render-context";
import { selectRuleLayers } from "./select-rule-layers";
import { REVIEW_SYNC_KEY, readSavedReviewSync } from "./review-sync-storage";
import {
  ARTWORK_ACCESS_KEY,
  readArtworkAccess,
} from "./artwork-access-storage";
import { importArtwork } from "./artwork-import";
import {
  createControlExamples,
  createArtworkExamples,
  createLayoutExamples,
} from "./create-layout-examples";
import { ASSET_CATALOG_KEY, readCatalog } from "./asset-catalog-data";
import {
  REVIEW_PREFERENCES_KEY,
  readReviewPreferences,
} from "../../../packages/core/src/structure-review";
import { createCloudStorage } from "./cloud-storage";
import { createConnectionStorage } from "./studio-connection";
import {
  createRobloxAccountStorage,
  robloxAuthorizationUrl,
} from "./roblox-account-storage";
import { HANDOFF_STORAGE_KEY, readHandoffs } from "./handoff-storage";
import {
  DEFAULT_WINDOW_SIZE,
  WINDOW_SIZE_KEY,
  windowSize,
} from "./window-size";
import { SIDEBAR_LAYOUT_KEY, readSidebarLayout } from "./sidebar-layout";
import { createAppearanceStorage } from "./plugin-appearance";
import { documentationUrl } from "./documentation";
import { createOnboardingStorage } from "./onboarding";
declare const __html__: string;
declare const __FRAMEBRIDGE_LIBRARY_COMMAND__: string;
export function startClassicController() {
  const libraryCommand =
    typeof __FRAMEBRIDGE_LIBRARY_COMMAND__ !== "undefined"
      ? __FRAMEBRIDGE_LIBRARY_COMMAND__
      : "";
  if (libraryCommand)
    figma.root.setRelaunchData({ [libraryCommand]: "Open Framebridge" });
  figma.showUI(__html__, {
    ...DEFAULT_WINDOW_SIZE,
    themeColors: true,
    title: "Framebridge · Figma to Roblox",
  });
  let currentWindowSize = DEFAULT_WINDOW_SIZE;
  const resizeWindow = (size: { width: number; height: number }) => {
    if (
      size.width === currentWindowSize.width &&
      size.height === currentWindowSize.height
    )
      return;
    figma.ui.resize(size.width, size.height);
    currentWindowSize = size;
  };
  let revision = 0,
    busy = false,
    requestId = 0;
  let ruleSelectionId = 0;
  const temporaryIds = new Set<string>();
  const activeScratchFrames = new Set<FrameNode>();
  let closed = false;
  let syncRoots: SceneNode[] = [],
    syncRevision = 0,
    watchSequence = 0;
  let syncSignature = "",
    activeNodes: SceneNode[] = [],
    activeSignature = "";
  let syncMembers = new Set<string>(),
    activeMembers = new Set<string>();
  let activeJobId: string | undefined;
  const sourceSignature = (nodes: SceneNode[]) =>
    JSON.stringify(nodes.map((n) => snapshot(n)));
  function members(nodes: SceneNode[], byId?: Map<string, SceneNode>) {
    const ids = new Set<string>();
    const visit = (node: SceneNode) => {
      ids.add(node.id);
      byId?.set(node.id, node);
      if ("children" in node) node.children.forEach(visit);
    };
    nodes.forEach(visit);
    return ids;
  }
  function affects(
    changes: NodeChange[],
    nodes: SceneNode[],
    ids: Set<string>,
  ) {
    return changes.some(
      (c) =>
        ids.has(c.node.id) ||
        (!c.node.removed &&
          nodes.some((n) => ancestor(c.node as SceneNode, n))),
    );
  }
  const send = (type: string, data: unknown = {}) => {
    if (!closed) figma.ui.postMessage({ type, ...(data as object) });
  };
  const imagePreparation = createImagePreparationBridge(send, {
    encode: (bytes) => figma.base64Encode(bytes),
    decode: (png) => figma.base64Decode(png),
  });
  figma.on("close", () => {
    closed = true;
    requestId++;
    imagePreparation.cancel();
    lastAnalysis = undefined;
    for (const frame of activeScratchFrames) {
      try {
        if (!frame.removed) frame.remove();
      } catch {
        /* Continue cleaning the other render. */
      }
    }
    activeScratchFrames.clear();
  });
  const count = (n: SceneNode): number => {
    let total = 0;
    const stack = [n];
    while (stack.length && total <= 10000) {
      const next = stack.pop()!;
      total++;
      if ("children" in next) stack.push(...next.children);
    }
    return total;
  };
  function selection() {
    return figma.currentPage.selection.filter(
      (n) =>
        !figma.currentPage.selection.some(
          (other) => other !== n && ancestor(n, other),
        ),
    );
  }
  function ancestor(n: BaseNode, parent: BaseNode): boolean {
    let p = n.parent;
    while (p) {
      if (p.id === parent.id) return true;
      p = p.parent;
    }
    return false;
  }
  function announce() {
    const selected = selection();
    send("selection", {
      selection: selected.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        width: Math.round(n.width),
        height: Math.round(n.height),
        layers: count(n),
      })),
      revision,
    });
  }
  figma.on("selectionchange", () => {
    revision++;
    announce();
  });
  const changed = (e: NodeChangeEvent) => {
    const changes = e.nodeChanges.filter((c) => !temporaryIds.has(c.node.id));
    if (!changes.length) return;
    // Clone/export events can affect an auto-layout parent briefly. Compare the source,
    // including while rendering, so those events cannot create a feedback loop.
    let actual = !busy;
    if (
      busy &&
      activeNodes.length &&
      affects(changes, activeNodes, activeMembers)
    ) {
      try {
        actual = sourceSignature(activeNodes) !== activeSignature;
      } catch {
        actual = true;
      }
    } else if (busy) actual = false;
    if (actual) {
      revision++;
      send("stale", { revision });
    }
    if (syncRoots.length && affects(changes, syncRoots, syncMembers)) {
      try {
        if (syncRoots.some((n) => n.removed || !ancestor(n, figma.currentPage)))
          throw new Error(
            "A linked frame was removed or moved to another page. Send the design again to choose its frames.",
          );
        const next = sourceSignature(syncRoots);
        if (next !== syncSignature) {
          syncSignature = next;
          syncMembers = members(syncRoots);
          syncRevision++;
          send("sync-source-changed", { revision: syncRevision });
        }
      } catch (error) {
        syncRoots = [];
        syncRevision++;
        send("sync-target-unavailable", {
          message:
            error instanceof Error
              ? error.message
              : "The linked frames are unavailable. Send the design again.",
        });
      }
    }
  };
  let watchedPage = figma.currentPage;
  watchedPage.on("nodechange", changed);
  figma.on("currentpagechange", () => {
    watchSequence++;
    if (syncRoots.length)
      send("sync-target-unavailable", {
        message:
          "You changed Figma pages. Send a design on this page to choose new sync frames.",
      });
    syncRoots = [];
    syncRevision++;
    watchedPage.off("nodechange", changed);
    watchedPage = figma.currentPage;
    watchedPage.on("nodechange", changed);
    revision++;
    announce();
  });
  function register(n: BaseNode) {
    temporaryIds.add(n.id);
    // Retain recent tombstones for delayed nodechange events without growing for
    // the entire lifetime of a long-running auto-sync session.
    if (temporaryIds.size > 50000)
      temporaryIds.delete(temporaryIds.values().next().value!);
    if ("children" in n) (n.children as readonly BaseNode[]).forEach(register);
  }
  async function rasterize(
    source: SceneNode,
    root: boolean,
    scale: number,
    options: ExportOptions,
    localTransform: Transform,
    renderMode?: Asset["renderMode"],
    backdrop?: Asset["backdrop"],
    check: () => void = () => {},
  ) {
    const scratch = figma.createFrame();
    activeScratchFrames.add(scratch);
    register(scratch);
    scratch.name = "__Framebridge export temporary__";
    scratch.fills = [];
    scratch.clipsContent = false;
    scratch.x = -100000;
    scratch.y = -100000;
    try {
      let clone = source.clone();
      register(clone);
      scratch.appendChild(clone);
      if (renderMode) {
        if (clone.type === "INSTANCE") {
          clone = clone.detachInstance();
          register(clone);
        }
        // Freeze Hug/auto-layout before hiding content. Work only on the temporary copy.
        if ("layoutMode" in clone) clone.layoutMode = "NONE";
        if ("resizeWithoutConstraints" in clone)
          clone.resizeWithoutConstraints(source.width, source.height);
        if ("children" in clone && renderMode !== "shadow")
          clone.children.forEach((child) => {
            child.visible = false;
          });
        if ("strokes" in clone && renderMode !== "shadow") clone.strokes = [];
        if ("effects" in clone && renderMode !== "shadow") clone.effects = [];
        if ("opacity" in clone) clone.opacity = 1;
        if (renderMode === "blend") {
          if (!backdrop)
            throw new Error("Paint blends need a known flat backdrop.");
          scratch.fills = [
            {
              type: "SOLID",
              color: { r: backdrop[0], g: backdrop[1], b: backdrop[2] },
            },
          ];
        }
      }
      const consumed = consumedScrollbarArtwork(options.layerOverrides);
      const omitTaggedLayers = (original: SceneNode, copy: SceneNode) => {
        if ("children" in original && "children" in copy)
          original.children.forEach((child, index) => {
            const cloned = copy.children[index];
            if (!cloned) return;
            if (
              (/\[skip\]/i.test(child.name) &&
                !["native", "image"].includes(
                  options.layerOverrides[child.id]?.renderMode ?? "",
                )) ||
              options.layerOverrides[child.id]?.renderMode === "skip" ||
              consumed.has(child.id)
            )
              cloned.visible = false;
            else omitTaggedLayers(child, cloned);
          });
      };
      omitTaggedLayers(source, clone);
      clone.visible = true;
      // The snapshot resolves Figma's container-relative group coordinates to
      // the direct parent used by Roblox. Crop bounds must use that same space.
      const t = localTransform;
      clone.relativeTransform = root
        ? [
            [1, 0, 0],
            [0, 1, 0],
          ]
        : [
            [t[0][0], t[0][1], 0],
            [t[1][0], t[1][1], 0],
          ];
      const bounds =
        ("absoluteRenderBounds" in clone ? clone.absoluteRenderBounds : null) ||
        clone.absoluteBoundingBox;
      if (!bounds) throw new Error(`Cannot measure ${source.name}.`);
      const x =
        renderMode === "fills" || renderMode === "blend"
          ? 0
          : Math.floor((bounds.x - scratch.x) * scale) / scale;
      const y =
        renderMode === "fills" || renderMode === "blend"
          ? 0
          : Math.floor((bounds.y - scratch.y) * scale) / scale;
      const w =
        renderMode === "fills" || renderMode === "blend"
          ? source.width
          : Math.ceil((bounds.x - scratch.x + bounds.width) * scale) / scale -
            x;
      const h =
        renderMode === "fills" || renderMode === "blend"
          ? source.height
          : Math.ceil((bounds.y - scratch.y + bounds.height) * scale) / scale -
            y;
      if (w * scale > 4096 || h * scale > 4096)
        throw new Error(
          `${source.name} exceeds 4096 px at ${scale}×. Reduce image resolution or export a smaller layer.`,
        );
      if (
        renderMode &&
        Math.ceil(w * scale) * Math.ceil(h * scale) > DECORATION_PIXELS
      )
        throw new Error(
          `${source.name} decoration exceeds 4 million pixels. Reduce image resolution.`,
        );
      // Cropping must not apply the copied artwork's layout constraints. Imported
      // SVG vectors often use SCALE, which would shrink with the scratch frame.
      scratch.resizeWithoutConstraints(
        Math.max(w, 1 / scale),
        Math.max(h, 1 / scale),
      );
      scratch.clipsContent = true;
      const ct = clone.relativeTransform;
      clone.relativeTransform = [
        [ct[0][0], ct[0][1], -x],
        [ct[1][0], ct[1][1], -y],
      ];
      const settings: ExportSettingsImage = {
        format: "PNG",
        constraint: { type: "SCALE", value: scale },
        contentsOnly: true,
        useAbsoluteBounds: true,
        ...(["shadow", "blend"].includes(renderMode ?? "")
          ? { colorProfile: "SRGB" }
          : {}),
      };
      check();
      let bytes = await scratch.exportAsync(settings);
      check();
      if (renderMode === "shadow") {
        const dimensions = pngPixelSize(bytes);
        if (
          !dimensions ||
          dimensions[0] !== Math.ceil(w * scale) ||
          dimensions[1] !== Math.ceil(h * scale)
        )
          throw new Error(
            "Drop-effect render does not match the measured export bounds.",
          );
        if (!("effects" in clone))
          throw new Error("Drop effect is no longer available.");
        clone.effects = [];
        const base = await scratch.exportAsync(settings);
        check();
        bytes = (
          await extractShadowPng(bytes, base, check, {
            order: source.type === "TEXT" ? "above" : "below",
            opacity: "opacity" in source ? source.opacity : 1,
          })
        ).bytes;
      }
      return {
        bytes,
        bounds: {
          x: (root ? 0 : t[0][2]) + x,
          y: (root ? 0 : t[1][2]) + y,
          width: w,
          height: h,
        },
      };
    } finally {
      if (activeScratchFrames.delete(scratch)) scratch.remove();
    }
  }
  const imageCache = createRenderCache<{
    signature: string;
    bytes: Uint8Array;
    bounds: { x: number; y: number; width: number; height: number };
  }>(IMAGE_BATCH_LIMITS.unique * 2);
  const sourcePreviews: Record<string, { signature: string; data: string }> =
    {};
  let savedPreferencesSignature: string | undefined;
  // Retain one small verified result. An unchanged repeat can finish in the
  // same synchronous turn as its fresh snapshot, without another render/compile
  // or verification pass. Large artwork still uses the bounded PNG caches.
  let lastAnalysis:
    | {
        signature: string;
        options: string;
        sourceId: string;
        result: AnalysisResult;
      }
    | undefined;
  async function analyze(
    options: ExportOptions,
    rootIds?: string[],
    jobId?: string,
  ) {
    if (busy) {
      if (jobId) {
        send("error", {
          jobId,
          message: "Another analysis is still finishing.",
        });
        send("idle", { jobId });
      }
      return;
    }
    busy = true;
    activeJobId = jobId;
    const report = (type: string, data: object = {}) =>
      send(type, { ...data, jobId });
    const task = ++requestId;
    const startRevision = rootIds ? syncRevision : revision;
    let selected: SceneNode[] = [];
    try {
      if (rootIds) {
        if (
          !Array.isArray(rootIds) ||
          !rootIds.length ||
          rootIds.length > 100 ||
          rootIds.some((id) => typeof id !== "string") ||
          new Set(rootIds).size !== rootIds.length
        )
          throw new Error(
            "The linked frame list is invalid. Send the design again.",
          );
        for (const id of rootIds) {
          const node = await figma.getNodeByIdAsync(id);
          if (
            !node ||
            !("exportAsync" in node) ||
            !ancestor(node, figma.currentPage)
          )
            throw new Error(
              "A linked frame is unavailable on this page. Send the design again.",
            );
          selected.push(node as SceneNode);
        }
      } else selected = [...selection()];
      if (!selected.length)
        throw new Error("Select at least one frame or layer in Figma.");
      if (selected.length > 100)
        throw new Error("Select no more than 100 root frames per export.");
      if (selected.reduce((a, n) => a + count(n), 0) > 10000)
        throw new Error("Select fewer than 10,000 layers per export.");
      activeNodes = selected;
      const sourceNodes = new Map<string, SceneNode>();
      activeMembers = members(selected, sourceNodes);
      report("progress", {
        progress: 5,
        label: rootIds
          ? "Reading the linked frames…"
          : "Reading your selection…",
      });
      const designs = selected.map((n) => snapshot(n));
      const signature = JSON.stringify(designs);
      activeSignature = signature;
      const optionsSignature = JSON.stringify(options);
      const { layerOverrides, ...preferences } = options;
      const preferencesSignature = JSON.stringify(preferences);
      const overridesJson = JSON.stringify(layerOverrides);
      let sourceId = figma.root.getPluginData("framebridge-source");
      if (!sourceId) {
        sourceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        temporaryIds.add(figma.root.id);
        figma.root.setPluginData("framebridge-source", sourceId);
      }
      if (
        lastAnalysis?.signature === signature &&
        lastAnalysis.options === optionsSignature &&
        lastAnalysis.sourceId === sourceId &&
        savedPreferencesSignature === preferencesSignature
      ) {
        if (task !== requestId || closed) throw new Error("Export cancelled.");
        if ((rootIds ? syncRevision : revision) !== startRevision)
          throw new Error(
            "The selection changed while analyzing. Review the current selection again.",
          );
        if (
          figma.root.getPluginData("framebridge-layer-overrides") !==
          overridesJson
        )
          figma.root.setPluginData(
            "framebridge-layer-overrides",
            overridesJson,
          );
        const result = {
          ...lastAnalysis.result,
          revision,
          package: {
            ...lastAnalysis.result.package,
            createdAt: new Date().toISOString(),
          },
        };
        report("result", { result });
        return;
      }
      const rootSignatures = new Map(
        designs.map((n) => [n.id, JSON.stringify(n)]),
      );
      const pendingCache = createRenderCache<{
        signature: string;
        bytes: Uint8Array;
        bounds: { x: number; y: number; width: number; height: number };
      }>(IMAGE_BATCH_LIMITS.unique * 2);
      let pkg = compile(designs, sourceId, options);
      if (pkg.assets.length > IMAGE_BATCH_LIMITS.references)
        throw new Error(
          "A design can contain at most 10,000 image references. Export smaller sections.",
        );
      if (!pkg.roots.length)
        throw new Error(
          "The selected layers are hidden or marked [skip]. Select a visible frame or include hidden layers.",
        );
      const previews: Record<string, string> = {},
        assets: Record<string, number[]> = {};
      let previewBytes = 0,
        omittedPreviews = 0;
      const addPreview = (id: string, data: string) => {
        if (previewBytes + data.length > IMAGE_BATCH_LIMITS.previewBytes) {
          omittedPreviews++;
          return;
        }
        previewBytes += data.length;
        previews[id] = data;
      };
      const previewJobs = selected.map((n) => async () => {
        if (sourcePreviews[n.id]?.signature === rootSignatures.get(n.id)) {
          addPreview(n.id, sourcePreviews[n.id].data);
          return;
        }
        const bytes = await n.exportAsync({
          format: "PNG",
          constraint: {
            type: "SCALE",
            value: Math.min(1, 1000 / Math.max(1, n.width, n.height)),
          },
          contentsOnly: true,
        });
        if (
          Math.ceil((bytes.length * 4) / 3) + 22 >
          IMAGE_BATCH_LIMITS.previewBytes - previewBytes
        ) {
          omittedPreviews++;
          return;
        }
        addPreview(n.id, `data:image/png;base64,${figma.base64Encode(bytes)}`);
      });
      const consumedArtwork = consumedScrollbarArtwork(options.layerOverrides);
      const originalRenders = new Map<
        string,
        Promise<{
          bytes: Uint8Array;
          bounds: { x: number; y: number; width: number; height: number };
        }>
      >();
      // Share native work across identical plain vector leaves within this
      // analysis. Keep this bounded and separate from the per-layer cache.
      type Raster = {
        bytes: Uint8Array;
        bounds: { x: number; y: number; width: number; height: number };
      };
      const sharedVectors = createRenderCache<Raster>();
      const sharedVectorJobs = new Map<string, Promise<Raster>>();
      const designsById = new Map<string, DesignNode>();
      const indexDesigns = (nodes: DesignNode[]) =>
        nodes.forEach((node) => {
          designsById.set(node.id, node);
          indexDesigns(node.children);
        });
      indexDesigns(designs);
      // Compute before rasterBounds are added to the compiled design snapshots.
      const imageSignatures = new Map(
        pkg.assets.map((asset) => [
          asset.nodeId,
          JSON.stringify(designsById.get(asset.nodeId)),
        ]),
      );
      let completed = 0,
        lastArtworkProgress = 0;
      const artworkPool = createArtworkPool();
      // Cached render buffers are immutable; repeated references can reuse their
      // already pooled number array without rehashing a large PNG in the sandbox.
      const pooledArtwork = new WeakMap<Uint8Array, number[]>();
      const preparedArtwork = new WeakMap<
        Uint8Array,
        Map<string, Promise<Uint8Array>>
      >();
      const prepareArtwork = (bytes: Uint8Array, asset: Asset) => {
        const variant = JSON.stringify([
          asset.processing,
          asset.scrollbarSlice,
        ]);
        let variants = preparedArtwork.get(bytes);
        if (!variants) preparedArtwork.set(bytes, (variants = new Map()));
        let job = variants.get(variant);
        if (!job) {
          job = imagePreparation.prepare(
            bytes,
            asset.processing,
            asset.scrollbarSlice,
          );
          variants.set(variant, job);
        }
        return job;
      };
      const assetJobs = pkg.assets.map((asset) => async () => {
        if (task !== requestId) throw new Error("Export cancelled.");
        const node = sourceNodes.get(asset.nodeId);
        if (!node || node.removed || !("exportAsync" in node))
          throw new Error(`Layer ${asset.name} is no longer available.`);
        // Fast cache hits need no per-image IPC/render updates. Keep long native
        // renders visibly progressing without flooding the iframe with messages.
        const now = Date.now();
        if (!lastArtworkProgress || now - lastArtworkProgress >= 75) {
          lastArtworkProgress = now;
          report("progress", {
            progress:
              15 +
              Math.round((completed / Math.max(1, pkg.assets.length)) * 75),
            label: `Rendering artwork · ${completed} of ${pkg.assets.length} references ready`,
          });
        }
        const isRoot =
          !!asset.renderMode || selected.some((n) => n.id === node.id);
        const sourceDesign = designsById.get(node.id)!;
        const context = artworkRenderContext(
          sourceDesign,
          options.layerOverrides,
          consumedArtwork,
          asset.renderMode,
        );
        const key = `${node.id}:${isRoot}:${options.imageScale}:${context}:${asset.renderMode ?? "subtree"}`;
        const previous = pendingCache.get(key) ?? imageCache.get(key);
        const imageSignature =
          asset.renderMode === "fills" || asset.renderMode === "blend"
            ? JSON.stringify([
                sourceDesign.width,
                sourceDesign.height,
                sourceDesign.radius,
                sourceDesign.corners,
                sourceDesign.cornerSmoothing,
                "fills" in node ? node.fills : [],
                asset.backdrop,
              ])
            : imageSignatures.get(node.id)!;
        const processedKey =
          asset.processing || asset.scrollbarSlice ? `${key}:${asset.id}` : key;
        const processed =
          pendingCache.get(processedKey) ?? imageCache.get(processedKey);
        let rendered =
          processed?.signature === imageSignature ? processed : undefined;
        if (!rendered) {
          let originalJob = originalRenders.get(key);
          if (!originalJob) {
            const render = () =>
              rasterize(
                node as SceneNode,
                isRoot,
                options.imageScale,
                options,
                sourceDesign.transform,
                asset.renderMode,
                asset.backdrop,
                () => {
                  if (task !== requestId || closed)
                    throw new Error("Export cancelled.");
                },
              );
            if (previous?.signature === imageSignature)
              originalJob = Promise.resolve(previous);
            else {
              const sharedKey = vectorRenderKey(
                node as SceneNode,
                sourceDesign,
                isRoot,
                asset.renderMode,
              );
              if (sharedKey) {
                let sharedJob = sharedVectorJobs.get(sharedKey);
                if (!sharedJob) {
                  const cached = sharedVectors.get(sharedKey);
                  sharedJob = cached
                    ? Promise.resolve(cached)
                    : render().then((original) => {
                        const local = {
                          bytes: original.bytes,
                          bounds: {
                            ...original.bounds,
                            x: original.bounds.x - sourceDesign.transform[0][2],
                            y: original.bounds.y - sourceDesign.transform[1][2],
                          },
                        };
                        sharedVectors.set(sharedKey, local);
                        return local;
                      });
                  sharedVectorJobs.set(sharedKey, sharedJob);
                }
                const job = sharedJob;
                originalJob = job.then((local) => {
                  if (sharedVectorJobs.get(sharedKey) === job)
                    sharedVectorJobs.delete(sharedKey);
                  return {
                    bytes: local.bytes,
                    bounds: {
                      ...local.bounds,
                      x: local.bounds.x + sourceDesign.transform[0][2],
                      y: local.bounds.y + sourceDesign.transform[1][2],
                    },
                  };
                });
              } else originalJob = render();
            }
            originalRenders.set(key, originalJob);
          }
          const original = await originalJob;
          if (originalRenders.get(key) === originalJob)
            originalRenders.delete(key);
          pendingCache.set(key, { ...original, signature: imageSignature });
          rendered = {
            ...original,
            bytes: await prepareArtwork(original.bytes, asset),
            signature: imageSignature,
          };
        }
        pendingCache.set(processedKey, {
          ...rendered,
          signature: imageSignature,
        });
        let pooled = pooledArtwork.get(rendered.bytes);
        if (!pooled) {
          pooled = artworkPool.add(rendered.bytes);
          pooledArtwork.set(rendered.bytes, pooled);
        }
        assets[asset.id] = pooled;
        const design = designsById.get(node.id)!;
        if (asset.renderMode === "fills" || asset.renderMode === "blend")
          design.decorationBounds = rendered.bounds;
        else if (asset.renderMode === "shadow")
          design.effectBounds = rendered.bounds;
        else design.rasterBounds = rendered.bounds;
        completed++;
      });
      // Two exports overlap without allowing large selections to flood Figma's renderer.
      await mapConcurrent([...assetJobs, ...previewJobs], 2, (job) => job());
      report("progress", { progress: 90, label: "Preparing your Studio UI…" });
      if (pkg.assets.length) pkg = compile(designs, sourceId, options);
      for (const asset of pkg.assets)
        asset.pixelSize = pngPixelSize(assets[asset.id]);
      pkg.issues.push(...imageScalingIssues(pkg));
      if (omittedPreviews)
        pkg.issues.push({
          severity: "warning",
          code: "preview-limit",
          nodeId: selected[0].id,
          nodeName: selected[0].name,
          message: `${omittedPreviews} source previews were omitted to keep the plugin responsive. Artwork and native UI are still exported.`,
        });
      const verifySnapshot = () => {
        if (task !== requestId || closed) throw new Error("Export cancelled.");
        if (
          (rootIds ? syncRevision : revision) !== startRevision ||
          JSON.stringify(selected.map((n) => snapshot(n))) !== signature
        )
          throw new Error(
            "The selection changed while analyzing. Review the current selection again.",
          );
      };
      verifySnapshot();
      if (preferencesSignature !== savedPreferencesSignature) {
        savedPreferencesSignature = undefined;
        await figma.clientStorage.setAsync("framebridge-options", preferences);
        // Track the actual device write even if its analysis is then cancelled,
        // so returning to earlier preferences still restores them on disk.
        savedPreferencesSignature = preferencesSignature;
        // Cancel, close, or a source edit can happen while the device write yields.
        verifySnapshot();
      }
      // Commit caches only for a verified snapshot. A cancelled render cannot poison
      // an earlier design's cache when the user later undoes an edit.
      for (const key of Object.keys(sourcePreviews))
        if (!rootSignatures.has(key)) delete sourcePreviews[key];
      for (const [id, data] of Object.entries(previews))
        sourcePreviews[id] = { signature: rootSignatures.get(id)!, data };
      for (const [key, entry] of pendingCache.entries())
        imageCache.set(key, entry);
      if (
        figma.root.getPluginData("framebridge-layer-overrides") !==
        overridesJson
      )
        figma.root.setPluginData("framebridge-layer-overrides", overridesJson);
      const result: AnalysisResult = {
        package: pkg,
        previews,
        assets,
        revision,
        designs,
      };
      if (libraryCommand)
        for (const node of selected)
          node.setRelaunchData({
            [libraryCommand]: "Convert with Framebridge",
          });
      lastAnalysis =
        artworkPool.usage().bytes <= 4 * 1024 * 1024 &&
        signature.length <= 4 * 1024 * 1024 &&
        optionsSignature.length <= 4 * 1024 * 1024 &&
        previewBytes <= 4 * 1024 * 1024
          ? { signature, options: optionsSignature, sourceId, result }
          : undefined;
      report("result", { result });
    } catch (e) {
      report("error", { message: e instanceof Error ? e.message : String(e) });
    } finally {
      imagePreparation.cancel();
      busy = false;
      activeNodes = [];
      activeJobId = undefined;
      report("idle");
    }
  }
  const cloudStorage = createCloudStorage(figma.clientStorage);
  const connectionStorage = createConnectionStorage(figma.clientStorage);
  const robloxAccountStorage = createRobloxAccountStorage(figma.clientStorage);
  const appearanceStorage = createAppearanceStorage(figma.clientStorage);
  const onboardingStorage = createOnboardingStorage(figma.clientStorage);
  let resizedByUser = false;
  let catalogSave = Promise.resolve();
  let reviewSave = Promise.resolve();
  let artworkSave = Promise.resolve();
  let handoffSave = Promise.resolve();
  let feedbackSave = Promise.resolve();
  let windowSave = Promise.resolve();
  let sidebarSave = Promise.resolve();
  figma.ui.onmessage = async (message: {
    type: string;
    topic?: unknown;
    options?: ExportOptions;
    id?: string;
    ids?: unknown;
    cloud?: unknown;
    catalog?: unknown;
    reviewPreferences?: unknown;
    syncSettings?: unknown;
    artworkAccess?: unknown;
    artwork?: unknown;
    handoffs?: unknown;
    feedback?: unknown;
    connection?: unknown;
    accountSettings?: unknown;
    authorizationUrl?: unknown;
    origin?: string;
    revision?: number;
    width?: number;
    height?: number;
    persist?: boolean;
    layout?: unknown;
    theme?: unknown;
    onboarding?: unknown;
    rootIds?: string[];
    jobId?: string;
    imagePreparation?: unknown;
    preparationId?: number;
    png?: unknown;
    unchanged?: unknown;
    error?: unknown;
  }) => {
    if (imagePreparation.receive(message)) return;
    if (message.type === "open-documentation") {
      const url = documentationUrl(message.topic);
      if (url) {
        try {
          figma.openExternal(url);
        } catch {
          send("error", {
            message: "Could not open the guides. Visit framebridge.terradream.games/#docs in your browser.",
          });
        }
      }
      return;
    }
    if (message.type === "import-artwork") {
      try {
        if (busy || closed || figma.editorType !== "figma")
          throw new Error(
            "Wait for the current operation, then import this PNG in Figma Design.",
          );
        const imported = importArtwork(figma, message.artwork);
        send("artwork-import-response", {
          revision: message.revision,
          imported,
        });
        figma.notify(
          `Imported ${imported.name}. Review it before uploading to Roblox.`,
        );
      } catch (error) {
        send("artwork-import-response", {
          revision: message.revision,
          error: error instanceof Error ? error.message : "PNG import failed.",
        });
      }
      return;
    }
    if (
      (message.type === "load-artwork-access" ||
        message.type === "save-artwork-access") &&
      !libraryCommand
    ) {
      try {
        if (message.type === "save-artwork-access") {
          const value =
            message.artworkAccess === null
              ? null
              : readArtworkAccess(message.artworkAccess);
          if (value === undefined)
            throw new Error("Invalid private artwork access.");
          const write = artworkSave.then(() =>
            figma.clientStorage.setAsync(ARTWORK_ACCESS_KEY, value),
          );
          artworkSave = write.catch(() => {});
          await write;
          send("artwork-access-response", {
            revision: message.revision,
            artworkAccess: value,
          });
        } else {
          await artworkSave;
          send("artwork-access-response", {
            revision: message.revision,
            artworkAccess:
              readArtworkAccess(
                await figma.clientStorage.getAsync(ARTWORK_ACCESS_KEY),
              ) ?? null,
          });
        }
      } catch {
        send("artwork-access-response", {
          revision: message.revision,
          error: "Artwork access could not be stored or read.",
        });
      }
      return;
    }
    if (
      [
        "load-roblox-account",
        "save-roblox-account",
        "open-roblox-authorization",
      ].includes(message.type) &&
      !libraryCommand
    ) {
      try {
        let accountSettings: unknown;
        if (message.type === "load-roblox-account")
          accountSettings = await robloxAccountStorage.load();
        else if (message.type === "save-roblox-account")
          await robloxAccountStorage.save(message.accountSettings);
        else {
          const saved = await robloxAccountStorage.load();
          if (
            saved?.origin !== message.origin ||
            saved?.pending?.authorizationUrl !== message.authorizationUrl ||
            !robloxAuthorizationUrl(
              message.authorizationUrl,
              message.origin ?? "",
              saved?.pending?.callbackOrigin ?? message.origin ?? "",
            )
          )
            throw new Error("Invalid Roblox authorization link.");
          figma.openExternal(message.authorizationUrl);
        }
        send("roblox-account-response", {
          revision: message.revision,
          accountSettings,
        });
      } catch {
        send("roblox-account-response", {
          revision: message.revision,
          error:
            message.type === "open-roblox-authorization"
              ? "Could not open Roblox authorization."
              : "Roblox connection storage failed.",
        });
      }
      return;
    }
    if (message.type === "watch-sync") {
      const sequence = ++watchSequence;
      syncRoots = [];
      syncRevision++;
      if (!message.rootIds?.length) return;
      try {
        if (libraryCommand || message.rootIds.length > 100)
          throw new Error("Automatic sync is unavailable in this build.");
        const nodes: SceneNode[] = [];
        for (const id of message.rootIds) {
          const node = await figma.getNodeByIdAsync(id);
          if (
            !node ||
            !("exportAsync" in node) ||
            !ancestor(node, figma.currentPage)
          )
            throw new Error(
              "The linked frames are unavailable on this page. Send the design again.",
            );
          nodes.push(node as SceneNode);
        }
        if (sequence !== watchSequence) return;
        syncRoots = nodes;
        syncMembers = members(nodes);
        syncSignature = sourceSignature(nodes);
      } catch (error) {
        if (sequence === watchSequence)
          send("sync-target-unavailable", {
            message:
              error instanceof Error
                ? error.message
                : "Cannot watch the linked frames.",
          });
      }
      return;
    }
    if (message.type === "resize") {
      const size = windowSize(message);
      if (!size) return;
      resizedByUser = true;
      resizeWindow(size);
      if (message.persist === true) {
        // Serialize completed gestures so an older async write cannot win.
        windowSave = windowSave
          .then(() => figma.clientStorage.setAsync(WINDOW_SIZE_KEY, size))
          .catch(() => {});
        await windowSave;
      }
      return;
    }
    if (
      message.type === "load-plugin-appearance" ||
      message.type === "save-plugin-appearance"
    ) {
      const action =
        message.type === "load-plugin-appearance" ? "load" : "save";
      try {
        if (action === "load")
          send("plugin-appearance", {
            theme: await appearanceStorage.load(),
            revision: message.revision,
          });
        else {
          await appearanceStorage.save(message.theme);
          send("plugin-appearance-saved", { revision: message.revision });
        }
      } catch {
        send("plugin-appearance-error", { action, revision: message.revision });
      }
      return;
    }
    if (
      message.type === "load-onboarding" ||
      message.type === "save-onboarding"
    ) {
      const action = message.type === "load-onboarding" ? "load" : "save";
      try {
        if (action === "load")
          send("onboarding", {
            onboarding: await onboardingStorage.load(),
            revision: message.revision,
          });
        else {
          await onboardingStorage.save(message.onboarding);
          send("onboarding-saved", { revision: message.revision });
        }
      } catch {
        send("onboarding-error", { action, revision: message.revision });
      }
      return;
    }
    if (message.type === "load-sidebar-layout") {
      await sidebarSave;
      try {
        send("sidebar-layout", {
          layout:
            readSidebarLayout(
              await figma.clientStorage.getAsync(SIDEBAR_LAYOUT_KEY),
            ) ?? {},
          revision: message.revision,
        });
      } catch {
        send("sidebar-layout", { layout: {}, revision: message.revision });
      }
      return;
    }
    if (message.type === "save-sidebar-layout") {
      const layout = readSidebarLayout(message.layout);
      if (!layout) return;
      sidebarSave = sidebarSave
        .then(() => figma.clientStorage.setAsync(SIDEBAR_LAYOUT_KEY, layout))
        .catch(() => {});
      await sidebarSave;
      return;
    }
    if (
      ["load-studio-connection", "save-studio-connection"].includes(
        message.type,
      ) &&
      !libraryCommand
    ) {
      try {
        if (message.type === "load-studio-connection") {
          send("studio-connection", {
            connection: await connectionStorage.load(),
            revision: message.revision,
          });
        } else {
          await connectionStorage.save(message.connection);
          send("studio-connection-saved", { revision: message.revision });
        }
      } catch {
        send("studio-connection-storage-error", { revision: message.revision });
      }
      return;
    }
    if (
      (message.type === "load-feedback" || message.type === "save-feedback") &&
      !libraryCommand
    ) {
      try {
        if (message.type === "save-feedback") {
          const feedback = readFeedbackRecords(message.feedback);
          const write = feedbackSave.then(() =>
            figma.clientStorage.setAsync(FEEDBACK_STORAGE_KEY, feedback),
          );
          feedbackSave = write.catch(() => {});
          await write;
          send("feedback-response", { revision: message.revision, feedback });
        } else {
          await feedbackSave;
          send("feedback-response", {
            revision: message.revision,
            feedback: readFeedbackRecords(
              await figma.clientStorage.getAsync(FEEDBACK_STORAGE_KEY),
            ),
          });
        }
      } catch {
        send("feedback-response", {
          revision: message.revision,
          error: "Saved reports could not be stored or read.",
        });
      }
      return;
    }
    if (
      (message.type === "load-handoffs" || message.type === "save-handoffs") &&
      !libraryCommand
    ) {
      try {
        if (message.type === "save-handoffs") {
          const handoffs = readHandoffs(message.handoffs);
          const write = handoffSave.then(() =>
            figma.clientStorage.setAsync(HANDOFF_STORAGE_KEY, handoffs),
          );
          handoffSave = write.catch(() => {});
          await write;
          send("handoffs-response", { revision: message.revision, handoffs });
        } else {
          await handoffSave;
          send("handoffs-response", {
            revision: message.revision,
            handoffs: readHandoffs(
              await figma.clientStorage.getAsync(HANDOFF_STORAGE_KEY),
            ),
          });
        }
      } catch {
        send("handoffs-response", {
          revision: message.revision,
          error: "Saved design codes could not be stored or read.",
        });
      }
      return;
    }
    if (
      (message.type === "load-review-sync" ||
        message.type === "save-review-sync") &&
      !libraryCommand
    ) {
      try {
        if (message.type === "save-review-sync") {
          const value =
            message.syncSettings === null
              ? null
              : readSavedReviewSync(message.syncSettings);
          if (value === undefined)
            throw new Error("Invalid preference sync settings.");
          const write = reviewSave.then(() =>
            figma.clientStorage.setAsync(REVIEW_SYNC_KEY, value),
          );
          reviewSave = write.catch(() => {});
          await write;
          send("review-sync-response", {
            revision: message.revision,
            syncSettings: value,
          });
        } else {
          await reviewSave;
          send("review-sync-response", {
            revision: message.revision,
            syncSettings:
              readSavedReviewSync(
                await figma.clientStorage.getAsync(REVIEW_SYNC_KEY),
              ) ?? null,
          });
        }
      } catch {
        send("review-sync-response", {
          revision: message.revision,
          error: "Preference sync settings could not be stored or read.",
        });
      }
      return;
    }
    if (
      message.type === "load-review-preferences" ||
      message.type === "save-review-preferences"
    ) {
      try {
        if (message.type === "save-review-preferences") {
          const preferences = readReviewPreferences(message.reviewPreferences);
          const write = reviewSave.then(() =>
            figma.clientStorage.setAsync(REVIEW_PREFERENCES_KEY, preferences),
          );
          reviewSave = write.catch(() => {});
          await write;
          send("review-preferences-response", {
            revision: message.revision,
            preferences,
          });
        } else {
          await reviewSave;
          send("review-preferences-response", {
            revision: message.revision,
            preferences: readReviewPreferences(
              await figma.clientStorage.getAsync(REVIEW_PREFERENCES_KEY),
            ),
          });
        }
      } catch {
        send("review-preferences-response", {
          revision: message.revision,
          error: "Saved review choices could not be stored or read.",
        });
      }
      return;
    }
    if (
      message.type === "load-asset-catalog" ||
      message.type === "save-asset-catalog"
    ) {
      try {
        if (message.type === "load-asset-catalog") {
          await catalogSave;
          send("asset-catalog-response", {
            catalog: readCatalog(
              await figma.clientStorage.getAsync(ASSET_CATALOG_KEY),
            ),
            revision: message.revision,
          });
        } else {
          const records = readCatalog(message.catalog);
          const write = catalogSave.then(() =>
            figma.clientStorage.setAsync(ASSET_CATALOG_KEY, records),
          );
          catalogSave = write.catch(() => {});
          await write;
          send("asset-catalog-response", { revision: message.revision });
        }
      } catch {
        send("asset-catalog-response", {
          error: "Image library storage failed.",
          revision: message.revision,
        });
      }
      return;
    }
    if (message.type === "load-cloud-settings" && !libraryCommand) {
      try {
        const cloud = await cloudStorage.load();
        send("cloud-settings", { cloud, revision: message.revision });
      } catch {
        send("cloud-storage-error", {
          action: "load",
          revision: message.revision,
        });
      }
    }
    if (message.type === "save-cloud-settings" && !libraryCommand) {
      try {
        await cloudStorage.save(message.cloud);
        send("cloud-settings-saved", { revision: message.revision });
      } catch {
        send("cloud-storage-error", {
          action: "save",
          revision: message.revision,
        });
      }
    }
    if (
      message.type === "create-layout-examples" ||
      message.type === "create-control-examples" ||
      message.type === "create-artwork-examples"
    ) {
      if (busy) return;
      busy = true;
      send("progress", {
        progress: 0,
        label:
          message.type === "create-artwork-examples"
            ? "Creating editable artwork examples…"
            : message.type === "create-control-examples"
              ? "Creating editable control examples…"
              : "Creating editable layout examples…",
      });
      try {
        const create =
          message.type === "create-artwork-examples"
            ? createArtworkExamples
            : message.type === "create-control-examples"
              ? createControlExamples
              : createLayoutExamples;
        const created = await create(message.options);
        revision++;
        announce();
        send("examples-created", created);
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        busy = false;
        send("idle");
      }
      return;
    }
    if (message.type === "ready") {
      imagePreparation.configure(message.imagePreparation);
      try {
        const size = windowSize(
          await figma.clientStorage.getAsync(WINDOW_SIZE_KEY),
        );
        if (size && !resizedByUser) resizeWindow(size);
      } catch {
        /* Keep the default window when local storage is unavailable. */
      }
      const saved = await figma.clientStorage.getAsync("framebridge-options");
      let layerOverrides = {};
      try {
        layerOverrides = JSON.parse(
          figma.root.getPluginData("framebridge-layer-overrides") || "{}",
        );
      } catch {
        /* Ignore an unreadable older profile. */
      }
      send("settings", {
        options: { ...DEFAULT_FIGMA_OPTIONS, ...saved, layerOverrides },
      });
      announce();
    }
    if (message.type === "analyze")
      void analyze(
        { ...DEFAULT_FIGMA_OPTIONS, ...message.options },
        message.rootIds,
        message.jobId,
      );
    if (message.type === "cancel") {
      if (!message.jobId || message.jobId === activeJobId) {
        requestId++;
        imagePreparation.cancel();
      }
    }
    if (message.type === "focus" && message.id) {
      const node = await figma.getNodeByIdAsync(message.id);
      if (node && "width" in node)
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    }
    if (message.type === "select-rule-layers") {
      const token = ++ruleSelectionId,
        request = requestId,
        sourceRevision = revision;
      try {
        const count = await selectRuleLayers(
          figma,
          message.ids,
          () =>
            closed ||
            ruleSelectionId !== token ||
            requestId !== request ||
            revision !== sourceRevision,
        );
        figma.notify(`Selected ${count} matching layers.`);
      } catch (error) {
        figma.notify(error instanceof Error ? error.message : String(error), {
          error: true,
        });
      }
    }
    if (message.type === "close") {
      await onboardingStorage.flush();
      await appearanceStorage.flush();
      await windowSave;
      await sidebarSave;
      await catalogSave;
      await reviewSave;
      await artworkSave;
      await handoffSave;
      await feedbackSave;
      await cloudStorage.flush();
      await connectionStorage.flush();
      await robloxAccountStorage.flush();
      figma.closePlugin();
    }
  };
}
