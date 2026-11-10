/** Figma's sandbox relays controller messages from the editor's top window. */
export function isHostMessage(
  source: MessageEventSource | null,
  immediateParent: Window,
  editorWindow: Window | null,
): boolean {
  return (
    source !== null && (source === immediateParent || source === editorWindow)
  );
}
