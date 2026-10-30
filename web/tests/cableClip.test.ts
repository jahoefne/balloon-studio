// Ported from mac/Tests/CableClipTests.swift @ cbda68d.
//
// The one-piece wall clip for the lead: a plate under the cable with a strap fixed on one side and
// free on the other, the nail in the plate's extension past the strap. Dimensions are stated here,
// independently of the generator: strap inner radius cable/2 + 0.1, plate 1.4 (or head height +
// 0.6), plate dropped by 1.0 past the cable on the open side, nail 0.6 past the strap with 1.0 of
// plate beyond its counterbore.
//
// SWIFT-DIFF: the lines that write .build/test-output/cable-clip (:11-12, :184-190) are not ported;
// tests/cableClip.reference.test.ts compares the exports with the Swift files instead.
import { describe, expect, it } from 'vitest';
import {
  CableClip,
  CableClipGenerator,
  CableClipKit,
  cableText,
  defaultParameters,
  displayName,
  filename,
  fromJSON,
  normalized,
  toJSON,
} from '../src/core/clip/cableClip';
import type { BalloonMesh } from '../src/core/geometry/mesh';
import { cross, point3, sub, unit, type Point3 } from '../src/core/geometry/point3';
import { binarySTL } from '../src/core/io/binaryStl';
import { hypot } from '../src/core/swift/dmath';
import { arrayMin } from '../src/core/swift/minmax';
import { check } from '../src/core/testing/check';
import { inside } from '../src/core/testing/inside';
import { ray } from '../src/core/testing/ray';
import { parseSTL } from '../src/core/testing/stl';
import type { CableClipParameters } from '../src/core/types';

const defaults = defaultParameters();
const with_ = (changes: Partial<CableClipParameters>): CableClipParameters => ({ ...defaultParameters(), ...changes });
const same = (a: CableClipParameters, b: CableClipParameters): boolean =>
  (Object.keys(defaults) as (keyof CableClipParameters)[]).every((key) => a[key] === b[key]);

const small = with_({ cableDiameter: 2, length: 4, wall: 0.6, overlap: 0.3, nailDiameter: 1, nailHeadDiameter: 2, nailHeadHeight: 0.3 });
const big = with_({ cableDiameter: 6, length: 12, wall: 1.2, overlap: 1.5, nailDiameter: 4, nailHeadDiameter: 8, nailHeadHeight: 2 });
const deep = with_({ overlap: 1.5 });
const glued = with_({ mount: 'adhesive' });
const flat = with_({ flat: true });

/** The cases of CableClipTests.swift:56-79, in its order. */
const cases: readonly (readonly [string, CableClipParameters])[] = [
  ['default', defaults],
  ['adhesive', glued],
  ['flat', flat],
  ['small', small],
  ['big', big],
  ['thin-adhesive', with_({ cableDiameter: 2, mount: 'adhesive' })],
  ['long-tall-head', with_({ cableDiameter: 3.5, length: 12, nailHeadHeight: 1.2 })],
  ['thick-strap', with_({ nailDiameter: 1.4, length: 8, wall: 1.2 })],
  ['deep-overlap', deep],
  ['big-flat', { ...big, flat: true }],
  ['thick-plate', with_({ plate: 4 })],
  ['thin-plate-tall-head', with_({ plate: 1.2, nailHeadHeight: 1.0 })],
  ['tight-nail', with_({ nailGap: 0.4 })],
  ['roomy-nail', with_({ nailGap: 10 })],
];

describe('CableClipTests', () => {
  it('checkCableClips: defaults, settings, filenames, problems and notes', () => {
    check(defaults.cableDiameter === 3.75 && defaults.mount === 'nail' && defaults.nailDiameter === 1.8 && defaults.nailHeadDiameter === 3.3
      && defaults.nailHeadHeight === 0.7 && defaults.nailGap === 3 && defaults.plate === 2 && defaults.length === 6 && defaults.wall === 0.7 && defaults.overlap === 0.5 && !defaults.flat, 'Cable clip defaults changed');

    // Settings: round trip, normalization, partial, unknown and old files.
    const restored = fromJSON(JSON.parse(toJSON(defaults)));
    check(same(restored, defaults), 'Cable clip settings failed to round trip');
    const bad = with_({ cableDiameter: 50, nailDiameter: -1, nailHeadDiameter: 99, nailHeadHeight: 0, nailGap: 99, plate: 0, length: 1, wall: 9, overlap: NaN });
    const fixed = normalized(bad);
    check(fixed.cableDiameter === 6 && fixed.nailDiameter === 1 && fixed.nailHeadDiameter === 8 && fixed.nailHeadHeight === 0.3
      && fixed.nailGap === 10 && fixed.plate === 1.2 && fixed.length === 4 && fixed.wall === 1.2 && fixed.overlap === 0.5, 'Cable clip normalization failed');
    check(same(normalized(fixed), fixed), 'Cable clip normalization is not idempotent');
    const partial = fromJSON(JSON.parse('{"cableDiameter":4,"mount":"adhesive"}'));
    check(partial.cableDiameter === 4 && partial.mount === 'adhesive' && partial.length === 6 && partial.overlap === 0.5 && partial.plate === 2, 'Partial cable clip settings did not fill in');
    const unknown = fromJSON(JSON.parse('{"mount":"velcro"}'));
    check(unknown.mount === 'nail', 'Unknown fixing did not fall back');
    // Settings saved by the two-part clip of 1.28: the cable and nail carry over, the rest is ignored or clamped.
    const old = normalized(fromJSON(JSON.parse('{"cableDiameter":3.75,"grip":0.4,"nailDiameter":1.4,"length":8,"wall":1.6,"hookDepth":0.5,"play":0.2,"rail":true,"railLength":20}')));
    check(old.nailDiameter === 1.4 && old.length === 8 && old.wall === 1.2 && old.overlap === 0.5, 'Old two-part settings did not migrate');
    check(filename(defaults) === 'Cable-Clip-3.75mm.stl', 'Cable clip filename changed');
    const four = with_({ cableDiameter: 4 });
    check(new Set([filename(defaults), filename(glued), filename(flat), filename(four)]).size === 4, 'Cable clip variants share a filename');
    check(filename(glued).includes('-adhesive') && filename(flat).includes('-flat') && filename(four).startsWith('Cable-Clip-4mm'), 'Cable clip filename parts');

    // Problems and notes.
    const smallHead = with_({ nailHeadDiameter: 2.2 });
    check(new CableClip(smallHead).problem !== null, 'A 2.2 mm head on a 1.8 mm nail was accepted');
    check(new CableClip(defaults).problem === null && new CableClip(defaults).note === null, 'The default clip reports a problem');
    const tallClip = new CableClip(with_({ nailHeadHeight: 2 }));
    check(Math.abs(tallClip.plateThickness - 2.6) < 1e-9 && Math.abs(tallClip.counterboreDepth - 2) < 1e-9 && tallClip.note === null, 'A tall head does not thicken the plate');
    const deepClip = new CableClip(deep);
    check(deepClip.opening >= 0.3 - 1e-9 && (deepClip.overlap >= 1.5 - 0.01 || deepClip.note !== null), 'A deep overlap left the tip too close to the plate');
    const thinClip = new CableClip(with_({ cableDiameter: 2, mount: 'adhesive', overlap: 1.5 }));
    check(thinClip.overlap < 0.9 - 0.01 && thinClip.note !== null && Math.abs(thinClip.opening - 0.3) < 0.02, 'A deep overlap on a 2 mm cable was not limited to keep the tip off the plate');
    const kit = CableClipKit.generate(smallHead, 'export');
    kit.mesh.validate();
  });

  it('has the 14 cases of CableClipTests.swift', () => {
    expect(cases).toHaveLength(14);
  });

  it.each(cases)('checkCableClip: %s', (name, input) => {
    checkCableClip(input, name);
  });
});

function checkCableClip(input: CableClipParameters, name: string): void {
  const p = normalized(input);
  const up = point3(0, 0, 1), down = point3(0, 0, -1), right = point3(1, 0, 0), left = point3(-1, 0, 0);
  const close = (actual: number, expected: number, message: string, tolerance = 1e-6): void => {
    check(Math.abs(actual - expected) < tolerance, `${message}: ${actual} instead of ${expected}`);
  };
  const distance = (mesh: BalloonMesh, o: Point3, d: Point3): number => ray(mesh, o, d)?.[0] ?? Infinity;
  const lowest = (mesh: BalloonMesh): number => arrayMin(mesh.vertices.map((v) => v.z))!;
  // The dimensions as the design states them.
  const nail = p.mount === 'nail', c = p.cableDiameter, r = c / 2, inner = r + 0.1, outer = inner + p.wall;
  const bore = p.nailDiameter + 0.3, cbore = Math.max(p.nailHeadDiameter + 0.3, bore + 0.4);
  const plate = nail ? Math.max(p.plate, p.nailHeadHeight + 0.6) : p.plate;
  const w = Math.max(outer, 1.5, nail ? cbore / 2 + 0.7 : 0);
  const center = plate + r, edgeX = Math.max(0.4 * r, 0.6);
  const half = p.length / 2;
  const flareEnd = half + 1.1 * (w - edgeX);
  const nailY = Math.max(half + p.nailGap + cbore / 2, half + (cbore / 2 + 0.7) * Math.sqrt(1 + 1.1 * 1.1) - 1.1 * edgeX), end = nail ? nailY + cbore / 2 + 1.0 : half, total = half + end;
  const height = center + outer, depth = nail ? Math.min(p.nailHeadHeight, plate - 0.6) : 0;
  for (const quality of ['preview', 'export'] as const) {
    const kit = CableClipKit.generate(p, quality), clip = kit.clip, mesh = kit.mesh;
    const label = `${name} at ${quality}`;
    close(clip.width, 2 * w, `Width, ${label}`); close(clip.length, total, `Length, ${label}`); close(clip.height, height, `Height, ${label}`);
    close(clip.plateThickness, plate, `Plate, ${label}`); close(clip.edgeX, edgeX, `Edge, ${label}`);
    if (nail) close(clip.flareEnd, flareEnd, `Slant, ${label}`);
    if (nail) close(clip.nailY ?? -1, nailY, `Nail position, ${label}`); else check(clip.nailY === null, `Nail on a glued clip, ${label}`);
    check(clip.opening >= 0.3 - 1e-9, `Tip too close to the plate: ${clip.opening}, ${label}`);
    check(clip.overlap > 0.29 && clip.overlap <= p.overlap + 1e-9, `Overlap ${clip.overlap} out of range, ${label}`);
    check(clip.snapStrain > 0.002 && clip.snapStrain < 0.08, `Strain estimate ${clip.snapStrain} out of range, ${label}`);
    mesh.validate();
    close(mesh.dimensions.x, 2 * w, `Mesh width, ${label}`); close(mesh.dimensions.y, total, `Mesh length, ${label}`); close(mesh.dimensions.z, height, `Mesh height, ${label}`);
    close(lowest(mesh), 0, `Clip off the wall, ${label}`);
    // The cable's room, from its middle: the arch above and on both sides, the plate below.
    const o = point3(0, 0, center);
    close(distance(mesh, o, up), inner, `Arch over the cable, ${label}`, 0.01);
    close(distance(mesh, o, left), inner, `Arch on the root side, ${label}`, 0.01);
    close(distance(mesh, o, right), inner, `Arch on the open side, ${label}`, 0.01);
    close(distance(mesh, o, down), r, `Plate under the cable, ${label}`);
    for (let k = 0; k < 24; k++) {
      const a = (2 * Math.PI * k) / 24, q = point3((r - 0.02) * Math.cos(a), 0, center + (r - 0.02) * Math.sin(a));
      check(!inside(mesh, q), `Cable cut by the clip at angle ${k}, ${label}`);
      const qe = point3((r - 0.02) * Math.cos(a), end - 0.5, center + (r - 0.02) * Math.sin(a));
      check(!inside(mesh, qe), `Cable cut by the plate's end at angle ${k}, ${label}`);
    }
    // The strap: root with its fillet, round tip, the opening below the tip, nothing beyond the strap's length.
    check(inside(mesh, point3(-(inner + outer) / 2, 0, plate + 0.2)) && inside(mesh, point3(-inner + 0.08, 0, plate + 0.08)), `No strap root, ${label}`);
    check(inside(mesh, point3(0, 0, center + (inner + outer) / 2)), `No arch, ${label}`);
    const tip = clip.tip;
    check(inside(mesh, point3(tip.x, 0, tip.z)), `No tip, ${label}`);
    check(!inside(mesh, point3(tip.x, 0, tip.z - p.wall / 2 - 0.05)) && !inside(mesh, point3(tip.x, 0, clip.tipBottom - 0.3)), `Opening blocked, ${label}`);
    check(distance(mesh, point3(tip.x, 0, clip.tipBottom - 0.01), down) >= clip.opening - 0.05, `Opening under the tip narrower than stated, ${label}`);
    check(clip.opening <= clip.tipBottom + 1e-6, `Opening wider than the space under the tip, ${label}`);
    check(!inside(mesh, point3(-(inner + outer) / 2, half + 0.2, center)) && !inside(mesh, point3(0, -half - 0.2, center + inner + p.wall / 2)), `Strap beyond its length, ${label}`);
    // The plate: full under the cable, dropped past it on the open side.
    check(inside(mesh, point3(edgeX - 0.1, 0, plate - 0.05)) && inside(mesh, point3(edgeX - 0.1, 0, 0.3)) && inside(mesh, point3(-w + 0.1, 0, 0.3)), `Plate missing under the strap, ${label}`);
    check(!inside(mesh, point3(edgeX + 0.15, 0, plate - 0.05)) && !inside(mesh, point3(edgeX + 0.15, 0, 0.3)) && !inside(mesh, point3(w - 0.1, 0, 0.3)), `Plate reaches under the strap's tip, ${label}`);
    if (nail) {
      // The extension: plate only, with the bore and the counterbore under the cable's line.
      check(!inside(mesh, point3(0, nailY, plate + 0.2)) && !inside(mesh, point3(0, nailY, 0.3)), `Extension blocked, ${label}`);
      check(!inside(mesh, point3(bore / 2 - 0.05, nailY, 0.3)) && inside(mesh, point3(bore / 2 + 0.1, nailY, 0.3)), `Bore size, ${label}`);
      check(!inside(mesh, point3(cbore / 2 - 0.05, nailY, plate - depth / 2)) && inside(mesh, point3(cbore / 2 + 0.1, nailY, plate - depth / 2)), `Counterbore size, ${label}`);
      check(inside(mesh, point3((bore + cbore) / 4, nailY, plate - depth - 0.05)), `No counterbore floor, ${label}`);
      close(distance(mesh, point3((bore + cbore) / 4, nailY, plate + 1), down), 1 + depth, `Counterbore depth, ${label}`);
      check(inside(mesh, point3(w - 0.1, nailY, plate - 0.05)) && !inside(mesh, point3(w - 0.1, nailY, plate + 0.05)), `Extension not full height, ${label}`);
      check(inside(mesh, point3(w - 0.1, flareEnd + 0.1, 0.5)) && !inside(mesh, point3(w - 0.1, half - 0.1, 0.5)), `Plate not full width past the slant, ${label}`);
      const ym = (half + flareEnd) / 2, xm = edgeX + (w - edgeX) / 2;
      check(inside(mesh, point3(xm - 0.15, ym, 0.5)) && !inside(mesh, point3(xm + 0.15, ym, 0.5)), `No slant between strap and extension, ${label}`);
      check(inside(mesh, point3(-w + 0.1, end - 0.2, plate - 0.05)), `Plate ends early, ${label}`);
      check(nailY - cbore / 2 - half >= p.nailGap - 1e-9, `Nail too close to the strap, ${label}`);
      check(inside(mesh, point3(0, half + p.nailGap / 2, plate - 0.05)), `No plate between strap and nail, ${label}`);
    } else {
      check(inside(mesh, point3(0, 0, 0.3)) && inside(mesh, point3(0, half - 0.2, 0.3)), `Hole in a glued clip, ${label}`);
    }
    // Print view: on the bed, standing on the strap's end unless flat.
    const print = kit.printView;
    print.validate();
    close(lowest(print), 0, `Print view below the bed, ${label}`);
    if (p.flat) {
      close(print.dimensions.z, height, `Flat print height, ${label}`); close(print.dimensions.y, total, `Flat print length, ${label}`);
    } else {
      close(print.dimensions.z, total, `Standing print height, ${label}`); close(print.dimensions.x, 2 * w, `Standing print width, ${label}`); close(print.dimensions.y, height, `Standing print depth, ${label}`);
      check(print.vertices.some((v) => Math.abs(v.z) < 1e-9 && Math.abs(v.y + height) < 1e-6 && Math.abs(v.x) < 1e-6), `Not standing on the strap's end, ${label}`);
      // Nothing overhangs more than 45°, but for the horizontal nail hole, which bridges.
      for (const t of print.triangles) {
        const v = [t.a, t.b, t.c].map((i) => print.vertices[i]!), n = unit(cross(sub(v[1]!, v[0]!), sub(v[2]!, v[0]!)));
        const inHole = nail && v.every((q) => hypot(q.x, q.z - (nailY + half)) <= cbore / 2 + 1e-6);
        check(n.z > -0.7072 || v.every((q) => Math.abs(q.z) < 1e-9) || inHole, `Overhang on the standing clip at ${JSON.stringify(v[0])}, ${label}`);
      }
    }
    // The preview: clip, cable and nail, each its own colour.
    const assembly = kit.assembly();
    const colors = new Set(assembly.colors), expectedColors = nail ? [0, 2, 3] : [0, 2];
    check(assembly.colors.length === assembly.mesh.triangles.length && colors.size === expectedColors.length && expectedColors.every((color) => colors.has(color)), `Preview parts, ${label}`);
    const cable = kit.cable();
    cable.validate();
    close(cable.dimensions.z, c, `Cable size, ${label}`, 1e-6); close(lowest(cable), plate, `Cable off its floor, ${label}`, 1e-6);
    for (const nailMesh of kit.nail()) nailMesh.validate();
    check(kit.notes.includes(cableText(p)) && kit.notes.includes('strap'), `Notes, ${label}`);
    if (quality !== 'export') continue;
    const data = binarySTL(print), parsed = parseSTL(data);
    parsed.validate();
    const a = parsed.dimensions, b = print.dimensions;
    check(Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4 && Math.abs(a.z - b.z) < 1e-4, `STL dimensions changed, ${label}`);
  }
}

// Not in the Swift tests: what the app's model and JSON path rely on. The expected strings are the
// output of CableClipKit.notes, CableClip.problem and .note compiled from the Swift sources.
describe('beyond CableClipTests.swift', () => {
  it('decodes like JSONDecoder', () => {
    for (const text of ['{"length":"8"}', '{"flat":1}', '{"wall":true}', '[]', '3', 'null', '{"plate":1e999}']) {
      expect(() => fromJSON(JSON.parse(text)), text).toThrow('The data couldn’t be read because it isn’t in the correct format.');
    }
    expect(same(fromJSON(JSON.parse('{"length":null,"mount":null,"flat":null}')), defaults)).toBe(true);
    expect(fromJSON(JSON.parse('{"mount":3}')).mount).toBe('nail');
  });

  it('encodes like JSONEncoder with sorted keys', () => {
    expect(toJSON(defaults)).toBe('{"cableDiameter":3.75,"flat":false,"length":6,"mount":"nail","nailDiameter":1.8,"nailGap":3,"nailHeadDiameter":3.3,"nailHeadHeight":0.7,"overlap":0.5,"plate":2,"wall":0.7}');
    expect(() => toJSON(with_({ overlap: NaN }))).toThrow();
  });

  it('names the clip', () => {
    expect(cableText(defaults)).toBe('3.75');
    expect(displayName(defaults)).toBe('Cable clip · Ø 3.75 mm');
    expect(filename({ ...big, flat: true, mount: 'adhesive' })).toBe('Cable-Clip-6mm-adhesive-flat.stl');
  });

  it('writes the texts of the Mac app', () => {
    const tail = "Press the cable in from the open side: the strap lifts about 1.6 mm, an estimated 2.0 % strain. Print standing on the strap's end, profile on the bed, with a brim; PETG bends further than PLA.";
    expect(CableClipKit.generate(defaults).notes).toBe(`Cable clip for a 3.75 mm cable: one piece, 5.4 × 13.6 × 6.6 mm. The strap (0.7 mm, 6.0 mm long) is fixed on one side and ends 0.5 mm below the cable's middle on the other; the opening under its tip is 1.6 mm. Nail: a 1.8 mm nail with a 3.3 mm head through the 2.1 mm bore in the plate's extension, 3.6 × 0.7 mm counterbore, under the cable, 3.0 mm past the strap. The hammer meets only the flat plate. Finish with a nail punch. ${tail}`);
    expect(CableClipKit.generate(glued).notes).toBe(`Cable clip for a 3.75 mm cable: one piece, 5.4 × 6.0 × 6.6 mm. The strap (0.7 mm, 6.0 mm long) is fixed on one side and ends 0.5 mm below the cable's middle on the other; the opening under its tip is 1.6 mm. Adhesive: a pad of thin double-sided tape cut to 5.4 × 6.0 mm, or a crumb of mounting putty, under the plate. ${tail}`);
    expect(CableClipKit.generate(flat).notes).toContain('Print lying on the plate, with the arch bridged; PETG bends further than PLA.');
    expect(new CableClip(with_({ nailHeadDiameter: 2.2 })).problem).toBe('A 2.2 mm head is too small for a 1.8 mm nail: it needs a head of 2.4 mm or more to hold the plate.');
    expect(new CableClip(with_({ cableDiameter: 2, mount: 'adhesive', overlap: 1.5 })).note).toBe("The overlap is limited to 0.6 mm here, so the strap's tip stays 0.3 mm off the plate.");
  });

  it('builds the preview parts', () => {
    const kit = CableClipKit.generate(defaults, 'export');
    const assembly = kit.assembly();
    expect(kit.fitsP2S).toBe(true);
    expect(kit.nail()).toHaveLength(2);
    expect(assembly.mesh.vertices.length).toBe(kit.mesh.vertices.length + kit.cable().vertices.length + kit.nail().reduce((sum, m) => sum + m.vertices.length, 0));
    expect(CableClipKit.generate(glued).nail()).toEqual([]);
    expect(CableClipGenerator.signedVolume(kit.cable())).toBeGreaterThan(0);
    expect(new CableClip(defaults).padArea).toBeGreaterThan(0);
  });
});
