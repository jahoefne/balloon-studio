// Core contract types (WP-U2). Mirrors the Codable parameter structs and enums of
// mac/Sources/BalloonStudio @ 03c9307 with identical JSON field names and raw values.
// Field order follows the Swift declarations; persisted and exported JSON is written
// with sorted keys (see `Codec` in api.ts), so the order here is documentation only.
//
// Optional Swift properties (`CableSide?`) are `null` here when absent. Codecs omit
// them on encode, exactly like JSONEncoder omits nil.

// ---------------------------------------------------------------------------
// Enums (raw values are persisted: never rename)
// ---------------------------------------------------------------------------

/** BalloonPatterns.swift:3-8 */
export type BalloonPattern =
  | 'Solid'
  | 'Horizontal stripes'
  | 'Hearts'
  | 'Polka dots'
  | 'Diamonds'
  | 'Text'
  | 'Night Flight'
  | 'Summit Cable Car';
export const BALLOON_PATTERNS: readonly BalloonPattern[] = [
  'Solid',
  'Horizontal stripes',
  'Hearts',
  'Polka dots',
  'Diamonds',
  'Text',
  'Night Flight',
  'Summit Cable Car',
];
/** `BalloonPattern.hasRelief`: panoramic sculpted scenes. */
export const patternHasRelief = (style: BalloonPattern): boolean =>
  style === 'Night Flight' || style === 'Summit Cable Car';

/** BalloonPatterns.swift:10-24 */
export type FilamentColor = 'Saffron' | 'Cream' | 'Rose' | 'Sage' | 'Blue' | 'Charcoal' | 'Midnight blue';
export const FILAMENT_COLORS: readonly FilamentColor[] = [
  'Saffron',
  'Cream',
  'Rose',
  'Sage',
  'Blue',
  'Charcoal',
  'Midnight blue',
];
export const FILAMENT_COLOR_HEX: Readonly<Record<FilamentColor, string>> = {
  Saffron: '#DB6E2E',
  Cream: '#F5EAD2',
  Rose: '#BA4F5C',
  Sage: '#31917D',
  Blue: '#739BCB',
  Charcoal: '#333D49',
  'Midnight blue': '#253D60',
};

/** BalloonText.swift:5-17. The Mac font names are for reference; the web build bundles replacements (plan §7). */
export type BalloonTextFont = 'Rounded' | 'Sans serif' | 'Serif' | 'Handwritten' | 'Monospaced';
export const BALLOON_TEXT_FONTS: readonly BalloonTextFont[] = ['Rounded', 'Sans serif', 'Serif', 'Handwritten', 'Monospaced'];
export const BALLOON_TEXT_FONT_MAC_POSTSCRIPT: Readonly<Record<BalloonTextFont, string>> = {
  Rounded: 'ArialRoundedMTBold',
  'Sans serif': 'Helvetica-Bold',
  Serif: 'Georgia-Bold',
  Handwritten: 'ChalkboardSE-Bold',
  Monospaced: 'Menlo-Bold',
};

/** BasketGeometry.swift:3-17 */
export type BasketStyle = 'wicker' | 'ribbed' | 'voyager';
export const BASKET_STYLES: readonly BasketStyle[] = ['wicker', 'ribbed', 'voyager'];
export const BASKET_STYLE_INFO: Readonly<Record<BasketStyle, { title: string; subtitle: string; symbol: string }>> = {
  wicker: { title: 'Wicker', subtitle: 'Rounded rectangle · woven texture', symbol: 'basket' },
  ribbed: { title: 'Ribbed', subtitle: 'Round basket · vertical fluting', symbol: 'cylinder' },
  voyager: { title: 'Voyager', subtitle: 'Faceted sides · broad bands', symbol: 'shippingbox' },
};

/** CloudGeometry.swift:3-16 */
export type CloudStyle = 'classic' | 'drift' | 'billow' | 'twin' | 'breeze' | 'cotton';
export const CLOUD_STYLES: readonly CloudStyle[] = ['classic', 'drift', 'billow', 'twin', 'breeze', 'cotton'];
export const CLOUD_STYLE_INFO: Readonly<Record<CloudStyle, { title: string; subtitle: string }>> = {
  classic: { title: 'Classic', subtitle: 'Soft & familiar' },
  drift: { title: 'Drift', subtitle: 'Low & flowing' },
  billow: { title: 'Billow', subtitle: 'Tall & pillowy' },
  twin: { title: 'Twin', subtitle: 'Two gentle peaks' },
  breeze: { title: 'Breeze', subtitle: 'Trailing in the wind' },
  cotton: { title: 'Cotton', subtitle: 'A crown of little puffs' },
};

/** SunGeometry.swift:56-90 */
export type SunStyle = 'soft-star' | 'cones' | 'pinwheel' | 'bold-eight';
export const SUN_STYLES: readonly SunStyle[] = ['soft-star', 'cones', 'pinwheel', 'bold-eight'];
export const SUN_STYLE_INFO: Readonly<
  Record<SunStyle, { title: string; subtitle: string; note: string; rayCount: number }>
> = {
  'soft-star': {
    title: 'Soft star',
    subtitle: 'Twelve plump rays that flow into the dome',
    note: 'Plump, ridged rays',
    rayCount: 12,
  },
  cones: { title: 'Cones', subtitle: 'Twelve round, tapering rays around a dome', note: 'Round, tapering rays', rayCount: 12 },
  pinwheel: {
    title: 'Pinwheel',
    subtitle: 'Twelve leaning rays that swirl into the middle',
    note: 'Leaning rays, a swirl',
    rayCount: 12,
  },
  'bold-eight': { title: 'Bold eight', subtitle: 'Eight broad rays around a button dome', note: 'Eight broad rays', rayCount: 8 },
};

/** LampSurface.swift:3-7 */
export type LampSurface = 'flat' | 'sculpted';
export const LAMP_SURFACES: readonly LampSurface[] = ['flat', 'sculpted'];
export const LAMP_SURFACE_TITLE: Readonly<Record<LampSurface, string>> = { flat: 'Flat', sculpted: '3D surface' };

/** CableSeal.swift:3-14. `CableSide.allCases` order matters (outlet logic, pickers). */
export type CableSide = 'left' | 'right' | 'top' | 'bottom';
export const CABLE_SIDES: readonly CableSide[] = ['left', 'right', 'top', 'bottom'];
export const CABLE_SIDE_TITLE: Readonly<Record<CableSide, string>> = {
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};
export const CABLE_SIDE_OPPOSITE: Readonly<Record<CableSide, CableSide>> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

/** SunGeometry.swift:5-15. Cloud and sun share `CloudParameters`; `kind` picks outline and storage key. */
export type WallLampKind = 'cloud' | 'sun';
export const WALL_LAMP_KINDS: readonly WallLampKind[] = ['cloud', 'sun'];
export const WALL_LAMP_KIND_INFO: Readonly<Record<WallLampKind, { title: string; settingsKey: string }>> = {
  cloud: { title: 'Cloud', settingsKey: 'BalloonStudio.cloud.v1' },
  sun: { title: 'Sun', settingsKey: 'BalloonStudio.sun.v1' },
};

/** FigureGeometry.swift:6-22 */
export type FigureStyle = 'balloon' | 'cloud' | 'star' | 'moon' | 'sun' | 'heart' | 'raindrop';
export const FIGURE_STYLES: readonly FigureStyle[] = ['balloon', 'cloud', 'star', 'moon', 'sun', 'heart', 'raindrop'];
export const FIGURE_STYLE_INFO: Readonly<Record<FigureStyle, { title: string; subtitle: string }>> = {
  balloon: { title: 'Balloon', subtitle: "The studio's envelope, with a basket on two ropes" },
  cloud: { title: 'Cloud', subtitle: 'The Classic cloud, small enough to hang' },
  star: { title: 'Star', subtitle: 'Five soft points' },
  moon: { title: 'Moon', subtitle: 'A crescent, leaning back' },
  sun: { title: 'Sun', subtitle: 'Eight broad rays' },
  heart: { title: 'Heart', subtitle: 'Full and round' },
  raindrop: { title: 'Raindrop', subtitle: 'Hang a few under a cloud' },
};

/** FigureGeometry.swift:24-35 */
export type FigureSurface = 'pillow' | 'puffy' | 'flat';
export const FIGURE_SURFACES: readonly FigureSurface[] = ['pillow', 'puffy', 'flat'];
export const FIGURE_SURFACE_INFO: Readonly<Record<FigureSurface, { title: string; subtitle: string }>> = {
  pillow: { title: 'Pillow', subtitle: 'A rounded edge, level in the middle' },
  puffy: { title: 'Puffy', subtitle: 'Domed all over, like a foil balloon' },
  flat: { title: 'Flat', subtitle: 'A plain slab' },
};

/** CableClip.swift:4-12 */
export type CableClipMount = 'nail' | 'adhesive';
export const CABLE_CLIP_MOUNTS: readonly CableClipMount[] = ['nail', 'adhesive'];
export const CABLE_CLIP_MOUNT_INFO: Readonly<Record<CableClipMount, { title: string; subtitle: string }>> = {
  nail: {
    title: 'Nail',
    subtitle:
      'The plate runs on past the strap and the nail goes through that extension, so the hammer meets flat plate and never the strap. The head sinks in under the cable.',
  },
  adhesive: {
    title: 'Adhesive',
    subtitle: 'No extension and no hole: the plate is as long as the strap and is stuck on with a pad of tape or mounting putty.',
  },
};

// ---------------------------------------------------------------------------
// Parameter structs (JSON field names identical to Swift CodingKeys)
// ---------------------------------------------------------------------------

/** BalloonGeometry.swift:3-20 (`BalloonStudio.parameters.v1`). `panels` is an Int. */
export interface BalloonParameters {
  height: number;
  diameter: number;
  panels: number;
  panelDepth: number;
  neckDiameter: number;
  neckHeight: number;
  shoulder: number;
  hollow: boolean;
  wallThickness: number;
  stringHoles: boolean;
  cordClearance: number;
  hangingLoop: boolean;
  hangingClearance: number;
  hangingThickness: number;
  hangingWall: number;
  hangingFillet: number;
  hangingCrownThickness: number;
}

/** BalloonPatterns.swift:26-42 (`BalloonStudio.pattern.v1`). bands/repeats/rows/textRepeats/flightCompositionVersion are Ints. */
export interface PatternSettings {
  style: BalloonPattern;
  bands: number;
  repeats: number;
  rows: number;
  size: number;
  base: FilamentColor;
  detail: FilamentColor;
  text: string;
  textFont: BalloonTextFont;
  textRepeats: number;
  textHeight: number;
  flightCompositionVersion: number;
  reliefDepth: number;
  capHeight: number;
  flightBody: FilamentColor;
  flightCap: FilamentColor;
}

/** BalloonPatterns.swift:254-259 (`BalloonStudio.purge.v1`). Synthesized Codable: every key is required. */
export interface PurgeSettings {
  layerHeight: number;
  baseToDetail: number;
  detailToBase: number;
  multiplier: number;
  density: number;
}

/** BalloonPatterns.swift:262-267 */
export interface PurgeEstimate {
  mixedLayers: number;
  minimumChanges: number;
  maximumChanges: number;
  minimumGrams: number;
  maximumGrams: number;
}

/** BasketGeometry.swift:19-26 (`BalloonStudio.basket.v1`). Synthesized Codable: every key is required. */
export interface BasketParameters {
  style: BasketStyle;
  width: number;
  depth: number;
  height: number;
  wallThickness: number;
  cordClearance: number;
  texture: number;
}

/** RingGeometry.swift:3-14 (`BalloonStudio.ring.v1`) */
export interface RingParameters {
  diameter: number;
  bandWidth: number;
  height: number;
  cordClearance: number;
  ledClearance: number;
  channelDepth: number;
  segmented: boolean;
  jointFit: number;
  reflectedLED: boolean;
  stripWidth: number;
  stripThickness: number;
}

/** CloudGeometry.swift:64-90 (`BalloonStudio.cloud.v1` / `.sun.v1`, and `cloud|sun-settings.json` in a kit). */
export interface CloudParameters {
  kind: WallLampKind;
  style: CloudStyle;
  sunStyle: SunStyle;
  mirrored: boolean;
  width: number;
  depth: number;
  diffuserThickness: number;
  surface: LampSurface;
  surfaceDepth: number;
  stripWidth: number;
  stripThickness: number;
  stripCutLength: number;
  ledRowSpacing: number;
  clipFit: number;
  cableDiameter: number;
  cableSide: CableSide;
  /** Swift `CableSide?`; omitted from JSON when null. */
  secondCableSide: CableSide | null;
  thirdCableSide: CableSide | null;
  fourthCableSide: CableSide | null;
  strainRelief: boolean;
  nailHead: number;
  nailShaft: number;
  nailInsert: boolean;
  nailDiameter: number;
  nailHeadDiameter: number;
}

/** FigureGeometry.swift:177-186 (`BalloonStudio.figure.v1`) */
export interface FigureParameters {
  style: FigureStyle;
  height: number;
  surface: FigureSurface;
  edge: number;
  dome: number;
  doubleSided: boolean;
  holeDiameter: number;
  holeMargin: number;
  chainHole: boolean;
}

/** CableClip.swift:19-38 (`BalloonStudio.cableClip.v1`) */
export interface CableClipParameters {
  cableDiameter: number;
  mount: CableClipMount;
  nailDiameter: number;
  nailHeadDiameter: number;
  nailHeadHeight: number;
  nailGap: number;
  plate: number;
  length: number;
  wall: number;
  overlap: number;
  flat: boolean;
}

/** localStorage keys, identical to the Mac UserDefaults keys (plan §2). */
export const SETTINGS_KEYS = {
  balloon: 'BalloonStudio.parameters.v1',
  pattern: 'BalloonStudio.pattern.v1',
  purge: 'BalloonStudio.purge.v1',
  basket: 'BalloonStudio.basket.v1',
  ring: 'BalloonStudio.ring.v1',
  cloud: 'BalloonStudio.cloud.v1',
  sun: 'BalloonStudio.sun.v1',
  figure: 'BalloonStudio.figure.v1',
  cableClip: 'BalloonStudio.cableClip.v1',
} as const;

// ---------------------------------------------------------------------------
// Geometry crossing the worker boundary
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
/** A closed numeric range, Swift `ClosedRange<Double>`. */
export interface Range {
  lower: number;
  upper: number;
}

/**
 * An indexed triangle mesh in the core's model frame (millimetres, Z up), as the
 * Swift `BalloonMesh` holds it. All typed arrays are transferable; the UI owns them
 * after the worker posts them. The preview de-indexes for Three.js itself (WP-U4).
 */
export interface MeshBuffers {
  /** x,y,z per vertex (Swift Doubles rounded to Float32, as the STL writer does). */
  positions: Float32Array;
  /** a,b,c per triangle, counter-clockwise seen from outside. */
  indices: Uint32Array;
  /** One color group per triangle (0 body, 1 detail, 2 accent, 3 hardware), where the Mac preview colors faces. */
  faceColors?: Uint8Array;
  maxOverhang: number;
  /** `BalloonMesh.dimensions`, computed in Double before rounding. */
  dimensions: Vec3;
}

// ---------------------------------------------------------------------------
// Preview bundles (quality: 'preview'), one per part
// ---------------------------------------------------------------------------

/** What the Balloon tab exports and previews together (BalloonStudioApp.swift:157-183). */
export interface BalloonSnapshot {
  parameters: BalloonParameters;
  pattern: PatternSettings;
  purge: PurgeSettings;
}

/** BalloonModel.rebuild (BalloonStudioApp.swift:92-112): painted mesh with face colors plus the purge estimate. */
export interface BalloonPreview {
  parameters: BalloonParameters;
  pattern: PatternSettings;
  purge: PurgeSettings;
  /** Painted mesh; `faceColors` is `PaintedBalloon.colors` (0 base, 1 detail). */
  mesh: MeshBuffers;
  estimate: PurgeEstimate;
  /**
   * Characters of the Text pattern that no bundled font can draw, each once, in text order. They leave no ink
   * (docs/plan.md, Abschnitt 7 and 13; the Mac app has no such case, CoreText falls back to a system font), so the
   * editor shows a hint. Empty for every other pattern.
   */
  missingGlyphs: string[];
}

export interface BasketPreview {
  parameters: BasketParameters;
  mesh: MeshBuffers;
}

/** RingPreviewState (RingEditor.swift:17-38). */
export interface RingPreview {
  parameters: RingParameters;
  /** Assembled ring; `faceColors` = `assemblyFaceColors` (segmented) or `ledFaces` (solid). */
  assembled: MeshBuffers;
  /** Same colors as `assembled`. Equals `assembled` for a solid ring. */
  exploded: MeshBuffers;
  /** Segmented: the four print parts A guided, B plain, C plate, D pin with `partFaceColors`. Solid: empty. */
  parts: MeshBuffers[];
}

/** The eight preview views of the cloud/sun editor (CloudEditor.swift:119-123), keyed by raw name. */
export type CloudView = 'assembled' | 'exploded' | 'back' | 'rear' | 'front' | 'seal' | 'clamp' | 'insert';
export const CLOUD_VIEWS: readonly CloudView[] = ['assembled', 'exploded', 'back', 'rear', 'front', 'seal', 'clamp', 'insert'];
export const CLOUD_VIEW_TITLE: Readonly<Record<CloudView, string>> = {
  assembled: 'Assembled',
  exploded: 'Exploded',
  back: 'Back · inside',
  rear: 'Back · wall side',
  front: 'Front · print view',
  seal: 'Cable seal · print view',
  clamp: 'Cable clamp · print view',
  insert: 'Slot insert · print view',
};

/** CloudLEDLayout.swift:5-16 */
export interface CloudLedPlan {
  sections: { x: number; y: number; length: number }[];
  totalLength: number;
  nominalWatts: number;
  rowCount: number;
}

/** The fields of `NailInsert` (NailInsert.swift:45-121) the editor reads. */
export interface NailInsertInfo {
  halfWidth: number;
  tipHalfWidth: number;
  height: number;
  slotHalfWidth: number;
  mouthHalfWidth: number;
  cheek: number;
  top: number;
  slotCenter: number;
  nailY: number;
  nearestHead: number;
  headRoom: number;
}

/** CloudKit (CloudGeometry.swift:321-466) as the cloud and sun editors read it. */
export interface CloudPreview {
  parameters: CloudParameters;
  /**
   * Meshes as CloudEditor.swift:385-416 picks them, fallbacks resolved: `clamp` is the seal
   * print view when there is no clamp, `insert` is the rear when there is no insert.
   * faceColors: assembled/exploded `assemblyColors`, back `backColors`, rear (and insert
   * fallback) `rearColors`, none elsewhere.
   */
  views: Record<CloudView, MeshBuffers>;
  ledPlan: CloudLedPlan;
  /** `kit.nailInsert`: non-null only when `nailInsert` is on and the keyhole suits it. */
  nailInsert: NailInsertInfo | null;
  /** `kit.insertMesh != nil` */
  hasInsertMesh: boolean;
  clampCount: number;
  /** `kit.cables.count` */
  cableCount: number;
  /** `kit.cables.filter { $0.clamp == nil }`, sides in outlet order. */
  cablesWithoutClamp: CableSide[];
  printedParts: number;
  /** `ASSEMBLY.md` / the guide sheet text. */
  instructions: string;
}

/** FigureBody (FigureGeometry.swift:245-300) as FigureEditor.swift reads it. */
export interface FigurePreview {
  parameters: FigureParameters;
  /** Print view: lying on its back. */
  printMesh: MeshBuffers;
  /** `hangingView()`: upright with its thread; faceColors from the Swift colors. */
  hangingMesh: MeshBuffers;
  width: number;
  hangingHole: Vec2 | null;
  chainHole: Vec2 | null;
  holesWanted: number;
  holes: number;
}

/** CableClip (CableClip.swift:94-260): every derived field the editor reads, plus the rest. */
export interface CableClipDerived {
  radius: number;
  inner: number;
  outer: number;
  plateThickness: number;
  halfWidth: number;
  center: number;
  tipAngle: number;
  edgeX: number;
  bore: number;
  counterbore: number;
  counterboreDepth: number;
  flareEnd: number;
  /** nil for adhesive */
  nailY: number | null;
  plateEnd: number;
  fillet: number;
  problem: string | null;
  overlap: number;
  note: string | null;
  length: number;
  width: number;
  height: number;
  tip: { x: number; z: number };
  tipBottom: number;
  opening: number;
  padArea: number;
  insertion: number;
  snapStrain: number;
  /** CableClipKit.fitsP2S */
  fitsP2S: boolean;
}

/** CableClipKit (CableClip.swift:452-509) as CableClipEditor.swift reads it. */
export interface ClipPreview {
  parameters: CableClipParameters;
  /** `kit.printView` */
  printMesh: MeshBuffers;
  /** `kit.assembly()`: clip 0, cable 2, nail 3. */
  assemblyMesh: MeshBuffers;
  clip: CableClipDerived;
}

// ---------------------------------------------------------------------------
// Import and export
// ---------------------------------------------------------------------------

/** ImportedBalloon (STLImport.swift:11-16) plus the editable preview STLImportView.swift:53 generates. */
export interface ImportedBalloon {
  /** The file's geometry, centered. */
  mesh: MeshBuffers;
  /** Normalized. */
  parameters: BalloonParameters;
  restoredSettings: boolean;
  notes: string;
  /** `BalloonGenerator.generate(parameters)` at preview quality. */
  editable: MeshBuffers;
}

export interface ExportFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * A finished export. `files` holds what the browser saves: today exactly one entry,
 * the STL, 3MF or kit ZIP, with `name === filename`.
 */
export interface ExportResult {
  filename: string;
  mime: 'model/stl' | 'model/3mf' | 'application/zip';
  files: ExportFile[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CoreErrorCode =
  /** MeshError.invalid: "The model could not be exported: <reason>" (BalloonGeometry.swift:119-124). */
  | 'invalid-mesh'
  /** A stored settings JSON did not decode (JSONDecoder failure; the Mac falls back to defaults silently). */
  | 'invalid-settings'
  /** LampSettingsFile.ReadError.invalidSettings (LampSettingsFile.swift:4-10). */
  | 'invalid-lamp-settings'
  /** STLImportError.invalid (STLImport.swift:4-9). */
  | 'invalid-stl'
  /** The editor would have disabled export, e.g. a cable clip with a `problem`. */
  | 'export-blocked'
  | 'internal';

/** Structured-cloneable error crossing the worker boundary. `message` is the exact Mac string. */
export interface CoreError {
  code: CoreErrorCode;
  message: string;
}
