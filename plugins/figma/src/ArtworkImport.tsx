import { FilePicker } from "./components/FilePicker";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { ChevronRight } from "./components/Glyph";
import { Input } from "./components/ui/input";
import { useEffect, useRef, useState } from "react";
import { libraryPng } from "../../../packages/core/src/image-processing";
import {
  ARTWORK_LIMITS as L,
  artworkName,
} from "../../../packages/core/src/cloud-artwork";
import { isHostMessage } from "./bridge";
import { Button } from "./components/ui/button";
import "./artwork-pages.css";
let importRevision = 0;
export function LocalPngPreview({
  bytes,
  name,
}: {
  bytes: Uint8Array;
  name: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    );
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [bytes]);
  return url ? (
    <img
      src={url}
      alt={"Reviewed PNG: " + name}
      style={{
        maxWidth: "100%",
        maxHeight: 180,
        objectFit: "contain",
        imageRendering: "pixelated",
      }}
    />
  ) : null;
}
export function downloadArtwork(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, "_") + ".png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function useArtworkImporter() {
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" }),
    pending = useRef<
      | {
          revision: number;
          timer: ReturnType<typeof setTimeout>;
          resolve(): void;
        }
      | undefined
    >(undefined);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const m = event.data?.pluginMessage,
        p = pending.current;
      if (
        m?.type !== "artwork-import-response" ||
        !p ||
        m.revision !== p.revision
      )
        return;
      clearTimeout(p.timer);
      p.resolve();
      pending.current = undefined;
      setStatus({
        busy: false,
        error: m.error ?? "",
        notice: m.error
          ? ""
          : `Imported ${m.imported.name} as a new Figma image layer. Review before Roblox upload.`,
      });
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (pending.current) {
        clearTimeout(pending.current.timer);
        pending.current.resolve();
        pending.current = undefined;
      }
    };
  }, []);
  const importPng = async (bytes: Uint8Array, name: string) => {
    if (pending.current) return;
    setStatus({ busy: true, error: "", notice: "" });
    try {
      const png = libraryPng(bytes);
      name = artworkName(name);
      if (import.meta.env.DEV) {
        downloadArtwork(png.bytes, name);
        setStatus({
          busy: false,
          error: "",
          notice:
            "Browser fixture downloaded a validated PNG. Native Figma layer import requires the plugin host.",
        });
        return;
      }
      const revision = ++importRevision;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          pending.current = undefined;
          setStatus({
            busy: false,
            error:
              "Figma import did not respond. Inspect the document before retrying; a layer may have been created.",
            notice: "",
          });
          resolve();
        }, 20000);
        pending.current = { revision, timer, resolve };
        parent.postMessage(
          {
            pluginMessage: {
              type: "import-artwork",
              revision,
              artwork: { name, png: Array.from(png.bytes) },
            },
          },
          "*",
        );
      });
    } catch (e) {
      setStatus({
        busy: false,
        error: e instanceof Error ? e.message : "PNG import failed.",
        notice: "",
      });
    }
  };
  return { status, importPng };
}
export async function readArtworkFile(file: File) {
  if (file.type && file.type !== "image/png")
    throw new Error("Choose a PNG file.");
  if (file.size > L.pngBytes)
    throw new Error("Choose a PNG no larger than 512 KiB.");
  const png = libraryPng(new Uint8Array(await file.arrayBuffer()));
  return {
    bytes: png.bytes,
    name: artworkName(
      file.name.replace(/\.png$/i, "").slice(0, 100) || "Artwork",
    ),
    width: png.width,
    height: png.height,
  };
}
export function ArtworkImport({
  disabled = false,
  defaultOpen = false,
}: {
  disabled?: boolean;
  defaultOpen?: boolean;
}) {
  const importer = useArtworkImporter(),
    [selected, setSelected] =
      useState<Awaited<ReturnType<typeof readArtworkFile>>>(),
    [error, setError] = useState("");
  const blocked = disabled || importer.status.busy;
  const choose = async (file?: File) => {
    if (!file || blocked) return;
    try {
      setSelected(await readArtworkFile(file));
      setError("");
    } catch (e) {
      setSelected(undefined);
      setError(e instanceof Error ? e.message : "PNG could not be read.");
    }
  };
  return (
    <Disclosure
      open={defaultOpen || undefined}
      className="image-library artwork-resource artwork-local"
    >
      <DisclosureSummary>
        <span>Import a local PNG</span>
      </DisclosureSummary>
      <p className="artwork-hint">PNG · up to 512 KiB · 1024 px per edge</p>
      <div
        className="artwork-dropzone"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (
            e.dataTransfer.types.includes("Files") ||
            e.dataTransfer.files.length
          ) {
            e.preventDefault();
            if (!blocked) void choose(e.dataTransfer.files[0]);
          }
        }}
      >
        <div className="resource-file-actions">
          <FilePicker
            aria-label="Local artwork PNG"

            accept="image/png,.png"
            disabled={blocked}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {selected && (
            <Button
              disabled={blocked}
              onClick={() =>
                void importer.importPng(selected.bytes, selected.name)
              }
            >
              Import into Figma
            </Button>
          )}
        </div>
        {selected && (
          <>
            <LocalPngPreview bytes={selected.bytes} name={selected.name} />
            <p className="artwork-file-meta">
              {selected.name} · {selected.width} × {selected.height} ·{" "}
              {selected.bytes.length} bytes
            </p>
          </>
        )}
      </div>
      {(error || importer.status.error) && (
        <p role="alert">{error || importer.status.error}</p>
      )}
      {importer.status.notice && <p role="status">{importer.status.notice}</p>}
    </Disclosure>
  );
}
