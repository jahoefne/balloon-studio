// Ported from mac/Tests/CloudShapeTests.swift @ cbda68d. Settings, core sweeps and silhouettes here
// (:5-34, :78-95); the kits (:35-77) follow with the generator in WP-K4a part 2.
import { describe, it } from 'vitest';
import {
  cableBossTop,
  cloudParameters,
  cloudStyleProfile,
  CloudGenerator,
  displayName,
  filename,
  lampProfile,
  Layout,
  verticalScale,
} from '../src/core/lamp/cloudGeometry';
import { atan2, hypot, PI } from '../src/core/swift/dmath';
import { arrayMax } from '../src/core/swift/minmax';
import { check } from '../src/core/testing/check';
import { CLOUD_STYLES, type CloudParameters } from '../src/core/types';
import { decoded, roundTripped, sameParameters } from './support/lamp';

describe('cloud shapes', () => {
  it('migrates an existing cloud', () => {
    const legacy = decoded('{"width":188,"depth":28,"clipFit":0.45}');
    check(
      legacy.style === 'classic' && !legacy.mirrored && legacy.width === 188 && legacy.depth === 28 && legacy.clipFit === 0.45,
      'Shape migration changed an existing cloud',
    );
  });

  it('keeps the hardware in the core for every shape', () => {
    for (const style of CLOUD_STYLES) {
      for (const mirrored of [false, true]) {
        const base: CloudParameters = { ...cloudParameters(), style, mirrored };
        for (let width = 100; width <= 240; width++) {
          const p: CloudParameters = { ...base, width, cableDiameter: 6, stripWidth: 12, nailHead: 10, clipFit: 0.5 };
          const l = new Layout(p);
          for (const rect of l.rectangles) {
            check(
              rect.x0 > -l.coreX && rect.x1 < l.coreX && rect.y0 > l.lowY && rect.y1 < l.highY,
              `${displayName(p)} hardware outside core at ${width} mm`,
            );
          }
          check(l.led.y0 >= cableBossTop(p) + 0.99 && l.nailBoss.y0 >= l.led.y1 + 0.99, 'Shape hardware overlaps or LED rows moved');
          const profile = lampProfile(p), scale = verticalScale(p);
          for (let i = 0; i <= 80; i++) {
            const t = i / 80;
            const points: [number, number][] = [
              [-l.coreX + 2 * l.coreX * t, l.lowY],
              [-l.coreX + 2 * l.coreX * t, l.highY],
              [-l.coreX, l.lowY + (l.highY - l.lowY) * t],
              [l.coreX, l.lowY + (l.highY - l.lowY) * t],
            ];
            for (const [x, y] of points) {
              const inner = CloudGenerator.radius(atan2(y, x), 4.1, p.width, scale, profile);
              check(inner > hypot(x, y) + 0.1, `${displayName(p)} core crosses skirt at ${width} mm`);
            }
          }
        }
      }
    }
  });

  it('keeps shape and mirror in settings and kit names', () => {
    const filenames = new Set<string>();
    for (const style of CLOUD_STYLES) {
      for (const mirrored of [false, true]) {
        const base: CloudParameters = { ...cloudParameters(), style, mirrored };
        check(sameParameters(roundTripped(base), base), 'Shape or mirror lost in settings');
        check(!filenames.has(filename(base)), 'Different cloud shapes share an archive filename');
        filenames.add(filename(base));
      }
    }
  });

  it('mirrors without distortion', () => {
    for (const style of CLOUD_STYLES) {
      for (const inset of [0.0, 2.4, 4.1]) {
        for (let i = 0; i < 720; i++) {
          const a = (i * PI) / 360;
          const normal = CloudGenerator.radius(a, inset, 230, 1, cloudStyleProfile(style));
          const mirrored = CloudGenerator.radius(PI - a, inset, 230, 1, cloudStyleProfile(style).mirrored);
          check(Math.abs(normal - mirrored) < 1e-8, 'Mirroring distorts the cloud outline');
        }
      }
    }
  });

  // Distinct profiles must remain visibly different, including the two
  // styles with the same bounding box; a size-only preset is insufficient.
  it('keeps the silhouettes distinct', () => {
    CLOUD_STYLES.forEach((a, index) => {
      for (const b of CLOUD_STYLES.slice(index + 1)) {
        const differences: number[] = [];
        for (let step = 0; step < 360; step++) {
          const angle = (step * PI) / 180;
          differences.push(
            Math.abs(CloudGenerator.radius(angle, 0, 230, 1, cloudStyleProfile(a)) - CloudGenerator.radius(angle, 0, 230, 1, cloudStyleProfile(b))),
          );
        }
        check(arrayMax(differences)! > 10 && differences.reduce((sum, d) => sum + d, 0) / 360 > 3, 'Cloud variants look too similar');
      }
    });
  });
});
