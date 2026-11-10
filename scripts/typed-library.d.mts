export function buildTypedLibrary(options: {
  entrypoint?: string;
  commandId: string;
}): Promise<{ code: string; modules: string[] }>;
