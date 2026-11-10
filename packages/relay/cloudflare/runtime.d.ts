// The mixed browser/Node workspace imports Workers types as modules, rather
// than installing their global DOM replacements. This module exists at runtime.
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
