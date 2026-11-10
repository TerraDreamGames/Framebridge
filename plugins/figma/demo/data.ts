import {
  demoResult,
  demoSvg,
  type DemoArtwork,
} from "../../../packages/core/src/demo";
import type {
  AnalysisResult,
  DesignNode,
  ExportOptions,
} from "../../../packages/core/src/types";
import { loadDemoArtwork } from "../src/demo-artwork";
import { pngPixelSize } from "../../../packages/core/src/image-scaling";

export async function prepareDemo(
  options: ExportOptions,
): Promise<{ data: AnalysisResult; artwork: DemoArtwork }> {
  const artwork = await loadDemoArtwork(
    new URL("./artwork/", location.href).href,
  );
  const data = demoResult(options, artwork);
  const nodes = new Map<string, DesignNode>();
  const walk = (rows: DesignNode[]) =>
    rows.forEach((node) => {
      nodes.set(node.id, node);
      walk(node.children);
    });
  walk(data.designs ?? []);
  await Promise.all(
    data.package.assets.map(async (asset) => {
      const source = nodes.get(asset.nodeId);
      if (!source) return;
      const hash = source.fills.find((fill) => fill.imageHash)?.imageHash;
      let url = hash ? artwork[hash] : undefined;
      if (!url) {
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
          demoSvg(
            [
              {
                ...source,
                transform: [
                  [1, 0, 0],
                  [0, 1, 0],
                ],
              },
            ],
            artwork,
          ),
        )}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(source.width));
        canvas.height = Math.max(1, Math.ceil(source.height));
        canvas
          .getContext("2d")!
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        url = canvas.toDataURL("image/png");
      }
      const bytes = Uint8Array.from(atob(url.split(",")[1]), (character) =>
        character.charCodeAt(0),
      );
      data.assets[asset.id] = Array.from(bytes);
      asset.pixelSize = pngPixelSize(bytes);
    }),
  );
  return { data, artwork };
}
