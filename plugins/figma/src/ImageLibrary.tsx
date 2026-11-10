import { FilePicker } from "./components/FilePicker";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { ChevronRight } from "./components/Glyph";
import { SelectControl } from "./components/SelectControl";
import { useEffect, useRef, useState } from "react";
import {
  ASSET_CATALOG_KEY,
  createAssetCatalog,
  fingerprintPng,
  ownerKey,
  type CatalogEntry,
  type AssetOwner,
} from "./asset-catalog";
import { isHostMessage } from "./bridge";
import type { AnalysisResult } from "../../../packages/core/src/types";
import { imageUseTarget } from "./image-use-target";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { imagePage, IMAGE_PAGE_SIZE } from "./image-pages";
import { ImagePages } from "./ImagePages";
import { validAssetId } from "../../../packages/core/src/geometry";
import type { Asset } from "../../../packages/core/src/types";

function ImageUses({
  uses,
  assetId,
  locate,
}: {
  uses: Asset[];
  assetId: string;
  locate(asset: Asset): void;
}) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(0);
  const visible = imagePage(uses, page);
  if (!uses.length) return null;
  return (
    <Disclosure onToggle={(event) => setOpen(event.currentTarget.open)}>
      <DisclosureSummary>
        {uses.length} matching {uses.length === 1 ? "layer" : "layers"}
      </DisclosureSummary>
      {open && (
        <>
          {visible.items.map((asset) => (
            <Button
              key={asset.id}
              size="sm"
              variant="ghost"
              onClick={() => locate(asset)}
            >
              {validAssetId(asset.robloxId ?? "") === assetId
                ? "Show use: "
                : "Show matching layer: "}
              {asset.name}
            </Button>
          ))}
          <ImagePages
            value={visible}
            onChange={setPage}
            label="Matching layer pages"
          />
        </>
      )}
    </Disclosure>
  );
}

async function thumbnail(bytes: number[]) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes).buffer], { type: "image/png" }),
  );
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 48 / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    return data.length <= 12_000 ? data : undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function useImageLibrary() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]),
    [warning, setWarning] = useState("");
  const requests = useRef(
    new Map<
      number,
      {
        resolve(value: unknown): void;
        reject(error: Error): void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const sequence = useRef(0);
  const request = (type: string, catalog?: CatalogEntry[]) =>
    new Promise<unknown>((resolve, reject) => {
      const revision = ++sequence.current;
      const timer = setTimeout(() => {
        requests.current.delete(revision);
        reject(new Error("Image library storage timed out."));
      }, 10000);
      requests.current.set(revision, { resolve, reject, timer });
      parent.postMessage({ pluginMessage: { type, catalog, revision } }, "*");
    });
  const catalog = useRef<ReturnType<typeof createAssetCatalog> | null>(null);
  if (!catalog.current)
    catalog.current = createAssetCatalog(
      {
        load: async () => {
          if (!import.meta.env.DEV) return request("load-asset-catalog");
          const saved = localStorage.getItem(ASSET_CATALOG_KEY);
          if (
            !saved &&
            ["image-history", "image-batches"].includes(
              new URLSearchParams(location.search).get("fixture") ?? "",
            )
          )
            return (
              await fetch(
                new URLSearchParams(location.search).get("fixture") ===
                  "image-batches"
                  ? "/.artifacts/image-batches/catalog.json"
                  : "/.artifacts/image-history-catalog.json",
              )
            ).json();
          return JSON.parse(saved || "null");
        },
        save: async (entries) => {
          if (import.meta.env.DEV)
            localStorage.setItem(ASSET_CATALOG_KEY, JSON.stringify(entries));
          else await request("save-asset-catalog", entries);
        },
      },
      setEntries,
      setWarning,
      thumbnail,
    );
  const restore = async () => {
    try {
      await catalog.current!.load();
      setWarning("");
    } catch {
      setWarning(
        "Saved images could not be read. Retry to restore your library.",
      );
    }
  };
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const m = event.data.pluginMessage;
      if (m?.type !== "asset-catalog-response") return;
      const pending = requests.current.get(m.revision);
      if (!pending) return;
      clearTimeout(pending.timer);
      requests.current.delete(m.revision);
      m.error ? pending.reject(new Error(m.error)) : pending.resolve(m.catalog);
    };
    window.addEventListener("message", handler);
    void restore();
    return () => {
      window.removeEventListener("message", handler);
      for (const pending of requests.current.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Plugin closed."));
      }
      requests.current.clear();
    };
  }, []);
  return { catalog: catalog.current, entries, warning, restore };
}
export function ImageLibrary(props: {
  library: ReturnType<typeof useImageLibrary>;
  owner: AssetOwner;
  result?: AnalysisResult;
  disabled: boolean;
  defaultOpen?: boolean;
  assign(asset: string, id: string): void;
  locate(node: string): void;
}) {
  const [search, setSearch] = useState(""),
    [target, setTarget] = useState(""),
    [targetSearch, setTargetSearch] = useState(""),
    [targetPage, setTargetPage] = useState(0),
    [scan, setScan] = useState(""),
    [message, setMessage] = useState(""),
    [page, setPage] = useState(0);
  const scanRevision = useRef(0);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  useEffect(() => {
    let current = true;
    const run = async () => {
      const next: Record<string, string> = {};
      const memo = new WeakMap<number[], Promise<string>>();
      for (const [id, bytes] of Object.entries(props.result?.assets ?? {})) {
        if (bytes)
          try {
            let hash = memo.get(bytes);
            if (!hash) {
              hash = fingerprintPng(bytes);
              memo.set(bytes, hash);
            }
            next[id] = await hash;
          } catch {}
        if (!current) return;
      }
      setHashes(next);
    };
    void run();
    return () => {
      current = false;
    };
  }, [props.result?.assets]);
  const validTarget = props.result?.package.assets.some((a) => a.id === target)
    ? target
    : "";
  const scope = ownerKey(props.owner);
  const entries = props.library.entries.filter(
    (e) =>
      (!scope || e.owner === scope) &&
      (!scan || e.fingerprint === scan) &&
      e.name.toLowerCase().includes(search.toLowerCase()),
  );
  const visible = imagePage(entries, page);
  const targets = imagePage(
    (props.result?.package.assets ?? []).filter((asset) =>
      asset.name.toLowerCase().includes(targetSearch.toLowerCase()),
    ),
    targetPage,
  );
  const selectedTarget = props.result?.package.assets.find(
    (asset) => asset.id === validTarget,
  );
  const assign = (entry: CatalogEntry, assetId: string) => {
    if (
      props.disabled ||
      !props.result?.package.assets.some((a) => a.id === assetId)
    )
      return;
    props.assign(assetId, entry.assetId);
    setMessage(
      "Image assigned. Confirm its owner can be used in this experience.",
    );
  };
  const scanFile = async (file?: File) => {
    if (!file || props.disabled) return;
    const revision = ++scanRevision.current;
    try {
      if (file.size > 20_000_000)
        throw new Error("Choose a PNG smaller than 20 MB.");
      const hash = await fingerprintPng(
        new Uint8Array(await file.arrayBuffer()),
      );
      if (revision !== scanRevision.current) return;
      setScan(hash);
      setMessage(
        "Showing saved images with identical PNG bytes. Choose the target layer, then assign a match.",
      );
    } catch (e) {
      if (revision !== scanRevision.current) return;
      setMessage(e instanceof Error ? e.message : "Could not match this file.");
    }
  };
  return (
    <Disclosure
      open={props.defaultOpen || undefined}
      className="image-library artwork-resource artwork-saved"
    >
      <DisclosureSummary>
        <span>Saved images · {props.library.entries.length}</span>
      </DisclosureSummary>
      {props.library.entries.length > 0 && (
        <p className="artwork-hint">
          Experience permissions apply to this owner’s images.
        </p>
      )}
      {props.library.warning && (
        <p role="alert">
          {props.library.warning}{" "}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void props.library.restore()}
          >
            Retry library
          </Button>
        </p>
      )}
      {props.library.entries.length ? (
        <>
          <Input
            aria-label="Search saved images"
            placeholder="Search saved images"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          {(props.result?.package.assets.length ?? 0) > IMAGE_PAGE_SIZE && (
            <Input
              aria-label="Find target image layer"
              placeholder="Find target image layer"
              value={targetSearch}
              onChange={(event) => {
                setTargetSearch(event.target.value);
                setTargetPage(0);
              }}
            />
          )}
          <label>
            Target layer
            <SelectControl
              aria-label="Library target image"
              value={target}
              disabled={props.disabled}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose an image layer</option>
              {selectedTarget &&
                !targets.items.some(
                  (asset) => asset.id === selectedTarget.id,
                ) && (
                  <option value={selectedTarget.id}>
                    {selectedTarget.name}
                  </option>
                )}
              {targets.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectControl>
          </label>
          <ImagePages
            value={targets}
            onChange={setTargetPage}
            label="Target image pages"
          />
          <div
            className="library-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void scanFile(e.dataTransfer.files[0]);
            }}
          >
            <label>
              Match a PNG
              <FilePicker
                accept="image/png"
                aria-label="Match a PNG in saved images"
                disabled={props.disabled}
                onChange={(e) => {
                  void scanFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {scan && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  scanRevision.current += 1;
                  setScan("");
                  setMessage("");
                }}
              >
                Show all saved images
              </Button>
            )}
          </div>
          {message && <p role="status">{message}</p>}
          <div className="library-grid">
            {visible.items.map((entry) => {
              const uses =
                props.result?.package.assets.filter(
                  (a) =>
                    validAssetId(a.robloxId ?? "") === entry.assetId ||
                    hashes[a.id] === entry.fingerprint,
                ) ?? [];
              return (
                <article
                  key={`${entry.owner}:${entry.fingerprint}`}
                  draggable={!props.disabled}
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      "application/x-framebridge-image",
                      JSON.stringify({
                        owner: entry.owner,
                        fingerprint: entry.fingerprint,
                      }),
                    )
                  }
                >
                  {entry.thumbnail && <img src={entry.thumbnail} alt="" />}
                  <strong title={entry.name}>{entry.name}</strong>
                  <small className="artwork-file-meta">
                    {entry.owner} · {entry.width} × {entry.height}
                  </small>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={props.disabled || !validTarget}
                    onClick={() => assign(entry, validTarget)}
                  >
                    Assign
                  </Button>
                  <ImageUses
                    uses={uses}
                    assetId={entry.assetId}
                    locate={(a) => {
                      const id =
                        props.result && imageUseTarget(props.result, a);
                      if (id) props.locate(id);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={props.disabled}
                    onClick={() =>
                      void props.library.catalog
                        .remove(entry)
                        .catch(() =>
                          setMessage(
                            "This image could not be removed from saved storage.",
                          ),
                        )
                    }
                  >
                    Forget
                  </Button>
                </article>
              );
            })}
          </div>
          <ImagePages
            value={visible}
            onChange={setPage}
            label="Saved image pages"
          />
          {!entries.length && (
            <p className="artwork-empty">
              {search || scan
                ? "No matching images."
                : "Uploaded images will appear here."}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={props.disabled || !props.library.entries.length}
            onClick={() =>
              void props.library.catalog
                .clear()
                .catch(() =>
                  setMessage("The saved library could not be cleared."),
                )
            }
          >
            Clear saved library
          </Button>
        </>
      ) : (
        <p className="resource-empty" role="status">
          No saved images yet.
        </p>
      )}
    </Disclosure>
  );
}
