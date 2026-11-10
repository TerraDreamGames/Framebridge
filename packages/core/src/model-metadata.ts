// XML stores enums as numeric tokens and integer properties as int.
// Values checked against Roblox Studio 0.738.0.7381393 and the API dump:
// https://github.com/MaximumADHD/Roblox-Client-Tracker/blob/roblox/API-Dump.json
export const MODEL_ENUM_VALUES: Record<string, Record<string, number>> = {
  NormalId: { Right: 0, Top: 1, Back: 2, Left: 3, Bottom: 4, Front: 5 },
  SurfaceGuiSizingMode: { FixedSize: 0, PixelsPerStud: 1 },
  ScreenInsets: {
    None: 0,
    DeviceSafeInsets: 1,
    CoreUISafeInsets: 2,
    TopbarSafeInsets: 3,
  },
  AutomaticSize: {
    None: 0,
    X: 1,
    Y: 2,
    XY: 3,
  },
  ZIndexBehavior: {
    Global: 0,
    Sibling: 1,
  },
  TextXAlignment: {
    Left: 0,
    Right: 1,
    Center: 2,
  },
  TextYAlignment: {
    Top: 0,
    Center: 1,
    Bottom: 2,
  },
  FontWeight: {
    Thin: 100,
    ExtraLight: 200,
    Light: 300,
    Regular: 400,
    Medium: 500,
    SemiBold: 600,
    Bold: 700,
    ExtraBold: 800,
    Heavy: 900,
  },
  FontStyle: {
    Normal: 0,
    Italic: 1,
  },
  ScaleType: {
    Stretch: 0,
    Slice: 1,
    Tile: 2,
    Fit: 3,
    Crop: 4,
  },
  ScrollingDirection: {
    X: 1,
    Y: 2,
    XY: 4,
  },
  ApplyStrokeMode: {
    Contextual: 0,
    Border: 1,
  },
  StrokeSizingMode: { FixedSize: 0, ScaledSize: 1 },
  BorderStrokePosition: {
    Outer: 0,
    Center: 1,
    Inner: 2,
  },
  LineJoinMode: {
    Round: 0,
    Bevel: 1,
    Miter: 2,
  },
  AspectType: {
    FitWithinMaxSize: 0,
    ScaleWithParentSize: 1,
  },
  DominantAxis: {
    Width: 0,
    Height: 1,
  },
  ItemLineAlignment: {
    Automatic: 0,
    Start: 1,
    Center: 2,
    End: 3,
    Stretch: 4,
  },
  FillDirection: {
    Horizontal: 0,
    Vertical: 1,
  },
  SortOrder: {
    Name: 0,
    Custom: 1,
    LayoutOrder: 2,
  },
  HorizontalAlignment: {
    Center: 0,
    Left: 1,
    Right: 2,
  },
  VerticalAlignment: {
    Center: 0,
    Top: 1,
    Bottom: 2,
  },
  UIFlexAlignment: {
    None: 0,
    Fill: 1,
    SpaceAround: 2,
    SpaceBetween: 3,
    SpaceEvenly: 4,
  },
  UIFlexMode: {
    None: 0,
    Grow: 1,
    Shrink: 2,
    Fill: 3,
    Custom: 4,
  },
  StartCorner: {
    TopLeft: 0,
    TopRight: 1,
    BottomLeft: 2,
    BottomRight: 3,
  },
};

export const MODEL_INTEGER_PROPERTIES: readonly string[] = [
  "DisplayOrder",
  "BorderSizePixel",
  "LayoutOrder",
  "ZIndex",
  "ScrollBarThickness",
  "MinTextSize",
  "MaxTextSize",
  "FillDirectionMaxCells",
];
