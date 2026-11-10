import type { Value } from "./types";

type FontFace = Extract<Value, { type: "Font" }>;
type FontMetrics = {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  faces: readonly string[];
};

// Facts read from Studio's bundled font files, not a shared multiplier. Remote
// faces and custom asset families remain unverified. See docs/TYPOGRAPHY.md.
const metrics: Record<string, FontMetrics> = {
  Arimo: {
    unitsPerEm: 2048,
    ascent: 1854,
    descent: -434,
    lineGap: 67,
    faces: ["Regular/Normal", "Bold/Normal"],
  },
  Roboto: {
    unitsPerEm: 2048,
    ascent: 1900,
    descent: -500,
    lineGap: 0,
    faces: ["Regular/Normal", "Regular/Italic", "Bold/Normal"],
  },
  SourceSansPro: {
    unitsPerEm: 1000,
    ascent: 984,
    descent: -273,
    lineGap: 0,
    faces: [
      "Light/Normal",
      "Regular/Normal",
      "Regular/Italic",
      "SemiBold/Normal",
      "Bold/Normal",
    ],
  },
  Ubuntu: {
    unitsPerEm: 1000,
    ascent: 932,
    descent: -189,
    lineGap: 28,
    faces: ["Regular/Normal", "Regular/Italic"],
  },
  Montserrat: {
    unitsPerEm: 1000,
    ascent: 968,
    descent: -251,
    lineGap: 0,
    faces: ["Regular/Normal", "Medium/Normal", "Bold/Normal", "Heavy/Normal"],
  },
  Nunito: {
    unitsPerEm: 1000,
    ascent: 1011,
    descent: -353,
    lineGap: 0,
    faces: ["Regular/Normal"],
  },
  FredokaOne: {
    unitsPerEm: 1000,
    ascent: 974,
    descent: -236,
    lineGap: 0,
    faces: ["Regular/Normal"],
  },
  RobotoMono: {
    unitsPerEm: 2048,
    ascent: 2146,
    descent: -555,
    lineGap: 0,
    faces: ["Regular/Normal"],
  },
  RobotoCondensed: {
    unitsPerEm: 2048,
    ascent: 1900,
    descent: -500,
    lineGap: 0,
    faces: ["Regular/Normal"],
  },
  Oswald: {
    unitsPerEm: 1000,
    ascent: 1193,
    descent: -289,
    lineGap: 0,
    faces: ["Regular/Normal", "Bold/Normal"],
  },
  Bangers: {
    unitsPerEm: 1000,
    ascent: 883,
    descent: -181,
    lineGap: 0,
    faces: ["Regular/Normal"],
  },
};

/** The native setter truncates, then bounds line height to 1–100 pixels. */
export function nativeTextSize(requested: number) {
  if (!Number.isFinite(requested)) throw new Error("Text size must be finite.");
  return {
    requested,
    value: Math.max(1, Math.min(100, Math.floor(requested))),
    clamped: requested < 1 || requested > 100,
  };
}

/** Legacy family paths are engine aliases, confirmed by GetFamilyInfoAsync. */
const familyAliases: Record<string, string> = {
  Arial: "Arimo",
  GothamSSm: "Montserrat",
};
function lineHeightFactor(font: FontFace) {
  const family = /^rbxasset:\/\/fonts\/families\/([A-Za-z0-9_]+)\.json$/.exec(
    font.family,
  )?.[1];
  const canonical =
    family && Object.prototype.hasOwnProperty.call(familyAliases, family)
      ? familyAliases[family]
      : family;
  const metric =
    canonical && Object.prototype.hasOwnProperty.call(metrics, canonical)
      ? metrics[canonical]
      : undefined;
  return metric && metric.faces.includes(font.weight + "/" + font.style)
    ? (metric.ascent - metric.descent + metric.lineGap) / metric.unitsPerEm
    : undefined;
}

/** Figma uses an em size; Roblox TextSize specifies a native line height. */
export function figmaTextSize(emSize: number, font: FontFace) {
  const factor = lineHeightFactor(font);
  return {
    ...nativeTextSize(emSize * (factor ?? 1)),
    verified: factor !== undefined,
  };
}

/** Native RichText accepts positive integer size tags above TextSize's 100 cap. */
export function richTextSize(requested: number) {
  if (!Number.isFinite(requested)) throw new Error("Text size must be finite.");
  return {
    requested,
    value: Math.max(1, Math.floor(requested)),
    clamped: requested < 1,
  };
}

function fontEmSize(lineHeight: number, font?: Value) {
  if (!font || typeof font !== "object" || font.type !== "Font")
    return undefined;
  const factor = lineHeightFactor(font);
  return factor === undefined ? undefined : lineHeight / factor;
}

/** CSS and contrast use em pixels rather than the bounded TextSize property. */
export function nativeFontEmSize(lineHeight: number, font?: Value) {
  return Number.isFinite(lineHeight)
    ? fontEmSize(nativeTextSize(lineHeight).value, font)
    : undefined;
}

/** Tagged heights use their own integer policy, without the property cap. */
export function richFontEmSize(lineHeight: number, font?: Value) {
  return Number.isFinite(lineHeight)
    ? fontEmSize(richTextSize(lineHeight).value, font)
    : undefined;
}
