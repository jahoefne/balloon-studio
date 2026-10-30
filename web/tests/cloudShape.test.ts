// Ported from mac/Tests/CloudShapeTests.swift @ cbda68d, without the files written to .build/test-output
// (:65-71, plan §8; its identity check stays). The kits wait for WP-K4b. Without FULL they run at
// preview quality, with the first and fifth of each shape only.
import { describe, it } from 'vitest';
import { binarySTL } from '../src/core/io/binaryStl';
import {
  cableBossTop,
  cloudParameters,
  cloudStyleProfile,
  CloudGenerator,
  displayName,
  filename,
  fitsP2S,
  height,
  lampProfile,
  Layout,
  normalized,
  verticalScale,
} from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { atan2, hypot, PI } from '../src/core/swift/dmath';
import { arrayMax } from '../src/core/swift/minmax';
import { check } from '../src/core/testing/check';
import { parseSTL } from '../src/core/testing/stl';
import { CABLE_SIDES, CLOUD_STYLES, type CloudParameters } from '../src/core/types';
import { decoded, roundTripped, sameParameters, waitsFor } from './support/lamp';
import { checkCloudFeatures, checkLEDLayout } from './support/lampFeatures';

const FULL = Boolean(process.env['FULL']);

const shapes = CLOUD_STYLES.flatMap((style) => [false, true].map((mirrored) => [style, mirrored] as const));

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

describe.skipIf(waitsFor.k4b)('cloud shape kits', () => {
  it.each(shapes)('%s, mirrored %s: 10 kits, fitting clearance and LED layouts', (style, mirrored) => {
    const base: CloudParameters = { ...cloudParameters(), style, mirrored };
    const cases: CloudParameters[] = [];
    // All four outlets for every silhouette and orientation. Mirrored
    // silhouettes begin on another side, so each width meets two.
    const turn = mirrored ? 2 : 0;
    for (const width of [100.0, 160, 188, 200, 230, 240, 500]) {
      cases.push({ ...base, width, depth: width === 100 ? 16 : 22, cableSide: CABLE_SIDES[(cases.length + turn) % 4]! });
    }
    for (const width of [100.0, 180, 240]) {
      cases.push(normalized({ ...base, width, depth: 16, cableDiameter: 6, stripWidth: 12, nailHead: 10, nailShaft: 5, clipFit: 0.5, diffuserThickness: 2, cableSide: CABLE_SIDES[(cases.length + turn) % 4]! }));
    }
    cases.forEach((p, index) => {
      checkLEDLayout(p);
      if (!FULL && index !== 0 && index !== 4) return;
      for (const quality of FULL ? (['preview', 'export'] as const) : (['preview'] as const)) {
        const kit = new CloudKit(p, quality);
        const parts = [];
        for (const [name, mesh] of [['back', kit.back], ['front', kit.front]] as const) {
          mesh.validate();
          const parsed = parseSTL(binarySTL(mesh));
          parsed.validate();
          parts.push(parsed);
          const dimensions = parsed.dimensions;
          check(Math.abs(dimensions.x - p.width) < 0.002 && Math.abs(dimensions.y - height(p)) < 0.002, `${displayName(p)} ${name} dimensions differ from readout`);
          check(parsed.vertices.every((v) => v.z >= -1e-6), 'Shape extends below print bed');
          check(Math.abs(dimensions.z - (name === 'back' ? p.depth : p.diffuserThickness + 12)) < 0.002, 'Shape depth changed');
          check(parsed.vertices.length - parsed.triangles.length / 2 === (name === 'back' ? 0 : 2), 'Shape has extra holes or shells');
          check(fitsP2S(p) === (dimensions.x + 16 <= 256.001 && dimensions.y + 16 <= 256.001), 'Shape bed-fit incorrect');
        }
        checkCloudFeatures(p, parts[0]!, parts[1]!, FULL && (index === 0 || index === 4));
        if (index === 0 || index === 4) {
          check(kit.instructions.includes(displayName(p)) && kit.ledPlan.svg.includes(displayName(p)), 'Export lost cloud identity');
        }
      }
    });
  }, 900_000);
});
