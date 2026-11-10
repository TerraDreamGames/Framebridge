import { themeProperties } from "../../../packages/core/src/theme-tokens";
import { previewTextDecoration } from "./text-decoration-preview";
import {
  flatten,
  type RbxNode,
  type Value,
} from "../../../packages/core/src/types";
import {
  evaluateRule,
  ruleActions,
  type RuleData,
} from "../../../packages/core/src/conditional-rules";
import {
  REST_POSE,
  sampleKeyframes,
} from "../../../packages/core/src/keyframes";
import { createParticlePreview } from "./particle-preview";
import {
  motionParent,
  sampleMotion,
  type MotionState,
} from "../../../packages/core/src/motion";
/** A local simulation of configured UI intent. No game code or gameplay data executes. */
export function createPreviewUI(root: RbxNode, initialData: RuleData = {}) {
  const nodes = flatten([root]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map(
    nodes.flatMap((n) => n.children.map((c) => [c.id, n] as const)),
  );
  const visible = new Map(
    nodes.map((n) => [n.id, n.properties.Visible !== false]),
  );
  const selected = new Set<string>();
  const properties = new Map(nodes.map((n) => [n.id, { ...n.properties }]));
  const ruleBranches = new Map<string, number>();
  const ruleProperties = new Map<string, Set<string>>();
  const ruleBindings = new Map<string, Set<string>>();
  const rules = nodes.flatMap(
    (n) => n.behavior?.rules?.map((rule) => ({ owner: n.id, rule })) ?? [],
  );
  for (const { rule } of rules)
    for (const a of ruleActions(rule)) {
      if (!ruleProperties.has(a.target))
        ruleProperties.set(a.target, new Set());
      ruleProperties.get(a.target)!.add(a.property);
    }
  const button = (n?: RbxNode) =>
    !!n && ["TextButton", "ImageButton"].includes(n.className);
  let hovered = "",
    pressed = "",
    focused = "";
  const show = (node: RbxNode, value: boolean) => {
    visible.set(node.id, value);
    const slot = node.behavior?.motion?.slot ?? node.behavior?.keyframes?.slot;
    if (slot) visible.set(slot, value);
  };
  const isVisible = (id: string) => {
    let n = byId.get(id);
    while (n && n !== root) {
      if (!visible.get(n.id)) return false;
      n = parents.get(n.id);
    }
    return n === root && root.properties.Enabled !== false;
  };
  const owner = (id: string) => {
    let n = byId.get(id);
    while (n && !button(n)) n = parents.get(n.id);
    return n?.id ?? "";
  };
  const enabled = (id: string) => {
    const n = byId.get(id);
    return (
      button(n) &&
      n!.properties.Active !== false &&
      (ruleProperties.get(id)?.has("Interactable")
        ? properties.get(id)!.Interactable
        : n!.properties.Interactable) !== false &&
      isVisible(id)
    );
  };
  const state = (id: string): MotionState => {
    const n = byId.get(id);
    if (
      !n ||
      n.properties.Active === false ||
      (ruleProperties.get(id)?.has("Interactable")
        ? properties.get(id)?.Interactable
        : n.properties.Interactable) === false
    )
      return "disabled";
    const action = n.behavior?.action;
    if (pressed === id) return "pressed";
    if (
      (action?.kind === "tab" && visible.get(action.target)) ||
      selected.has(id)
    )
      return "selected";
    if (hovered === id || focused === id) return "hover";
    return "default";
  };
  const variants = new Map<string, Map<string, RbxNode>>();
  for (const n of nodes) {
    const s = n.behavior?.state;
    if (s) {
      if (!variants.has(s.owner)) variants.set(s.owner, new Map());
      variants.get(s.owner)!.set(s.kind, n);
    }
  }
  const states = () => {
    for (const [id, visuals] of variants) {
      const current = state(id);
      const choice = visuals.has(current) ? current : "default";
      for (const [kind, n] of visuals) show(n, kind === choice);
    }
  };
  for (const group of nodes.filter((n) => n.behavior?.role === "tabGroup")) {
    const panels = nodes.filter(
      (n) =>
        n.behavior?.role === "panel" &&
        motionParent(n, parents)?.id === group.id,
    );
    const choice = panels.find((n) => visible.get(n.id)) ?? panels[0];
    for (const n of panels) show(n, n === choice);
  }
  states();
  const setData = (data: RuleData) => {
    ruleBindings.clear();
    for (const [id, keys] of ruleProperties)
      for (const key of keys) {
        properties.get(id)![key] = byId.get(id)!.properties[key];
        if (key === "Visible")
          show(byId.get(id)!, byId.get(id)!.properties.Visible !== false);
      }
    for (const { owner, rule } of rules) {
      const result = evaluateRule(rule, data);
      ruleBranches.set(owner + "/" + rule.id, result.branch);
      for (const a of result.actions) {
        if (!ruleBindings.has(a.target)) ruleBindings.set(a.target, new Set());
        ruleBindings.get(a.target)!.add(a.property);
        properties.get(a.target)![a.property] = a.value;
        if (a.property === "Visible")
          show(byId.get(a.target)!, a.value === true);
      }
    }
    states();
  };
  setData(initialData);
  const activate = (id: string) => {
    const n = byId.get(id);
    const action = n?.behavior?.action;
    if (!enabled(id) || !action) return false;
    const panel = byId.get(action.target);
    if (!panel) return false;
    if (action.kind === "open") show(panel, true);
    if (action.kind === "close") show(panel, false);
    if (action.kind === "toggle") show(panel, !visible.get(panel.id));
    if (action.kind === "tab") {
      const group = motionParent(panel, parents);
      for (const candidate of nodes)
        if (
          candidate.behavior?.role === "panel" &&
          motionParent(candidate, parents) === group
        )
          show(candidate, candidate === panel);
    }
    states();
    return true;
  };
  return {
    nodes,
    byId,
    visible,
    properties,
    ruleBranches,
    ruleProperties,
    ruleBindings,
    setData,
    owner,
    state,
    isVisible,
    activate,
    setHover(id: string) {
      hovered = enabled(id) ? id : "";
      states();
    },
    setPress(id: string) {
      pressed = enabled(id) ? id : "";
      states();
    },
    setFocus(id: string) {
      focused = enabled(id) ? id : "";
      states();
    },
  };
}

/** One animation loop per preview, with cached DOM handles and no React render per frame. */
export function mountPreviewUI(
  host: HTMLElement,
  root: RbxNode,
  reduced: boolean | (() => boolean),
  data: RuleData = {},
) {
  const ui = createPreviewUI(root, data);
  const elements = new Map(
    Array.from(host.querySelectorAll<HTMLElement>("[data-preview-layer]")).map(
      (el) => [el.dataset.previewLayer!, el],
    ),
  );
  const resting = (el: HTMLElement) =>
    JSON.parse(el.dataset.previewResting ?? "{}") as Record<string, string>;
  const particlePreview = createParticlePreview(
    ui.nodes,
    elements,
    ui.isVisible,
    () => (typeof reduced === "function" ? reduced() : reduced),
  );
  const base = new Map([...elements].map(([id, el]) => [id, resting(el)]));
  const ruleArtwork = new Map(
    [...elements].map(([id, el]) => [
      id,
      {
        text: el.querySelector<HTMLElement>(`[data-preview-text]`),
        images: Array.from(
          el.querySelectorAll<HTMLElement>("[data-preview-image-artwork]"),
        ).filter((img) => img.dataset.previewImageArtwork === id),
        masks: Array.from(
          el.querySelectorAll<HTMLElement>("[data-preview-tint-mask]"),
        ).filter((mask) => mask.dataset.previewTintMask === id),
      },
    ]),
  );
  const originalText = new Map(
    [...ruleArtwork].flatMap(([id, art]) =>
      art.text ? [[id, Array.from(art.text.childNodes)] as const] : [],
    ),
  );
  const appliedRuleText = new Map<string, string>();
  const originalImages = new Map(
    [...ruleArtwork.values()].flatMap((art) =>
      art.images.map((img) => [img, img.style.opacity] as const),
    ),
  );
  const textDecorations = ui.nodes
    .filter((node) => node.textDecoration)
    .map((node) => {
      const element = elements.get(node.id),
        text = ruleArtwork.get(node.id)?.text;
      const capture = node.textDecoration?.captured
        ? elements.get(node.textDecoration.captured)
        : undefined;
      return {
        node,
        element,
        text,
        capture,
        originalShadow: text?.style.textShadow ?? "",
        originalCaptureDisplay: capture?.style.display ?? "",
      };
    });
  const rgba = (value: Value | undefined, alpha: number) => {
    const rgb =
      value && typeof value === "object" && value.type === "Color3"
        ? value.value
        : [1, 1, 1];
    return `rgba(${rgb.map((n) => Math.round(n * 255)).join(",")},${alpha})`;
  };
  const artwork = Array.from(
    host.querySelectorAll<HTMLElement>("[data-preview-artwork-resting]"),
  );
  const restoreArtwork = () => {
    for (const el of artwork) {
      const styles = JSON.parse(
        el.dataset.previewArtworkResting ?? "{}",
      ) as Record<string, string>;
      for (const [key, value] of Object.entries(styles))
        if (key.startsWith("--")) el.style.setProperty(key, value);
        else Object.assign(el.style, { [key]: value });
    }
  };
  const records = ui.nodes
    .filter((n) => n.behavior?.motion)
    .map((node) => {
      const element = elements.get(node.id);
      const own = (selector: string) =>
        Array.from(
          element?.querySelectorAll<HTMLElement>(selector) ?? [],
        ).filter(
          (child) =>
            child.closest<HTMLElement>("[data-preview-layer]")?.dataset
              .previewLayer === node.id,
        );
      return {
        node,
        element,
        text: own("[data-preview-text]")[0],
        masks: own("[data-preview-tint-mask]"),
        tile: own('[data-preview-scaling="Tile"]')[0],
        width: element?.offsetWidth ?? 0,
        time: 0,
        visible: false,
        scale: 1,
        rotation: 0,
        lift: 0,
        mx: 0,
        my: 0,
        tint: 0,
        engaged: false,
        shineStart: -Infinity,
        shine: undefined as HTMLDivElement | undefined,
      };
    });
  const chains = ui.nodes
    .filter((n) => n.behavior?.keyframes)
    .map((node) => ({
      node,
      element: elements.get(node.id),
      elapsed: 0,
      playing: false,
      started: false,
      showing: false,
      engaged: false,
      pose: { ...REST_POSE },
    }));
  const playChain = (record: (typeof chains)[number]) => {
    const k = record.node.behavior!.keyframes!;
    if (record.playing && k.interruption === "ignore") return;
    record.elapsed = 0;
    record.playing = true;
    record.pose = sampleKeyframes(k, 0).pose;
  };
  const playOwner = (owner: string) => {
    for (const record of chains) {
      const k = record.node.behavior!.keyframes!;
      if (
        k.trigger === "activate" &&
        k.owner === owner &&
        ui.isVisible(record.node.id) &&
        ui.state(owner) !== "disabled"
      )
        playChain(record);
    }
  };
  const dimensions = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const record = records.find((record) => record.element === entry.target);
      if (record) record.width = entry.contentRect.width;
    }
  });
  for (const record of records)
    if (record.element) dimensions.observe(record.element);
  let mouseX = 0,
    mouseY = 0,
    mouse = false,
    frame = 0,
    last = performance.now(),
    destroyed = false;
  const sync = () => {
    if (root.themes) {
      const color = (value: unknown, transparency: unknown) => {
        const rgb = (value as { value?: number[] })?.value ?? [1, 1, 1];
        return `rgba(${rgb.map((v) => v * 255).join(",")},${1 - Number(transparency ?? 0)})`;
      };
      for (const n of ui.nodes) {
        if (!n.theme) continue;
        const el = elements.get(n.id);
        if (!el) continue;
        const state = n.theme.owner ? ui.state(n.theme.owner) : "default";
        const props = {
          ...n.properties,
          ...themeProperties(
            n,
            root.themes,
            root.themes.initial,
            state === "hover" || state === "pressed",
          ),
        };
        if (props.BackgroundColor3)
          el.style.backgroundColor = color(
            props.BackgroundColor3,
            props.BackgroundTransparency,
          );
        const own = (selector: string) =>
          Array.from(el.querySelectorAll<HTMLElement>(selector)).filter(
            (child) =>
              child.closest<HTMLElement>("[data-preview-layer]")?.dataset
                .previewLayer === n.id,
          );
        for (const text of own("[data-preview-text]")) {
          text.style.color = color(props.TextColor3, props.TextTransparency);
          text.style.setProperty(
            "--preview-text-alpha",
            String(1 - Number(props.TextTransparency ?? 0)),
          );
        }
        for (const mask of own("[data-preview-tint-mask]"))
          mask.style.backgroundColor = color(
            props.ImageColor3,
            props.ImageTransparency,
          );
      }
    }
    for (const [id, el] of elements) {
      const show = ui.visible.get(id)!;
      el.style.display = show ? "" : "none";
      const owned = ui.ruleProperties.get(id),
        props = ui.properties.get(id)!;
      if (!owned) continue;
      const art = ruleArtwork.get(id)!;
      if (owned.has("Interactable"))
        el.setAttribute("aria-disabled", String(props.Interactable === false));
      if (owned.has("Text") && art.text) {
        // Runtime-bound strings are literal, as the native runtime escapes RichText.
        // Retain the authored spans when no rule branch owns Text right now.
        if (!ui.ruleBindings.get(id)?.has("Text")) {
          if (appliedRuleText.delete(id))
            art.text.replaceChildren(...(originalText.get(id) ?? []));
        } else {
          const text = String(props.Text ?? "");
          if (appliedRuleText.get(id) !== text) {
            art.text.textContent = text;
            appliedRuleText.set(id, text);
          }
        }
      }
      if (owned.has("TextColor3") || owned.has("TextTransparency"))
        if (art.text) {
          art.text.style.color = rgba(
            props.TextColor3,
            1 - Number(props.TextTransparency ?? 0),
          );
          art.text.style.setProperty(
            "--preview-text-alpha",
            String(1 - Number(props.TextTransparency ?? 0)),
          );
        }
      if (owned.has("BackgroundColor3") || owned.has("BackgroundTransparency"))
        el.style.background = rgba(
          props.BackgroundColor3,
          1 - Number(props.BackgroundTransparency ?? 1),
        );
      if (owned.has("ImageColor3"))
        for (const mask of art.masks)
          mask.style.backgroundColor = rgba(props.ImageColor3, 1);
      if (owned.has("ImageTransparency"))
        for (const img of art.images)
          img.style.opacity = String(1 - Number(props.ImageTransparency ?? 0));
    }
    // A hidden ancestor also resets entrances if it is reopened between animation frames.
    for (const item of textDecorations) {
      if (!item.element || !item.text) continue;
      const properties = { ...ui.properties.get(item.node.id)! };
      const owned = ui.ruleBindings.get(item.node.id);
      if (owned?.has("Text") && properties.RichText)
        properties.Text = String(properties.Text ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const themed = (node: RbxNode) => {
        if (!root.themes || !node.theme) return node.properties;
        const state = node.theme.owner ? ui.state(node.theme.owner) : "default";
        return {
          ...node.properties,
          ...themeProperties(
            node,
            root.themes,
            root.themes.initial,
            state === "hover" || state === "pressed",
          ),
        };
      };
      for (const [key, value] of Object.entries(themed(item.node)))
        if (item.node.theme && !owned?.has(key)) properties[key] = value;
      const current = {
        ...item.node,
        children: item.node.children.map((child) => ({
          ...child,
          properties: themed(child),
        })),
      };
      const dimensions = [item.element.offsetWidth, item.element.offsetHeight];
      const available = !!item.capture?.querySelector(
        "[data-preview-image-artwork]",
      );
      const result = previewTextDecoration(
        current,
        properties,
        dimensions,
        available,
      );
      item.text.style.textShadow = result.shadow ?? "";
      for (const run of Array.from(
        item.text.querySelectorAll<HTMLElement>("[data-preview-rich-alpha]"),
      ))
        run.style.textShadow =
          previewTextDecoration(
            current,
            properties,
            dimensions,
            available,
            Number(run.dataset.previewRichAlpha),
          ).shadow ?? "";
      if (item.capture)
        item.capture.style.display =
          result.captured && ui.isVisible(item.node.id) ? "" : "none";
    }
    for (const record of records)
      if (!ui.isVisible(record.node.id)) record.visible = false;
  };
  const eventOwner = (event: Event) => {
    const el =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-preview-layer]")
        : null;
    return ui.owner(el?.dataset.previewLayer ?? "");
  };
  const move = (event: PointerEvent) => {
    mouse = event.pointerType === "mouse";
    mouseX = event.clientX;
    mouseY = event.clientY;
    ui.setHover(mouse ? eventOwner(event) : "");
    sync();
  };
  const leave = () => {
    mouse = false;
    ui.setHover("");
    ui.setPress("");
    sync();
  };
  const down = (event: PointerEvent) => {
    ui.setPress(eventOwner(event));
    sync();
  };
  const up = () => {
    ui.setPress("");
    sync();
  };
  const click = (event: MouseEvent) => {
    const id = eventOwner(event);
    if (id) {
      event.preventDefault();
      playOwner(id);
      ui.activate(id);
      if (ui.state(id) !== "disabled" && ui.isVisible(id))
        particlePreview.activate(id);
      sync();
    }
  };
  const focus = (event: FocusEvent) => {
    ui.setFocus(eventOwner(event));
    sync();
  };
  const blur = () => {
    ui.setFocus("");
    ui.setPress("");
    sync();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      const id = eventOwner(event);
      if (id) {
        event.preventDefault();
        ui.setPress(id);
        sync();
      }
    }
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      const id = eventOwner(event);
      if (id) {
        event.preventDefault();
        ui.setPress("");
        playOwner(id);
        ui.activate(id);
        if (ui.state(id) !== "disabled" && ui.isVisible(id))
          particlePreview.activate(id);
        sync();
      }
    }
  };
  const listeners: [
    [string, EventListener],
    ...Array<[string, EventListener]>,
  ] = [
    ["framebridge-particles-preview-burst", () => particlePreview.burst()],
    ["pointermove", move as EventListener],
    ["pointerleave", leave],
    ["pointerdown", down as EventListener],
    ["pointerup", up],
    ["pointercancel", up],
    ["click", click as EventListener],
    ["focusin", focus as EventListener],
    ["focusout", blur],
    ["keydown", keydown as EventListener],
    ["keyup", keyup as EventListener],
  ];
  for (const [type, listener] of listeners)
    host.addEventListener(type, listener, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("blur", leave);
  for (const record of records) {
    const shine = record.node.behavior!.motion!.shine;
    if (shine && record.element) {
      const overlay = document.createElement("div");
      overlay.dataset.previewMotionHelper = "shine";
      Object.assign(overlay.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        borderRadius: "inherit",
        overflow: "hidden",
        zIndex: String(Number(record.node.properties.ZIndex ?? 1) + 1),
      });
      overlay.style.background = `linear-gradient(${90 + shine.direction}deg,transparent ${50 - shine.width * 50}%,rgb(${shine.color.map((c) => Math.round(c * 255)).join(",")}) 50%,transparent ${50 + shine.width * 50}%)`;
      overlay.style.backgroundSize = "100% 100%";
      overlay.style.backgroundRepeat = "no-repeat";
      record.element.appendChild(overlay);
      record.shine = overlay;
    }
  }
  const approach = (
    current: number,
    target: number,
    dt: number,
    duration: number,
  ) => {
    const value =
      duration <= 0
        ? target
        : current + (target - current) * (1 - Math.exp((-dt * 5) / duration));
    return Math.abs(value - target) < 0.001 ? target : value;
  };
  const paint = (now: number) => {
    if (destroyed) return;
    const calm = typeof reduced === "function" ? reduced() : reduced;
    const dt = document.hidden
      ? 0
      : Math.min(1, Math.max(0, (now - last) / 1000));
    last = now;
    particlePreview.step(dt);
    // Read geometry before writing styles, avoiding repeated layout flushes.
    const magnetBoxes = new Map(
      records
        .filter((r) => r.node.behavior!.motion!.magnet)
        .map((r) => [
          r.node.id,
          elements
            .get(r.node.behavior!.motion!.slot ?? r.node.id)
            ?.getBoundingClientRect(),
        ]),
    );
    for (const record of records) {
      const element = record.element;
      if (!element) continue;
      const settings = record.node.behavior!.motion!;
      const showing = ui.isVisible(record.node.id);
      if (showing && !record.visible) {
        record.time = 0;
        record.engaged = false;
        record.shineStart = -Infinity;
      }
      record.visible = showing;
      if (!showing) continue;
      record.time += dt;
      const state = ui.state(settings.owner ?? record.node.id);
      const engaged = ["hover", "pressed", "selected"].includes(state);
      const hovered = ["hover", "selected"].includes(state);
      if (engaged && !record.engaged) record.shineStart = record.time;
      record.engaged = engaged;
      const sample = sampleMotion(settings, record.time, "default", calm);
      const h = settings.hover,
        p = settings.press;
      const duration =
        state === "pressed" && p ? p.duration : (h?.duration ?? 0.15);
      const zoom = calm
        ? 1
        : state === "pressed" && p
          ? p.scale
          : hovered && h
            ? h.scale
            : 1;
      record.scale = approach(record.scale, zoom, dt, duration);
      record.rotation = approach(
        record.rotation,
        !calm && hovered && h ? h.rotation : 0,
        dt,
        duration,
      );
      record.lift = approach(
        record.lift,
        !calm && hovered && h ? h.lift : 0,
        dt,
        duration,
      );
      let mx = 0,
        my = 0;
      const box = magnetBoxes.get(record.node.id);
      if (
        !calm &&
        mouse &&
        showing &&
        box &&
        settings.magnet &&
        state !== "disabled"
      ) {
        const x = mouseX - (box.left + box.width / 2),
          y = mouseY - (box.top + box.height / 2);
        const distance = Math.hypot(x, y);
        const ratio = box.width / Math.max(1, record.width || box.width);
        const radius = settings.magnet.radius * ratio;
        if (distance > 0 && distance < radius) {
          const strength =
            Math.min(distance / ratio, settings.magnet.pull) *
            (1 - distance / radius);
          mx = (x / distance) * strength;
          my = (y / distance) * strength;
        }
      }
      record.mx = approach(
        record.mx,
        mx,
        dt,
        settings.magnet?.duration ?? 0.15,
      );
      record.my = approach(
        record.my,
        my,
        dt,
        settings.magnet?.duration ?? 0.15,
      );
      if (calm) {
        record.scale = 1;
        record.rotation = 0;
        record.lift = 0;
        record.mx = 0;
        record.my = 0;
      }
      const authored = base.get(record.node.id)!;
      element.style.transform = `translate(${sample.x + record.mx}px,${sample.y - record.lift + record.my}px) ${authored.transform} rotate(${sample.rotation + record.rotation}deg) scale(${sample.scale * record.scale})`;
      element.style.opacity = String(
        Number(authored.opacity || 1) * sample.opacity,
      );
      record.tint = approach(
        record.tint,
        hovered ? 1 : 0,
        dt,
        h?.duration ?? 0.15,
      );
      if (h?.tint) {
        const colorProperty = record.node.className.startsWith("Text")
          ? "TextColor3"
          : record.node.className.startsWith("Image")
            ? "ImageColor3"
            : "BackgroundColor3";
        const c = record.node.properties[colorProperty];
        const from =
          c && typeof c === "object" && c.type === "Color3"
            ? c.value
            : [1, 1, 1];
        const color = from.map((v, index) =>
          Math.round((v + (h.tint![index] - v) * record.tint) * 255),
        );
        if (colorProperty === "BackgroundColor3")
          element.style.backgroundColor = `rgba(${color.join(",")},${1 - Number(record.node.properties.BackgroundTransparency ?? 1)})`;
        else if (colorProperty === "TextColor3") {
          const text = record.text;
          if (text) {
            text.style.color = `rgba(${color.join(",")},${1 - Number(record.node.properties.TextTransparency ?? 0)})`;
            text.style.setProperty(
              "--preview-text-alpha",
              String(1 - Number(record.node.properties.TextTransparency ?? 0)),
            );
          }
        } else {
          for (const mask of record.masks)
            if (mask.dataset.previewTintMask === record.node.id)
              mask.style.backgroundColor = `rgb(${color.join(",")})`;
        }
      }
      if (record.shine && settings.shine) {
        const shine = settings.shine;
        const elapsed =
          shine.trigger === "hover"
            ? record.time - record.shineStart
            : record.time % shine.period;
        record.shine.style.display =
          showing && !calm && elapsed >= 0 && elapsed <= shine.period
            ? ""
            : "none";
        record.shine.style.opacity = String(shine.opacity);
        record.shine.style.backgroundPosition = `${((elapsed / shine.period) * 4 - 2) * record.width}px 0`;
      }
      if (settings.drift) {
        const tile = record.tile;
        if (tile) {
          tile.style.backgroundPosition = `${sample.driftX}px ${sample.driftY}px`;
          tile.style.maskPosition = `${sample.driftX}px ${sample.driftY}px`;
        }
      }
    }
    for (const record of chains) {
      if (!record.element) continue;
      const k = record.node.behavior!.keyframes!;
      const showing = ui.isVisible(record.node.id);
      const state = k.owner ? ui.state(k.owner) : "default";
      const engaged =
        state === k.trigger || (k.trigger === "hover" && state === "selected");
      if (!showing || state === "disabled") {
        record.playing = false;
        record.pose = { ...REST_POSE };
        record.engaged = false;
      } else {
        if (
          (!record.started && k.trigger === "mount") ||
          (!record.showing && k.trigger === "visible")
        )
          playChain(record);
        if (["hover", "pressed", "selected"].includes(k.trigger)) {
          if (engaged && !record.engaged) playChain(record);
          else if (!engaged && record.engaged) {
            record.playing = false;
            record.pose = { ...REST_POSE };
          }
          record.engaged = engaged;
        }
      }
      record.started = true;
      record.showing = showing;
      if (record.playing && showing) {
        record.elapsed += Math.min(dt, 0.25);
        const sample = sampleKeyframes(k, record.elapsed);
        record.pose = sample.pose;
        if (sample.complete) {
          record.playing = false;
          if (k.finish === "restore") record.pose = { ...REST_POSE };
        }
      }
      const pose = calm ? REST_POSE : record.pose;
      const authored = base.get(record.node.id)!;
      record.element.style.transform = `translate(${pose.x}px,${pose.y}px) ${authored.transform} rotate(${pose.rotation}deg) scale(${Math.max(0.01, pose.scale)})`;
      record.element.style.opacity = String(
        Math.min(1, Math.max(0, Number(authored.opacity || 1) * pose.opacity)),
      );
    }
    frame = requestAnimationFrame(paint);
  };
  sync();
  frame = requestAnimationFrame(paint);
  return Object.assign(
    () => {
      particlePreview.destroy();
      destroyed = true;
      cancelAnimationFrame(frame);
      dimensions.disconnect();
      for (const [type, listener] of listeners)
        host.removeEventListener(type, listener, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", leave);
      for (const record of records) record.shine?.remove();
      for (const el of elements.values()) Object.assign(el.style, resting(el));
      restoreArtwork();
      for (const [id, text] of originalText) {
        const el = ruleArtwork.get(id)?.text;
        if (el) el.replaceChildren(...text);
      }
      for (const [img, opacity] of originalImages) img.style.opacity = opacity;
      for (const item of textDecorations) {
        if (item.text) item.text.style.textShadow = item.originalShadow;
        if (item.capture)
          item.capture.style.display = item.originalCaptureDisplay;
      }
      for (const [id, owned] of ui.ruleProperties)
        if (owned.has("Interactable"))
          elements.get(id)?.removeAttribute("aria-disabled");
    },
    {
      setData(next: RuleData) {
        if (!destroyed) {
          ui.setData(next);
          sync();
        }
      },
    },
  );
}
