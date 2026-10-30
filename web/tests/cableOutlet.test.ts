// Ported from mac/Tests/CableOutletTests.swift @ cbda68d: checkCableSettings (:314-378),
// checkOutletPlacement (:384-435), checkCore (:482-509) and the opt-in suite `outlets`, checkOutlets
// (:439-480, without the files written to .build/test-output, plan §8). checkCableOutlet is in
// support/lampFeatures.ts, checkChainedOutlets in cableOutletChained.test.ts.
// Without FULL the placements run every fifth width.
import { describe, it } from 'vitest';
import { binarySTL } from '../src/core/io/binaryStl';
import { CableOutlet } from '../src/core/lamp/cableSeal';
import { CloudConstants, CloudGenerator, cloudParameters, coreHalfWidth, coreHighY, coreLowY, displayName, filename, height, lampProfile, layoutHeightBasis, Layout, ledCenterY, minimumWidth, nailCenterY, normalized, verticalScale } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { sunNotchAngles, sunRayCount, wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { cos, hypot, PI, sin } from '../src/core/swift/dmath';
import { swiftMax } from '../src/core/swift/minmax';
import { ieeeRemainder, strideThrough } from '../src/core/swift/rounding';
import { check } from '../src/core/testing/check';
import { parseSTL } from '../src/core/testing/stl';
import { CABLE_SIDES, CLOUD_STYLES, SUN_STYLES, type CableSide, type CloudParameters, type WallLampKind } from '../src/core/types';
import { decoded, roundTripped, sameParameters } from './support/lamp';
import { checkCloudFeatures, checkLEDLayout } from './support/lampFeatures';
import { FULL, shardOf } from './support/tier';


const suns = (): CloudParameters[] => SUN_STYLES.map((sunStyle) => ({ ...wallLampDefaults('sun'), sunStyle }));
/** Every cloud style, as drawn and mirrored, then the four suns. */
const allDesigns = (): CloudParameters[] => [...CLOUD_STYLES.flatMap((style) => [false, true].map((mirrored) => ({ ...cloudParameters(), style, mirrored }))), ...suns()];

const checkCore = (p: CloudParameters, o: CableOutlet, label: string): void => {
  const l = new Layout(p);
  for (const r of l.rectangles) {
    check(r.x0 > -l.coreX && r.x1 < l.coreX && r.y0 > l.lowY && r.y1 < l.highY, `Fitting outside the meshing core: ${JSON.stringify(r)}, ${label}`);
  }
  // Only an outlet at the bottom moves the core, and never the fittings.
  check(l.highY === coreHighY(p) && l.coreX === coreHalfWidth(p) && l.lowY >= coreLowY(p), `Meshing core grew: ${label}`);
  check(l.lowY === coreLowY(p) || p.cableSide === 'bottom', `Meshing core moved without need: ${label}`);
  const q: CloudParameters = { ...p, cableSide: 'right' };
  check(ledCenterY(p) === ledCenterY(q) && nailCenterY(p) === nailCenterY(q) && height(p) === height(q) && layoutHeightBasis(p) === layoutHeightBasis(q), `Cable exit moved the fittings or changed the outline: ${label}`);
  // Floor between the core and the pocket's mouth, on every column of the strip.
  for (let i = -20; i <= 20; i++) {
    const h = (o.notchHalfWidth * i) / 20, [x, y] = o.point(o.seat, h);
    const scale = swiftMax(Math.abs(x) / l.coreX, y >= 0 ? y / l.highY : y / l.lowY);
    check(scale > 1 && hypot(x, y) * (1 - 1 / scale) > CableOutlet.clearance - 1e-6, `Pocket reaches into the meshing core: ${hypot(x, y) * (1 - 1 / scale)} mm of floor, ${label}`);
  }
  const landing = o.landing;
  check(landing >= 7 && landing <= 12, `Landing of ${landing} mm: ${label}`);
  check(landing === 12 || (p.kind === 'cloud' && p.cableSide === 'top' && p.width < 140), `Landing is short without need: ${landing} mm, ${label}`);
  // The keep-out covers the landing and the pocket, up to the outline.
  const keep = o.keepOut;
  for (const [t, h] of [[o.seat - landing, -o.notchHalfWidth], [o.seat - landing, o.notchHalfWidth], [o.reach(0, 0), 0]] as const) {
    const [x, y] = o.point(t, h);
    check(x >= keep.x0 - 1e-9 && x <= keep.x1 + 1e-9 && y >= keep.y0 - 1e-9 && y <= keep.y1 + 1e-9, `LED keep-out misses the outlet: ${label}`);
  }
};

describe('cable exit', () => {
  it.each(['cloud', 'sun'] as WallLampKind[])('%s: persistence, migration from the rear outlet, kit names and contents', (kind) => {
    const legacy = decoded(`{"kind":"${kind}","width":188,"cableDiameter":4}`);
    check(legacy.cableSide === 'right' && legacy.cableDiameter === 4 && legacy.width === 188, 'Saved lamp lost its settings with the side outlet');
    const names = new Set<string>();
    for (const side of CABLE_SIDES) {
      const p: CloudParameters = { ...wallLampDefaults(kind), cableSide: side };
      const restored = roundTripped(p);
      check(sameParameters(restored, p) && restored.cableSide === side, 'Cable side did not persist');
      check(normalized(p).cableSide === side, 'Normalization changed the cable side');
      check(!names.has(filename(p)), 'Left and right kits share a filename');
      names.add(filename(p));
      const kit = new CloudKit(p);
      const entries = kit.entries().map(([name]) => name);
      check(entries.filter((name) => name.endsWith('.stl')).length === kit.printedParts && entries.includes(CloudConstants.sealFilename), 'Kit must contain the cable seal');
      const place: Record<CableSide, string> = {
        left: 'side wall, on the left as you face the lamp',
        right: 'side wall, on the right as you face the lamp',
        top: 'outer wall, at the top of the lamp',
        bottom: 'outer wall, at the bottom of the lamp',
      };
      check(kit.instructions.includes(place[side]) && kit.instructions.includes('TPU'), 'Guide does not describe the outlet');
      check(Object.values(place).filter((text) => kit.instructions.includes(text)).length === 1, 'Guide describes several outlets');
      check(kit.clamp !== null && !kit.instructions.includes('fix the lead to the wall'), 'The clamp carries the cable, at the top too');
      const plain: CloudParameters = { ...p, strainRelief: false };
      check(new CloudKit(plain).instructions.includes('fix the lead to the wall') === (side === 'top'), 'Guide must tell to relieve a cable that leaves at the top');
      const suffix: Record<CableSide, string> = { left: '-cable-left-kit.zip', right: 'mm-kit.zip', top: '-cable-top-kit.zip', bottom: '-cable-bottom-kit.zip' };
      check(filename(p).endsWith(suffix[side]), `Kit is not named after its outlet: ${filename(p)}`);
      check(!kit.instructions.includes('spacers at least') && !kit.instructions.includes('U-shaped'), 'Guide still describes the rear outlet');
    }
    check(filename(wallLampDefaults(kind)) === (kind === 'sun' ? 'Sun-Lamp-soft-star-200mm-kit.zip' : 'Cloud-Lamp-230mm-kit.zip'), 'Default kit was renamed');
  }, 120_000);

  it('has four exits', () => {
    check(CABLE_SIDES.length === 4 && new Set(CABLE_SIDES).size === 4 && ['left', 'right', 'top', 'bottom'].every((side) => (CABLE_SIDES as readonly string[]).includes(side)), 'Cable exits changed');
  });

  // Left is the mirror image of right for a cloud together with its
  // mirrored silhouette. Top and bottom turn over with a cloud's
  // silhouette too. A sun's exits are a quarter turn apart instead.
  it("turns a sun's exits a quarter turn", () => {
    for (const sun of suns()) {
      for (const width of [minimumWidth(sun), 200, 500]) {
        for (const cable of [2.0, 6]) {
          const a: CloudParameters = { ...sun, width, cableDiameter: cable };
          const right = new CableOutlet(normalized(a));
          (['top', 'left', 'bottom'] as CableSide[]).forEach((side, turns) => {
            const turned = new CableOutlet(normalized({ ...a, cableSide: side }));
            check(
              Math.abs(ieeeRemainder(turned.angle - right.angle - ((turns + 1) * PI) / 2, 2 * PI)) < 1e-9 && Math.abs(turned.seat - right.seat) < 1e-6,
              `A sun's exits are not a quarter turn apart: ${displayName(a)} ${width} ${side}`,
            );
            for (const h of [-3.0, 0, 3]) {
              check(Math.abs(turned.reach(h, 0) - right.reach(h, 0)) < 1e-6, "A sun's exits meet different walls");
            }
          });
        }
      }
    }
  }, 120_000);

  it('mirrors the outlets of a mirrored cloud', () => {
    const designs: [CloudParameters, CloudParameters][] = [];
    for (const style of CLOUD_STYLES) {
      for (const width of [100.0, 230, 500]) {
        for (const cable of [2.0, 6]) {
          const a: CloudParameters = { ...cloudParameters(), style, width, cableDiameter: cable };
          const b: CloudParameters = { ...a, cableSide: 'left', mirrored: true };
          designs.push([a, b]);
          for (const side of ['top', 'bottom'] as CableSide[]) designs.push([{ ...a, cableSide: side }, { ...b, cableSide: side }]);
        }
      }
    }
    for (const [right, left] of designs) {
      const a = new CableOutlet(normalized(right)), b = new CableOutlet(normalized(left));
      check(Math.abs(ieeeRemainder(a.angle + b.angle - PI, 2 * PI)) < 1e-9 && Math.abs(a.seat - b.seat) < 1e-6, `Mirrored outlet is not the mirror image: ${displayName(right)} ${right.width} ${right.cableSide}`);
      for (const h of [-3.0, 0, 3]) {
        check(Math.abs(a.reach(h, 0) - b.reach(-h, 0)) < 1e-6, 'Mirrored outlet meets a different wall');
      }
    }
  }, 120_000);
});

/**
 * Where the outlet is, stated independently of the generator: on a
 * cloud at the widest and the highest point and in the middle of the
 * base, on a sun between two rays.
 * The meshing core keeps the fittings and ends before the pocket.
 */
describe('outlet placement', () => {
  const degree = PI / 180;
  const apart = (a: number, b: number): number => Math.abs(ieeeRemainder(a - b, 2 * PI));
  const center: Record<CableSide, number> = { right: 0, top: 90 * degree, left: 180 * degree, bottom: 270 * degree };
  const sample = <T,>(values: readonly T[]): readonly T[] => (FULL ? values : values.filter((_, i) => i % 5 === 0));

  it.each(SUN_STYLES)('sun %s', (style) => {
    const sun: CloudParameters = { ...wallLampDefaults('sun'), sunStyle: style };
    for (const width of sample(strideThrough(minimumWidth(sun), 500, 20))) {
      for (const cable of [2.0, 6]) {
        for (const side of CABLE_SIDES) {
          const p = normalized({ ...sun, width, cableDiameter: cable, cableSide: side, nailHead: cable === 2 ? 5 : 10, stripWidth: cable === 2 ? 3.5 : 12 });
          const o = new CableOutlet(p), label = `${displayName(p)} ${width} mm, cable ${cable} ${side}`;
          // Between two rays, clockwise of the ray on that side, at every
          // size: in the notch. A pinwheel's notch is 7.5° from that ray:
          // its outlet is there in a large lamp, and up to midway
          // between the rays in a small one.
          const between = (360 * degree) / sunRayCount(p.sunStyle) / 2;
          const turned = ieeeRemainder(center[side] - o.angle, 360 * degree);
          if (p.sunStyle === 'pinwheel') {
            check(turned > 7.5 * degree - 1e-9 && turned < between + 1e-9, `Pinwheel's outlet is not between its notch and the middle: ${turned / degree}°, ${label}`);
            check(width < 300 || turned < 7.5 * degree + 1e-9, `A large pinwheel's outlet is not in its notch: ${turned / degree}°, ${label}`);
          } else {
            check(Math.abs(turned - between) < 1e-9 && sunNotchAngles(p.sunStyle).some((a) => apart(o.angle, a) < 1e-9), `Sun's outlet is not in the notch between two rays: ${o.angle / degree}°, ${label}`);
          }
          // The ridges and tips of both rays are outside the outlet's strip.
          for (const ray of [center[side], center[side] - 2 * between]) {
            check(o.seat * sin(apart(o.angle, ray)) > o.notchHalfWidth + 0.3, `Sun's outlet reaches under a ray: ${label}`);
          }
          checkCore(p, o, label);
        }
      }
    }
  }, 300_000);

  it.each(CLOUD_STYLES.flatMap((style) => [false, true].map((mirrored) => [style, mirrored] as const)))('cloud %s, mirrored %s', (style, mirrored) => {
    for (const width of sample(strideThrough(100.0, 500, 10))) {
      for (const cable of [2.0, 6]) {
        for (const side of CABLE_SIDES) {
          const p = normalized({ ...cloudParameters(), style, mirrored, width, cableDiameter: cable, cableSide: side, nailHead: cable === 2 ? 5 : 10, stripWidth: cable === 2 ? 3.5 : 12 });
          const o = new CableOutlet(p), label = `${displayName(p)} ${width} mm, cable ${cable} ${side}`;
          const tip = CloudGenerator.radius(o.angle, 0, p.width, verticalScale(p), lampProfile(p)), x = tip * cos(o.angle), y = tip * sin(o.angle);
          switch (side) {
            case 'top':
              check(Math.abs(y - lampProfile(p).highY * layoutHeightBasis(p)) < 1e-6, `Cloud's top outlet is not at its highest point: ${label}`);
              break;
            case 'bottom':
              check(Math.abs(x) < 1e-6 && Math.abs(y - lampProfile(p).lowY * layoutHeightBasis(p)) < 1e-6, `Cloud's bottom outlet is not in the middle of its base: ${label}`);
              // The base is flat across the whole pocket.
              for (const h of [-o.notchHalfWidth, o.notchHalfWidth]) {
                check(Math.abs(o.reach(h, 0) - o.reach(0, 0)) < 1e-6, `Cloud's base is not flat at the outlet: ${label}`);
              }
              break;
            case 'left':
            case 'right':
              if (width >= 200) check(Math.abs(Math.abs(x) - p.width / 2) < 0.5, `Cloud's side outlet is not at its widest point: ${label}`);
          }
          check(apart(o.angle, center[side]) < 30 * degree, `Cloud's outlet is on the wrong side: ${label}`);
          checkCore(p, o, label);
        }
      }
    }
  }, 300_000);
});

/**
 * Top and bottom outlets on every silhouette, at the sizes and fittings
 * that leave them the least room. `bash scripts/test.sh outlets`
 */
describe.skipIf(!FULL)('outlets', () => {
  const cases = shardOf(allDesigns()).flatMap((design) => (['top', 'bottom'] as CableSide[]).map((side) => [displayName(design), design.mirrored, side, design] as const));

  it.each(cases)('%s, mirrored %s, cable at the %s', (_, __, side, design) => {
    // Mirrored clouds repeat the outlines: they get the two extremes.
    const widths = design.mirrored ? [minimumWidth(design), 500] : [minimumWidth(design), minimumWidth(design) + 25, design.width, 500];
    widths.forEach((width, index) => {
      for (const large of [false, true]) {
        let p: CloudParameters = {
          ...design, cableSide: side, width,
          cableDiameter: large ? 6 : 2, nailHead: large ? 10 : 5, nailShaft: large ? 5 : 2,
          stripWidth: large ? 12 : 3.5, clipFit: large ? 0.5 : 0.2,
          depth: large === (index % 2 === 0) ? 16 : 26,
        };
        if (index === 2 && !large) p = { ...design, cableSide: side };
        p = normalized(p);
        checkLEDLayout(p);
        for (const quality of ['preview', 'export'] as const) {
          const kit = new CloudKit(p, quality);
          const parts = [];
          for (const [name, mesh] of [['back', kit.back], ['front', kit.front]] as const) {
            const parsed = parseSTL(binarySTL(mesh));
            parsed.validate();
            parts.push(parsed);
            const dimensions = parsed.dimensions;
            check(Math.abs(dimensions.x - p.width) < 0.002 && Math.abs(dimensions.y - height(p)) < 0.002, `${displayName(p)} ${name} dimensions differ from readout with the cable at the ${side}`);
            check(parsed.vertices.length - parsed.triangles.length / 2 === (name === 'back' ? 0 : 2), `Extra holes or shells with the cable at the ${side}`);
          }
          checkCloudFeatures(p, parts[0]!, parts[1]!, index === 2 && !large, parseSTL(binarySTL(kit.seal)));
        }
      }
    });
  }, 1_800_000);
});
