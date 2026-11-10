/** Run the local upload helper automatically for the signed-in macOS user. No credentials are saved. */
import { mkdir, writeFile, access, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
if (process.platform !== "darwin")
  throw new Error(
    "This installer is for macOS. On other platforms, use npm run relay.",
  );
const label = "com.framebridge.upload-helper";
const server = resolve("dist/relay/server.mjs");
await access(server);
const folder = resolve(homedir(), "Library/LaunchAgents");
const logs = resolve(homedir(), "Library/Logs/Framebridge");
await mkdir(folder, { recursive: true });
await mkdir(logs, { recursive: true });
const xml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
// Keep the stable Homebrew symlink when it points at our runtime.
let node = process.execPath;
try {
  if ((await realpath("/opt/homebrew/bin/node")) === (await realpath(node)))
    node = "/opt/homebrew/bin/node";
} catch {}
const plist = resolve(folder, `${label}.plist`);
await writeFile(
  plist,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(server)}</string></array>
<key>EnvironmentVariables</key><dict><key>HOST</key><string>127.0.0.1</string><key>PORT</key><string>4318</string></dict>
<key>WorkingDirectory</key><string>${xml(resolve("."))}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(resolve(logs, "helper.log"))}</string>
<key>StandardErrorPath</key><string>${xml(resolve(logs, "helper-error.log"))}</string>
</dict></plist>\n`,
  { mode: 0o600 },
);
const domain = `gui/${process.getuid()}`;
try {
  execFileSync("launchctl", ["bootout", `${domain}/${label}`], {
    stdio: "ignore",
  });
} catch {}
execFileSync("launchctl", ["bootstrap", domain, plist], { stdio: "pipe" });
console.log(
  "Framebridge upload helper installed on 127.0.0.1:4318 and starts at login. No API keys are saved.",
);
console.log(
  `Remove with: launchctl bootout ${domain}/${label}; then delete ${plist}`,
);
