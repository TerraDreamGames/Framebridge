import type { StudioModule } from "./studio-tree.mjs";
export function rojoBinary(): Promise<string>;
export function studioProjectFiles(tree: StudioModule): Record<string, string>;
export function studioProjectPaths(): Promise<string[]>;
export function prepareStudioProject(
  entrySource: string,
): Promise<Record<string, string>>;
export function buildStudioProject(
  entrySource: string,
  directory?: string,
): Promise<string[]>;
export function configuredStudioEntry(
  relayUrl: string,
  privateBeta: boolean,
): Promise<string>;
