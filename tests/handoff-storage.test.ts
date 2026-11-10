import { expect, it } from "vitest";
import { readHandoffs } from "../plugins/figma/src/handoff-storage";

const record = () => ({
  origin: "https://private.test",
  ownerToken: "a".repeat(64),
  name: "Snapshot",
  expiresAt: 2000,
});
it("restores pending creation capabilities while pruning expired and repeated records", () => {
  const pending = record();
  expect(
    readHandoffs(
      [
        pending,
        pending,
        {
          ...pending,
          ownerToken: "b".repeat(64),
          expiresAt: 1000,
          code: "FB-AAAAAA-BBBBBB-CCCCCC-DDDDDD",
        },
      ],
      1000,
    ),
  ).toEqual([pending]);
  expect(
    readHandoffs(
      [{ ...pending, code: "FB-AAAAAA-BBBBBB-CCCCCC-DDDDDD" }],
      1000,
    ),
  ).toHaveLength(1);
  expect(readHandoffs(undefined)).toEqual([]);
  expect(readHandoffs([{ ...pending, expiresAt: 1000 }], 2000)).toEqual([
    { ...pending, expiresAt: 1000 },
  ]);
});
it("rejects unbounded, credential-bearing, artwork-bearing and malformed storage records", () => {
  const pending = record();
  for (const extra of [
    { apiKey: "secret" },
    { png: [1] },
    { package: {} },
    { ownerToken: "short" },
    { expiresAt: NaN },
    { code: "PAIR12" },
    { origin: "http://external.test" },
  ])
    expect(() => readHandoffs([{ ...pending, ...extra }], 1000)).toThrow(
      "Invalid saved",
    );
  expect(() => readHandoffs(Array.from({ length: 21 }, record), 1000)).toThrow(
    "Invalid saved",
  );
});
