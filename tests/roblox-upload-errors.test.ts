import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  createImageOperation,
  readImageOperation,
  retryableUploadFailure,
  PublicError,
  type RobloxCredential,
  type Upload,
} from "../packages/relay/src/roblox";

const bytes = readFileSync(
  new URL("./fixtures/upload-test.png", import.meta.url),
);
const input: Upload = {
  owner: { kind: "user", id: "123" },
  name: "Test artwork",
  png: bytes.toString("base64"),
};
const key = "synthetic-test-key";
afterEach(() => vi.useRealTimers());

async function reject(body: unknown, credential: RobloxCredential = key) {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(body, { status: 400 }));
  const error = await createImageOperation(
    input,
    bytes,
    credential,
    request,
  ).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(PublicError);
  expect(request).toHaveBeenCalledTimes(1);
  return error as PublicError;
}

describe("Roblox upload rejection diagnostics", () => {
  it.each([
    [
      { message: "The asset name was moderated." },
      "The asset name was moderated.",
    ],
    [
      {
        errors: [
          { code: 3, message: "Creator is not eligible to upload this asset." },
        ],
      },
      "Creator is not eligible",
    ],
    [
      {
        errors: { "request.displayName": ["Name is too long."] },
        title: "Validation failed",
      },
      "displayName: Name is too long.",
    ],
    [
      { error: { message: "Image content could not be decoded." } },
      "Image content could not be decoded.",
    ],
    [{ error: "INVALID_ARGUMENT" }, "INVALID_ARGUMENT"],
  ])(
    "preserves the useful reason from Roblox's error formats",
    async (body, expected) => {
      const error = await reject(body);
      expect(error.message).toContain("HTTP 400");
      expect(error.message).toContain(expected);
      expect(error.message).not.toContain("Check asset permissions");
      expect(error.rejectedCreate).toBe(true);
    },
  );

  it.each([key, { oauthToken: "synthetic-test-oauth-token" }])(
    "redacts the credential and excludes arbitrary payload fields",
    async (credential) => {
      const token =
        typeof credential === "string" ? credential : credential.oauthToken;
      const error = await reject(
        {
          message: `Invalid creator. Credential ${token}. Bearer private-value. See https://example.test/?key=secret-value`,
          request: { secret: "request-must-not-appear" },
          errors: {
            "secret-field-must-not-appear": ["secret-message-must-not-appear"],
          },
        },
        credential,
      );
      expect(error.message).toContain("Invalid creator.");
      for (const secret of [
        token,
        "private-value",
        "secret-value",
        "request-must-not-appear",
        "secret-field-must-not-appear",
        "secret-message-must-not-appear",
      ])
        expect(error.message).not.toContain(secret);
    },
  );

  it("redacts token-shaped strings and a credential across the truncation boundary", async () => {
    const token = "abcdef".repeat(20);
    const error = await reject({
      message:
        "Invalid creator. " +
        " ".repeat(225) +
        key +
        " " +
        token +
        "\u202e\nPlease review.",
    });
    expect(error.message).not.toContain(key);
    expect(error.message).not.toContain(token);
    expect(error.message).not.toContain("\u202e");
    expect(error.message.length).toBeLessThan(650);
  });

  it("does not reflect an unreadable, oversized or unrelated response body", async () => {
    for (const body of [
      "<html>private error</html>",
      JSON.stringify({ message: "x".repeat(9000) }),
      JSON.stringify({ request: { credential: key } }),
    ]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body, { status: 400 }));
      await expect(
        createImageOperation(input, bytes, key, request),
      ).rejects.toThrow("Check the image, name and selected creator");
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it("bounds the error stream and cancels it when diagnostic reading stalls", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(new ReadableStream({ cancel }), { status: 400 }),
      );
    const failure = createImageOperation(input, bytes, key, request).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(2000);
    const error = await failure;
    expect(error).toBeInstanceOf(PublicError);
    expect((error as PublicError).message).toContain("HTTP 400");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reports a poll validation failure with the same safe diagnostic", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ message: "Invalid operation ID." }, { status: 400 }),
      );
    await expect(
      readImageOperation("operations/test", { oauthToken: key }, request),
    ).rejects.toThrow("Roblox reason: Invalid operation ID.");
    const error = (await readImageOperation(
      "operations/test",
      key,
      request,
    ).catch((error: unknown) => error)) as PublicError;
    expect(error.rejectedCreate).toBe(false);
  });

  it("keeps authorization guidance and credentials private on HTTP 401 and 403", async () => {
    for (const status of [401, 403]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ message: key }, { status }));
      const error = (await createImageOperation(
        input,
        bytes,
        { oauthToken: key },
        request,
      ).catch((error: unknown) => error)) as PublicError;
      expect(error.status).toBe(status);
      expect(error.rejectedCreate).toBe(false);
      expect(error.message).not.toContain(key);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
});

describe("safe upload retry migration", () => {
  const legacy =
    "Roblox rejected the upload request (HTTP 400). Check asset permissions and Creator Dashboard.";
  it.each([
    [{ state: "failed", error: legacy }, true],
    [{ state: "failed", retryable: true }, true],
    [
      { state: "failed", error: legacy, operation: "operations/accepted" },
      false,
    ],
    [{ state: "failed", retryable: true, result: { assetId: "123" } }, false],
    [{ state: "uploading", error: legacy, retryable: true }, false],
    [{ state: "done", retryable: true }, false],
    [{ state: "failed", error: "Upload response was lost." }, false],
    [{ state: "failed", error: "Roblox could not process this image." }, false],
  ])("retries only definite creation rejections", (job, expected) => {
    expect(retryableUploadFailure(job)).toBe(expected);
  });
});
