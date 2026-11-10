import { expect, it, vi } from "vitest";
import { RobloxOAuth } from "../packages/relay/src/roblox-oauth";
import {
  oauthConfig,
  oauthFixture,
  oauthHash,
  tokenResponse,
} from "./roblox-oauth-fixture";

it("drains a 1,000-request expired-provider burst through one rotation and rechecks creator grants", async () => {
  const f = oauthFixture(),
    ready = await f.connect(),
    initial = await f.service.credential(ready.accountToken, "invite");
  f.advance(900001); // Local fixture time only; no production account changes.
  let release!: (value: Response) => void;
  f.remote.run = async (path, init, body) => {
    if (path === "token")
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    if (path === "token/resources")
      return Response.json({
        resource_infos: [
          {
            owner: { type: "User", id: "123" },
            resources: { creator: { ids: ["U"] } },
          },
        ],
      });
    return f.provider(path, init, body);
  };
  const pending = Array.from({ length: 1000 }, (_, index) =>
    f.service.credential(ready.accountToken, "invite", {
      kind: index % 2 ? "group" : "user",
      id: index % 2 ? "456" : "123",
    }),
  );
  // Attach rejection handlers before unblocking the shared provider operation.
  const settled = Promise.allSettled(pending);
  await vi.waitFor(() => expect(release).toBeDefined());
  expect(
    f.calls.filter((call) => call.body.get("grant_type") === "refresh_token"),
  ).toHaveLength(1);
  release(Response.json(tokenResponse(2)));
  const results = await settled;
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(500);
  results.forEach((result, index) => {
    if (index % 2) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ status: 403 });
    } else {
      expect(result).toEqual({
        status: "fulfilled",
        value: { token: "local-access-token-2", identity: initial.identity },
      });
    }
  });
  const restarted = new RobloxOAuth(f.store, oauthConfig, f.deps);
  expect(restarted.status(ready.accountToken)).toMatchObject({
    needsAuthorization: false,
    providerRefreshCount: 1,
    providerRefreshedAt: 1900001,
    providerAccessExpiresAt: 2800001,
    owners: [{ kind: "user", id: "123" }],
  });
  await expect(
    restarted.credential(ready.accountToken, "invite", {
      kind: "group",
      id: "456",
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    f.calls.filter((call) => call.body.get("grant_type") === "refresh_token"),
  ).toHaveLength(1);
});

it("rejects every queued upload credential when its invitation ends during a shared refresh", async () => {
  const f = oauthFixture(),
    ready = await f.connect();
  f.advance(900001);
  let release!: (value: Response) => void;
  f.remote.run = async (path, init, body) =>
    path === "token"
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : f.provider(path, init, body);
  const pending = Promise.allSettled(
    Array.from({ length: 1000 }, () =>
      f.service.credential(ready.accountToken, "invite", {
        kind: "group",
        id: "456",
      }),
    ),
  );
  await vi.waitFor(() => expect(release).toBeDefined());
  f.active.delete("invite");
  release(Response.json(tokenResponse(2)));
  const results = await pending;
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  for (const result of results)
    if (result.status === "rejected")
      expect(result.reason).toMatchObject({ status: 401 });
  const stored = f.store.account(oauthHash(ready.accountToken));
  expect(stored).toMatchObject({
    state: "reauthorize",
    providerRefreshCount: 0,
    providerRefreshedAt: null,
  });
  expect(
    f.calls.filter((call) => call.body.get("grant_type") === "refresh_token"),
  ).toHaveLength(1);
  expect(
    f.calls
      .filter((call) => call.path === "token/revoke")
      .map((call) => call.body.get("token")),
  ).toEqual(["local-refresh-token-2"]);
  expect(() => f.service.status(ready.accountToken)).toThrow(
    "connection ended",
  );
});
