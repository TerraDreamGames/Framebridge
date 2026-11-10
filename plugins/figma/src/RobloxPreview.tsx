import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { SelectControl } from "./components/SelectControl";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { Popover } from "radix-ui";
import { createPortal } from "react-dom";
import {
  Play,
  Square,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from "./components/Glyph";
import { themeProperties } from "../../../packages/core/src/theme-tokens";
import { hasParticles } from "../../../packages/core/src/particles";
import {
  nativeFontEmSize,
  nativeTextSize,
  richTextSize,
} from "../../../packages/core/src/font-size-metrics";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  AnalysisResult,
  RbxNode,
  Value,
} from "../../../packages/core/src/types";
import {
  previewFlow,
  previewConstrainedSize,
  previewScrollSize,
} from "./preview-layout";
import { textureSize } from "../../../packages/core/src/image-scaling";
import { ImageArtwork } from "./ImageArtwork";
import { PreviewSelectionOverlay } from "./PreviewSelectionOverlay";
import {
  parsePreviewRichText,
  previewFontFamily,
  previewFontWeight,
  previewRichRunStyle,
} from "./rich-text-preview";
import { mountPreviewUI } from "./preview-interactions";
import { previewTextDecoration } from "./text-decoration-preview";
import {
  conditionalInputs,
  type RuleData,
  type RuleScalar,
} from "../../../packages/core/src/conditional-rules";
import { motionSlotContent } from "./layer-entries";
import { DevicePreviewControls } from "./DevicePreviewControls";
import {
  previewViewportSize,
  previewArtworkFrame,
  previewCamera,
  type PreviewFrame,
  type PreviewViewport,
} from "./preview-viewport";
const arr = (v: Value | undefined) =>
  v && typeof v === "object" && "value" in v ? (v.value as number[]) : [];
const rgba = (v: Value | undefined, alpha = 1) => {
  const c = arr(v);
  return `rgba(${c[0] * 255 || 0},${c[1] * 255 || 0},${c[2] * 255 || 0},${alpha})`;
};
const enumName = (v: Value | undefined, fallback: string) =>
  v && typeof v === "object" && v.type === "Enum" ? v.value[1] : fallback;
function png(bytes: number[]) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.slice(i, i + 8192));
  return "data:image/png;base64," + btoa(binary);
}
export function RobloxPreview({
  result,
  active,
  selected,
  onSelect,
  zoom,
  viewportChoice,
  toolbarHost,
  onViewportChange,
}: {
  result: AnalysisResult;
  active: string;
  selected: string;
  onSelect: (id: string) => void;
  zoom: number;
  viewportChoice: PreviewViewport;
  toolbarHost?: HTMLElement | null;
  onViewportChange?: (choice: PreviewViewport) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const ruleController = useRef<ReturnType<typeof mountPreviewUI> | undefined>(
    undefined,
  );
  const [sampleData, setSampleData] = useState<RuleData>({});
  const viewport = useRef<HTMLDivElement>(null);
  const [testing, setTesting] = useState(false),
    [reduced, setReduced] = useState(
      () =>
        (typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ??
        false,
    ),
    [restart, setRestart] = useState(0),
    [theme, setTheme] = useState("");
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const [size, setSize] = useState<[number, number]>([400, 400]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize([entry.contentRect.width, entry.contentRect.height]),
    );
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const authoredRoot =
    result.package.roots.find((n) => n.id === `screen:${active}`) ??
    result.package.roots[0];
  const root = useMemo(() => {
    if (!authoredRoot?.themes) return authoredRoot;
    const out = JSON.parse(JSON.stringify(authoredRoot)) as RbxNode;
    const mode = out.themes!.modes[theme] ? theme : out.themes!.initial;
    out.themes!.initial = mode;
    const apply = (n: RbxNode) => {
      Object.assign(n.properties, themeProperties(n, out.themes!, mode));
      n.children.forEach(apply);
    };
    apply(out);
    return out;
  }, [authoredRoot, theme]);
  useEffect(() => {
    if (testing && host.current && root) {
      const controller = mountPreviewUI(
        host.current,
        root,
        () => reducedRef.current,
      );
      ruleController.current = controller;
      return () => {
        controller();
        ruleController.current = undefined;
      };
    }
  }, [testing, restart, root]);
  const authored: [number, number] = root?.referenceSize ?? [400, 300];
  const [width, height] =
    root?.className === "ScreenGui"
      ? previewViewportSize(viewportChoice, authored)
      : authored;
  useEffect(() => {
    ruleController.current?.setData({
      ...sampleData,
      viewport: { width, height },
    });
  }, [sampleData, width, height, testing, restart, root]);
  const inputs = root
    ? conditionalInputs(root).filter((p) => p.source !== "viewport")
    : [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    setUrls(
      Object.fromEntries(
        Object.entries(result.assets).map(([id, bytes]) => [id, png(bytes)]),
      ),
    );
  }, [result.assets]);
  const coordinateBoxes = new Map<
    string,
    { x: number; y: number; w: number; h: number; scale: number }
  >();
  const hiddenCaptures = new Set<string>();
  const artworkBoxes: PreviewFrame[] = [];
  const artworkRoots = new Set(root?.children);
  let selectedTarget = selected;
  function draw(
    node: RbxNode,
    pw: number,
    ph: number,
    forced?: { x: number; y: number; w?: number; h?: number },
    ownsPosition = false,
    parentBox = { x: 0, y: 0, scale: 1 },
    parentStyleSize: readonly number[] = [pw, ph],
  ): React.ReactNode {
    if (node.className.startsWith("UI") || node.className === "ScreenGui")
      return null;
    const p = node.properties;
    const scrolls =
      node.className === "ScrollingFrame" && p.ScrollingEnabled !== false;
    const scrollDirection = enumName(p.ScrollingDirection, "XY");
    if (p.Visible === false && !testing) return null;
    const position = arr(p.Position),
      anchor = arr(p.AnchorPoint);
    const basis = node.maskBasis && coordinateBoxes.get(node.maskBasis);
    if (basis)
      forced = {
        x: (basis.x - parentBox.x) / parentBox.scale,
        y: (basis.y - parentBox.y) / parentBox.scale,
        w: basis.w,
        h: basis.h,
      };
    const [w, h] = previewConstrainedSize(node, pw, ph, forced).size;
    const localScale = basis
      ? basis.scale / parentBox.scale
      : Number(
          node.children.find((n) => n.className === "UIScale")?.properties
            .Scale ?? 1,
        );
    const stroke = node.children.find((n) => n.className === "UIStroke");
    const isText = node.className.startsWith("Text");
    const textLimits = node.children.find(
      (n) => n.className === "UITextSizeConstraint",
    );
    const font =
      p.FontFace && typeof p.FontFace === "object" && p.FontFace.type === "Font"
        ? p.FontFace
        : undefined;
    const richText = p.RichText
      ? parsePreviewRichText(
          String(p.Text ?? ""),
          font,
          nativeTextSize(Number(p.TextSize ?? 16)).value,
        )
      : undefined;
    const textContent = richText?.plainText ?? String(p.Text ?? "");
    const emAt100 = nativeFontEmSize(100, font);
    // The browser fit is an em estimate; Roblox constraints limit native line
    // height. Convert before limiting, then invert for CSS below.
    const requestedTextSize = p.TextScaled
      ? Math.min(h * 0.7, (w / Math.max(1, textContent.length)) * 1.5) *
        (emAt100 === undefined ? 1 : 100 / emAt100)
      : Number(p.TextSize ?? 16);
    const renderedTextSize = nativeTextSize(
      p.TextScaled
        ? Math.min(
            Number(textLimits?.properties.MaxTextSize ?? 100),
            Math.max(
              Number(textLimits?.properties.MinTextSize ?? 1),
              requestedTextSize,
            ),
          )
        : requestedTextSize,
    ).value;
    const renderedEmSize = nativeFontEmSize(renderedTextSize, font);
    const textOutline =
      isText &&
      enumName(stroke?.properties.ApplyStrokeMode, "Contextual") ===
        "Contextual";
    const strokeWidth =
      Number(stroke?.properties.Thickness ?? 1) *
      (enumName(stroke?.properties.StrokeSizingMode, "FixedSize") ===
      "ScaledSize"
        ? textOutline
          ? renderedTextSize
          : Math.min(w, h)
        : 1);
    const cornerNode = node.children.find((n) => n.className === "UICorner");
    const radius = (key: string) => {
      const value = arr(
        cornerNode?.properties[key] ?? cornerNode?.properties.CornerRadius,
      );
      return Math.min(
        Math.min(w, h) / 2,
        (value[0] ?? 0) * Math.min(w, h) + (value[1] ?? 0),
      );
    };
    const shadows = node.children
      .filter(
        (n) => n.className === "UIShadow" && n.properties.Enabled !== false,
      )
      .map((n) => {
        const offset = arr(n.properties.Offset),
          spread = arr(n.properties.Spread),
          blur = arr(n.properties.BlurRadius);
        return `${(offset[0] ?? 0) * w + (offset[1] ?? 0)}px ${(offset[2] ?? 0) * h + (offset[3] ?? 0)}px ${(blur[0] ?? 0) * Math.min(w, h) + (blur[1] ?? 0)}px ${(spread[0] ?? 0) * w + (spread[1] ?? 0)}px ${rgba(n.properties.Color, 1 - Number(n.properties.Transparency ?? 0))}`;
      });
    if (stroke && !textOutline)
      shadows.push(
        `inset 0 0 0 ${strokeWidth}px ${rgba(stroke.properties.Color, 1 - Number(stroke.properties.Transparency ?? 0))}`,
      );
    const style: CSSProperties = {
      pointerEvents: node.decorationRect ? "none" : undefined,
      position: "absolute",
      display: p.Visible === false ? "none" : undefined,
      left:
        (forced?.x ?? (position[0] ?? 0) * pw + (position[1] ?? 0)) -
        (ownsPosition ? 0 : (anchor[0] ?? 0)) * w,
      top:
        (forced?.y ?? (position[2] ?? 0) * ph + (position[3] ?? 0)) -
        (ownsPosition ? 0 : (anchor[1] ?? 0)) * h,
      width: w,
      height: h,
      background: rgba(
        p.BackgroundColor3,
        1 - Number(p.BackgroundTransparency ?? 1),
      ),
      borderRadius: `${radius("TopLeftRadius")}px ${radius("TopRightRadius")}px ${radius("BottomRightRadius")}px ${radius("BottomLeftRadius")}px`,
      transform: `${localScale !== 1 ? `translate(${((anchor[0] ?? 0) - 0.5) * w * (1 - localScale)}px,${((anchor[1] ?? 0) - 0.5) * h * (1 - localScale)}px) ` : ""}scale(${localScale}) rotate(${Number(p.Rotation ?? 0)}deg)`,
      transformOrigin: "50% 50%",
      // Clearing overflow longhands can also clear the shorthand clip in React.
      ...(scrolls
        ? {
            overflowX: scrollDirection === "Y" ? "hidden" : "auto",
            overflowY: scrollDirection === "X" ? "hidden" : "auto",
          }
        : {
            overflow:
              p.ClipsDescendants || node.className === "CanvasGroup"
                ? "hidden"
                : "visible",
          }),
      opacity:
        node.className === "CanvasGroup"
          ? 1 - Number(p.GroupTransparency ?? 0)
          : 1,
      zIndex: Number(p.ZIndex ?? 1),
      boxShadow: shadows.join(", ") || undefined,
    };
    const flow = previewFlow(
      node,
      w,
      h,
      pw,
      ph,
      parentStyleSize[0],
      parentStyleSize[1],
    );
    const nodeBox = {
      x:
        parentBox.x +
        (Number(style.left) + (anchor[0] ?? 0) * w * (1 - localScale)) *
          parentBox.scale,
      y:
        parentBox.y +
        (Number(style.top) + (anchor[1] ?? 0) * h * (1 - localScale)) *
          parentBox.scale,
      scale: parentBox.scale * localScale,
    };
    if (artworkRoots.has(node) && p.Visible !== false && !node.decorationRect) {
      const bw = w * nodeBox.scale,
        bh = h * nodeBox.scale;
      const ax = bw / 2,
        ay = bh / 2;
      const angle = (Number(p.Rotation ?? 0) * Math.PI) / 180;
      const points = [
        [0, 0],
        [bw, 0],
        [bw, bh],
        [0, bh],
      ].map(([x, y]) => [
        nodeBox.x +
          ax +
          (x - ax) * Math.cos(angle) -
          (y - ay) * Math.sin(angle),
        nodeBox.y +
          ay +
          (x - ax) * Math.sin(angle) +
          (y - ay) * Math.cos(angle),
      ]);
      const x = Math.min(...points.map((p) => p[0])),
        y = Math.min(...points.map((p) => p[1]));
      artworkBoxes.push({
        x,
        y,
        w: Math.max(...points.map((p) => p[0])) - x,
        h: Math.max(...points.map((p) => p[1])) - y,
      });
    }
    coordinateBoxes.set(node.id, {
      ...nodeBox,
      x: nodeBox.x + flow.left * nodeBox.scale,
      y: nodeBox.y + flow.top * nodeBox.scale,
      w: flow.width,
      h: flow.height,
    });
    const scrollCanvas =
      node.className === "ScrollingFrame"
        ? previewScrollSize(node, w, h, flow.boxes, pw, ph)
        : undefined;
    const asset = result.package.assets.find(
      (asset) => asset.id === node.assetRef,
    );
    const textStroke =
      stroke && textOutline
        ? `${strokeWidth}px ${rgba(stroke.properties.Color, 1 - Number(stroke.properties.Transparency ?? 0))}`
        : undefined;
    const textDecoration = previewTextDecoration(
      node,
      p,
      [w, h],
      !!node.textDecoration?.captured &&
        !!urls[
          node.children.find(
            (child) => child.id === node.textDecoration?.captured,
          )?.assetRef ?? ""
        ],
    );
    if (node.textDecoration?.captured && !textDecoration.captured)
      hiddenCaptures.add(node.textDecoration.captured);
    if (
      node.children.some(
        (child) => child.id === selected && child.className.startsWith("UI"),
      )
    )
      selectedTarget = node.id;
    if (hiddenCaptures.has(node.id)) style.display = "none";
    return (
      <div
        key={node.id}
        style={style}
        data-preview-layer={node.id}
        data-preview-name={node.name}
        data-preview-resting={JSON.stringify({
          transform: style.transform,
          opacity: String(style.opacity ?? 1),
          background: style.background,
          display: style.display ?? "",
        })}
        title={testing ? node.name : undefined}
        onScroll={(event) => {
          const element = event.currentTarget;
          const decorations = Array.from(element.children).filter((child) =>
            node.children.some(
              (n) =>
                n.decorationRect &&
                n.id === child.getAttribute("data-preview-layer"),
            ),
          ) as HTMLElement[];
          for (const decoration of decorations)
            decoration.style.translate = `${element.scrollLeft}px ${element.scrollTop}px`;
        }}
        role={
          testing && node.className.endsWith("Button") ? "button" : undefined
        }
        tabIndex={testing && node.className.endsWith("Button") ? 0 : undefined}
        aria-label={
          testing && node.className.endsWith("Button") ? node.name : undefined
        }
        onClick={(e) => {
          e.stopPropagation();
          if (!testing)
            onSelect(
              node.sourceType === "MOTION_SLOT"
                ? (motionSlotContent(node)?.id ?? node.id)
                : node.maskBasis
                  ? node.id.replace(/\/mask-content$/, "")
                  : node.id,
            );
        }}
      >
        {node.className === "ViewportFrame" && (
          <div
            data-preview-viewport={node.id}
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              color: "var(--muted-foreground)",
              pointerEvents: "none",
            }}
          >
            3D scene · finish in Studio
          </div>
        )}
        {node.assetRef && urls[node.assetRef] && (
          <ImageArtwork
            url={urls[node.assetRef]}
            size={textureSize(asset, result.assets[node.assetRef])}
            width={w}
            height={h}
            properties={p}
            whiteMask={asset?.processing?.whiteMask}
            name={node.name}
            layerId={node.id}
          />
        )}
        {isText && (
          <div
            data-preview-text={node.id}
            data-preview-rich-text={
              richText
                ? richText.supported
                  ? "supported"
                  : "literal"
                : undefined
            }
            title={
              richText && !richText.supported
                ? "Unsupported or malformed RichText is shown literally."
                : undefined
            }
            data-preview-artwork-resting={JSON.stringify({
              color: rgba(p.TextColor3, 1 - Number(p.TextTransparency ?? 0)),
              "--preview-text-alpha": String(
                1 - Number(p.TextTransparency ?? 0),
              ),
            })}
            style={{
              ...({
                "--preview-text-alpha": String(
                  1 - Number(p.TextTransparency ?? 0),
                ),
              } as CSSProperties),
              ...(node.children.some(
                (child) =>
                  child.decorationRect && child.id === `${node.id}/effect`,
              )
                ? ({ position: "relative", zIndex: -2 } as CSSProperties)
                : {}),
              textShadow: textDecoration.shadow,
              width: "100%",
              height: "100%",
              display: "flex",
              justifyContent: {
                Left: "flex-start",
                Center: "center",
                Right: "flex-end",
              }[enumName(p.TextXAlignment, "Left")],
              alignItems: {
                Top: "flex-start",
                Center: "center",
                Bottom: "flex-end",
              }[enumName(p.TextYAlignment, "Top")],
              color: rgba(p.TextColor3, 1 - Number(p.TextTransparency ?? 0)),
              fontSize: renderedEmSize ?? renderedTextSize,
              fontFamily: previewFontFamily(font),
              fontWeight: previewFontWeight(font),
              fontStyle: font?.style === "Italic" ? "italic" : "normal",
              lineHeight:
                renderedEmSize === undefined
                  ? Number(p.LineHeight ?? 1) * 1.2
                  : `${renderedTextSize * Number(p.LineHeight ?? 1)}px`,
              whiteSpace: p.TextWrapped ? "pre-wrap" : "pre",
              textAlign: enumName(
                p.TextXAlignment,
                "Left",
              ).toLowerCase() as "left",
              WebkitTextStroke: textStroke,
              pointerEvents: "none",
            }}
          >
            <div
              data-preview-text-content
              style={{ minWidth: 0, width: p.TextWrapped ? "100%" : undefined }}
            >
              {richText?.supported && richText.plainText
                ? richText.runs.map((run, index) => (
                    <span
                      key={index}
                      data-preview-rich-run={index}
                      data-preview-rich-alpha={run.color ? run.alpha : 1}
                      style={{
                        ...previewRichRunStyle(
                          p.TextScaled
                            ? {
                                ...run,
                                size: richTextSize(
                                  (run.size * renderedTextSize) /
                                    nativeTextSize(Number(p.TextSize ?? 16))
                                      .value,
                                ).value,
                              }
                            : run,
                          Number(p.LineHeight ?? 1),
                        ),
                        textShadow: previewTextDecoration(
                          node,
                          p,
                          [w, h],
                          textDecoration.captured,
                          run.color ? run.alpha : 1,
                        ).shadow,
                      }}
                    >
                      {run.text}
                    </span>
                  ))
                : textContent || String(p.PlaceholderText ?? "")}
            </div>
          </div>
        )}
        {flow.children.map((child) =>
          draw(
            child,
            flow.width,
            flow.height,
            child.decorationRect
              ? {
                  x: child.decorationRect[0] * w,
                  y: child.decorationRect[1] * h,
                  w: child.decorationRect[2] * w,
                  h: child.decorationRect[3] * h,
                }
              : flow.ownsPosition
                ? flow.boxes.get(child.id)
                : flow.boxes.has(child.id)
                  ? {
                      x: flow.boxes.get(child.id)!.x,
                      y: flow.boxes.get(child.id)!.y,
                    }
                  : undefined,
            flow.ownsPosition,
            nodeBox,
            node.className === "ScrollingFrame"
              ? [w, h]
              : [flow.width, flow.height],
          ),
        )}
        {scrollCanvas && (
          <div
            aria-hidden="true"
            data-preview-scroll-canvas={`${scrollCanvas[0]}x${scrollCanvas[1]}`}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: scrollCanvas[0],
              height: scrollCanvas[1],
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    );
  }
  const rendered =
    root?.properties.Enabled !== false &&
    root?.children.map((node) => draw(node, width, height));
  if (selected === root?.id && root.className === "ScreenGui") {
    const frames = root.children.filter(
      (node) =>
        !node.className.startsWith("UI") && node.properties.Visible !== false,
    );
    if (frames.length === 1) selectedTarget = frames[0].id;
  }
  const focusArtwork =
    root?.className === "ScreenGui" &&
    viewportChoice.preset === "design" &&
    !viewportChoice.rotated;
  const frame = focusArtwork
    ? previewArtworkFrame(artworkBoxes, [width, height])
    : { x: 0, y: 0, w: width, h: height };
  const camera = previewCamera(size, frame, zoom);
  const testControls = (
    <div className="preview-test-controls">
      <Button
        type="button"
        variant={testing ? "secondary" : "default"}
        size="sm"
        className="preview-test-toggle"
        aria-pressed={testing}
        aria-label={testing ? "Stop test" : "Test UI"}
        title={
          testing
            ? "Stop UI simulation"
            : "Try buttons and interactions in this preview"
        }
        onClick={() => setTesting((value) => !value)}
      >
        {testing ? <Square size={13} /> : <Play size={13} />}
        <span>{testing ? "Stop test" : "Test UI"}</span>
      </Button>
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="preview-options-trigger"
            aria-label="Preview options"
            title="Preview options"
          >
            <SlidersHorizontal size={14} />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="preview-controls-popover"
            align="start"
            side="top"
            sideOffset={8}
            collisionPadding={12}
            aria-label="Preview options"
          >
            <strong>Preview options</strong>
            <p>
              {testing
                ? "Local simulation uses sample rules. Verify audio and live gameplay data in Studio."
                : "Approximate layout. Verify text and safe areas in Studio."}
            </p>
            {root?.themes && (
              <label className="preview-option-field">
                <span>Theme</span>
                <SelectControl
                  aria-label="Preview theme"
                  value={root.themes.initial}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  {Object.keys(root.themes.modes).map((mode) => (
                    <option key={mode}>{mode}</option>
                  ))}
                </SelectControl>
              </label>
            )}
            <label className="preview-motion-option">
              <span>Reduce motion</span>
              <Switch
                aria-label="Reduce motion"
                checked={reduced}
                onCheckedChange={setReduced}
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={!testing}
              onClick={() => setRestart((value) => value + 1)}
            >
              <RotateCcw size={14} /> Restart test
            </Button>
            {root && hasParticles([root]) && (
              <Button
                variant="outline"
                size="sm"
                disabled={!testing}
                onClick={() =>
                  host.current?.dispatchEvent(
                    new Event("framebridge-particles-preview-burst"),
                  )
                }
              >
                <Sparkles size={14} /> Preview burst
              </Button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
  return (
    <div ref={host} className="roblox-preview">
      {toolbarHost ? createPortal(testControls, toolbarHost) : testControls}
      <div className="roblox-preview-toolbar" data-floating={!!toolbarHost}>
        {!toolbarHost &&
          onViewportChange &&
          root?.className === "ScreenGui" && (
            <DevicePreviewControls
              choice={viewportChoice}
              authored={authored}
              onChange={onViewportChange}
            />
          )}
        {testing && inputs.length > 0 && (
          <Disclosure className="preview-rule-data" open>
            <DisclosureSummary>Sample rule data</DisclosureSummary>
            <p>
              Local samples only. Missing values use ELSE; Roblox reads your
              player data in Play. Image tint preview supports white masks.
            </p>
            {inputs.map((p) => {
              const source = p.source as "attribute" | "leaderstats";
              const value = sampleData[source]?.[p.key];
              const update = (next: RuleScalar | undefined) =>
                setSampleData((before) => {
                  const values = { ...before[source] };
                  if (next === undefined) delete values[p.key];
                  else values[p.key] = next;
                  return { ...before, [source]: values };
                });
              return (
                <label key={source + "/" + p.key}>
                  {source}.{p.key}
                  <SelectControl
                    aria-label={`Sample ${source}.${p.key} type`}
                    value={value === undefined ? "missing" : typeof value}
                    onChange={(e) =>
                      update(
                        e.target.value === "missing"
                          ? undefined
                          : e.target.value === "number"
                            ? 0
                            : e.target.value === "boolean"
                              ? true
                              : "",
                      )
                    }
                  >
                    <option value="missing">Missing</option>
                    <option value="number">Number</option>
                    <option value="string">Text</option>
                    <option value="boolean">Boolean</option>
                  </SelectControl>
                  {value !== undefined &&
                    (typeof value === "boolean" ? (
                      <SelectControl
                        aria-label={`Sample ${source}.${p.key} value`}
                        value={String(value)}
                        onChange={(e) => update(e.target.value === "true")}
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </SelectControl>
                    ) : (
                      <input
                        aria-label={`Sample ${source}.${p.key} value`}
                        type={typeof value === "number" ? "number" : "text"}
                        maxLength={4096}
                        value={value}
                        onChange={(e) => {
                          const v =
                            typeof value === "number"
                              ? Number(e.target.value)
                              : e.target.value;
                          if (
                            typeof v !== "number" ||
                            (Number.isFinite(v) && Math.abs(v) < 1e9)
                          )
                            update(v);
                        }}
                      />
                    ))}
                </label>
              );
            })}
          </Disclosure>
        )}
        {root && hasParticles([root]) && (
          <p className="preview-layout-notice">
            Particles are a colored-shape approximation. Check textures,
            clipping and the installed Emitter2D client in Studio Play.
          </p>
        )}
        {result.package.options.layout === "exact" &&
          root?.className === "ScreenGui" &&
          (viewportChoice.preset !== "design" || viewportChoice.rotated) && (
            <p className="preview-layout-notice">
              Preserved geometry keeps pixel sizes. Choose Responsive in
              Conversion settings to adapt the layout.
            </p>
          )}
      </div>
      <div ref={viewport} className="roblox-preview-viewport">
        <div
          className="roblox-preview-stage"
          data-preview-canvas={`${width}x${height}`}
          data-preview-framing={focusArtwork ? "artwork" : "screen"}
          data-preview-frame={`${frame.x},${frame.y},${frame.w},${frame.h}`}
          aria-label={`UI canvas ${width} by ${height} pixels`}
          style={{
            width,
            height,
            transformOrigin: "0 0",
            transform: camera.transform,
          }}
        >
          {rendered}
        </div>
        <PreviewSelectionOverlay
          viewport={viewport}
          selected={selectedTarget}
          revision={root}
          camera={camera.transform}
          enabled={!testing}
        />
      </div>
    </div>
  );
}
