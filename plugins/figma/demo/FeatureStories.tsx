import { featureOverrides, featureSelection } from "./feature-data";
import { useEffect, useMemo, useRef, useState } from "react";
import { compile } from "../../../packages/core/src/compiler";
import { advancedControlDesign } from "../../../packages/core/src/advanced-control-examples";

import { PARTICLE_DEFAULTS } from "../../../packages/core/src/particles";
import { defaultWorldSettings } from "../../../packages/core/src/world-space";
import {
  flatten,
  type AnalysisResult,
  type DesignNode,
  type LayerOverride,
  type ImageProcessing,
  type Value,
} from "../../../packages/core/src/types";
import { BehaviorEditor } from "../src/BehaviorEditor";
import { MotionEditor } from "../src/MotionEditor";
import { KeyframeEditor } from "../src/KeyframeEditor";
import { ConditionalRuleEditor } from "../src/ConditionalRuleEditor";
import { ParticleEditor } from "../src/ParticleEditor";
import { WorldEditor } from "../src/WorldEditor";
import { ImagePreparation } from "../src/ImagePreparation";
import { ImageScalingEditor } from "../src/ImageScalingEditor";
import { ReportFeedback } from "../src/ReportFeedback";
import { LayerRuleMatcher } from "../src/LayerRuleMatcher";
import { RobloxAccountPanel } from "../src/RobloxAccountPanel";
import { ImageLibrary } from "../src/ImageLibrary";
import { createAssetCatalog } from "../src/asset-catalog";
import { ArtworkImport } from "../src/ArtworkImport";
import { CloudArtworkLibrary } from "../src/CloudArtworkLibrary";
import type {
  createRobloxAccountManager,
  RobloxAccountState,
} from "../src/roblox-account-manager";
import type { DemoScene } from "./scenes";

export const featureIds = new Set<DemoScene>([
  "interactions",
  "progress",
  "toggle",
  "slider",
  "cooldown",
  "tooltip",
  "window",
  "skill",
  "roulette",
  "tabs",
  "data",
  "motion",
  "keyframes",
  "rules",
  "particles",
  "world",
  "image-preparation",
  "image-scaling",
  "report",
  "select-rules",
]);
const designs = advancedControlDesign();
const sources = new Map<string, DesignNode>();
const walk = (rows: DesignNode[]) =>
  rows.forEach((n) => {
    sources.set(n.id, n);
    walk(n.children);
  });
walk(designs);
export function FeatureStory({
  scene,
  result,
  notice,
}: {
  scene: DemoScene;
  result: AnalysisResult;
  notice: (message: string) => void;
}) {
  const initial = useMemo(() => featureOverrides(scene), [scene]);
  const [edits, setEdits] = useState(initial);
  const [processing, setProcessing] = useState<ImageProcessing>({
    edgeCleanup: true,
  });
  const [world, setWorld] = useState<
    ReturnType<typeof defaultWorldSettings> | false
  >(defaultWorldSettings("surface"));
  const [particles, setParticles] = useState<
    typeof PARTICLE_DEFAULTS | undefined
  >(structuredClone(PARTICLE_DEFAULTS));
  const host = useRef<HTMLDivElement>(null);
  const pkg = useMemo(
    () =>
      compile(
        designs,
        "website-controls",
        { layerOverrides: edits },
        "2026-11-10",
      ),
    [edits],
  );
  const nodes = flatten(pkg.roots);
  const id = featureSelection[scene] ?? scene;
  const source = sources.get(id) ?? sources.get("cooldown")!;
  const node = nodes.find((n) => n.id === source.id)!;
  const edit = edits[source.id] ?? {};
  const onChange = (behavior: LayerOverride["behavior"]) =>
    setEdits((before) => ({ ...before, [source.id]: { ...edit, behavior } }));
  useEffect(() => {
    // Open the demonstrated section; this is the same disclosure element used by the installed inspector.
    const selector =
      scene === "image-scaling"
        ? ".slice-editor"
        : scene === "motion"
          ? ".motion-setup"
          : scene === "keyframes"
            ? ".keyframe-setup"
            : scene === "rules"
              ? ".conditional-rules"
              : scene === "world"
                ? ".world-setup"
                : scene === "select-rules"
                  ? "details"
                  : ".behavior-setup";
    const target =
      host.current?.querySelector<HTMLDetailsElement>(selector) ??
      host.current?.querySelector<HTMLDetailsElement>("details");
    if (target) target.open = true;
  }, [scene]);
  const imageAsset =
    result.package.assets.find((a) =>
      a.name.toLowerCase().includes("window"),
    ) ?? result.package.assets[0];
  const imageNode = flatten(result.package.roots).find(
    (n) => n.id === imageAsset.nodeId,
  )!;
  const [imageProperties, setImageProperties] = useState<Record<string, Value>>(
    {
      ...imageNode?.properties,
      ScaleType: { type: "Enum" as const, value: ["ScaleType", "Slice"] },
      SliceCenter: { type: "Rect" as const, value: [24, 24, 232, 232] },
    },
  );
  return (
    <div ref={host} className="demo-feature inspector-tools">
      {scene === "report" ? (
        <ReportFeedback
          pkg={result.package}
          knownSecrets={[]}
          onExport={(report) => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(report, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "sample-issue.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        />
      ) : scene === "image-preparation" ? (
        <ImagePreparation value={processing} onChange={setProcessing} />
      ) : scene === "image-scaling" ? (
        <ImageScalingEditor
          node={{ ...imageNode, properties: imageProperties }}
          asset={imageAsset}
          bytes={result.assets[imageAsset.id]}
          onChange={(name, value) =>
            setImageProperties((before) => ({ ...before, [name]: value }))
          }
        />
      ) : scene === "world" ? (
        <WorldEditor
          root={result.package.roots[0]}
          value={world}
          onChange={setWorld}
        />
      ) : scene === "select-rules" ? (
        <LayerRuleMatcher
          layers={flatten(result.package.roots).map((node) => ({ node }))}
          overrides={{}}
          disabled={false}
          onSelect={(ids) => notice(`${ids.length} sample layers selected.`)}
        />
      ) : scene === "motion" ? (
        <MotionEditor
          source={source}
          node={node}
          edit={edit}
          onChange={onChange}
        />
      ) : scene === "keyframes" ? (
        <KeyframeEditor
          source={source}
          node={node}
          nodes={nodes}
          edit={edit}
          onChange={onChange}
        />
      ) : scene === "rules" ? (
        <ConditionalRuleEditor
          source={source}
          node={node}
          nodes={nodes}
          edit={edit}
          onChange={onChange}
          disabled={false}
        />
      ) : scene === "particles" ? (
        <ParticleEditor
          value={particles}
          onChange={setParticles}
          onError={notice}
        />
      ) : (
        <BehaviorEditor
          source={source}
          node={node}
          nodes={nodes}
          edit={edit}
          onChange={onChange}
        />
      )}
    </div>
  );
}

const disconnected: RobloxAccountState = {
  loading: false,
  busy: false,
  error: "",
  simulation: false,
  retry: false,
  notice: "",
};
// Deliberately inert: the website never restores a sign-in or accepts credentials.
const accountManager = {
  start: async () => {},
  reopen: async () => {},
  check: async () => {},
  disconnect: async () => {},
} as unknown as ReturnType<typeof createRobloxAccountManager>;
export function DemoAccount({ notice }: { notice: (message: string) => void }) {
  return (
    <div
      onClickCapture={(event) => {
        if ((event.target as Element).closest("button")) {
          event.preventDefault();
          event.stopPropagation();
          notice(
            "Sign in from the installed Figma plugin. This website does not connect to Roblox.",
          );
        }
      }}
    >
      <RobloxAccountPanel
        state={disconnected}
        manager={accountManager}
        cloud={{ key: "", ownerType: "user", ownerId: "" }}
        update={() => {}}
        disabled={false}
      />
    </div>
  );
}
export function DemoLibrary({ result }: { result: AnalysisResult }) {
  const [entries, setEntries] = useState<never[]>([]);
  const catalog = useMemo(
    () =>
      createAssetCatalog(
        { load: async () => [], save: async () => {} },
        () => setEntries([]),
        () => {},
        async () => undefined,
      ),
    [],
  );
  return (
    <ImageLibrary
      library={{ catalog, entries, warning: "", restore: async () => {} }}
      owner={{ ownerType: "user", ownerId: "" }}
      result={result}
      disabled={false}
      defaultOpen
      assign={() => {}}
      locate={() => {}}
    />
  );
}
export function DemoLocal() {
  return <ArtworkImport defaultOpen />;
}
export function DemoCloud() {
  return <CloudArtworkLibrary account={disconnected} defaultOpen />;
}
