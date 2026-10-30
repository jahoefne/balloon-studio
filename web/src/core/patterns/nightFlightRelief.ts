// Ported from mac/Sources/BalloonStudio/NightFlight.swift @ 04553ee (lines 251-419: NightFlightRelief).
// The artworks (:8-240, SummitCableCar.swift) live behind the ReliefArtwork seam (patterns/raster.ts,
// WP-R4, WP-R5); this file only reads the finished raster.
//
// Swift's `Float` arithmetic is emulated: `pixels` is a Float32Array and every Float operation goes
// through Math.fround, comparisons run against fround(0.005) and fround(0.025). Double arithmetic on two
// Float32 values and rounding once more is the correctly rounded Float32 result for + - × ÷ (53 ≥ 2·24 + 2).
import type { BalloonMesh } from '../geometry/mesh';
import type { Point3 } from '../geometry/point3';
import { atan2, cos, hypot, PI, sin } from '../swift/dmath';
import { swiftMax, swiftMax3, swiftMin, swiftMin3 } from '../swift/minmax';
import { intCeil, intFloor, intTrunc, rounded } from '../swift/rounding';
import { sortedDoubles } from '../swift/sort';
import type { BalloonParameters, PatternSettings } from '../types';
import { capBoundary, normalized } from './balloonPatterns';
import type { PatternRasterizers, ReliefMeshInput } from './raster';
import { highest, lowest } from './textLayout';

const FLOAT_0_005 = Math.fround(0.005);
const FLOAT_0_025 = Math.fround(0.025);

/** The nested `smooth` of NightFlightRelief.init, :303-318. */
export function smooth(input: Float32Array, horizontal: boolean, columns: number, rows: number, width: number, height: number): Float32Array {
  const fround = Math.fround;
  const output = new Float32Array(input.length);
  const count = horizontal ? columns : rows;
  const lines = horizontal ? rows : columns;
  const radius = swiftMax(1, intTrunc(rounded((0.25 * count) / (horizontal ? width : height))));
  const divisor = fround(2 * radius + 1);
  for (let line = 0; line < lines; line++) {
    const base = line * columns;
    let sum = 0;
    if (horizontal) {
      for (let offset = -radius; offset <= radius; offset++) sum = fround(sum + (input[base + (offset + count) % count] as number));
      for (let offset = 0; offset < count; offset++) {
        output[base + (offset + count) % count] = swiftMax(0, fround(sum / divisor));
        sum = fround(sum - (input[base + (offset - radius + count) % count] as number));
        sum = fround(sum + (input[base + (offset + radius + 1 + count) % count] as number));
      }
    } else {
      for (let offset = 0; offset <= radius; offset++) sum = fround(sum + (input[offset * columns + line] as number));
      for (let offset = 0; offset < count; offset++) {
        output[offset * columns + line] = swiftMax(0, fround(sum / divisor));
        if (offset - radius >= 0) sum = fround(sum - (input[(offset - radius) * columns + line] as number));
        if (offset + radius + 1 < count) sum = fround(sum + (input[(offset + radius + 1) * columns + line] as number));
      }
    }
  }
  return output;
}

/**
 * Swift `struct NightFlightRelief`. SWIFT-DIFF: `pixels`, `coverage`, `boundaries` and `crest` are private in
 * Swift; they are public here for the comparison with the reference dumps. Read them only.
 */
export class NightFlightRelief {
  readonly width: number;
  readonly height: number;
  readonly bottom: number;
  readonly depth: number;
  readonly columns: number;
  readonly rows: number;
  readonly pixels: Float32Array;
  readonly coverage: Int32Array;
  readonly boundaries: Int32Array;
  readonly crest: Float64Array;
  static readonly origin: number = -PI / 3;
  get resolution(): number {
    return 0.28;
  }

  constructor(input: PatternSettings, p: BalloonParameters, mesh: ReliefMeshInput, rasterizers: Pick<PatternRasterizers, 'artworks'>) {
    const settings = normalized(input, p);
    this.depth = settings.reliefDepth;
    const width = PI * p.diameter * 0.94;
    const free = p.height - p.neckHeight;
    const bottom = p.neckHeight + free * 0.09;
    const height = capBoundary(settings, p) - swiftMax(2, p.height * 0.012) - bottom;
    const columns = swiftMin(3072, swiftMax(1024, intCeil(width / 0.2)));
    const rows = swiftMin(1200, swiftMax(256, intCeil(height / 0.18)));
    this.width = width;
    this.height = height;
    this.bottom = bottom;
    this.columns = columns;
    this.rows = rows;
    // Lift each motif above the panel crests, filling grooves under the object only.
    // Original ring maxima define the same meridian as the source mesh, independently
    // of relief refinement. Inner walls and mechanical attachments stay untouched.
    const rings = new Map<number, number>();
    const inner = mesh.innerVertexRange;
    const vertices = mesh.vertices;
    for (let i = 0; i < vertices.length; i++) {
      if (inner !== undefined && inner !== null && i >= inner.lowerBound && i < inner.upperBound) continue;
      const v = vertices[i] as Point3;
      if (!(v.z <= p.height)) continue;
      rings.set(v.z, swiftMax(rings.get(v.z) ?? 0, hypot(v.x, v.y)));
    }
    const profileKeys = sortedDoubles(Array.from(rings.keys()));
    const profileValues = profileKeys.map((key) => rings.get(key) as number);
    const radii = new Float64Array(rows);
    let j = 0;
    for (let y = 0; y < rows; y++) {
      const z = bottom + (y / (rows - 1)) * height;
      while (j + 1 < profileKeys.length - 1 && (profileKeys[j + 1] as number) < z) j += 1;
      const aKey = profileKeys[j] as number;
      const aValue = profileValues[j] as number;
      const bKey = profileKeys[j + 1] as number;
      const bValue = profileValues[j + 1] as number;
      const f = (z - aKey) / (bKey - aKey);
      radii[y] = aValue + (bValue - aValue) * f;
    }
    this.crest = radii;
    // The cable car lays its motifs out in millimetres per meridian and needs the crest
    // radius at each height to keep their proportions where the envelope narrows.
    const crestRadius = (y: number): number => {
      const f = swiftMax(0, swiftMin(rows - 1, (y / height) * (rows - 1)));
      const i = swiftMin(rows - 2, intTrunc(f));
      const t = f - i;
      return (radii[i] as number) * (1 - t) + (radii[i + 1] as number) * t;
    };
    const artwork = settings.style === 'Summit Cable Car' ? rasterizers.artworks.summitCableCar : rasterizers.artworks.nightFlight;
    const drawn = artwork(width, height, p.diameter, columns, rows, crestRadius);
    // A fixed 0.25 mm bevel preserves small details even at deeper relief settings.
    // Horizontal filtering wraps with the artwork instead of fading at the seam.
    // Unlike the old broad blur, it leaves flat tops and sharp silhouette transitions.
    const field = smooth(smooth(drawn, true, columns, rows, width, height), false, columns, rows, width, height);
    this.pixels = field;
    const sums = new Int32Array((columns + 1) * (rows + 1));
    const edges = new Int32Array((columns + 1) * (rows + 1));
    const stride = columns + 1;
    for (let y = 0; y < rows; y++) {
      let sum = 0;
      let edge = 0;
      const above = swiftMin(rows - 1, y + 1) * columns;
      for (let x = 0; x < columns; x++) {
        const i = y * columns + x;
        const v = field[i] as number;
        sum += v > FLOAT_0_005 ? 1 : 0;
        const dx = Math.abs(Math.fround(v - (field[y * columns + (x + 1) % columns] as number)));
        const dy = Math.abs(Math.fround(v - (field[above + x] as number)));
        edge += swiftMax(dx, dy) > FLOAT_0_025 ? 1 : 0;
        sums[(y + 1) * stride + x + 1] = (sums[y * stride + x + 1] as number) + sum;
        edges[(y + 1) * stride + x + 1] = (edges[y * stride + x + 1] as number) + edge;
      }
    }
    this.coverage = sums;
    this.boundaries = edges;
  }

  artworkHeight(point: Point3): number {
    const angle = atan2(point.y, point.x) - NightFlightRelief.origin;
    const x = (angle / (2 * PI) + 0.5) % 1;
    return this.sample(x < 0 ? x + 1 : x, (point.z - this.bottom) / this.height) * this.depth;
  }

  private sample(x: number, y: number): number {
    if (!(y >= 0 && y < 1)) return 0;
    const fround = Math.fround;
    const { columns, rows, pixels } = this;
    // Raster samples sit at pixel centers. Interpolate periodically across the
    // cylindrical seam; clamping here would split the plane on the opposite side.
    const px = x * columns - 0.5;
    const py = y * (rows - 1);
    const ix = intFloor(px);
    const x0 = (ix + columns) % columns;
    const y0 = intTrunc(py);
    const x1 = (x0 + 1) % columns;
    const y1 = swiftMin(rows - 1, y0 + 1);
    const u = fround(px - ix);
    const v = fround(py - y0);
    const notU = fround(1 - u);
    const notV = fround(1 - v);
    const low = fround(fround((pixels[y0 * columns + x0] as number) * notU) + fround((pixels[y0 * columns + x1] as number) * u));
    const high = fround(fround((pixels[y1 * columns + x0] as number) * notU) + fround((pixels[y1 * columns + x1] as number) * u));
    return fround(fround(low * notV) + fround(high * v));
  }

  displacement(point: Point3): number {
    const amount = this.artworkHeight(point);
    if (!(amount > 0.005)) return 0;
    const { rows, height, crest, depth } = this;
    const y = swiftMax(0, swiftMin(rows - 1, ((point.z - this.bottom) / height) * (rows - 1)));
    const i = swiftMin(rows - 2, intTrunc(y));
    const f = y - i;
    const radius = (crest[i] as number) * (1 - f) + (crest[i + 1] as number) * f;
    const edge = swiftMin(1, amount / (depth * 0.35));
    return amount + swiftMax(0, radius - hypot(point.x, point.y)) * edge;
  }

  needsRefinement(a: Point3, b: Point3, c: Point3, normal: Point3): boolean {
    const third = 1.0 / 3;
    const centerX = (a.x + b.x + c.x) * third;
    const centerY = (a.y + b.y + c.y) * third;
    const { bottom, height, width } = this;
    if (!(normal.x * centerX + normal.y * centerY > 0 && swiftMax3(a.z, b.z, c.z) >= bottom && swiftMin3(a.z, b.z, c.z) <= bottom + height)) return false;
    const first = atan2(a.y, a.x);
    const unwrap = (p: Point3): number => {
      const delta = atan2(p.y, p.x) - first;
      return first + atan2(sin(delta), cos(delta));
    };
    const angleB = unwrap(b);
    const angleC = unwrap(c);
    const middle = (0 + first + angleB + angleC) / 3;
    const origin = NightFlightRelief.origin;
    const shift = Math.floor((middle - origin) / (2 * PI) + 0.5);
    const xA = (first - origin) / (2 * PI) + 0.5 - shift;
    const xB = (angleB - origin) / (2 * PI) + 0.5 - shift;
    const xC = (angleC - origin) / (2 * PI) + 0.5 - shift;
    const yA = (a.z - bottom) / height;
    const yB = (b.z - bottom) / height;
    const yC = (c.z - bottom) / height;
    const loX = lowest(xA, xB, xC);
    const hiX = highest(xA, xB, xC);
    const loY = lowest(yA, yB, yC);
    const hiY = highest(yA, yB, yC);
    const span = swiftMax((hiX - loX) * width, (hiY - loY) * height);
    if (!(span > this.resolution && hiY >= 0 && loY <= 1)) return false;
    const table = span > 1.0 ? this.coverage : this.boundaries;
    if (this.occupied(table, loX, hiX, loY, hiY)) return true;
    if (loX < 0 && this.occupied(table, loX + 1, 1, loY, hiY)) return true;
    return hiX > 1 && this.occupied(table, 0, hiX - 1, loY, hiY);
  }

  private occupied(table: Int32Array, low: number, high: number, loY: number, hiY: number): boolean {
    const { columns, rows } = this;
    const x0 = swiftMax(0, swiftMin(columns, intFloor(swiftMax(0, low) * columns) - 2));
    const x1 = swiftMax(0, swiftMin(columns, intCeil(swiftMin(1, high) * columns) + 3));
    const y0 = swiftMax(0, swiftMin(rows, intFloor(swiftMax(0, loY) * rows) - 2));
    const y1 = swiftMax(0, swiftMin(rows, intCeil(swiftMin(1, hiY) * rows) + 3));
    if (!(x1 > x0 && y1 > y0)) return false;
    const stride = columns + 1;
    return (table[y1 * stride + x1] as number) - (table[y0 * stride + x1] as number) - (table[y1 * stride + x0] as number) + (table[y0 * stride + x0] as number) > 0;
  }

  edgeNeedsRefinement(a: Point3, b: Point3): boolean {
    const angle = atan2(a.y, a.x) - atan2(b.y, b.x);
    return swiftMax((Math.abs(atan2(sin(angle), cos(angle))) * this.width) / (2 * PI), Math.abs(a.z - b.z)) > this.resolution;
  }

  apply(mesh: BalloonMesh): void {
    const { bottom, height } = this;
    const vertices = mesh.vertices;
    const triangles = mesh.triangles;
    const third = 1.0 / 3;
    const exterior = new Uint8Array(vertices.length);
    for (let f = 0; f < triangles.length; f++) {
      const t = triangles[f]!;
      const a = vertices[t.a]!;
      const b = vertices[t.b]!;
      const c = vertices[t.c]!;
      const centerX = (a.x + b.x + c.x) * third;
      const centerY = (a.y + b.y + c.y) * third;
      const centerZ = (a.z + b.z + c.z) * third;
      const abX = b.x - a.x;
      const abY = b.y - a.y;
      const abZ = b.z - a.z;
      const acX = c.x - a.x;
      const acY = c.y - a.y;
      const acZ = c.z - a.z;
      const normalX = abY * acZ - abZ * acY;
      const normalY = abZ * acX - abX * acZ;
      if (centerZ >= bottom && centerZ <= bottom + height && normalX * centerX + normalY * centerY > 0) {
        exterior[t.a] = 1;
        exterior[t.b] = 1;
        exterior[t.c] = 1;
      }
    }
    for (let i = 0; i < vertices.length; i++) {
      if (exterior[i] === 0) continue;
      const p = vertices[i]!;
      const r = hypot(p.x, p.y);
      const amount = this.displacement(p);
      if (!(r > 0 && amount > 0)) continue;
      vertices[i] = { x: p.x * (1 + amount / r), y: p.y * (1 + amount / r), z: p.z };
    }
    for (let f = 0; f < triangles.length; f++) {
      const t = triangles[f]!;
      if (exterior[t.a] === 0 && exterior[t.b] === 0 && exterior[t.c] === 0) continue;
      const a = vertices[t.a]!;
      const b = vertices[t.b]!;
      const c = vertices[t.c]!;
      const abX = b.x - a.x;
      const abY = b.y - a.y;
      const abZ = b.z - a.z;
      const acX = c.x - a.x;
      const acY = c.y - a.y;
      const acZ = c.z - a.z;
      const nX = abY * acZ - abZ * acY;
      const nY = abZ * acX - abX * acZ;
      const nZ = abX * acY - abY * acX;
      const centerX = (a.x + b.x + c.x) * third;
      const centerY = (a.y + b.y + c.y) * third;
      if (nX * centerX + nY * centerY > 0) {
        mesh.maxOverhang = swiftMax(mesh.maxOverhang, (atan2(-nZ, hypot(nX, nY)) * 180) / PI);
      }
    }
  }
}
