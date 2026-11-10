import {
  useId,
  useLayoutEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  clipSelection,
  selectionQuad,
  type SelectionPoint,
} from "./preview-selection";
import "./preview-selection.css";

type Box = {
  id: string;
  name: string;
  width: number;
  height: number;
  points: SelectionPoint[];
  clips: SelectionPoint[][];
  left: number;
  top: number;
  bottom: number;
};
type Measurement = {
  selected?: Box;
  hover?: Box;
  width: number;
  height: number;
};

function measure(
  element: HTMLElement | null,
  viewport: HTMLElement,
): Box | undefined {
  if (!element || !element.isConnected) return;
  const origin = viewport.getBoundingClientRect();
  const chain: {
    element: HTMLElement;
    style: CSSStyleDeclaration;
    angle: number;
  }[] = [];
  for (
    let n: HTMLElement | null = element;
    n && n !== viewport;
    n = n.parentElement
  ) {
    const style = getComputedStyle(n);
    if (style.display === "none" || style.visibility === "hidden") return;
    const m = new DOMMatrixReadOnly(
      style.transform === "none" ? undefined : style.transform,
    );
    chain.push({ element: n, style, angle: Math.atan2(m.b, m.a) });
  }
  let angle = 0;
  const clips: SelectionPoint[][] = [
    [
      { x: 0, y: 0 },
      { x: origin.width, y: 0 },
      { x: origin.width, y: origin.height },
      { x: 0, y: origin.height },
    ],
  ];
  let points: SelectionPoint[] = [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const entry = chain[i];
    angle += entry.angle;
    if (
      i !== 0 &&
      !/(hidden|clip|auto|scroll)/.test(
        entry.style.overflowX + entry.style.overflowY,
      )
    )
      continue;
    const r = entry.element.getBoundingClientRect();
    const quad = selectionQuad(
      {
        left: r.left - origin.left,
        top: r.top - origin.top,
        width: r.width,
        height: r.height,
      },
      parseFloat(entry.style.width),
      parseFloat(entry.style.height),
      angle,
    );
    if (i === 0) points = quad;
    else clips.push(quad);
  }
  const visible = clips.reduce(clipSelection, points);
  if (visible.length < 3) return;
  const left = Math.min(...visible.map((p) => p.x)),
    right = Math.max(...visible.map((p) => p.x));
  const top = Math.min(...visible.map((p) => p.y)),
    bottom = Math.max(...visible.map((p) => p.y));
  if (right - left < 0.5 || bottom - top < 0.5) return;
  return {
    id: element.dataset.previewLayer!,
    name: element.dataset.previewName || "Layer",
    width: parseFloat(chain[0].style.width),
    height: parseFloat(chain[0].style.height),
    points,
    clips,
    left,
    top,
    bottom,
  };
}

const polygon = (points: SelectionPoint[]) =>
  points.map((p) => `${p.x},${p.y}`).join(" ");
function corners(points: SelectionPoint[]) {
  return points
    .map((p, i) => {
      const towards = (q: SelectionPoint) => {
        const length = Math.hypot(q.x - p.x, q.y - p.y);
        const t = Math.min(6, length / 3) / length;
        return `${p.x + (q.x - p.x) * t},${p.y + (q.y - p.y) * t}`;
      };
      return `M${towards(points[(i + 3) % 4])} L${p.x},${p.y} L${towards(points[(i + 1) % 4])}`;
    })
    .join(" ");
}
const dimension = (v: number) => String(Math.round(v * 10) / 10);

/** Editor chrome lives outside the scaled artwork, so its stroke and label stay readable at any zoom. */
export function PreviewSelectionOverlay({
  viewport,
  selected,
  revision,
  camera,
  enabled,
}: {
  viewport: RefObject<HTMLDivElement | null>;
  selected: string;
  revision: unknown;
  camera: string;
  enabled: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const [state, setState] = useState<Measurement>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const container = viewport.current;
    const stage = container?.querySelector<HTMLElement>(
      ".roblox-preview-stage",
    );
    if (!container || !stage || !enabled) {
      setState({ width: 0, height: 0 });
      return;
    }
    let frame = 0,
      hover: HTMLElement | null = null;
    const update = () => {
      frame = 0;
      const target = selected
        ? stage.querySelector<HTMLElement>(
            `[data-preview-layer="${CSS.escape(selected)}"]`,
          )
        : null;
      const next: Measurement = {
        selected: measure(target, container),
        hover: hover !== target ? measure(hover, container) : undefined,
        width: container.clientWidth,
        height: container.clientHeight,
      };
      setState((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const pointer = (event: PointerEvent) => {
      const next =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-preview-layer]")
          : null;
      if (next !== hover) {
        hover = next && stage.contains(next) ? next : null;
        schedule();
      }
    };
    const leave = () => {
      hover = null;
      schedule();
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    const mutation = new MutationObserver(schedule);
    mutation.observe(stage, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    container.addEventListener("pointerover", pointer);
    container.addEventListener("pointerleave", leave);
    container.addEventListener("scroll", schedule, true);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      container.removeEventListener("pointerover", pointer);
      container.removeEventListener("pointerleave", leave);
      container.removeEventListener("scroll", schedule, true);
    };
  }, [viewport, selected, revision, camera, enabled]);
  if (!enabled || (!state.selected && !state.hover)) return null;
  const boxes = [
    { box: state.hover, type: "hover" },
    { box: state.selected, type: "selected" },
  ] as const;
  return (
    <div className="preview-selection-overlay" aria-hidden="true">
      <svg width="100%" height="100%" className="preview-selection-lines">
        <defs>
          {boxes.flatMap(
            ({ box, type }) =>
              box?.clips.map((clip, i) => (
                <clipPath id={`${id}-${type}-${i}`} key={`${type}-${i}`}>
                  <polygon points={polygon(clip)} />
                </clipPath>
              )) ?? [],
          )}
        </defs>
        {boxes.map(({ box, type }) => {
          if (!box) return null;
          let content: ReactNode = (
            <g
              className={`preview-selection-shape is-${type}`}
              data-preview-outline={box.id}
            >
              <polygon points={polygon(box.points)} />
              {type === "selected" && <path d={corners(box.points)} />}
            </g>
          );
          box.clips.forEach((_, i) => {
            content = <g clipPath={`url(#${id}-${type}-${i})`}>{content}</g>;
          });
          return <g key={type}>{content}</g>;
        })}
      </svg>
      {state.selected && (
        <div
          className="preview-selection-label"
          data-preview-selection-label={state.selected.id}
          style={{
            left: Math.max(
              8,
              Math.min(
                state.selected.left,
                state.width - Math.min(240, state.width - 16) - 8,
              ),
            ),
            top:
              state.selected.top >= 34
                ? state.selected.top - 29
                : state.selected.bottom + 30 < state.height
                  ? state.selected.bottom + 6
                  : 8,
            maxWidth: Math.max(0, Math.min(240, state.width - 16)),
          }}
        >
          <span className="preview-selection-name">{state.selected.name}</span>
          <span className="preview-selection-dimensions">
            {dimension(state.selected.width)} ×{" "}
            {dimension(state.selected.height)}
          </span>
        </div>
      )}
    </div>
  );
}
