// Ported from mac/Tests/CloudTests.swift @ cbda68d. Settings and layout here (:56-82, :99-104); the
// kits, LED layouts and features (:4-55, :83-93, :108-252) follow with the generator in WP-K4a
// part 2. The UserDefaults lines :94-98 are not ported (plan §5).
import { describe, it } from 'vitest';
import {
  cableBossTop,
  cloudParameters,
  CloudGenerator,
  height,
  Layout,
  normalized,
  verticalScale,
} from '../src/core/lamp/cloudGeometry';
import { atan2, hypot } from '../src/core/swift/dmath';
import { check } from '../src/core/testing/check';
import type { CloudParameters } from '../src/core/types';
import { decoded, roundTripped, sameParameters } from './support/lamp';

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
