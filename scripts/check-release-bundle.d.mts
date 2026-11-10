export const RELEASE_GUIDES: readonly string[];
export const RELEASE_NOTICES: readonly string[];
export function sourceExamplePaths(root?: string): Promise<string[]>;
export function relocateMarkdownLinks(
  markdown: string,
  sourcePath: string,
  artifactPath: string,
): string;
export function checkReleaseBundle(
  archiveBytes: Uint8Array,
  expectedExamples: readonly string[],
  expectedStudio: readonly string[],
): {
  entries: number;
  examples: number;
  guides: number;
  studioSources: number;
  localLinks: number;
};
