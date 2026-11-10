export type StudioModule = {
  name: string;
  source?: string;
  children: StudioModule[];
};
export function bundleStudio(
  entrySource: string,
  extraModules?: StudioModule[],
): Promise<string>;
