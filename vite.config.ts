import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import config from "./framebridge.config.json";
import { connectionBuildSettings } from "./scripts/connection-build.mjs";
export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, process.cwd(), ["FRAMEBRIDGE_", "VITE_FRAMEBRIDGE_"]),
    ...process.env,
  };
  const settings = connectionBuildSettings(
    config,
    {
      FRAMEBRIDGE_RELAY_URL:
        env.VITE_FRAMEBRIDGE_RELAY_URL ?? env.FRAMEBRIDGE_RELAY_URL,
      FRAMEBRIDGE_PRIVATE_BETA:
        env.VITE_FRAMEBRIDGE_PRIVATE_BETA ?? env.FRAMEBRIDGE_PRIVATE_BETA,
    },
    /^http:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(
      env.VITE_FRAMEBRIDGE_RELAY_URL ?? env.FRAMEBRIDGE_RELAY_URL ?? "",
    )
      ? ["--local"]
      : [],
  );
  return {
    // Only the explicitly defined public connection settings reach the UI.
    envPrefix: [],
    define:
      mode === "test"
        ? {}
        : {
            "import.meta.env.VITE_FRAMEBRIDGE_RELAY_URL": JSON.stringify(
              settings.relayUrl,
            ),
            "import.meta.env.VITE_FRAMEBRIDGE_PRIVATE_BETA": JSON.stringify(
              settings.privateBeta ? "1" : "0",
            ),
          },
    plugins: [tailwindcss()],
    server: {
      fs: {
        allow: [process.cwd()],
        deny: [
          "**/.env",
          "**/.env.*",
          "**/.dev.vars",
          "**/.dev.vars.*",
          "**/*.{crt,pem,key,p12,pfx}",
          "**/.git/**",
          "**/.artifacts/**",
          "**/.wrangler/**",
        ],
      },
      watch: {
        ignored: [
          "**/.artifacts/**",
          "**/dist/**",
          "**/tests/**/*.luau",
          "**/plugins/studio/*.project.json",
        ],
      },
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./plugins/figma/src", import.meta.url)),
      },
    },
  };
});
