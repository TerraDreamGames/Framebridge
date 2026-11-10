/** Keep small ratios precise: geometry rounding can erase a thin scaled border. */
export function styleUDim(
  pixels: number,
  reference: number,
  scaled: boolean,
): { type: "UDim"; value: [number, number] } {
  return {
    type: "UDim",
    value: scaled && reference > 0 ? [pixels / reference, 0] : [0, pixels],
  };
}
