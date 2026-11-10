import { describe, expect, it } from "vitest";
import {
  Handoffs,
  memoryHandoffs,
  newHandoffCapability,
  HANDOFF_LIMITS,
} from "../packages/relay/src/handoff";
import { demoResult } from "../packages/core/src/demo";

function setup() {
  let time = 1000;
  const active = new Set(["alice", "bob"]),
    store = memoryHandoffs(),
    counts = new Map<string, number>();
  const handoffs = new Handoffs(store, {
    now: () => time,
    active: (invite) => active.has(invite),
    count: (key, max) => {
      const count = counts.get(key) ?? 0;
      if (count >= max) throw new Error("quota");
      counts.set(key, count + 1);
    },
  });
  const input = () => ({
    ownerToken: newHandoffCapability(),
    package: demoResult().package,
    ttlMinutes: 60,
  });
  return {
    handoffs,
    store,
    active,
    counts,
    input,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
describe("private immutable design handoffs", () => {
  it("enforces the global active-code bound and frees capacity after revocation", () => {
    const s = setup();
    const invites = ["alice", "bob", "carol", "dan", "eve", "frank"];
    invites.forEach((invite) => s.active.add(invite));
    const first = s.input();
    s.handoffs.create("alice", first);
    for (let index = 1; index < 20; index++)
      s.handoffs.create(invites[Math.floor(index / 4)], s.input());
    expect(() => s.handoffs.create("frank", s.input())).toThrow(
      "storage is full",
    );
    s.handoffs.revoke(first.ownerToken);
    expect(s.handoffs.create("frank", s.input()).code).toBeTruthy();
  });
  it("bounds both individual snapshots and aggregate persisted artwork-free JSON", () => {
    const s = setup();
    s.active.add("carol");
    const input = s.input();
    input.package.roots[0].children.push({
      id: "large-label",
      name: "Large label",
      className: "TextLabel",
      properties: { Text: "x".repeat(8_000_000) },
      children: [],
    });
    expect(() => s.handoffs.create("alice", input)).toThrow("8 MB");
    input.package.roots[0].children.at(-1)!.properties.Text = "x".repeat(
      7_200_000,
    );
    for (let index = 0; index < 8; index++)
      s.handoffs.create(index < 4 ? "alice" : "bob", {
        ...input,
        ownerToken: newHandoffCapability(),
      });
    expect(() =>
      s.handoffs.create("carol", {
        ...input,
        ownerToken: newHandoffCapability(),
      }),
    ).toThrow("storage is full");
  });
  it("reuses a creation retry without extending expiry and isolates returned snapshots", () => {
    const s = setup(),
      input = s.input(),
      created = s.handoffs.create("alice", input);
    expect(created.code).toMatch(/^FB-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/);
    s.advance(1000);
    expect(s.handoffs.create("alice", input)).toEqual(created);
    input.package.name = "Changed later";
    const receiptToken = newHandoffCapability(),
      opened = s.handoffs.open("bob", {
        code: created.code.toLowerCase().replace(/-/g, " "),
        receiptToken,
      });
    expect(opened.package.name).toBe(created.name);
    opened.package.roots.length = 0;
    expect(
      s.handoffs.open("bob", { code: created.code, receiptToken }).package.roots
        .length,
    ).toBeGreaterThan(0);
    expect(() => s.handoffs.create("alice", input)).toThrow("another snapshot");
  });
  it("binds creation retries to the owner invite and lifetime", () => {
    const s = setup(),
      input = s.input();
    s.handoffs.create("alice", input);
    expect(() => s.handoffs.create("bob", input)).toThrow("another snapshot");
    expect(() =>
      s.handoffs.create("alice", { ...input, ttlMinutes: 1440 }),
    ).toThrow("another snapshot");
    expect(() =>
      s.handoffs.create("alice", { ...s.input(), ttlMinutes: 30 }),
    ).toThrow("one-hour");
  });
  it("records distinct imports and idempotent terminal receipts without exposing capabilities", () => {
    const s = setup(),
      input = s.input(),
      created = s.handoffs.create("alice", input),
      one = newHandoffCapability(),
      two = newHandoffCapability();
    s.handoffs.open("bob", { code: created.code, receiptToken: one });
    s.handoffs.open("bob", { code: created.code, receiptToken: one });
    s.handoffs.open("alice", { code: created.code, receiptToken: two });
    s.handoffs.receipt(one, { status: "ready" });
    s.handoffs.receipt(one, { status: "imported", message: "Done" });
    s.advance(1);
    s.handoffs.receipt(one, { status: "imported", message: "Retry" });
    expect(() => s.handoffs.receipt(one, { status: "ready" })).toThrow(
      "final receipt",
    );
    const summary = s.handoffs.owner(input.ownerToken).summary;
    expect(summary.receipts).toHaveLength(2);
    expect(summary.receipts).toContainEqual({
      status: "imported",
      at: 1000,
      message: "Done",
    });
    expect(JSON.stringify(summary)).not.toMatch(/token|alice|bob/);
    expect(JSON.stringify(s.store.records())).not.toContain(input.ownerToken);
    expect(
      JSON.stringify(s.store.claims(s.store.records()[0].id)),
    ).not.toContain(one);
  });
  it("expires at the exact boundary and rejects delayed retries for a retired attempt", () => {
    const s = setup(),
      input = { ...s.input(), ttlMinutes: 1440 },
      created = s.handoffs.create("alice", input),
      receiptToken = newHandoffCapability();
    s.advance(86_400_000 - 1);
    s.handoffs.open("bob", { code: created.code, receiptToken });
    s.advance(1);
    expect(() =>
      s.handoffs.open("bob", { code: created.code, receiptToken }),
    ).toThrow("expired");
    expect(() => s.handoffs.owner(input.ownerToken)).toThrow("expired");
    expect(() =>
      s.handoffs.receipt(receiptToken, { status: "imported" }),
    ).toThrow("expired");
    expect(() => s.handoffs.create("alice", input)).toThrow("expired");
    expect(s.store.records()).toHaveLength(0);
    // Even beyond the bounded retry retention, recreating with an old capability
    // uses a fresh design identity, so the old code cannot become valid again.
    s.advance(86_400_000);
    expect(s.handoffs.create("alice", input).code).not.toBe(created.code);
    expect(() =>
      s.handoffs.open("bob", { code: created.code, receiptToken }),
    ).toThrow("expired");
  });
  it("allows only owner revocation and revokes outstanding claims too", () => {
    const s = setup(),
      input = s.input(),
      created = s.handoffs.create("alice", input),
      receiptToken = newHandoffCapability();
    s.handoffs.open("bob", { code: created.code, receiptToken });
    expect(() => s.handoffs.revoke(receiptToken)).toThrow("expired");
    s.handoffs.revoke(input.ownerToken);
    expect(() =>
      s.handoffs.receipt(receiptToken, { status: "imported" }),
    ).toThrow("expired");
    expect(() => s.handoffs.create("alice", input)).toThrow("revoked");
    expect(s.store.claims("anything")).toHaveLength(0);
  });
  it("rejects revoked creator and recipient invitations independently", () => {
    const s = setup(),
      input = s.input(),
      created = s.handoffs.create("alice", input),
      receiptToken = newHandoffCapability();
    s.handoffs.open("bob", { code: created.code, receiptToken });
    s.active.delete("bob");
    expect(() =>
      s.handoffs.open("bob", { code: created.code, receiptToken }),
    ).toThrow("access required");
    expect(() => s.handoffs.receipt(receiptToken, { status: "ready" })).toThrow(
      "revoked",
    );
    expect(s.handoffs.owner(input.ownerToken).summary.receipts).toHaveLength(1);
    s.active.delete("alice");
    expect(() => s.handoffs.owner(input.ownerToken)).toThrow("revoked");
    expect(s.store.records()).toHaveLength(0);
  });
  it("bounds claims but permits unknown-outcome retries at the limit", () => {
    const s = setup(),
      input = s.input(),
      created = s.handoffs.create("alice", input);
    let receiptToken = "";
    for (let i = 0; i < HANDOFF_LIMITS.claims; i++) {
      receiptToken = newHandoffCapability();
      s.handoffs.open("bob", { code: created.code, receiptToken });
    }
    expect(() =>
      s.handoffs.open("bob", {
        code: created.code,
        receiptToken: newHandoffCapability(),
      }),
    ).toThrow("50-open");
    expect(
      s.handoffs.open("bob", { code: created.code, receiptToken }).name,
    ).toBe(created.name);
  });
  it("bounds active storage per creator and frees it on revoke", () => {
    const s = setup(),
      inputs = Array.from({ length: 4 }, () => s.input());
    inputs.forEach((input) => s.handoffs.create("alice", input));
    expect(() => s.handoffs.create("alice", s.input())).toThrow("four active");
    s.handoffs.revoke(inputs[0].ownerToken);
    expect(s.handoffs.create("alice", s.input()).code).toBeTruthy();
  });
  it("rejects unknown fields, credential-bearing designs and role-confused capabilities", () => {
    const s = setup(),
      input = s.input(),
      created = s.handoffs.create("alice", input),
      receiptToken = newHandoffCapability();
    expect(() => s.handoffs.create("alice", { ...input, extra: true })).toThrow(
      "Invalid handoff",
    );
    expect(() =>
      s.handoffs.open("bob", { code: created.code, receiptToken, extra: true }),
    ).toThrow("Invalid design");
    expect(() =>
      s.handoffs.open("bob", { code: created.code, receiptToken: "wrong" }),
    ).toThrow("Invalid handoff");
    const leak = s.input();
    (leak.package.roots[0].properties as any).receiptToken = receiptToken;
    expect(() => s.handoffs.create("alice", leak)).toThrow("Credentials");
    s.handoffs.open("bob", { code: created.code, receiptToken });
    expect(() =>
      s.handoffs.receipt(input.ownerToken, { status: "imported" }),
    ).toThrow("expired");
    expect(() =>
      s.handoffs.receipt(receiptToken, { status: "banana" }),
    ).toThrow("Invalid handoff receipt");
  });
});
