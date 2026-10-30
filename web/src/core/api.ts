// The CoreApi contract between the UI and the geometry core (WP-U2).
//
// Every method is synchronous and pure: same input, same output, no I/O, no shared
// state that changes results. Two implementations satisfy it, picked at build time by
// `VITE_CORE=stub|real` through the package import `#core` (see web/package.json):
//   web/src/core/stub/index.ts  placeholder geometry, real normalizers/filenames/derived values
//   web/src/core/real/index.ts  the 1:1 port of the Swift core (WP-K9)
//
// The parameter half (`CoreParameterApi`) is cheap and is also imported on the main
// thread through `#core/parameters`, so stores can normalize and compare synchronously
// (plan §6, WP-U3). Geometry (`preview`, `export`, `stl.open`) runs in the core worker.
//
// Swift sources are cited as mac/Sources/BalloonStudio/<File>.swift:<lines> @ 03c9307.

import type {
  BalloonParameters,
  BalloonPreview,
  BalloonSnapshot,
  BasketParameters,
  BasketPreview,
  CableClipDerived,
  CableClipParameters,
  CableSide,
  ClipPreview,
  CloudParameters,
  CloudPreview,
  CloudStyle,
  CoreError,
  CoreErrorCode,
  ExportResult,
  FigureParameters,
  FigurePreview,
  FigureStyle,
  FilamentColor,
  ImportedBalloon,
  NailInsertInfo,
  PatternSettings,
  PurgeSettings,
  Range,
  RingParameters,
  RingPreview,
  SunStyle,
  Vec2,
  WallLampKind,
} from './types';

// ---------------------------------------------------------------------------
// Errors (exact Mac strings)
// ---------------------------------------------------------------------------

/** MeshError.errorDescription (BalloonGeometry.swift:119-124). */
export const meshErrorMessage = (reason: string): string => `The model could not be exported: ${reason}`;

/** LampSettingsFile.ReadError.errorDescription (LampSettingsFile.swift:7-9), with its typographic apostrophe. */
export const LAMP_SETTINGS_ERROR =
  'This file doesn’t contain valid cloud or sun lamp settings. Choose cloud-settings.json or sun-settings.json from an exported lamp kit.';

/** STLImportError messages (STLImport.swift:50-160). */
export const STL_ERRORS = {
  tooLarge: 'This STL is too large. Open a file smaller than 150 MB with at most 2 million triangles.',
  emptyOrTooLarge: 'The STL is empty or exceeds the 150 MB limit.',
  tooManyTriangles: 'The STL exceeds the limit of 2 million triangles.',
  invalidCoordinates: 'The STL contains invalid coordinates or collapsed triangles.',
  truncated: 'The binary STL is truncated or has an invalid triangle count.',
  noTriangles: 'The STL has no triangles.',
  incomplete: 'The file is not a complete ASCII or binary STL. Try exporting it as STL again.',
  notABalloon:
    'This STL could not be reconstructed as an editable balloon. Use an upright balloon envelope in millimetres (60–240 mm wide, 80–256 mm tall). Arbitrary meshes, baskets, and rotated models cannot be converted to balloon settings.',
} as const;

/**
 * Messages of a settings JSON that does not decode. The Mac app never shows them (it uses
 * `try?` and falls back to defaults); they are Foundation's DecodingError descriptions:
 * `typeMismatch` and `dataCorrupted` (a wrong type, an unknown enum raw value, a syntax error)
 * give the first, `keyNotFound` and `valueNotFound` (a required key absent or null, a null
 * document) the second. The first failure in declaration order decides.
 */
export const INVALID_SETTINGS_MESSAGE = 'The data couldn’t be read because it isn’t in the correct format.';
export const MISSING_SETTINGS_MESSAGE = 'The data couldn’t be read because it is missing.';

/** Thrown by core implementations; structured-clone it with `toCoreError` before posting. */
export class CoreFailure extends Error implements CoreError {
  readonly code: CoreErrorCode;
  constructor(code: CoreErrorCode, message: string) {
    super(message);
    this.name = 'CoreFailure';
    this.code = code;
  }
}

export const isCoreError = (value: unknown): value is CoreError =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { code?: unknown }).code === 'string' &&
  typeof (value as { message?: unknown }).message === 'string';

/** Any thrown value as a plain `CoreError`; unknown failures become `internal`. */
export const toCoreError = (error: unknown): CoreError => {
  if (isCoreError(error)) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: 'internal', message: error.message };
  return { code: 'internal', message: String(error) };
};

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type Quality = 'preview' | 'export';

/**
 * K9: polled where Swift checks `Task.isCancelled`; progress never changes results. A cancelled
 * preview comes back with empty meshes, like `BalloonGenerator.generate`; the caller discards it.
 */
export interface RunOptions {
  isCancelled?: () => boolean;
  onProgress?: (fraction: number) => void;
}

/**
 * What the reference exporter does and the app does not (mac/ReferenceExporter/main.swift). The
 * app calls `export` without them; the stub core ignores both.
 */
export interface ExportOptions extends RunOptions {
  /** Defaults to `'export'`. 59 grid cases are exported at preview quality. A figure set is always export quality, as in Swift. */
  quality?: Quality;
  /** Export a cable clip with a `problem` instead of throwing `export-blocked`; the app disables the button. */
  ignoreExportProblem?: boolean;
}

/**
 * JSON as the Mac app reads and writes it.
 * - `decode` = `JSONDecoder` + the struct's `init(from:)`: `decodeIfPresent ?? default`
 *   leniency, migrations, type errors rejected, unknown keys ignored. It does NOT normalize.
 *   Throws `CoreFailure('invalid-settings', …)` with `INVALID_SETTINGS_MESSAGE` or `MISSING_SETTINGS_MESSAGE`.
 * - `encode` = `JSONEncoder` with `.sortedKeys` (StableJSON, plan §8): compact, nil omitted,
 *   whole Doubles without `.0`, `/` escaped as `\/`.
 */
export interface Codec<T> {
  decode(text: string): T;
  /** Same as `decode` for an already parsed JSON value. */
  decodeValue(value: unknown): T;
  encode(value: T): string;
}

// ---------------------------------------------------------------------------
// Balloon (BalloonGeometry.swift:3-97, BalloonPatterns.swift:3-122, 254-267)
// ---------------------------------------------------------------------------

/** Computed properties of BalloonParameters (BalloonGeometry.swift:26-43). */
export interface BalloonDerived {
  maximumNeckDiameter: number;
  maximumNeckHeight: number;
  hasStringHoles: boolean;
  /** `CeilingLoop.height` when the hanger is on, else 0. */
  loopHeight: number;
  totalHeight: number;
  maximumHeight: number;
  neckWallThickness: number;
  minimumNeckDiameter: number;
  minimumNeckHeight: number;
  fitsPrinter: boolean;
  fitsWithBrim: boolean;
  openingDiameter: number;
  filename: string;
}

/** Computed properties of PatternSettings for given balloon parameters (BalloonPatterns.swift:43-51). */
export interface PatternDerived {
  hasRelief: boolean;
  baseColor: FilamentColor;
  detailColor: FilamentColor;
  multicolor: boolean;
  capBoundary: number;
  maximumTextHeight: number;
  maximumSize: number;
}

export interface BalloonParameterApi {
  /** `BalloonParameters()` = `.classic`, the reset target. */
  readonly defaults: BalloonParameters;
  readonly presets: { readonly classic: BalloonParameters; readonly round: BalloonParameters; readonly tall: BalloonParameters };
  normalize(p: BalloonParameters): BalloonParameters;
  readonly codec: Codec<BalloonParameters>;
  filename(p: BalloonParameters): string;
  derived(p: BalloonParameters): BalloonDerived;
  readonly pattern: {
    readonly defaults: PatternSettings;
    /** `PatternSettings.normalized(_:)`: depends on the (normalized) balloon. */
    normalize(s: PatternSettings, balloon: BalloonParameters): PatternSettings;
    readonly codec: Codec<PatternSettings>;
    derived(s: PatternSettings, balloon: BalloonParameters): PatternDerived;
  };
  readonly purge: {
    readonly defaults: PurgeSettings;
    normalize(s: PurgeSettings): PurgeSettings;
    readonly codec: Codec<PurgeSettings>;
  };
  /** `uses3MF`: any pattern but Solid exports a two-color 3MF (BalloonStudioApp.swift:113-114). */
  exportFormat(pattern: PatternSettings): 'stl' | '3mf';
  /** Save-panel name (BalloonStudioApp.swift:169-170), extension included: `…-night-flight.3mf`, `…-pattern.3mf` or the STL name. */
  exportFilename(snapshot: BalloonSnapshot): string;
}

export interface BalloonGeometryApi {
  /** Normalizes, generates at preview quality, paints and estimates purge. */
  preview(snapshot: BalloonSnapshot, options?: RunOptions): BalloonPreview;
  /** `BalloonSTL.export` (STL with the BSTL0002 header) or `PaintedBalloon.threeMF` per `exportFormat`. */
  export(snapshot: BalloonSnapshot, options?: ExportOptions): ExportResult;
}

// ---------------------------------------------------------------------------
// Basket (BasketGeometry.swift:3-44, BasketEditor.swift:50-56)
// ---------------------------------------------------------------------------

export interface BasketDerived {
  actualDepth: number;
  floorThickness: number;
  holeCenter: number;
  filename: string;
}

export interface BasketParameterApi {
  readonly defaults: BasketParameters;
  normalize(p: BasketParameters): BasketParameters;
  readonly codec: Codec<BasketParameters>;
  filename(p: BasketParameters): string;
  derived(p: BasketParameters): BasketDerived;
  /** "Match balloon": width/depth/height from the balloon, not normalized (BasketEditor.swift:50-56). */
  match(p: BasketParameters, balloon: BalloonParameters): BasketParameters;
}

export interface BasketGeometryApi {
  preview(p: BasketParameters, options?: RunOptions): BasketPreview;
  export(p: BasketParameters, options?: ExportOptions): ExportResult;
}

// ---------------------------------------------------------------------------
// Ring (RingGeometry.swift:3-112)
// ---------------------------------------------------------------------------

export interface RingDerived {
  diameterRange: Range;
  heightRange: Range;
  cordRange: Range;
  maximumBandWidth: number;
  continuousCords: boolean;
  fitsP2S: boolean;
  channelWidth: number;
  minimumBandWidth: number;
  maximumChannelDepth: number;
  innerRadius: number;
  channelOuterRadius: number;
  channelInnerRadius: number;
  flangeOuterRadius: number;
  holeRadius: number;
  channelRadius: number;
  stripPathLength: number;
  balloonSpacing: number;
  floorThickness: number;
  ledWallRadius: number;
  ledShelfZ: number;
  ledShelfRadius: number;
  reflectorRise: number;
  reflectorToeRadius: number;
  reflectorInnerRadius: number;
  totalHeight: number;
  /** For the LED reflector diagram. */
  outerProfile: { radius: number; z: number }[];
  filename: string;
}

export interface RingParameterApi {
  /** `RingParameters()`: the codec's base for missing keys. Not a reset target. */
  readonly defaults: RingParameters;
  /** Reset and first-launch targets: `.large` (segmented) and `.solid` (RingGeometry.swift:16-17). */
  readonly presets: { readonly large: RingParameters; readonly solid: RingParameters };
  readonly outerLip: number;
  normalize(p: RingParameters): RingParameters;
  readonly codec: Codec<RingParameters>;
  filename(p: RingParameters): string;
  derived(p: RingParameters): RingDerived;
}

export interface RingGeometryApi {
  preview(p: RingParameters, options?: RunOptions): RingPreview;
  /** Solid ring STL, or the segmented kit ZIP (`SegmentedRingKit.archive`). */
  export(p: RingParameters, options?: ExportOptions): ExportResult;
}

// ---------------------------------------------------------------------------
// Cloud and sun lamps (CloudGeometry.swift:3-273, SunGeometry.swift, NailInsert.swift, CableClamp.swift)
// ---------------------------------------------------------------------------

/** Which outline: a cloud style (optionally mirrored) or a sun style. */
export type LampProfileRef = { kind: 'cloud'; style: CloudStyle; mirrored: boolean } | { kind: 'sun'; sunStyle: SunStyle };

/** Computed properties of CloudParameters (CloudGeometry.swift:139-247). */
export interface CloudDerived {
  cableSides: CableSide[];
  height: number;
  reliefDepth: number;
  maximumSurfaceDepth: number;
  totalDepth: number;
  minimumWidth: number;
  layoutHeightBasis: number;
  verticalScale: number;
  compactBlend: number;
  coreLowY: number;
  coreHighY: number;
  coreHalfWidth: number;
  cableStartY: number;
  cableBossTop: number;
  nailCenterY: number;
  ledCenterY: number;
  ledLength: number;
  ledChannelWidth: number;
  cableClearance: number;
  fitsP2S: boolean;
  displayName: string;
  frontFilename: string;
  filename: string;
}

export interface CloudParameterApi {
  /** `WallLampKind.defaults`: `CloudParameters()` with the kind set; a sun is 200 mm wide. */
  defaults(kind: WallLampKind): CloudParameters;
  normalize(p: CloudParameters): CloudParameters;
  /** Both `BalloonStudio.cloud.v1` and `.sun.v1`; the stores force `kind` after decoding. */
  readonly codec: Codec<CloudParameters>;
  filename(p: CloudParameters): string;
  derived(p: CloudParameters): CloudDerived;
  readonly constants: {
    readonly floor: number;
    readonly wall: number;
    readonly skirt: number;
    readonly sunCore: number;
    readonly sunNailTop: number;
    readonly sealFilename: string;
    readonly barFilename: string;
    readonly anvilFilename: string;
    readonly insertFilename: string;
  };
  /** The `cableSides` setter (CloudGeometry.swift:145-150). */
  withCableSides(p: CloudParameters, sides: readonly CableSide[]): CloudParameters;
  /** `selectCableSide(_:outlet:)` (CloudGeometry.swift:161-167). The editor's guard (CloudEditor.swift:65) stays in the store. */
  selectCableSide(p: CloudParameters, side: CableSide, outlet?: number): CloudParameters;
  /** `setCableOutletCount(_:)` (CloudGeometry.swift:168-178). Editor: `setCableOutlet(i, on)` = count `on ? i+1 : i`. */
  setCableOutletCount(p: CloudParameters, count: number): CloudParameters;
  /** One single-outlet copy per outlet (CloudGeometry.swift:152-159). */
  cableConfigurations(p: CloudParameters): CloudParameters[];
  /** `NailInsert.problem(_:)` (NailInsert.swift:85-101): why the slot insert does not suit, or null. */
  nailInsertProblem(p: CloudParameters): string | null;
  /** `NailInsert(_:)`: null where `nailInsertProblem` is not. Independent of `p.nailInsert`. */
  nailInsert(p: CloudParameters): NailInsertInfo | null;
  /** `CableClamp(p) != nil` for a single-outlet configuration (CableClamp.swift:69-73, 152-174). */
  clampFits(p: CloudParameters): boolean;
  /** `CableClamp.minimumWidth(_:)` (CableClamp.swift:177-185). */
  clampMinimumWidth(p: CloudParameters): number | null;
  /** `profile.lowY` / `profile.highY` at unit width (CloudGeometry.swift:55-56). */
  profileExtent(ref: LampProfileRef): { lowY: number; highY: number };
  /** `CloudGenerator.radius` (CloudGeometry.swift:824-843); defaults inset 0, width 1, verticalScale 1. */
  radius(angle: number, ref: LampProfileRef, options?: { inset?: number; width?: number; verticalScale?: number }): number;
}

export interface CloudGeometryApi {
  /** `CloudKit(p)` at preview quality, for a cloud or a sun. */
  preview(p: CloudParameters, options?: RunOptions): CloudPreview;
  /** `CloudKit(p, quality: .export).archive()`. */
  export(p: CloudParameters, options?: ExportOptions): ExportResult;
}

// ---------------------------------------------------------------------------
// Figures (FigureGeometry.swift:6-243, 562-617)
// ---------------------------------------------------------------------------

export interface FigureDerived {
  domed: boolean;
  sides: number;
  thickness: number;
  scale: number;
  width: number;
  fitsP2S: boolean;
  displayName: string;
  filename: string;
  setFilename: string;
}

/** FigureOutline (FigureGeometry.swift:39-74), in drawing units. */
export interface FigureOutlineInfo {
  loops: Vec2[][];
  rounding: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centroid: Vec2;
  rawHeight: number;
  rawWidth: number;
}

export interface FigureParameterApi {
  readonly defaults: FigureParameters;
  readonly ranges: { readonly height: Range; readonly edge: Range; readonly dome: Range; readonly hole: Range; readonly margin: Range };
  normalize(p: FigureParameters): FigureParameters;
  readonly codec: Codec<FigureParameters>;
  filename(p: FigureParameters): string;
  setFilename(p: FigureParameters): string;
  derived(p: FigureParameters): FigureDerived;
  /** For the silhouettes on the style cards. */
  outline(style: FigureStyle): FigureOutlineInfo;
}

export interface FigureGeometryApi {
  preview(p: FigureParameters, options?: RunOptions): FigurePreview;
  /** One figure STL, or the seven-figure set ZIP (`FigureSet.archive`). */
  export(p: FigureParameters, variant: 'single' | 'set', options?: ExportOptions): ExportResult;
}

// ---------------------------------------------------------------------------
// Cable clip (CableClip.swift:4-260, 452-509)
// ---------------------------------------------------------------------------

export interface CableClipNames {
  /** `%g` of the cable diameter. */
  cableText: string;
  displayName: string;
  filename: string;
}

export interface ClipParameterApi {
  readonly defaults: CableClipParameters;
  readonly ranges: {
    readonly cable: Range;
    readonly nail: Range;
    readonly head: Range;
    readonly headHeight: Range;
    readonly nailGap: Range;
    readonly plate: Range;
    readonly length: Range;
    readonly wall: Range;
    readonly overlap: Range;
  };
  normalize(p: CableClipParameters): CableClipParameters;
  readonly codec: Codec<CableClipParameters>;
  filename(p: CableClipParameters): string;
  names(p: CableClipParameters): CableClipNames;
  /** `CableClip(p)` with every derived field, `problem` and `note` (pure arithmetic, no mesh). */
  clip(p: CableClipParameters): CableClipDerived;
}

export interface ClipGeometryApi {
  preview(p: CableClipParameters, options?: RunOptions): ClipPreview;
  /** `printView.binarySTL()`. Throws `export-blocked` with the `problem` text when there is one, unless `ignoreExportProblem`. */
  export(p: CableClipParameters, options?: ExportOptions): ExportResult;
}

// ---------------------------------------------------------------------------
// Opening files (STLImport.swift, LampSettingsFile.swift)
// ---------------------------------------------------------------------------

/** The limits, for a size check on the main thread before the file goes to the worker. */
export interface StlParameterApi {
  readonly maximumBytes: number;
  readonly maximumTriangles: number;
}

export interface StlGeometryApi {
  /** `BalloonSTL.open` + the editable preview. Throws `CoreFailure('invalid-stl', STL_ERRORS.…)`. */
  open(bytes: Uint8Array, options?: RunOptions): ImportedBalloon;
}

export interface LampSettingsApi {
  /** `LampSettingsFile.decode`: width, depth and diffuserThickness required; result normalized. Throws `CoreFailure('invalid-lamp-settings', LAMP_SETTINGS_ERROR)`. */
  decode(text: string): CloudParameters;
}

// ---------------------------------------------------------------------------
// The two halves
// ---------------------------------------------------------------------------

/** Cheap and synchronous: safe on the main thread (`#core/parameters`). */
export interface CoreParameterApi {
  readonly implementation: 'stub' | 'real';
  readonly balloon: BalloonParameterApi;
  readonly basket: BasketParameterApi;
  readonly ring: RingParameterApi;
  readonly cloud: CloudParameterApi;
  readonly figure: FigureParameterApi;
  readonly clip: ClipParameterApi;
  readonly stl: StlParameterApi;
  readonly lampSettings: LampSettingsApi;
}

/** Fetches one bundled file by name: `fetch` in the worker, `readFile` in tests. */
export type AssetLoader = (file: string) => Promise<Uint8Array | ArrayBuffer>;

/** Everything; runs in the core worker (`#core`). */
export interface CoreApi extends CoreParameterApi {
  /**
   * Loads what the synchronous calls below need and cannot fetch themselves: the bundled fonts of the
   * Text pattern. Call once and await it before the first request. If it rejects, everything but the
   * Text pattern keeps working. The stub needs nothing.
   */
  prepare(loader: AssetLoader): Promise<void>;
  readonly balloon: BalloonParameterApi & BalloonGeometryApi;
  readonly basket: BasketParameterApi & BasketGeometryApi;
  readonly ring: RingParameterApi & RingGeometryApi;
  readonly cloud: CloudParameterApi & CloudGeometryApi;
  readonly figure: FigureParameterApi & FigureGeometryApi;
  readonly clip: ClipParameterApi & ClipGeometryApi;
  readonly stl: StlParameterApi & StlGeometryApi;
}
