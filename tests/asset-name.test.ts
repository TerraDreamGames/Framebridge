import { expect, it } from "vitest";
import { robloxAssetName } from "../packages/core/src/asset-name";
import {
  createImageOperation,
  validateUpload,
  type Upload,
} from "../packages/relay/src/roblox";
import { readFileSync } from "node:fs";

it.each([
  [" Inventory icon ", "Inventory icon"],
  ["A".repeat(50), "A".repeat(50)],
  ["A".repeat(100), "A".repeat(50)],
  ["猫".repeat(20), "猫".repeat(16)],
  ["😀".repeat(30), "😀".repeat(12)],
  ["A".repeat(49) + "😀", "A".repeat(49)],
  ["e\u0301".repeat(30), "é".repeat(25)],
  ["\u0000 \u200b \u202e", "Framebridge artwork"],
  ["\u200c\u200d", "Framebridge artwork"],
  ["", "Framebridge artwork"],
])("prepares a nonempty UTF-8-safe upload name: %j", (input, expected) => {
  const name = robloxAssetName(input);
  expect(name).toBe(expected);
  expect(Buffer.byteLength(name, "utf8")).toBeLessThanOrEqual(50);
});

it.each(["Long image name ".repeat(6), "猫".repeat(60), ""])(
  "normalizes legacy client names at the Roblox boundary without changing upload input",
  async (name) => {
    const bytes = readFileSync(
      new URL("./fixtures/upload-test.png", import.meta.url),
    );
    const input: Upload = {
      owner: { kind: "user", id: "123" },
      name,
      png: bytes.toString("base64"),
    };
    expect(validateUpload(input)).toEqual(bytes);
    let metadata: { displayName: string } | undefined;
    await expect(
      createImageOperation(
        input,
        bytes,
        "synthetic-key",
        async (_url, init) => {
          const form = init!.body as FormData;
          metadata = JSON.parse(form.get("request") as string);
          return Response.json({ path: "operations/accepted" });
        },
      ),
    ).resolves.toBe("operations/accepted");
    expect(metadata!.displayName).toBe(robloxAssetName(name));
    expect(
      Buffer.byteLength(metadata!.displayName, "utf8"),
    ).toBeLessThanOrEqual(50);
    expect(input.name).toBe(name);
  },
);
