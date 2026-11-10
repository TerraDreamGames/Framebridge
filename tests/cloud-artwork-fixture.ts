import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { oauthConfig, oauthHash, tokenResponse } from "./roblox-oauth-fixture";
import { encode } from "fast-png";
export const artworkInvite =
    "artwork-local-private-invitation-1234567890123456",
  otherArtworkInvite = "artwork-other-private-invitation-1234567890123456";
export const artworkPng = (n = 1) =>
  encode({
    width: 2,
    height: 1,
    channels: 4,
    data: new Uint8Array([n, 2, 3, 255, 4, 5, 6, 128]),
  });
export type ArtworkProvider = {
  userId: string;
  groups: string[];
  number: number;
  users: Map<string, string>;
  calls: string[];
  revoked?: Set<string>;
  revocation?: { promise: Promise<void>; arrived(): void };
};
export async function artworkScript() {
  return (
    await build({
      stdin: {
        contents: `import {DurableObject} from "cloudflare:workers";
import {RelayRoom} from "./packages/relay/cloudflare/worker.ts";export {default} from "./packages/relay/cloudflare/worker.ts";
// These fault controls exist only in the local fixture bundle, never the shipped Worker.
export class InspectableRelayRoom extends DurableObject {constructor(ctx,env){super(ctx,env);this.storage=ctx.storage;this.flags={};this.bucket=env.ARTWORK_BUCKET;
const bucket={get:(...a)=>this.bucket.get(...a),list:async(...a)=>{if(this.flags.list)throw Error("simulated R2 list outage");const page=await this.bucket.list(...a);if(this.flags.holdList){this.waiting=true;await new Promise(r=>this.release=r);this.waiting=false;}return page;},delete:async(...a)=>{if(this.flags.delete)throw Error("simulated R2 delete outage");return this.bucket.delete(...a);},put:async(...a)=>{const value=await this.bucket.put(...a);if(this.flags.hold){this.waiting=true;await new Promise(r=>this.release=r);this.waiting=false;}if(this.flags.put)throw Error("simulated lost R2 write response");return value;}};
this.room=new RelayRoom(ctx,{...env,ARTWORK_BUCKET:bucket});}
async fetch(r){const path=new URL(r.url).pathname;if(path==="/__qa/fault"){this.flags=await r.json();return Response.json({ok:true});}if(path==="/__qa/release"){this.release?.();return Response.json({ok:true});}
if(path==="/__qa/state")return Response.json({waiting:!!this.waiting,alarm:await this.storage.getAlarm(),objects:(await this.bucket.list({prefix:"framebridge-artwork-v1/",limit:1000})).objects.map(o=>({key:o.key,size:o.size}))});
if(path==="/__qa/object"){const b=await r.json();await this.bucket.put(b.key,new Uint8Array(b.bytes),{httpMetadata:{contentType:"image/png"}});return Response.json({ok:true});}
if(path==="/__qa/alarm"){await this.room.alarm();return Response.json({ok:true});}return this.room.fetch(r);}alarm(){return this.room.alarm();}}`,
        resolveDir: process.cwd(),
        sourcefile: "cloud-artwork-qa.ts",
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      external: ["node:*", "cloudflare:workers"],
      write: false,
      logLevel: "silent",
    })
  ).outputFiles[0].text;
}
export async function startArtwork(
  script: string,
  directory: string,
  provider: ArtworkProvider = {
    userId: "123",
    groups: ["456"],
    number: 0,
    users: new Map(),
    calls: [],
  },
  enabled = true,
  access = [artworkInvite, otherArtworkInvite],
) {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: "artwork-test",
      modules: true,
      script,
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        RELAY: { className: "InspectableRelayRoom", useSQLite: true },
      },
      r2Buckets: { ARTWORK_BUCKET: "artwork-local" },
      resourcePersistencePath: directory,
      telemetry: { enabled: false },
      unsafeInspectDurableObjects: true,
      bindings: {
        ARTWORK_ENABLED: enabled ? "1" : "0",
        BETA_ACCESS_HASHES: access.map(oauthHash).join(","),
        ROBLOX_OAUTH_CLIENT_ID: oauthConfig.clientId,
        ROBLOX_OAUTH_CLIENT_SECRET: oauthConfig.clientSecret,
        ROBLOX_OAUTH_REDIRECT_URI: oauthConfig.redirectUri,
        ROBLOX_OAUTH_SEALING_KEY: oauthConfig.sealingKey,
      },
      outboundService: async (request) => {
        const endpoint = new URL(request.url).pathname.split("/oauth/v1/")[1];
        provider.calls.push(endpoint);
        if (endpoint === "token") {
          const v = tokenResponse(++provider.number);
          provider.users.set(v.access_token, provider.userId);
          return Response.json(v);
        }
        if (endpoint === "userinfo") {
          const id = provider.users.get(
            request.headers.get("Authorization")!.slice(7),
          );
          if (provider.revoked?.has(id!))
            return Response.json({ error: "revoked" }, { status: 401 });
          return Response.json({
            sub: id,
            preferred_username: "Creator" + id,
            name: "Creator " + id,
          });
        }
        if (endpoint === "token/resources") {
          const b = new URLSearchParams(await request.text()),
            id = provider.users.get(b.get("token")!);
          return Response.json({
            resource_infos: [
              {
                owner: { id, type: "User" },
                resources: {
                  creator: {
                    ids: ["U", ...provider.groups.map((g) => "G" + g)],
                  },
                },
              },
            ],
          });
        }
        if (endpoint === "token/revoke") {
          if (provider.revocation) {
            provider.revocation.arrived();
            await provider.revocation.promise;
          }
          return new Response(null, { status: 204 });
        }
        throw Error("Unexpected outbound request " + endpoint);
      },
    }),
  );
  const base = (await runtime.ready).origin;
  const call = async (
    path: string,
    token = "",
    body?: unknown,
    grant = "",
    method?: string,
    accessCode?: string,
  ) => {
    const response = await fetch(base + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        Connection: "close",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(grant ? { "X-Framebridge-Artwork-Grant": grant } : {}),
        ...(accessCode ? { "X-Framebridge-Beta": accessCode } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status,
      body: response.headers.get("Content-Type")?.includes("application/json")
        ? JSON.parse(new TextDecoder().decode(bytes))
        : bytes,
    };
  };
  const account = async (id = "123", code = artworkInvite) => {
    provider.userId = id;
    const login = (await call("/v1/roblox/login", "", {}, "", undefined, code))
      .body;
    if (!login.authorizationUrl) throw Error("Fixture login failed");
    const state = new URL(login.authorizationUrl).searchParams.get("state");
    const callback = await runtime.dispatchFetch(
      "https://relay.test/oauth/roblox/callback?code=local-auth-code&state=" +
        state,
    );
    if (callback.status !== 200) throw Error("Fixture callback failed");
    const ready = (await call("/v1/roblox/login", login.loginToken)).body;
    const complete = await call(
      "/v1/roblox/login/complete",
      login.loginToken,
      {},
    );
    if (complete.status !== 200) throw Error("Fixture completion failed");
    return ready.accountToken as string;
  };
  const connect = async (token: string, group?: string) => {
    const r = await call(
      "/v1/artwork/connect",
      token,
      group
        ? { scope: "group", groupId: group, consent: true }
        : { scope: "personal", consent: true },
    );
    if (r.status !== 201)
      throw Error("Fixture connect failed: " + JSON.stringify(r));
    return r.body;
  };
  const upload = (
    token: string,
    grant: string,
    n = 1,
    name = "Reviewed PNG",
    folder: string | null = null,
  ) =>
    call(
      "/v1/artwork/images",
      token,
      { name, folder, png: Buffer.from(artworkPng(n)).toString("base64") },
      grant,
    );
  const sql = () =>
    runtime.unsafeGetDurableObjectStorage(
      "artwork-test",
      "InspectableRelayRoom",
      { name: "private-beta-v1" },
    );
  return {
    runtime,
    base,
    provider,
    call,
    account,
    connect,
    upload,
    sql,
    close: () => runtime.dispose(),
  };
}
