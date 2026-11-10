import { describe, expect, it, vi } from "vitest";
import { RobloxGroupNames } from "../packages/relay/src/roblox-group-names";
import {
  RobloxOAuth,
  type OAuthOwner,
} from "../packages/relay/src/roblox-oauth";
import { oauthConfig, oauthFixture, oauthHash } from "./roblox-oauth-fixture";

const owners: OAuthOwner[] = [
  { kind: "user", id: "123", label: "TestCreator" },
  { kind: "group", id: "456", label: "Group 456" },
  { kind: "group", id: "789", label: "Group 789" },
];

describe("Roblox group display names", () => {
  it("batches and caches names without sending credentials or adding directory results to approved creators", async () => {
    const request = vi.fn(async () =>
      Response.json({
        data: [
          { id: 456, name: "Example Studio" },
          { id: 789, name: "Second Studio" },
          { id: 999, name: "Not an approved creator" },
        ],
      }),
    );
    const names = new RobloxGroupNames(request as typeof fetch, () => 1000);
    const [a, b] = await Promise.all([
      names.resolve(owners),
      names.resolve(owners),
    ]);
    expect(a).toEqual([
      owners[0],
      { ...owners[1], label: "Example Studio" },
      { ...owners[2], label: "Second Studio" },
    ]);
    expect(b).toEqual(a);
    await names.resolve(owners);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://groups.roblox.com/v2/groups?groupIds=456,789");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(new Headers(init.headers).has("Cookie")).toBe(false);
    expect(init.body).toBeUndefined();
    expect(owners[1].label).toBe("Group 456");
  });
  it("refreshes renamed groups after the cache expires", async () => {
    let now = 1000,
      label = "Original Studio";
    const request = vi.fn(async () =>
      Response.json({ data: [{ id: 456, name: label }] }),
    );
    const names = new RobloxGroupNames(request as typeof fetch, () => now);
    expect((await names.resolve(owners))[1].label).toBe("Original Studio");
    label = "Renamed Studio";
    expect((await names.resolve(owners))[1].label).toBe("Original Studio");
    now += 86_400_001;
    expect((await names.resolve(owners))[1].label).toBe("Renamed Studio");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("preserves known labels and creator access during outages, then retries", async () => {
    let now = 1000;
    const request = vi.fn(async () => new Response(null, { status: 503 }));
    const names = new RobloxGroupNames(request as typeof fetch, () => now);
    const saved = [owners[0], { ...owners[1], label: "Saved Studio Name" }];
    expect(await names.resolve(saved)).toEqual(saved);
    expect(await names.resolve(saved)).toEqual(saved);
    expect(request).toHaveBeenCalledTimes(1);
    now += 60_001;
    request.mockImplementation(async () =>
      Response.json({ data: [{ id: 456, name: "Current Studio Name" }] }),
    );
    expect((await names.resolve(saved))[1].label).toBe("Current Studio Name");
  });
  it("ignores malformed and overlong directory names", async () => {
    const names = new RobloxGroupNames(
      (async () =>
        Response.json({
          data: [
            { id: 456, name: "x".repeat(101) },
            { id: 789, name: "\n\u0000" },
          ],
        })) as typeof fetch,
      () => 1000,
    );
    expect(await names.resolve(owners)).toEqual(owners);
  });
  it("updates existing sign-ins on account inspection without another OAuth grant", async () => {
    const f = oauthFixture(),
      connected = await f.connect();
    const request = vi.fn(async () =>
      Response.json({ data: [{ id: 456, name: "Example Studio" }] }),
    );
    const service = new RobloxOAuth(f.store, oauthConfig, {
      ...f.deps,
      request: request as typeof fetch,
    });
    const account = await service.inspect(connected.accountToken);
    expect(account.owners).toEqual([
      owners[0],
      { ...owners[1], label: "Example Studio" },
    ]);
    expect(account.needsAuthorization).toBe(false);
    await service.inspect(connected.accountToken);
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      f.accounts.get(oauthHash(connected.accountToken))?.owners[1].label,
    ).toBe("Example Studio");
  });
  it("does not restore an account disconnected while names are loading", async () => {
    const f = oauthFixture(),
      connected = await f.connect();
    let finish!: (response: Response) => void;
    const request = (async () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      })) as typeof fetch;
    const service = new RobloxOAuth(f.store, oauthConfig, {
      ...f.deps,
      request,
    });
    const inspection = service.inspect(connected.accountToken);
    f.store.removeAccount(oauthHash(connected.accountToken));
    finish(Response.json({ data: [{ id: 456, name: "Example Studio" }] }));
    await expect(inspection).rejects.toMatchObject({ status: 401 });
    expect(f.accounts.size).toBe(0);
  });
});
