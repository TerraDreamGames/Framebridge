/** Copy the JSON-serializable settings shared with Figma's plugin sandbox. */
export function cloneSettings<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
