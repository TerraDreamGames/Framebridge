// Shared by the production builder and the sandbox startup regression check.
export const FIGMA_CONTROLLER_BUILD_OPTIONS = {
  entryPoints: ["plugins/figma/src/controller.ts"],
  inject: ["plugins/figma/src/sandbox-text-codecs.ts"],
  bundle: true,
  format: "iife",
  target: "es2018",
  minify: true,
  define: { __FRAMEBRIDGE_LIBRARY_COMMAND__: '""' },
};
