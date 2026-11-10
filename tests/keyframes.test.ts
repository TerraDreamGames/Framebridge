import { describe, it, expect } from "vitest";
import {
  captureLayerPose,
  captureRecordingBasis,
  compileKeyframes,
  easeKeyframe,
  hasKeyframeSpatial,
  KEYFRAME_DEFAULTS,
  KEYFRAME_EASINGS,
  keyframeTotalDuration,
  REST_POSE,
  sampleKeyframes,
  validKeyframes,
} from "../packages/core/src/keyframes";
import {
  keyframePackage,
  keyframeDesign,
  keyframeOverrides,
  exampleChain,
} from "../packages/core/src/keyframe-examples";
import { flatten } from "../packages/core/src/types";
import { compile } from "../packages/core/src/compiler";
import { validatePackage } from "../packages/relay/src/protocol";
import { generateModel } from "../packages/core/src/model-export";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { createPreviewUI } from "../plugins/figma/src/preview-interactions";
import { createOverrideHistory } from "../plugins/figma/src/override-history";
import {
  entries,
  motionSlotContent,
  recordingNodes,
  type Entry,
} from "../plugins/figma/src/layer-entries";
import { node } from "../packages/core/src/demo";
import { layoutExamples } from "../packages/core/src/layout-examples";
import {
  extractComponent,
  reviewComponents,
} from "../packages/core/src/reusable-components";
const get = (p: ReturnType<typeof keyframePackage>, id: string) =>
  flatten(p.roots).find((n) => n.id === id)!;
describe("recorded keyframe chains", () => {
  it("keeps a recorded list child's parent and fill sizing stable when its source rotation changes", () => {
    const example = layoutExamples()[0];
    const id = "quest-list:row-4";
    example.options.layerOverrides[id].behavior = {
      keyframes: structuredClone(KEYFRAME_DEFAULTS),
    };
    const before = compile(example.designs, "recorded list", example.options);
    const reference = captureRecordingBasis(
      get(before, id),
      flatten(before.roots),
    );
    const settings = example.options.layerOverrides[id].behavior!.keyframes!;
    settings.recording = reference;
    const source = example.designs[0].children.find(
      (n) => n.id === "quest-list:scroll",
    )!.children[3];
    const radians = (12 * Math.PI) / 180;
    source.transform[0][0] = Math.cos(radians);
    source.transform[0][1] = -Math.sin(radians);
    source.transform[1][0] = Math.sin(radians);
    source.transform[1][1] = Math.cos(radians);
    const after = compile(example.designs, "recorded list", example.options);
    expect(after.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(() => validatePackage(after)).not.toThrow();
    expect(flatten(after.roots).some((n) => n.id === `${id}/slot`)).toBe(false);
    expect(get(after, `${id}/motion-slot`).properties.Size).toEqual(
      get(before, `${id}/motion-slot`).properties.Size,
    );
    const current = captureRecordingBasis(get(after, id), flatten(after.roots));
    expect(captureLayerPose(reference, current)).toEqual({
      ...REST_POSE,
      rotation: 12,
    });
    expect(get(after, id).behavior!.keyframes!.frames[0].rotation).toBe(-12);
    settings.frames.push({
      ...REST_POSE,
      rotation: 12,
      time: 1,
      easing: "linear",
      direction: "out",
    });
    const captured = compile(
      example.designs,
      "captured rotation",
      example.options,
    );
    expect(get(captured, id).behavior!.keyframes!.frames.at(-1)!.rotation).toBe(
      0,
    );
    expect(get(captured, id).properties.Rotation).toBe(12);
  });
  it("records folded inspector rows against their full compiled geometry hierarchy", () => {
    const pkg = keyframePackage();
    const roots = entries({
      designs: keyframeDesign(),
      package: pkg,
      previews: {},
      assets: {},
      revision: 1,
    });
    const rows = (items: Entry[]): Entry[] =>
      items.flatMap((row) => [row, ...rows(row.children)]);
    const presentation = rows(roots).find((row) => row.node.id === "activate")!;
    const slotId = presentation.node.behavior!.keyframes!.slot!;
    expect(rows(roots).some((row) => row.node.id === slotId)).toBe(false);
    expect(recordingNodes(roots[0]).some((layer) => layer.id === slotId)).toBe(
      true,
    );
    const basis = captureRecordingBasis(
      presentation.node,
      recordingNodes(roots[0]),
    );
    expect(basis).toEqual(
      captureRecordingBasis(get(pkg, "activate"), flatten(pkg.roots)),
    );
    const captured = captureLayerPose(
      basis,
      captureRecordingBasis(presentation.node, recordingNodes(roots[0])),
    );
    expect(captured).toEqual(REST_POSE);
    const recorded = { ...exampleChain("activate"), recording: basis };
    expect(
      compileKeyframes(recorded, presentation.node, recordingNodes(roots[0]), 1)
        .frames,
    ).toEqual(recorded.frames);
  });
  it("folds keyframe reservations into authored rows and selects their content", () => {
    const pkg = keyframePackage();
    const rows = entries({
      designs: keyframeDesign(),
      package: pkg,
      previews: {},
      assets: {},
      revision: 1,
    });
    const flatRows = (items: Entry[]): Entry[] =>
      items.flatMap((item) => [item, ...flatRows(item.children)]);
    const flattened = flatRows(rows);
    expect(flattened.some((row) => row.node.sourceType === "MOTION_SLOT")).toBe(
      false,
    );
    const row = flattened.find((item) => item.node.id === "activate")!;
    const slot = get(pkg, "activate/motion-slot");
    expect(row.source?.id).toBe("activate");
    expect(row.node.behavior?.keyframes?.slot).toBe(slot.id);
    for (const key of ["Position", "Size", "AnchorPoint"])
      expect(row.node.properties[key]).toEqual(slot.properties[key]);
    expect(row.children.some((item) => item.node.id === "activate-label")).toBe(
      true,
    );
    expect(motionSlotContent(slot)?.id).toBe("activate");
    expect(motionSlotContent(row.node)).toBeUndefined();
  });
  it("keeps exact endpoints for every easing and direction, including back easing", () => {
    for (const easing of KEYFRAME_EASINGS)
      for (const direction of ["in", "out", "inOut"] as const) {
        expect(easeKeyframe(0, easing, direction)).toBe(0);
        expect(easeKeyframe(1, easing, direction)).toBe(1);
      }
  });
  it("compiles all triggers, stable button owners and reserved layout slots", () => {
    const p = keyframePackage();
    expect(p.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(() => validatePackage(p)).not.toThrow();
    for (const id of ["hover", "press", "activate", "selected"]) {
      expect(get(p, id).className).toBe("TextButton");
      expect(get(p, id).behavior?.keyframes?.owner).toBe(id);
    }
    for (const id of [
      "mount",
      "hover",
      "press",
      "activate",
      "panel",
      "selected",
      "attribute",
    ]) {
      expect(get(p, id).behavior?.keyframes?.slot).toBe(id + "/motion-slot");
      expect(get(p, id + "/motion-slot").children[0].id).toBe(id);
    }
    expect(get(p, "panel/motion-slot").properties.Visible).toBe(false);
  });
  it.each([
    false,
    null,
    [],
    { ...KEYFRAME_DEFAULTS, source: "print(1)" },
    { ...KEYFRAME_DEFAULTS, frames: [KEYFRAME_DEFAULTS.frames[0]] },
    { ...KEYFRAME_DEFAULTS, repeats: 21 },
    { ...KEYFRAME_DEFAULTS, attribute: "Source.Code" },
    { ...KEYFRAME_DEFAULTS, trigger: "attribute", attribute: "Parent.Source" },
    {
      ...KEYFRAME_DEFAULTS,
      frames: [
        { ...KEYFRAME_DEFAULTS.frames[0], time: 1 },
        KEYFRAME_DEFAULTS.frames[1],
      ],
    },
    {
      ...KEYFRAME_DEFAULTS,
      frames: Array(33).fill(KEYFRAME_DEFAULTS.frames[0]),
    },
    {
      ...KEYFRAME_DEFAULTS,
      frames: [
        KEYFRAME_DEFAULTS.frames[0],
        { ...KEYFRAME_DEFAULTS.frames[1], time: Infinity },
      ],
    },
  ])("rejects unbounded/executable chains %j", (v) =>
    expect(validKeyframes(v)).toBe(false),
  );
  it("samples segment easing, repeats/yoyo and exact completion deterministically", () => {
    const k = exampleChain("activate");
    expect(sampleKeyframes(k, 0.25).pose.x).toBeCloseTo(20);
    expect(sampleKeyframes(k, 0.75).pose.x).toBeCloseTo(57.5);
    expect(sampleKeyframes(k, 1).complete).toBe(true);
    expect(sampleKeyframes(k, 99).pose.x).toBe(60);
    const repeated = { ...k, repeats: 1, yoyo: true };
    expect(keyframeTotalDuration(repeated)).toBe(4);
    expect(sampleKeyframes(repeated, 1.25).pose.x).toBeCloseTo(
      sampleKeyframes(k, 0.75).pose.x,
    );
    expect(sampleKeyframes(repeated, 4).pose).toEqual(REST_POSE);
    for (const easing of ["linear", "quad", "cubic", "sine", "back"] as const)
      for (const direction of ["in", "out", "inOut"] as const) {
        expect(easeKeyframe(0, easing, direction)).toBeCloseTo(0);
        expect(easeKeyframe(1, easing, direction)).toBeCloseTo(1);
      }
    expect(easeKeyframe(0.75, "back", "out")).toBeGreaterThan(1);
  });
  it("records actual layer edits and rebases earlier poses against the final authored layout", () => {
    const before = keyframePackage();
    const old = get(before, "activate");
    const reference = captureRecordingBasis(old, flatten(before.roots));
    const design = keyframeDesign();
    const edited = design[0].children.find((n) => n.id === "activate")!;
    edited.transform = [
      [1, 0, 340],
      [0, 1, 220],
    ];
    edited.width *= 2;
    edited.height *= 2;
    const after = compile(design, "recorded", {
      layerOverrides: keyframeOverrides,
    });
    const current = captureRecordingBasis(
      get(after, "activate"),
      flatten(after.roots),
    );
    const pose = captureLayerPose(reference, current);
    const recorded = {
      ...exampleChain("activate"),
      recording: reference,
      frames: [
        {
          ...REST_POSE,
          time: 0,
          easing: "linear" as const,
          direction: "out" as const,
        },
        {
          ...pose,
          time: 1,
          easing: "linear" as const,
          direction: "out" as const,
        },
      ],
    };
    const rebased = compileKeyframes(
      recorded,
      get(after, "activate"),
      flatten(after.roots),
      1,
    );
    expect(rebased.frames[0].x + current.x).toBeCloseTo(reference.x);
    expect(rebased.frames[0].scale * current.width).toBeCloseTo(
      reference.width,
    );
    expect(rebased.frames[1].x).toBeCloseTo(0);
    expect(rebased.frames[1].scale).toBeCloseTo(1);
    expect("recording" in rebased).toBe(false);
    expect(() =>
      captureLayerPose(reference, { ...current, parent: "another" }),
    ).toThrow("parent changed");
    expect(() =>
      captureLayerPose(reference, { ...current, height: current.height * 2 }),
    ).toThrow("uniform");
  });
  it("rejects competing controls, nested motion and tampered slot/owner/author-only data", () => {
    for (const id of ["owner", "slot", "recording"]) {
      const p = keyframePackage();
      (get(p, "activate").behavior!.keyframes as any)[id] =
        id === "recording" ? { source: "code" } : "missing";
      expect(() => validatePackage(p)).toThrow();
    }
    const conflict = keyframePackage({
      layerOverrides: {
        activate: {
          behavior: {
            keyframes: exampleChain("activate"),
            control: { kind: "toggle", value: false },
          },
        },
      },
    });
    expect(conflict.issues.some((i) => i.severity === "error")).toBe(true);
    const nested = keyframePackage({
      layerOverrides: {
        "activate-label": {
          behavior: { motion: { pulse: { scale: 1.1, period: 2 } } },
        },
      },
    });
    expect(nested.issues.some((i) => i.severity === "error")).toBe(true);
  });
  it("keeps input on nearest parent and opacity-only chains out of spatial slots", () => {
    const p = keyframePackage({
      layerOverrides: {
        activate: { behavior: { action: { kind: "open", target: "panel" } } },
        "activate-label": {
          behavior: {
            keyframes: {
              ...exampleChain("activate"),
              input: "parent",
              frames: exampleChain("activate").frames.map((f) => ({
                ...f,
                x: 0,
                y: 0,
                rotation: 0,
                scale: 1,
              })),
            },
          },
        },
      },
    });
    expect(get(p, "activate-label").behavior?.keyframes?.owner).toBe(
      "activate",
    );
    expect(get(p, "activate-label").behavior?.keyframes?.slot).toBeUndefined();
    expect(() => validatePackage(p)).not.toThrow();
  });
  it("preserves recorded settings through document undo/redo without aliasing", () => {
    const history = createOverrideHistory(),
      before = {
        a: { behavior: { keyframes: structuredClone(KEYFRAME_DEFAULTS) } },
      },
      after = structuredClone(before);
    after.a.behavior.keyframes.frames[1].x = 40;
    history.record(before, after);
    before.a.behavior.keyframes.frames[0].x = 999;
    expect(history.undo(after)?.a.behavior).toEqual({
      keyframes: KEYFRAME_DEFAULTS,
    });
    expect(history.redo(before)).toEqual(after);
  });
  it("rewrites copied keyframe owners/slots in actual repeat exports", () => {
    const design = node("Root", {
      id: "root",
      children: [
        node("Repeat", {
          id: "repeat",
          type: "TRANSFORM_GROUP",
          width: 300,
          height: 60,
          transformModifiers: [
            {
              type: "REPEAT",
              repeatType: "LINEAR",
              count: 3,
              unitType: "PIXELS",
              offset: 100,
              axis: "HORIZONTAL",
            },
          ],
          children: [node("Button", { id: "button", width: 60, height: 40 })],
        }),
      ],
    });
    const p = compile([design], "repeat-keyframes", {
      layerOverrides: {
        button: { behavior: { keyframes: exampleChain("activate") } },
      },
    });
    expect(p.issues.filter((i) => i.severity === "error")).toEqual([]);
    for (let i = 1; i < 3; i++)
      expect(
        get(p, `button/repeat:repeat:${i}`).behavior?.keyframes,
      ).toMatchObject({
        owner: `button/repeat:repeat:${i}`,
        slot: `button/repeat:repeat:${i}/motion-slot`,
      });
    expect(() => validatePackage(p)).not.toThrow();
  });
  it("preserves panel/tab logical ownership in the browser and every source/model format", () => {
    const p = keyframePackage();
    const ui = createPreviewUI(p.roots[0]);
    expect(ui.activate("open")).toBe(true);
    expect(ui.visible.get("panel/motion-slot")).toBe(true);
    for (const format of SOURCE_FORMATS) {
      const code = generateSource(p, format.id);
      expect(code).toContain("FramebridgeBehavior");
      if (format.id !== "tsx")
        expect(code).toContain("FramebridgeKeyframeTime");
    }
    expect(generateModel(p)).toContain("FramebridgeKeyframeStatus");
  });
  it("compares and extracts self-contained recorded widgets without losing their input or reservation", () => {
    const card = (id: string, x: number) =>
      node("Card", {
        id,
        width: 160,
        height: 80,
        transform: [
          [1, 0, x],
          [0, 1, 20],
        ],
        children: [
          node("Animated button", {
            id: `${id}-button`,
            width: 90,
            height: 30,
            transform: [
              [1, 0, 20],
              [0, 1, 20],
            ],
          }),
        ],
      });
    const designs = [
      node("Components", {
        id: "components",
        width: 500,
        height: 200,
        children: [card("card-a", 10), card("card-b", 200)],
      }),
    ];
    const p = compile(designs, "keyframe-components", {
      layerOverrides: {
        "card-a-button": { behavior: { keyframes: exampleChain("activate") } },
        "card-b-button": { behavior: { keyframes: exampleChain("activate") } },
      },
    });
    const result = {
      designs,
      package: p,
      assets: {},
      previews: {},
      revision: 1,
    };
    const group = reviewComponents(result).find(
      (g) => g.nodeIds.join() === "card-a,card-b",
    );
    expect(group).toBeDefined();
    const extracted = extractComponent(result, group!.key);
    expect(
      flatten(extracted.package.roots).find((n) => n.id === "card-a-button")
        ?.behavior?.keyframes,
    ).toMatchObject({
      owner: "card-a-button",
      slot: "card-a-button/motion-slot",
    });
    expect(() => validatePackage(extracted.package)).not.toThrow();
  });
  it("allows a parent cooldown to gate a decorative chain without sharing property writers", () => {
    const chain = exampleChain("activate", {
      input: "parent",
      frames: exampleChain("activate").frames.map((f) => ({
        ...f,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      })),
    });
    const p = keyframePackage({
      layerOverrides: {
        open: {
          behavior: {
            action: { kind: "toggle", target: "panel" },
            control: { kind: "cooldown", duration: 1 },
          },
        },
        "open-label": { behavior: { keyframes: chain } },
      },
    });
    expect(p.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(get(p, "open-label").behavior?.keyframes?.owner).toBe("open");
    expect(() => validatePackage(p)).not.toThrow();
  });
  it("bounds the number of native chains independently for each screen", () => {
    const chain = exampleChain("mount", {
      frames: exampleChain("mount").frames.map((f) => ({
        ...f,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      })),
    });
    const make = (count: number) => {
      const children = Array.from({ length: count }, (_, i) =>
        node("Fader", { id: `fader-${i}`, width: 10, height: 10 }),
      );
      return compile(
        [
          node("Bounded chains", {
            id: "bounded",
            width: 400,
            height: 400,
            children,
          }),
        ],
        "bounded-keyframes",
        {
          layerOverrides: Object.fromEntries(
            children.map((n) => [n.id, { behavior: { keyframes: chain } }]),
          ),
        },
      );
    };
    expect(make(256).issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(
      make(257).issues.some(
        (i) => i.severity === "error" && i.message.includes("256"),
      ),
    ).toBe(true);
  });
});
