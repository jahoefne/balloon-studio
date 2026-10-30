// Ported from mac/Sources/BalloonStudio/SegmentedRing.swift @ 04553ee
// (SegmentedRingKit :4-226, RingArc :228-353).
//
// SWIFT-DIFF: `precondition`, force unwraps and out-of-range subscripts trap in Swift; here they throw.
import { BalloonMesh, MeshError } from '../geometry/mesh';
import { zero, type Point3, type Triangle } from '../geometry/point3';
import { binarySTL } from '../io/binaryStl';
import { storedZipArchive, type ZipEntry } from '../io/storedZip';
import type { RingParameters } from '../types';
import { atan, cos, hypot, PI, sin } from '../swift/dmath';
import { formatFixed } from '../swift/format';
import { encodeJSONPretty17g, parseJSONSerialization, SwiftInt, type JSONObject } from '../swift/json';
import { arrayMax, arrayMin } from '../swift/minmax';
import { intCeil, intRounded, intTrunc } from '../swift/rounding';
import { sortDoubles } from '../swift/sort';
import { utf8 } from '../swift/text';
import {
  channelWidth,
  encodeRingParameters,
  flangeOuterRadius,
  holeRadius,
  innerRadius,
  ledFaces,
  normalized,
  outerProfile,
  patchLoop,
  stripPathLength,
  StringHoles,
  totalHeight,
  type RingQuality,
} from './ringGeometry';

export interface RingPrintPart {
  name: string;
  quantity: number;
  mesh: BalloonMesh;
}

const mm = (value: number): string => formatFixed(value, 1);

/** Individual solids are exported; the combined meshes are assembly previews only. */
export class SegmentedRingKit {
  readonly parameters: RingParameters;
  readonly guided: BalloonMesh;
  readonly plain: BalloonMesh;
  readonly plate: BalloonMesh;
  readonly pin: BalloonMesh;
  static readonly plateThickness = 4.0;
  static readonly plateLength = 60.0;
  static readonly pinWidth = 4.0;
  static readonly pinOffset = 14.0;
  get pinAngle(): number {
    return SegmentedRingKit.pinOffset / holeRadius(this.parameters);
  }
  get pinLength(): number {
    return this.parameters.height + SegmentedRingKit.plateThickness - 0.4;
  }

  constructor(input: RingParameters, quality: RingQuality = 'preview') {
    const value = { ...input, segmented: true };
    const p = normalized(value);
    this.parameters = p;
    const angle = PI / 6;
    const pinAngle = SegmentedRingKit.pinOffset / holeRadius(p);
    const pinHoles: Hole[] = [-angle + pinAngle, angle - pinAngle].map((a) => ({
      angle: a,
      clearance: SegmentedRingKit.pinWidth + p.jointFit,
      bevel: 0.4,
    }));
    this.guided = RingArc.generate(p, angle, [...pinHoles, { angle: 0, clearance: p.cordClearance, bevel: 0.8 }], false, quality);
    this.plain = RingArc.generate(p, angle, pinHoles, false, quality);
    this.plate = RingArc.generate(
      p,
      SegmentedRingKit.plateLength / (2 * holeRadius(p)),
      [-pinAngle, pinAngle].map((a) => ({ angle: a, clearance: SegmentedRingKit.pinWidth + p.jointFit, bevel: 0.4 })),
      true,
      quality,
    );
    this.pin = RingArc.pin(SegmentedRingKit.pinWidth, p.height + SegmentedRingKit.plateThickness - 0.4);
  }

  get printParts(): RingPrintPart[] {
    return [
      { name: 'A-cord-guide-print-3.stl', quantity: 3, mesh: SegmentedRingKit.onBed(this.guided, PI / 4) },
      { name: 'B-plain-section-print-3.stl', quantity: 3, mesh: SegmentedRingKit.onBed(this.plain, PI / 4) },
      { name: 'C-underside-plate-print-6.stl', quantity: 6, mesh: SegmentedRingKit.onBed(this.plate, PI / 2) },
      { name: 'D-alignment-pin-print-12.stl', quantity: 12, mesh: this.pin },
    ];
  }

  static transform(mesh: BalloonMesh, rotation = 0, offset: Point3 = zero()): BalloonMesh {
    const c = cos(rotation);
    const s = sin(rotation);
    // The triangles are shared, not copied: every use replaces them rather than mutating them.
    return new BalloonMesh(
      mesh.vertices.map((v) => ({ x: v.x * c - v.y * s + offset.x, y: v.x * s + v.y * c + offset.y, z: v.z + offset.z })),
      mesh.triangles,
      mesh.maxOverhang,
      mesh.innerVertexRange,
    );
  }
  static onBed(mesh: BalloonMesh, rotation: number): BalloonMesh {
    const rotated = SegmentedRingKit.transform(mesh, rotation);
    const xs = rotated.vertices.map((v) => v.x);
    const ys = rotated.vertices.map((v) => v.y);
    const zs = rotated.vertices.map((v) => v.z);
    return SegmentedRingKit.transform(rotated, 0, {
      x: -((arrayMin(xs) as number) + (arrayMax(xs) as number)) / 2,
      y: -((arrayMin(ys) as number) + (arrayMax(ys) as number)) / 2,
      z: -(arrayMin(zs) as number),
    });
  }
  assembly(exploded = false): BalloonMesh {
    const output = new BalloonMesh([], [], 0);
    const add = (mesh: BalloonMesh): void => {
      const start = output.vertices.length;
      for (const v of mesh.vertices) output.vertices.push(v);
      for (const t of mesh.triangles) output.triangles.push({ a: t.a + start, b: t.b + start, c: t.c + start });
    };
    for (let i = 0; i < 6; i++) {
      const angle = (i * PI) / 3;
      const seam = angle + PI / 6;
      const spread = exploded ? 10.0 : 0;
      add(
        SegmentedRingKit.transform(i % 2 === 0 ? this.guided : this.plain, angle, {
          x: spread * cos(angle),
          y: spread * sin(angle),
          z: SegmentedRingKit.plateThickness + (exploded ? 12 : 0),
        }),
      );
      add(SegmentedRingKit.transform(this.plate, seam));
      for (const theta of [seam - this.pinAngle, seam + this.pinAngle]) {
        add(
          SegmentedRingKit.transform(this.pin, theta, {
            x: holeRadius(this.parameters) * cos(theta),
            y: holeRadius(this.parameters) * sin(theta),
            z: 0.2,
          }),
        );
      }
    }
    return output;
  }
  entries(): ZipEntry[] {
    const entries: ZipEntry[] = [];
    const parts: JSONObject[] = [];
    for (const part of this.printParts) {
      const d = part.mesh.dimensions;
      if (!(d.x + 16 <= 256.001 && d.y + 16 <= 256.001 && d.z <= 256)) throw new MeshError('a ring part does not fit the P2S with an 8 mm brim');
      entries.push([part.name, binarySTL(part.mesh)]);
      parts.push({ file: part.name, quantity: new SwiftInt(part.quantity), dimensions_mm: [d.x, d.y, d.z] });
    }
    const settings = parseJSONSerialization(encodeRingParameters(this.parameters));
    const manifest: JSONObject = {
      format_version: new SwiftInt(2),
      units: 'millimetres',
      parameters: settings,
      parts,
      led_mount: this.parameters.reflectedLED ? 'vertical_outer_wall_with_white_45_degree_reflector' : 'flat_top_channel',
      load_rated: false,
      rigging: 'Three continuous main cords from rated ceiling hardware to the balloons; ring holes guide the cords.',
    };
    entries.push(['kit-manifest.json', utf8(encodeJSONPretty17g(manifest))]);
    entries.push(['ASSEMBLY.md', utf8(this.instructions)]);
    return entries;
  }
  archive(): Uint8Array {
    return storedZipArchive(this.entries());
  }

  /** Triangle order is preserved by print orientation and assembly transforms. */
  ledFaces(mesh: BalloonMesh): number[] {
    return ledFaces(this.parameters, mesh);
  }
  get partFaceColors(): number[][] {
    return [
      this.ledFaces(this.guided),
      this.ledFaces(this.plain),
      new Array<number>(this.plate.triangles.length).fill(0),
      new Array<number>(this.pin.triangles.length).fill(0),
    ];
  }
  get assemblyFaceColors(): number[] {
    const colors = this.partFaceColors;
    const output: number[] = [];
    for (let i = 0; i < 6; i++) {
      for (const list of [colors[i % 2], colors[2], colors[3], colors[3]] as number[][]) {
        for (const color of list) output.push(color);
      }
    }
    return output;
  }

  get instructions(): string {
    const p = this.parameters;
    return `# ${intTrunc(p.diameter)} mm mobile ring — six-section PLA prototype

All STL dimensions are in millimetres. Import at 100%; do not scale the parts.
The assembled ring is larger than the print bed. Each exported part is already
centred, rotated to fit a 256 × 256 mm bed, and placed at Z = 0.

## Print quantities
- A-cord-guide-print-3.stl: 3 copies, each with one large central cord guide.
- B-plain-section-print-3.stl: 3 copies, with only the two small alignment holes.
- C-underside-plate-print-6.stl: 6 copies, one beneath every seam.
- D-alignment-pin-print-12.stl: 12 copies, two for each plate.
There are four unique STL files and 24 physical printed pieces.

Ring band: ${mm(p.bandWidth)} mm wide × ${mm(p.height)} mm base thickness.
Full section height including the light mount: ${mm(totalHeight(p))} mm.
Plates: 60 mm arc length at the pin radius × ${mm(p.bandWidth - 2)} mm wide × 4 mm thick.
Each plate overlaps about 30 mm either side of a seam.
Assembled height at plates: ${mm(totalHeight(p) + 4)} mm.
Guide throat clearance: ${mm(p.cordClearance)} mm, with 0.8 mm bevels at both openings.
Alignment pins: 4 mm across flats × ${mm(this.pinLength)} mm long; hole fit allowance
is ${mm(p.jointFit)} mm total across flats. Pins align the glue-up; they are not locking fasteners.

## Print and fit
Print A and B flat, LED channel up; C flat; D upright on its small flat end.
No modeled overhang requires support. Inspect the sliced result before printing.
A starting PLA prototype profile is 0.2 mm layers, 6 walls, 6 top/bottom layers,
and 40% infill for A/B. Make C/D solid using a slicer modifier or 100% infill.
These settings are a starting point, not a strength rating.
Print one C plate and one D pin first to check fit. Adjust Joint fit in the app
if needed and re-export the entire matching kit. Never force a tight pin into PLA.

## Permanent assembly
1. Dry-fit A–B–A–B–A–B around the circle with all LED channels up. The three
   large cord guides will be 120° apart. Small end holes are for alignment pins only.
2. Centre a C plate below each seam. Its two holes align with one small hole
   in each neighbouring section. Insert two D pins; they should sit about
   0.2 mm below the outer faces when centred through the plate and ring.
3. Bond the broad plate-to-ring surfaces, seam faces and alignment pins with
   an adhesive explicitly compatible with your PLA. Follow the adhesive
   manufacturer's surface preparation, bond-gap, clamping and full-cure directions.
   Keep glue out of the three large cord guides and the LED channel.
4. Hold the assembly flat and circular while curing. Check every seam and
   channel transition. The pins are for registration, not proof of joint strength.

## Continuous-cord suspension — read before loading
Intended arrangement: three balloons estimated at 1 kg each, plus ring and LEDs.
This is NOT a tested or rated 3 kg assembly.
Run three separate, continuous main cords from suitable rated ceiling hardware,
through the three LARGE guides in the A sections, down to the respective balloons.
Each main cord must stay unbroken through the guide; do not terminate it on the
printed ring and start a separate balloon cord underneath. Use a stopper/retainer
below each guide to locate and support the ring's own weight on the main cords.
Follow the cord maker's guidance for terminations, knots and working loads.
Keep the three upper legs reasonably steep and balanced: shallow legs increase
tension and inward guide forces. Allow for ring/LED weight and unequal loading.
The ring still carries its own weight and lateral guide forces, despite the
direct cord connection to the balloons. Keep every cord clear of LED components.
Use proven attachments on each balloon and basket; existing printed eyelets in
Balloon Studio have NOT been validated for a 1 kg balloon assembly.

Test the actual printed, bonded and fully rigged assembly at low height over a
clear area before overhead use. Check joints, cord wear, deformation and LED
operating temperature under sustained load. Mesh checks only verify geometry;
they do not establish strength or lifetime. PLA can creep under sustained load.

## LED strip
${this.ledInstructions}

kit-manifest.json records the exact settings and quantities. Settings are saved
in the app; the balloon STL importer cannot reopen ring parts or this ZIP.`;
  }

  private get ledInstructions(): string {
    const p = this.parameters;
    const common = `Install after gluing and full cure. Smooth the mounting face across every seam.
Green in the preview marks the mounting surface, not a supplied LED component.
Approximate mounting path: ${intRounded(stripPathLength(p))} mm; final strip length
must follow its marked cut points. Leave an end gap rather than overlapping or
folding the tape. Route the lead over the outer rim, secure it against pulling,
and keep all wiring and joints clear of the suspension cords.
Check the strip maker's bending, adhesive and cooling requirements. PLA is not
a heat sink. Test operating temperature with the actual strip and adhesive.`;
    if (!p.reflectedLED) {
      return `Flat channel: ${mm(channelWidth(p))} mm wide × ${mm(p.channelDepth)} mm deep for
a ${mm(p.stripWidth)} mm strip. A normal strip cannot follow this curve sideways:
use a strip explicitly made for that bend direction, or wired straight pieces.
${common}`;
    }
    return `CONTINUOUS STRIP / REFLECTED UPLIGHT
Strip width: ${mm(p.stripWidth)} mm. Vertical mounting allowance: ${mm(channelWidth(p))} mm.
Thickness allowance: ${mm(p.stripThickness)} mm INCLUDING LEDs, coating and adhesive.
A 1 mm-high ledge supports the lower edge. The 2.4 mm outer wall and the raised
inner lip enclose an open-topped trough above the solid ${mm(p.height)} mm base.

Mount the tape UPRIGHT against the inside of the OUTER wall, with the LEDs
facing inward toward the white 45° slope. Keep the strip's long edges level:
it wraps a vertical cylinder in its natural bending direction. Do not stick
it onto the slope, twist it, or bend it flat around the top of the ring.
One continuous run bridges all six printed sections after assembly.

Use white PLA for the reflecting surface. It scatters light broadly; it is
not a mirror and the drawing is not a prediction of beam angle or brightness.
The floor and inner lip obstruct direct sight of the LEDs from below. White
PLA may transmit some glow: hiding the chips does not guarantee a dark underside.
Print and light one B section first to check clearance, opacity and temperature.
If the underside must be completely dark, a suitable opaque lining/coating
may be needed; keep any conductive lining insulated from electrical contacts.

Use the LED manufacturer's mounting method on the vertical wall. The ledge
supports the edge but is not a snap lock. Adhesive must suit both the strip and
PLA. The default 3 mm thickness is an assumption: measure your strip and change
the app setting before printing if needed. Do not mix parts from older kits;
changing band width or the light mount also changes pin and guide locations.
${common}`;
  }
}

interface Hole {
  angle: number;
  clearance: number;
  bevel: number;
}

const RingArc = {
  generate(p: RingParameters, halfAngle: number, holes: readonly Hole[], plate: boolean, quality: RingQuality): BalloonMesh {
    const r = holeRadius(p);
    const height = plate ? SegmentedRingKit.plateThickness : p.height;
    const inner = innerRadius(p) + (plate ? 1 : 0);
    const outer = p.diameter / 2 - (plate ? 1 : 0);
    const flangeOuter = plate ? outer : flangeOuterRadius(p);
    const spans = holes.map((hole) => atan((hole.clearance + 2 * hole.bevel) / Math.sqrt(2) / r));
    const steps = intCeil((halfAngle / PI) * (quality === 'export' ? 720 : 360));
    const angles: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const angle = -halfAngle + (2 * halfAngle * i) / steps;
      if (!holes.some((hole, h) => Math.abs(angle - hole.angle) < (spans[h] as number) + 1e-8)) angles.push(angle);
    }
    holes.forEach((hole, h) => {
      const span = spans[h] as number;
      angles.push(hole.angle - span, hole.angle, hole.angle + span);
    });
    sortDoubles(angles);
    const n = angles.length;
    const halves = new Array<number>(n).fill(2.0);
    const straighten = new Array<number>(n).fill(0.0);
    const columns = holes.map((hole) => {
      const column = angles.findIndex((angle) => Math.abs(angle - hole.angle) < 1e-8);
      if (column < 0) throw new RangeError('Ring hole centre is missing from the sampled angles');
      return column;
    });
    columns.forEach((column, i) => {
      if (column < 1 || column + 1 >= n) throw new RangeError('Ring hole column is out of range');
      const hole = holes[i] as Hole;
      for (let j = column - 1; j <= column + 1; j++) halves[j] = (hole.clearance + 2 * hole.bevel) / Math.sqrt(2);
      straighten[column - 1] = spans[i] as number;
      straighten[column + 1] = spans[i] as number;
    });
    const vertices: Point3[] = [];
    const triangles: Triangle[] = [];
    const ring = (z: number, radius: (column: number) => number): number[] =>
      angles.map((theta, j) => {
        const index = vertices.length;
        const rad = radius(j);
        vertices.push({ x: rad * cos(theta), y: rad * sin(theta), z });
        return index;
      });
    const rows = (z: number): number[][] => [
      ring(z, () => inner),
      ring(z, (j) => r - (halves[j] as number)),
      ring(z, (j) => r / cos(straighten[j] as number)),
      ring(z, (j) => r + (halves[j] as number)),
      ring(z, () => flangeOuter),
    ];
    const bottom = rows(0);
    const top = rows(height);
    const join = (a: number[], b: number[], reverse = false): void => {
      for (let j = 0; j < n - 1; j++) {
        const aj = a[j] as number;
        const ak = a[j + 1] as number;
        const bk = b[j + 1] as number;
        const bj = b[j] as number;
        if (reverse) triangles.push({ a: aj, b: bk, c: ak }, { a: aj, b: bj, c: bk });
        else triangles.push({ a: aj, b: ak, c: bk }, { a: aj, b: bk, c: bj });
      }
    };
    for (let row = 0; row < 4; row++) {
      join(bottom[row] as number[], bottom[row + 1] as number[]);
      join(top[row] as number[], top[row + 1] as number[], true);
    }
    join(top[0] as number[], bottom[0] as number[]);
    let profile: number[][];
    if (plate) profile = [bottom[4] as number[], top[4] as number[]];
    else {
      profile = [
        bottom[4] as number[],
        ...outerProfile(p).slice(1, -1).map((point) => ring(point.z, () => point.radius)),
        top[4] as number[],
      ];
    }
    for (let i = 0; i < profile.length - 1; i++) join(profile[i] as number[], profile[i + 1] as number[]);
    // Close each end by triangulating the actual cross section, including
    // all collinear flange vertices and the concave LED channel.
    for (const col of [0, n - 1]) {
      const perimeter = [
        ...bottom.map((loop) => loop[col] as number),
        ...profile.slice(1).map((loop) => loop[col] as number),
        ...top.slice(0, -1).reverse().map((loop) => loop[col] as number),
      ];
      for (const face of RingArc.cap(perimeter, vertices)) {
        triangles.push(col === 0 ? face : { a: face.a, b: face.c, c: face.b });
      }
    }
    let faces = triangles;
    columns.forEach((column, i) => {
      const lower = StringHoles.patch(2, column, n, (row, col) => (bottom[row] as number[])[col] as number);
      const upper = StringHoles.patch(2, column, n, (row, col) => (top[row] as number[])[col] as number);
      faces = faces.filter(
        (t) => !(t.a === lower.center || t.b === lower.center || t.c === lower.center || t.a === upper.center || t.b === upper.center || t.c === upper.center),
      );
      faces.push(
        { a: lower.bottomLeft, b: lower.bottom, c: lower.left },
        { a: lower.right, b: lower.topRight, c: lower.top },
        { a: upper.bottomLeft, b: upper.left, c: upper.bottom },
        { a: upper.right, b: upper.top, c: upper.topRight },
      );
      const center = vertices[lower.center] as Point3;
      const h = holes[i] as Hole;
      const ratio = h.clearance / (h.clearance + 2 * h.bevel);
      const throat = (z: number): number[] =>
        patchLoop(lower).map((index) => {
          const point = vertices[index] as Point3;
          const created = vertices.length;
          vertices.push({ x: center.x + (point.x - center.x) * ratio, y: center.y + (point.y - center.y) * ratio, z });
          return created;
        });
      const loops = [patchLoop(lower), throat(h.bevel), throat(height - h.bevel), patchLoop(upper)];
      for (let layer = 0; layer < 3; layer++) {
        for (let j = 0; j < 4; j++) {
          const k = (j + 1) % 4;
          const a = (loops[layer] as number[])[j] as number;
          const b = (loops[layer] as number[])[k] as number;
          const c = (loops[layer + 1] as number[])[k] as number;
          const d = (loops[layer + 1] as number[])[j] as number;
          faces.push({ a, b, c }, { a, b: c, c: d });
        }
      }
    });
    const mesh = new BalloonMesh(vertices, faces, 45);
    StringHoles.compact(mesh);
    return mesh;
  },

  cap(perimeter: readonly number[], vertices: readonly Point3[]): Triangle[] {
    const polygon = perimeter.slice();
    const faces: Triangle[] = [];
    const cross = (a: number, b: number, c: number): number => {
      const u = vertices[a] as Point3;
      const v = vertices[b] as Point3;
      const w = vertices[c] as Point3;
      return (hypot(v.x, v.y) - hypot(u.x, u.y)) * (w.z - u.z) - (v.z - u.z) * (hypot(w.x, w.y) - hypot(u.x, u.y));
    };
    while (polygon.length > 3) {
      let found = false;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[(i + polygon.length - 1) % polygon.length] as number;
        const b = polygon[i] as number;
        const c = polygon[(i + 1) % polygon.length] as number;
        if (!(cross(a, b, c) > 1e-8)) continue;
        const blocked = polygon.some((v) => v !== a && v !== b && v !== c && cross(a, b, v) >= -1e-8 && cross(b, c, v) >= -1e-8 && cross(c, a, v) >= -1e-8);
        if (!blocked) {
          faces.push({ a, b, c });
          polygon.splice(i, 1);
          found = true;
          break;
        }
      }
      if (!found) throw new Error('Ring cross section must be a simple polygon');
    }
    faces.push({ a: polygon[0] as number, b: polygon[1] as number, c: polygon[2] as number });
    return faces;
  },

  pin(width: number, length: number): BalloonMesh {
    const vertices: Point3[] = [];
    const triangles: Triangle[] = [];
    for (const [z, w] of [[0.0, width - 0.8], [0.4, width], [length - 0.4, width], [length, width - 0.8]] as const) {
      for (let i = 0; i < 4; i++) {
        const a = (i * PI) / 2;
        vertices.push({ x: (w / Math.sqrt(2)) * cos(a), y: (w / Math.sqrt(2)) * sin(a), z });
      }
    }
    for (let row = 0; row < 3; row++) {
      for (let j = 0; j < 4; j++) {
        const k = (j + 1) % 4;
        const a = row * 4 + j;
        const b = row * 4 + k;
        const c = (row + 1) * 4 + k;
        const d = (row + 1) * 4 + j;
        triangles.push({ a, b, c }, { a, b: c, c: d });
      }
    }
    vertices.push(zero());
    vertices.push({ x: 0, y: 0, z: length });
    for (let j = 0; j < 4; j++) {
      triangles.push({ a: 16, b: (j + 1) % 4, c: j });
      triangles.push({ a: 17, b: 12 + j, c: 12 + (j + 1) % 4 });
    }
    return new BalloonMesh(vertices, triangles, 45);
  },
};
