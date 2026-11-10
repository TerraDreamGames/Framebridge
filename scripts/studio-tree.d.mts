export type StudioModule = {
  name: string;
  className?: string;
  source?: string;
  children: StudioModule[];
};
export const STUDIO_MODULES: readonly string[];
export function sourceTemplate(source: string): string;
export function loadStudioTree(
  entrySource: string,
  extraModules?: StudioModule[],
): Promise<StudioModule>;
