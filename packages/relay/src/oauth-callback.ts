import { createHash } from "node:crypto";

/** Keep only provider code/error and one state; never forward arbitrary query data. */
export function validatedOAuthCallback(value: unknown, redirectUri?: string) {
  if (typeof value !== "string" || value.length > 16384) return undefined;
  try {
    const url = new URL(value),
      params = url.searchParams,
      states = params.getAll("state"),
      codes = params.getAll("code"),
      errors = params.getAll("error");
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.origin + url.pathname !== redirectUri ||
      states.length !== 1 ||
      !/^[a-f0-9]{64}$/.test(states[0]) ||
      !(
        (codes.length === 1 && errors.length === 0) ||
        (errors.length === 1 && codes.length === 0)
      )
    )
      return undefined;
    const field = codes.length ? "code" : "error",
      content = (codes.length ? codes : errors)[0];
    if (
      !content ||
      content.length > (field === "code" ? 4096 : 256) ||
      /[\r\n]/.test(content)
    )
      return undefined;
    const callback = new URL(redirectUri!);
    callback.searchParams.set("state", states[0]);
    callback.searchParams.set(field, content);
    return callback;
  } catch {
    return undefined;
  }
}

export function oauthPage(
  title:
    | "Return to Framebridge"
    | "Roblox authorization completed"
    | "Roblox authorization could not finish" = "Return to Framebridge",
  status = 200,
) {
  const script = "history.replaceState(null,'','/oauth/roblox/complete');";
  const scriptHash = createHash("sha256").update(script).digest("base64");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Framebridge Roblox sign-in</title><style>body{font:16px system-ui;background:#18191d;color:#eee;max-width:32rem;margin:12vh auto;padding:24px}p{color:#b7b9c3;line-height:1.5}</style><h1>${title}</h1><p>Return to the Framebridge Figma plugin to check your connection. You can close this tab.</p><script>${script}</script></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      },
    },
  );
}
