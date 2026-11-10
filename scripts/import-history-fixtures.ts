import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { imageToolsResult } from "../tests/image-tools-fixtures";
const data = imageToolsResult();
const asset = data.package.assets[0],
  bytes = data.assets[asset.id];
await mkdir(".artifacts/import-history", { recursive: true });
await writeFile(
  ".artifacts/image-history-preview.json",
  JSON.stringify({
    data,
    selected: data.designs!.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      width: n.width,
      height: n.height,
      layers: 2,
    })),
  }),
);
await writeFile(
  ".artifacts/image-history-catalog.json",
  JSON.stringify([
    {
      owner: "user:123",
      fingerprint: createHash("sha256")
        .update(new Uint8Array(bytes))
        .digest("hex"),
      assetId: "rbxassetid://987",
      name: "Saved tintable icon (test)",
      width: 140,
      height: 100,
      savedAt: Date.now(),
      moderation: "MODERATION_STATE_UNKNOWN",
      thumbnail:
        "data:image/png;base64," + Buffer.from(bytes).toString("base64"),
    },
  ]),
);
await writeFile(
  ".artifacts/import-history/matching.png",
  new Uint8Array(bytes),
);
await writeFile(
  ".artifacts/import-history/prepared.framebridge.json",
  JSON.stringify(data.package),
);
console.log(
  "Synthetic image library fixture ready; IDs are test values, not verified Roblox artwork.",
);
