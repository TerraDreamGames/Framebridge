import { createHash, webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { sha256Hex, sha256HexPortable } from "../packages/core/src/sha256";

afterEach(() => vi.unstubAllGlobals());
const oracle = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const pattern = (length: number) =>
  Uint8Array.from({ length }, (_, i) => (i * 131 + (i >>> 3)) & 255);

it.each([
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
])("matches fixed SHA-256 vectors for %j", (text, expected) => {
  expect(sha256HexPortable(new TextEncoder().encode(text))).toBe(expected);
});

it.each([1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 65535, 65536, 65537])(
  "matches independent native SHA-256 across padding/block boundaries (%i bytes)",
  (length) => {
    const bytes = pattern(length);
    expect(sha256HexPortable(bytes)).toBe(oracle(bytes));
  },
);

it("matches the million-byte vector and hashes only a typed-array view without mutation", () => {
  expect(sha256HexPortable(new Uint8Array(1_000_000).fill(97))).toBe(
    "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
  );
  const bytes = pattern(65549),
    before = new Uint8Array(bytes);
  const view = bytes.subarray(7, 65544);
  expect(sha256HexPortable(view)).toBe(oracle(view));
  expect(bytes).toEqual(before);
  expect(sha256HexPortable(view)).not.toBe(oracle(bytes));
});

it.each([undefined, {}, { subtle: {} }])(
  "hashes exact bytes when native crypto/digest is unavailable (%j)",
  async (crypto) => {
    vi.stubGlobal("crypto", crypto);
    const bytes = pattern(65537);
    expect(await sha256Hex(bytes)).toBe(oracle(bytes));
  },
);

it("also works when the crypto global is absent entirely", async () => {
  vi.stubGlobal("crypto", undefined);
  Reflect.deleteProperty(globalThis, "crypto");
  expect("crypto" in globalThis).toBe(false);
  const bytes = pattern(65537);
  expect(await sha256Hex(bytes)).toBe(oracle(bytes));
});

it("prefers native digest and snapshots the exact view before an asynchronous operation", async () => {
  let finish!: () => Promise<void>;
  const digest = vi.fn(
    (_algorithm: string, input: Uint8Array) =>
      new Promise<ArrayBuffer>((done) => {
        finish = async () =>
          done(await webcrypto.subtle.digest("SHA-256", input));
      }),
  );
  vi.stubGlobal("crypto", { subtle: { digest } });
  const bytes = pattern(80),
    view = bytes.subarray(3, 68);
  const expected = oracle(view);
  const pending = sha256Hex(view);
  bytes.fill(0);
  expect(digest).toHaveBeenCalledOnce();
  expect(digest.mock.calls[0][0]).toBe("SHA-256");
  expect(digest.mock.calls[0][1]).not.toBe(view);
  await finish();
  expect(await pending).toBe(expected);
});

it.each([
  vi.fn().mockRejectedValue(new Error("unsupported native digest")),
  vi.fn().mockResolvedValue(new ArrayBuffer(0)),
])(
  "falls back when a host exposes an unusable native digest",
  async (digest) => {
    vi.stubGlobal("crypto", { subtle: { digest } });
    const bytes = pattern(120);
    expect(await sha256Hex(bytes)).toBe(oracle(bytes));
    expect(digest).toHaveBeenCalledOnce();
  },
);
