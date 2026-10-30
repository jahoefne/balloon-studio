// Ported from mac/Tests/CloudTests.swift @ cbda68d, without the UserDefaults lines :94-98 (plan §5) and
// the files written to .build/test-output (:44-51, plan §8). checkCableSettings (:92) is in
// cableOutlet.test.ts. Without FULL the sweep of kits runs at preview quality, with the two default
// cases at export quality too.
import { describe, it } from 'vitest';
import {
  cableBossTop,
  cloudParameters,
  CloudGenerator,
  fitsP2S,
  height,
  Layout,
  normalized,
  verticalScale,
} from '../src/core/lamp/cloudGeometry';
import { CloudLEDPlan } from '../src/core/lamp/cloudLedLayout';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { binarySTL } from '../src/core/io/binaryStl';
import { parseSTL } from '../src/core/testing/stl';
import { arrayMax } from '../src/core/swift/minmax';
import { atan2, hypot } from '../src/core/swift/dmath';
import { check } from '../src/core/testing/check';
import { CABLE_SIDES, type CloudParameters } from '../src/core/types';
import { decoded, roundTripped, sameParameters } from './support/lamp';
import { checkCloudFeatures, checkLEDLayout } from './support/lampFeatures';

const FULL = Boolean(process.env['FULL']);

describe('cloud settings', () => {
  it('keeps the fittings of a small cloud', () => {
    const requestedSmall: CloudParameters = { ...cloudParameters(), width: 100, depth: 16 };
    const acceptedSmall = normalized(requestedSmall);
    check(
      acceptedSmall.width === 100 && acceptedSmall.depth === 16 && acceptedSmall.stripWidth === 8 && acceptedSmall.cableDiameter === 3 && acceptedSmall.nailHead === 8,
      '100 mm cloud shrank the fittings or changed requested size',
    );
    check(height(acceptedSmall) > 58, 'Small cloud did not leave room for the fittings');
  });

  it('persists and migrates', () => {
    const p = cloudParameters();
    check(sameParameters(roundTripped(p), p), 'Cloud settings lost in persistence');
    const legacy = decoded('{"width":100,"depth":16,"diffuserThickness":0.8,"stripThickness":4}');
    check(
      legacy.width === 100 && legacy.depth === 16 && legacy.diffuserThickness === 0.8 && legacy.stripThickness === 4 && legacy.stripCutLength === 16 && legacy.ledRowSpacing === 14,
      'New LED settings erased saved print dimensions',
    );
  });

  it('normalizes', () => {
    const bad: CloudParameters = {
      ...cloudParameters(),
      width: NaN, depth: Infinity, diffuserThickness: -1, clipFit: 10,
      nailHead: 5, nailShaft: 100, cableDiameter: NaN,
    };
    const fixed = normalized(bad);
    check(
      fixed.width === 230 && fixed.depth === 22 && fixed.diffuserThickness === 0.8 && fixed.clipFit === 0.5 && fixed.nailShaft === 3 && fixed.cableDiameter === 3,
      'Cloud normalization failed',
    );
    check(sameParameters(normalized(fixed), fixed), 'Cloud normalization not idempotent');
  });
});

describe('cloud layout', () => {
  // Sweep the compact/regular transition with the largest fittings. This
  // catches concave-outline crossings between the mesh test dimensions.
  it('keeps the hardware in the core at every width', () => {
    for (let width = 100; width <= 230; width++) {
      const p: CloudParameters = { ...cloudParameters(), width, cableDiameter: 6, stripWidth: 12, nailHead: 10, clipFit: 0.5 };
      const l = new Layout(p);
      for (const rect of l.rectangles) {
        check(rect.x0 > -l.coreX && rect.x1 < l.coreX && rect.y0 > l.lowY && rect.y1 < l.highY, `Compact hardware outside meshing core at ${width}`);
      }
      check(l.led.y0 >= cableBossTop(p) + 0.99 && l.nailBoss.y0 >= l.led.y1 + 0.99, `Compact features overlap or LED rows moved at ${width}`);
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const points: [number, number][] = [
          [-l.coreX + 2 * l.coreX * t, l.lowY],
          [-l.coreX + 2 * l.coreX * t, l.highY],
          [-l.coreX, l.lowY + (l.highY - l.lowY) * t],
          [l.coreX, l.lowY + (l.highY - l.lowY) * t],
        ];
        for (const [x, y] of points) {
          const wall = CloudGenerator.radius(atan2(y, x), 4.1, p.width, verticalScale(p));
          check(wall > hypot(x, y) + 0.1, `Compact core crosses skirt at ${width}`);
        }
      }
    }
  });
});

describe('cloud kits', () => {
  const small: CloudParameters = { ...cloudParameters(), width: 100, depth: 16 };
  const cases: CloudParameters[] = [cloudParameters(), small];
  // Pairwise extremes plus each mechanical tolerance independently.
  // The outlet goes round with the widths, so every side meets every
  // pair of fit and cable.
  [100.0, 125, 160, 180, 188, 192, 200, 240, 500].forEach((width, turn) => {
    for (const fit of [0.2, 0.5]) {
      for (const cable of [2.0, 6]) {
        cases.push({
          ...cloudParameters(),
          width, clipFit: fit, cableDiameter: cable,
          cableSide: CABLE_SIDES[(cases.length + turn) % 4]!,
          nailHead: cable === 2 ? 5 : 10, nailShaft: cable === 2 ? 2 : 5,
          diffuserThickness: fit === 0.2 ? 0.8 : 2,
          depth: fit === 0.2 ? 16 : 20, stripWidth: cable === 2 ? 3.5 : 12,
          stripThickness: cable === 2 ? 1 : 6,
        });
      }
    }
  });

  it.each(cases.map((p, index) => [index, p] as const))('kit %i: connected STL solids, dimensions, features', (index, p) => {
    checkLEDLayout(p);
    for (const quality of FULL || index < 2 ? (['preview', 'export'] as const) : (['preview'] as const)) {
      const kit = new CloudKit(p, quality);
      const meshes = [];
      for (const [name, mesh] of [['back', kit.back], ['front', kit.front]] as const) {
        mesh.validate();
        const parsed = parseSTL(binarySTL(mesh));
        parsed.validate();
        meshes.push(parsed);
        const dimensions = parsed.dimensions;
        check(Math.abs(dimensions.x - p.width) < 0.002, 'Cloud width changed');
        check(Math.abs(dimensions.y - height(p)) < 0.002, 'Cloud height changed');
        check(parsed.vertices.every((v) => v.z >= -1e-6), 'Cloud part below bed');
        const expected = name === 'back' ? p.depth : p.diffuserThickness + 12;
        check(Math.abs(dimensions.z - expected) < 0.002, 'Cloud part height changed');
        const euler = parsed.vertices.length - parsed.triangles.length / 2;
        check(euler === (name === 'back' ? 0 : 2), 'Cloud back needs exactly one cable through-path; front must be a single closed shell');
        check(fitsP2S(p) === (dimensions.x + 16 <= 256.001 && dimensions.y + 16 <= 256.001), 'Cloud bed-fit readout mismatch');
      }
      checkCloudFeatures(p, meshes[0]!, meshes[1]!, FULL && index < 2, parseSTL(binarySTL(kit.seal)));
    }
  }, 300_000);

  it('lays the LEDs out for every cut pitch and row spacing', () => {
    const p = cloudParameters();
    for (const width of [100.0, 160, 230, 500]) {
      for (const cut of [15.625, 16, 25, 50, 100]) {
        for (const spacing of [12.0, 16, 25, 40]) {
          checkLEDLayout({ ...p, width, stripCutLength: cut, ledRowSpacing: spacing });
        }
      }
    }
  }, 120_000);

  it('plans the LEDs for the size of the lamp', () => {
    const compact = new CloudLEDPlan(small), large = new CloudLEDPlan(cloudParameters());
    check(compact.sections.length >= 3 && arrayMax(compact.sections.map((s) => s.length))! >= 48, '100 mm lamp still restricted to the tiny former recess');
    check(large.rowCount > compact.rowCount && large.totalLength > compact.totalLength, 'LED coverage does not scale with cloud size');
  });

  it('exports the LED guides as a plan', () => {
    const entries = new CloudKit(small).entries();
    check(entries.filter(([name]) => name.endsWith('.stl')).length === 5 && entries.some(([name]) => name === 'LED-LAYOUT.svg'), 'LED guides must export as a plan, not as a printed part');
  });
});
