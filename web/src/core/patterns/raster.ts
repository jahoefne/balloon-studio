// Seam between the pattern mesh code (WP-K3) and the deterministic rasterizer (WP-R3/R4/R5):
// docs/plan.md, Abschnitt 5 (WP-K3) and 7 (WP-R0). K3 consumes these types, R implements them, and
// K3's fixture adapter fills them from the Swift dumps; neither side imports the other.
//
// Swift counterparts:
// - BalloonText.swift:5-17      BalloonTextFont (raw values persisted in pattern settings)
// - BalloonText.swift:20-66     BalloonTextMask {width, height, aspect, pixels} (sums stay on the K3 side)
// - NightFlight.swift:8, :239   NightFlightArtwork.draw(width:height:diameter:columns:rows:) -> [Float]
// - SummitCableCar.swift:14,:468 SummitCableCarArtwork.draw(…, radius:) -> [Float]
// - NightFlight.swift:243-300   NightFlightRelief.init picks the artwork by style and reads the mesh
// - BalloonGeometry.swift:99-131 Point3, Triangle, BalloonMesh (structural copies, no core/geometry import)
//
// Row convention for every raster here: storage row 0 is the bottom of the artwork or glyphs (the Swift
// contexts flip with translateBy(0, rows) + scaleBy(1, -1); the TS canvas writes device rows directly).

/** BalloonTextFont raw values, in CaseIterable order. */
export type BalloonTextFont = 'Rounded' | 'Sans serif' | 'Serif' | 'Handwritten' | 'Monospaced';
export const BALLOON_TEXT_FONTS: readonly BalloonTextFont[] = ['Rounded', 'Sans serif', 'Serif', 'Handwritten', 'Monospaced'];

/**
 * Relief artwork before the blur: `columns × rows` gray levels in 0…1 (`Float(byte)/255`), row 0 at the
 * bottom. This is what K3's NightFlightRelief port smooths and integrates.
 */
export interface ReliefField {
  readonly columns: number;
  readonly rows: number;
  readonly pixels: Float32Array;
}

/**
 * BalloonTextMask: AA-off fill (CoreGraphics `setShouldAntialias(false)`, gray 1), so pixels are 0 or 255;
 * consumers test `> 0` like `contains`. `width ≤ 8192`, `height ≤ 256`; aspect = pathBounds width/height.
 * Row 0 at the glyph bottom.
 */
export interface TextMask {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly pixels: Uint8Array;
}

/**
 * NightFlightArtwork.draw / SummitCableCarArtwork.draw: the artwork for a `width × height` mm panorama
 * rendered at `columns × rows` pixels, returned as `columns·rows` values `Float(byte)/255`, row 0 at the
 * bottom. `radius(y)` is the crest radius y mm above the artwork bottom (Summit uses it, Night Flight
 * ignores it).
 */
export type ReliefArtwork = (
  width: number,
  height: number,
  diameter: number,
  columns: number,
  rows: number,
  radius: (y: number) => number,
) => Float32Array;

/** BalloonTextMask.init(text:font:): nil for blank text or a mask without ink. */
export type TextRasterizer = (text: string, font: BalloonTextFont) => TextMask | null;

/** The two relief artworks, keyed like the Swift PatternStyle cases that have a relief. */
export interface ReliefArtworks {
  readonly nightFlight: ReliefArtwork;
  readonly summitCableCar: ReliefArtwork;
}

/** What PaintedBalloon.make receives instead of calling CoreGraphics/CoreText. */
export interface PatternRasterizers {
  readonly artworks: ReliefArtworks;
  readonly textRasterizer: TextRasterizer;
}

/** Point3, structurally. */
export interface MeshPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Triangle (vertex indices), structurally. */
export interface MeshTriangle {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

/** Swift `Range<Int>`: half-open, lowerBound ≤ i < upperBound. */
export interface IndexRange {
  readonly lowerBound: number;
  readonly upperBound: number;
}

/** The part of BalloonMesh the relief reads; K1's mesh type is assignable to it. */
export interface ReliefMeshInput {
  readonly vertices: readonly MeshPoint[];
  readonly triangles: readonly MeshTriangle[];
  readonly maxOverhang: number;
  readonly innerVertexRange?: IndexRange | null | undefined;
}

/**
 * `bytes.map {Float($0)/255}` (NightFlight.swift:239, SummitCableCar.swift:468). Dividing in double and
 * storing as Float32 gives the correctly rounded Float32 quotient (53 ≥ 2·24 + 2 bits), i.e. Swift's
 * Float division.
 */
export function fieldFromBytes(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] as number) / 255;
  return out;
}
