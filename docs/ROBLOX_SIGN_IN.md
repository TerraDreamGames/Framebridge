# Roblox sign-in and image uploads

Roblox sign-in lets Framebridge upload images for creators you approve during authorization. It uses the configured transfer service and keeps Roblox provider tokens on the backend.

## Upload artwork

1. Open **Images** and choose **Connect Roblox**.
2. Review the requested identity and asset permissions on Roblox's authorization page.
3. Return to Framebridge and select an approved personal or group image owner.
4. Choose **Upload all images** or **Send to Studio**. Existing image links remain available.

Only creators approved during sign-in appear in the owner picker. Choose the group that owns your group experience. Changing the owner does not move previously uploaded images.

**Check connection** refreshes account status. **Reconnect Roblox** requests fresh authorization when needed. **Disconnect** clears the saved account capability and prevents further use of it. API-key uploads remain an alternative where enabled; keys need asset access for the chosen creator.

## Diagnose an upload error

Open the upload diagnostic details and retain the plugin/service revisions, failed stage and provider reason. HTTP status alone does not establish a permissions problem. Framebridge normalizes upload names to Roblox's supported length and reports the rejected request's details when available.

A retry may reuse the existing job for identical PNG bytes. Renaming a Figma layer does not create new artwork. Changed image bytes or preparation settings identify a different variant. Check Creator Dashboard after an uncertain upload before retrying with a new connection.

Roblox may accept an upload before moderation or experience permissions allow it to display. Test visibility in the intended experience and under the intended owner.

## Privacy and persistence

The plugin stores an account capability in local device storage. Provider access and refresh tokens remain encrypted on the service. Credentials are excluded from Figma document data, exported designs and diagnostic reports.

The backend validates identity, approved creators and scopes when refreshing authorization. Revoked or expired grants require reconnecting. Saved image reuse is scoped to the authorized owner and prepared PNG bytes.

## Operator configuration

Register the OAuth callback for the HTTPS domain you control. Configure client credentials and token encryption as server-only secrets. The optional gateway handles only `/oauth/roblox/*`; use `/oauth/roblox/health` for its scoped health check and preserve unrelated website traffic.

Callback origins, plugin completion routing and allowed service origins must match the deployed configuration. Keep test simulation disabled in production. See [release setup](RELEASE.md).

### Changing the OAuth app

Registering a replacement app under another creator produces a different client ID. Existing Roblox grants and refresh tokens still belong to the original app. Before switching, retain its credentials as the server-only secrets `ROBLOX_OAUTH_LEGACY_CLIENT_ID` and `ROBLOX_OAUTH_LEGACY_CLIENT_SECRET`. Set the replacement credentials as `ROBLOX_OAUTH_CLIENT_ID` and `ROBLOX_OAUTH_CLIENT_SECRET` together, and keep the callback URI, sealing key, Worker and Durable Object identity unchanged.

Deploy migration support before switching credentials. New logins use the replacement app; pending logins, refreshes, permission checks and revocations use their issuing app. Records from releases without an issuer field use the explicitly configured legacy app. Failed refreshes never retry using another client's credentials. A completed reconnect replaces the old grant only after the plugin acknowledges the new connection.

Keep the original app and legacy secrets until its remaining accounts expire or reconnect. Keep the legacy client ID as long as any records without an issuer field could remain. The replacement app needs its own Roblox public review; registration alone leaves sign-in limited to ten users. An app ownership change does not change the creator of anyone's uploaded images.
