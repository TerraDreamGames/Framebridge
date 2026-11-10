import { FilePicker } from "./components/FilePicker";
import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { ChevronRight } from "./components/Glyph";
import { SelectControl } from "./components/SelectControl";
import { useEffect, useState } from "react";
import { encode } from "fast-png";
import {
  ARTWORK_LIMITS as L,
  type ArtworkItem,
} from "../../../packages/core/src/cloud-artwork";
import type { RobloxAccountState } from "./roblox-account-manager";
import { useCloudArtwork } from "./useCloudArtwork";
import {
  downloadArtwork,
  readArtworkFile,
  useArtworkImporter,
  LocalPngPreview,
} from "./ArtworkImport";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Checkbox } from "./components/ui/checkbox";
const DRAG = "application/x-framebridge-cloud-artwork";
type Reviewed = {
  bytes: Uint8Array;
  name: string;
  width: number;
  height: number;
};
export function CloudArtworkLibrary({
  account,
  disabled = false,
  defaultOpen = false,
}: {
  account: RobloxAccountState;
  disabled?: boolean;
  defaultOpen?: boolean;
}) {
  const { state, manager } = useCloudArtwork(account),
    importer = useArtworkImporter();
  const [scope, setScope] = useState("personal"),
    [consent, setConsent] = useState(false),
    [query, setQuery] = useState(""),
    [folder, setFolder] = useState("all"),
    [folderName, setFolderName] = useState(""),
    [reviewed, setReviewed] = useState<Reviewed>(),
    [uploadFolder, setUploadFolder] = useState(""),
    [localError, setLocalError] = useState(""),
    [preview, setPreview] = useState<{ url: string; name: string }>(),
    [editing, setEditing] = useState<{
      item: ArtworkItem;
      name: string;
      folder: string;
    }>(),
    [deleting, setDeleting] = useState<{
      kind: "image" | "folder" | "library";
      id?: string;
      name: string;
    }>();
  useEffect(() => {
    setConsent(false);
    setReviewed(undefined);
    setEditing(undefined);
    setDeleting(undefined);
    setFolder("all");
    setUploadFolder("");
    setPreview(undefined);
  }, [state.connected, state.snapshot?.generation, account.account?.userId]);
  useEffect(() => {
    if (
      folder !== "all" &&
      folder &&
      !state.snapshot?.folders.some((f) => f.id === folder)
    )
      setFolder("all");
  }, [folder, state.snapshot?.folders]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  useEffect(() => {
    if (!state.snapshot?.folders.some((f) => f.id === uploadFolder))
      setUploadFolder("");
  }, [state.snapshot?.folders, uploadFolder]);
  const blocked = disabled || state.busy || importer.status.busy,
    mutation = blocked || !!state.conflict,
    signed =
      !!account.accountToken &&
      !!account.account &&
      !account.account.needsAuthorization;
  const snapshot = state.snapshot,
    label =
      snapshot?.scope.kind === "group"
        ? "shared Roblox group " + snapshot.scope.id
        : "personal Roblox account " +
          (snapshot?.scope.id ?? account.account?.userId ?? "");
  const selectFile = async (file?: File) => {
    if (!file || blocked) return;
    try {
      setReviewed(await readArtworkFile(file));
      setLocalError("");
    } catch (e) {
      setReviewed(undefined);
      setLocalError(e instanceof Error ? e.message : "PNG could not be read.");
    }
  };
  const receive = async (e: React.DragEvent) => {
    e.preventDefault();
    if (blocked) return;
    try {
      if (e.dataTransfer.files.length) {
        await selectFile(e.dataTransfer.files[0]);
        return;
      }
      const raw = e.dataTransfer.getData(DRAG);
      if (raw.length > 512) throw Error("Invalid artwork drag.");
      const value = JSON.parse(raw);
      if (
        !snapshot ||
        value.generation !== snapshot.generation ||
        value.scope !== snapshot.scope.kind + ":" + snapshot.scope.id ||
        !snapshot.items.some((i) => i.id === value.id)
      )
        throw Error("Fetch and drag an image from this connected library.");
      const result = await manager.download(value.id);
      if (result)
        setReviewed({
          bytes: result.bytes,
          name: result.item.name,
          width: result.item.width,
          height: result.item.height,
        });
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "Artwork could not be reviewed.",
      );
    }
  };
  const imageAction = async (
    item: ArtworkItem,
    action: "preview" | "download" | "import",
  ) => {
    const result = await manager.download(item.id);
    if (!result) return;
    if (action === "import") await importer.importPng(result.bytes, item.name);
    else if (action === "download") downloadArtwork(result.bytes, item.name);
    else
      setPreview({
        url: URL.createObjectURL(
          new Blob([new Uint8Array(result.bytes)], { type: "image/png" }),
        ),
        name: item.name,
      });
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    await manager.edit(
      deleting.kind === "library"
        ? "delete-library"
        : deleting.kind === "folder"
          ? "delete-folder"
          : "delete-image",
      deleting.id ? { id: deleting.id } : {},
    );
    if (!manager.snapshot().error && !manager.snapshot().conflict)
      setDeleting(undefined);
  };
  const filtered =
    snapshot?.items.filter(
      (i) =>
        (folder === "all" || i.folder === (folder || null)) &&
        (i.name.toLowerCase().includes(query.toLowerCase()) ||
          snapshot.folders
            .find((f) => f.id === i.folder)
            ?.name.toLowerCase()
            .includes(query.toLowerCase())),
    ) ?? [];
  return (
    <Disclosure
      open={defaultOpen || undefined}
      className="image-library artwork-resource artwork-cloud"
    >
      <DisclosureSummary>
        <span>Cloud artwork</span>
      </DisclosureSummary>
      <p className="artwork-hint">
        Private PNG storage across devices. Saving here does not publish a
        Roblox asset.
      </p>
      {!state.enabled && (
        <p className="artwork-empty">
          Cloud storage is unavailable on this service.
        </p>
      )}
      {!signed && (
        <p className="artwork-hint">Sign in with Roblox to connect.</p>
      )}
      {account.simulation && (
        <p>
          This sign-in demo uses synthetic provider identities and local test
          storage.
        </p>
      )}
      {!state.connected && (
        <>
          <label>
            Artwork scope{" "}
            <SelectControl
              aria-label="Artwork scope"
              value={scope}
              disabled={blocked || !signed}
              onChange={(e) => {
                setScope(e.target.value);
                setConsent(false);
              }}
            >
              <option value="personal">Personal Roblox account</option>
              {account.account?.owners
                .filter((o) => o.kind === "group")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    Shared Roblox group {o.id}
                  </option>
                ))}
            </SelectControl>
          </label>
          <label className="artwork-consent">
            <Checkbox
              aria-label="Consent to private artwork storage"
              checked={consent}
              disabled={blocked || !signed || !state.enabled}
              onCheckedChange={(checked) => setConsent(checked === true)}
            />{" "}
            <span>
              Allow private PNG, image name and folder storage for{" "}
              {scope === "personal"
                ? "my Roblox account"
                : "shared Roblox group " + scope}
              .
            </span>
          </label>
          <Button
            disabled={blocked || !consent || !signed || !state.enabled}
            onClick={() => void manager.connect(scope)}
          >
            Connect artwork
          </Button>
          <Button
            variant="ghost"
            disabled={blocked}
            onClick={() => void manager.restore()}
          >
            Retry availability
          </Button>
        </>
      )}
      {state.connected && snapshot && (
        <>
          <p
            className="artwork-file-meta"
            title={`Connected to ${label} · revision ${snapshot.revision}`}
          >
            {snapshot.usage.items}/{L.items} images ·{" "}
            {(snapshot.usage.bytes / 1048576).toFixed(2)}/16 MiB ·{" "}
            {snapshot.folders.length}/{L.folders} folders ·{" "}
            {snapshot.usage.pending} saving, {snapshot.usage.cleanup} awaiting
            deletion.
          </p>
          <div className="artwork-actions">
            <Button
              variant="outline"
              disabled={blocked}
              onClick={() => void manager.fetch()}
            >
              Refresh
            </Button>
            <Button
              disabled={blocked || !snapshot.usage.cleanup}
              onClick={() => void manager.cleanup()}
            >
              Retry cleanup
            </Button>
            <Button
              variant="outline"
              disabled={blocked}
              onClick={() => void manager.revoke()}
            >
              Disconnect artwork
            </Button>
          </div>
          <Disclosure className="artwork-inline-help">
            <DisclosureSummary>Storage limits</DisclosureSummary>
            <p>
              10 PNG saves and 100 downloads per account daily. Previewing or
              importing downloads the PNG. Group libraries are separate from
              Figma teams.
            </p>
          </Disclosure>
          {state.conflict && (
            <p role="alert">
              Another session changed this library to revision{" "}
              {state.conflict.revision}. Fetch and review it before saving,
              renaming or deleting.
            </p>
          )}
          <label>
            Search artwork{" "}
            <Input
              aria-label="Search cloud artwork"
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            Folder{" "}
            <SelectControl
              aria-label="Cloud artwork folder"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            >
              <option value="all">All folders</option>
              <option value="">Unfiled</option>
              {snapshot.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </SelectControl>
          </label>
          <label>
            Folder name{" "}
            <Input
              aria-label="Cloud artwork folder name"
              value={folderName}
              maxLength={64}
              disabled={mutation}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </label>
          <Button
            disabled={
              mutation ||
              !folderName.trim() ||
              snapshot.folders.length >= L.folders
            }
            onClick={async () => {
              await manager.edit("create-folder", { name: folderName });
              if (!manager.snapshot().error && !manager.snapshot().conflict)
                setFolderName("");
            }}
          >
            Create artwork folder
          </Button>
          {folder !== "all" && folder && (
            <>
              <Button
                disabled={mutation || !folderName.trim()}
                onClick={() =>
                  void manager.edit("rename-folder", {
                    id: folder,
                    name: folderName,
                  })
                }
              >
                Rename selected folder
              </Button>
              <Button
                variant="outline"
                disabled={
                  mutation || snapshot.items.some((i) => i.folder === folder)
                }
                onClick={() =>
                  setDeleting({
                    kind: "folder",
                    id: folder,
                    name:
                      snapshot.folders.find((f) => f.id === folder)?.name ??
                      "folder",
                  })
                }
              >
                Delete empty folder
              </Button>
            </>
          )}
          <div
            className="artwork-dropzone"
            aria-label="Cloud artwork review drop zone"
            onDragOver={(e) => {
              if (e.dataTransfer.types.some((t) => t === "Files" || t === DRAG))
                e.preventDefault();
            }}
            onDrop={(e) => void receive(e)}
          >
            <p className="artwork-hint">
              Drop a PNG or drag saved artwork here.
            </p>
            <label>
              PNG to save{" "}
              <FilePicker
                aria-label="Cloud artwork PNG"

                accept="image/png,.png"
                disabled={mutation}
                onChange={(e) => {
                  void selectFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {import.meta.env.DEV && (
              <Button
                variant="ghost"
                disabled={mutation}
                onClick={() =>
                  setReviewed({
                    name: "Synthetic QA icon",
                    width: 8,
                    height: 8,
                    bytes: encode({
                      width: 8,
                      height: 8,
                      channels: 4,
                      data: Uint8Array.from({ length: 256 }, (_, i) =>
                        i % 4 === 3 ? 255 : i % 4 === 0 ? 40 : 180,
                      ),
                    }),
                  })
                }
              >
                Review synthetic QA PNG
              </Button>
            )}
            {reviewed && (
              <>
                <LocalPngPreview bytes={reviewed.bytes} name={reviewed.name} />
                <label>
                  Reviewed image name{" "}
                  <Input
                    aria-label="Reviewed cloud image name"
                    value={reviewed.name}
                    maxLength={100}
                    disabled={mutation}
                    onChange={(e) =>
                      setReviewed({ ...reviewed, name: e.target.value })
                    }
                  />
                </label>
                <p className="artwork-file-meta">
                  {reviewed.width} × {reviewed.height} · {reviewed.bytes.length}{" "}
                  bytes
                </p>
                <label>
                  Save in folder{" "}
                  <SelectControl
                    aria-label="Upload artwork folder"
                    value={uploadFolder}
                    disabled={mutation}
                    onChange={(e) => setUploadFolder(e.target.value)}
                  >
                    <option value="">Unfiled</option>
                    {snapshot.folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </SelectControl>
                </label>
                <Button
                  disabled={mutation || !reviewed.name.trim()}
                  onClick={() =>
                    void manager.upload({
                      name: reviewed.name,
                      folder: uploadFolder || null,
                      bytes: reviewed.bytes,
                    })
                  }
                >
                  Save to cloud
                </Button>
                <Button
                  disabled={blocked || !reviewed.name.trim()}
                  onClick={() =>
                    void importer.importPng(reviewed.bytes, reviewed.name)
                  }
                >
                  Import into Figma
                </Button>
                <Button
                  variant="ghost"
                  disabled={blocked}
                  onClick={() => setReviewed(undefined)}
                >
                  Discard
                </Button>
              </>
            )}
          </div>
          <p className="artwork-file-meta">
            {filtered.length} {filtered.length === 1 ? "image" : "images"}
          </p>
          {filtered.map((item) => (
            <div
              className="artwork-cloud-item"
              key={item.id}
              draggable={!blocked}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  DRAG,
                  JSON.stringify({
                    id: item.id,
                    generation: snapshot.generation,
                    scope: snapshot.scope.kind + ":" + snapshot.scope.id,
                  }),
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              <strong>{item.name}</strong>
              <span>
                {" "}
                ·{" "}
                {snapshot.folders.find((f) => f.id === item.folder)?.name ??
                  "Unfiled"}{" "}
                · {item.width} × {item.height} · {item.bytes} bytes
              </span>
              <div className="artwork-actions">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Preview ${item.name}`}
                  disabled={blocked}
                  onClick={() => void imageAction(item, "preview")}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Download ${item.name}`}
                  disabled={blocked}
                  onClick={() => void imageAction(item, "download")}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  aria-label={`Import ${item.name}`}
                  disabled={blocked}
                  onClick={() => void imageAction(item, "import")}
                >
                  Import
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Rename or move ${item.name}`}
                  disabled={mutation}
                  onClick={() =>
                    setEditing({
                      item,
                      name: item.name,
                      folder: item.folder ?? "",
                    })
                  }
                >
                  Rename / move
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Delete ${item.name}`}
                  disabled={mutation}
                  onClick={() =>
                    setDeleting({ kind: "image", id: item.id, name: item.name })
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {editing && (
            <div className="artwork-edit-sheet">
              <label>
                Image name{" "}
                <Input
                  aria-label="Edit cloud image name"
                  value={editing.name}
                  maxLength={100}
                  disabled={mutation}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label>
                Move to folder{" "}
                <SelectControl
                  aria-label="Move cloud image folder"
                  value={editing.folder}
                  disabled={mutation}
                  onChange={(e) =>
                    setEditing({ ...editing, folder: e.target.value })
                  }
                >
                  <option value="">Unfiled</option>
                  {snapshot.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </SelectControl>
              </label>
              <Button
                disabled={mutation || !editing.name.trim()}
                onClick={async () => {
                  await manager.edit("edit-image", {
                    id: editing.item.id,
                    name: editing.name,
                    folder: editing.folder || null,
                  });
                  if (!manager.snapshot().error && !manager.snapshot().conflict)
                    setEditing(undefined);
                }}
              >
                Save changes
              </Button>
              <Button
                variant="ghost"
                disabled={blocked}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            disabled={mutation}
            onClick={() => setDeleting({ kind: "library", name: label })}
          >
            Delete library
          </Button>
          {deleting && (
            <div
              className="artwork-confirm"
              role="group"
              aria-label="Confirm artwork deletion"
            >
              <p>
                Delete{" "}
                {deleting.kind === "library"
                  ? "every cloud PNG and folder in " + label
                  : deleting.kind + " “" + deleting.name + "” from " + label}
                ?{" "}
                {deleting.kind === "library"
                  ? "Every connection to this shared scope will be revoked. "
                  : ""}
                Imported/local copies remain. This cannot be undone.
              </p>
              <Button disabled={mutation} onClick={() => void confirmDelete()}>
                Delete permanently
              </Button>
              <Button
                variant="ghost"
                disabled={blocked}
                onClick={() => setDeleting(undefined)}
              >
                Cancel
              </Button>
            </div>
          )}
        </>
      )}
      {preview && (
        <div className="artwork-preview-sheet">
          <strong>{preview.name}</strong>
          <img
            src={preview.url}
            alt={preview.name}
            style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain" }}
          />
          <Button variant="ghost" onClick={() => setPreview(undefined)}>
            Close preview
          </Button>
        </div>
      )}
      {(localError || state.error || importer.status.error) && (
        <p role="alert">{localError || state.error || importer.status.error}</p>
      )}
      {(state.notice || importer.status.notice) && (
        <p role="status">{importer.status.notice || state.notice}</p>
      )}
      {state.error && (
        <Button
          variant="ghost"
          disabled={blocked}
          onClick={() => void manager.forget()}
        >
          Forget artwork access
        </Button>
      )}
      {state.busy && (
        <Button variant="outline" onClick={() => manager.cancel()}>
          Cancel request
        </Button>
      )}
    </Disclosure>
  );
}
