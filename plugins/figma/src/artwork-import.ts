import { artworkName } from "../../../packages/core/src/cloud-artwork";
import { libraryPng } from "../../../packages/core/src/image-processing";
/** Creates one new image rectangle; existing nodes/configuration are untouched. */
export function importArtwork(figma: PluginAPI, input: unknown) {
  const v = input as { name: string; png: number[] };
  if (
    !v ||
    typeof v !== "object" ||
    Object.keys(v).some((k) => !["name", "png"].includes(k)) ||
    !Array.isArray(v.png) ||
    v.png.length > 512 * 1024 ||
    v.png.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    throw new Error("Choose a bounded PNG file to import.");
  const name = artworkName(v.name),
    png = libraryPng(new Uint8Array(v.png));
  const image = figma.createImage(png.bytes),
    selection = figma.currentPage.selection;
  let node: RectangleNode | undefined;
  try {
    node = figma.createRectangle();
    node.name = name;
    node.resize(png.width, png.height);
    node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
    node.strokes = [];
    node.x = figma.viewport.center.x - png.width / 2;
    node.y = figma.viewport.center.y - png.height / 2;
    figma.currentPage.appendChild(node);
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
    figma.commitUndo();
    return { id: node.id, name, width: png.width, height: png.height };
  } catch (error) {
    node?.remove();
    figma.currentPage.selection = selection;
    throw error;
  }
}
