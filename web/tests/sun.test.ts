// Ported from mac/Tests/SunTests.swift @ cbda68d, without the files written to .build/test-output
// (:161-166, plan §8). The sculpted fronts of :55-57 wait for WP-K4c.
// Without FULL the kits run at preview quality, with the default and the next two only.
import { describe, it } from 'vitest';
import { binarySTL } from '../src/core/io/binaryStl';
import { CloudConstants, CloudGenerator, cloudParameters, displayName, filename, fitsP2S, height, LampClips, Layout, minimumWidth, normalized } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { sunNotchAngles, sunNotchRadius, sunProfile, wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { atan2, cos, hypot, PI, sin } from '../src/core/swift/dmath';
import { arrayMax } from '../src/core/swift/minmax';
import { strideThrough } from '../src/core/swift/rounding';
import { check } from '../src/core/testing/check';
import { parseSTL } from '../src/core/testing/stl';
import { CABLE_SIDES, SUN_STYLE_INFO, SUN_STYLES, WALL_LAMP_KIND_INFO, type CloudParameters, type SunStyle } from '../src/core/types';
import { decoded, roundTripped, sameParameters, waitsFor } from './support/lamp';
import { checkCloudFeatures, checkLEDLayout } from './support/lampFeatures';
import { FULL, shardOf } from './support/tier';


type Pair = [number, number];

const point = (radius: number, angle: number): Pair => [radius * cos(angle), radius * sin(angle)];
const distance = (p: Pair, a: Pair, b: Pair): number =>
  Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / hypot(b[0] - a[0], b[1] - a[1]);

/**
 * A spring tab must be a flat piece of wall to bend. On a sun that is
 * the flank of a ray: not its tip, not a notch. Stated here from the
 * silhouette alone: tips at half the width, notches where rays meet.
 */
const checkSunClips = (style: SunStyle): void => {
  const rayCount = SUN_STYLE_INFO[style].rayCount;
  const sector = (2 * PI) / rayCount, lean = style === 'pinwheel' ? PI / 24 : 0;
  const profile = sunProfile(style);
  for (const width of strideThrough(160.0, 500, 10)) {
    for (const fit of [0.2, 0.5]) {
      const p: CloudParameters = { ...wallLampDefaults('sun'), sunStyle: style, width, clipFit: fit };
      const clips = new LampClips(p), label = `${SUN_STYLE_INFO[style].title} ${width} mm, fit ${fit}`;
      check(clips.centers.length === 4, `Four clips: ${label}`);
      clips.centers.forEach((center, index) => {
        check(Math.abs(center - clips.centers[0]! - (index * PI) / 2) < 1e-12, `Clips are not a quarter turn apart: ${label}`);
        // Slot, tab, slot: four points of the outline.
        const ends = [-clips.half - clips.slit, -clips.half, clips.half, clips.half + clips.slit].map((offset) =>
          point(CloudGenerator.radius(center + offset, 0, width, 1, profile), center + offset),
        );
        // The flank they lie on, between a tip and the notch beside it.
        let flank: { tip: Pair; notch: Pair; other: Pair } | undefined;
        for (let ray = 0; ray < rayCount; ray++) {
          for (const side of [1.0, -1]) {
            const tip = point(width / 2, ray * sector);
            const notch = point(sunNotchRadius(style) * width, (ray + side / 2) * sector + lean);
            if (ends.every((end) => distance(end, tip, notch) < 1e-6)) {
              flank = { tip, notch, other: point(sunNotchRadius(style) * width, (ray - side / 2) * sector + lean) };
            }
          }
        }
        check(flank !== undefined, `A clip is not on the straight flank of one ray: ${label}`);
        const tab = hypot(ends[2]![0] - ends[1]![0], ends[2]![1] - ends[1]![1]);
        const slots = [hypot(ends[1]![0] - ends[0]![0], ends[1]![1] - ends[0]![1]), hypot(ends[3]![0] - ends[2]![0], ends[3]![1] - ends[2]![1])];
        // One angle serves both slots; the flank is oblique, so the
        // one nearer the tip comes out wider.
        check(Math.abs(tab - 10) < 0.01 && slots.every((slot) => slot > 0.999 && slot < 1.6), `Tab of ${tab} mm, slots of ${slots.join(', ')} mm: ${label}`);
        // Clear of the notch, and where the ray is wide enough for
        // the tab to bend into the cavity: both skirts, the tab's
        // root and 1 mm of room between them and the other flank.
        for (const end of [ends[0]!, ends[3]!]) {
          check(hypot(end[0] - flank.notch[0], end[1] - flank.notch[1]) > 1.5, `A clip's slot is in the notch: ${label}`);
          check(distance(end, flank.tip, flank.other) > 2 * (2.4 + fit) + 2.0 + 1.2 + 1, `No room for the tab to bend: ${label}`);
        }
      });
    }
  }
};

const checkSunStyle = (style: SunStyle): void => {
  const defaults: CloudParameters = { ...wallLampDefaults('sun'), sunStyle: style };
  const rays = SUN_STYLE_INFO[style].rayCount, profile = sunProfile(style);
  checkSunClips(style);
  // At every supported compact diameter, the largest fittings must stay
  // in the Cartesian core and the core must stay inside the diffuser skirt.
  for (let width = Math.trunc(minimumWidth(defaults)); width <= 240; width++) {
    const p: CloudParameters = { ...defaults, width, cableDiameter: 6, nailHead: 10, stripWidth: 12, clipFit: 0.5 };
    const l = new Layout(p);
    for (const r of l.rectangles) {
      check(r.x0 > -l.coreX && r.x1 < l.coreX && r.y0 > l.lowY && r.y1 < l.highY, `Sun fitting outside core at ${width}`);
    }
    check(l.nailBoss.y0 >= l.led.y1 + 0.99 && Math.abs(l.nailBoss.y1 - p.width * CloudConstants.sunNailTop) < 1e-9, 'Sun fittings overlap or LED rows moved');
    // The lamp hangs from the top of the slot, above its middle.
    check(l.slot.y1 > 0.09 * p.width, 'Sun hangs from below its middle');
    for (const x of [-l.coreX, l.coreX]) {
      for (const y of [l.lowY, l.highY]) {
        const r = CloudGenerator.radius(atan2(y, x), 4.1, p.width, 1, profile);
        check(r > hypot(x, y) + 0.1, 'Sun core crosses skirt');
      }
    }
  }
  // Verify the sun has distinct rays, with matching X/Y
  // extents and rotational symmetry. Test nested inset contours as well.
  for (const inset of [0.0, 1.6, 2.4, 4.1, 6.1]) {
    for (let i = 0; i < 720; i++) {
      const a = (i * PI) / 360;
      const r = CloudGenerator.radius(a, inset, 200, 1, profile);
      const rotated = CloudGenerator.radius(a + (2 * PI) / rays, inset, 200, 1, profile);
      check(Math.abs(r - rotated) < 1e-8, 'Sun rays are not symmetric');
      if (inset > 0) {
        const outside = CloudGenerator.radius(a, 0, 200, 1, profile);
        check(outside - r >= inset - 1e-8, 'Sun inset loses wall thickness');
      }
    }
  }
  const tip = CloudGenerator.radius(0, 0, 200, 1, profile);
  const root = sunNotchAngles(style).map((angle) => CloudGenerator.radius(angle, 0, 200, 1, profile));
  check(root.every((r) => Math.abs(r - sunNotchRadius(style) * 200) < 1e-6) && tip === 100 && tip - root[0]! > 35, 'Sun rays are not distinct');
};

describe('suns', () => {
  const defaults = wallLampDefaults('sun');

  it('has its own defaults and preferences', () => {
    check(defaults.kind === 'sun' && defaults.width === 200 && height(defaults) === 200, 'Sun defaults changed');
    const old = decoded('{"width":188,"style":"twin","mirrored":true}');
    check(old.kind === 'cloud' && old.style === 'twin' && old.mirrored && old.width === 188, 'Sun migration changed a saved cloud');
    check(sameParameters(roundTripped(defaults), defaults), 'Sun settings failed to round trip');
    check(WALL_LAMP_KIND_INFO.sun.settingsKey !== WALL_LAMP_KIND_INFO.cloud.settingsKey, 'Sun shares cloud preferences');
  });

  it('normalizes', () => {
    const bad: CloudParameters = { ...defaults, width: 20, depth: NaN, style: 'twin', mirrored: true };
    const fixed = normalized(bad);
    check(fixed.width === 160 && fixed.depth === 22 && fixed.style === 'classic' && !fixed.mirrored, 'Sun normalization failed');
    check(sameParameters(normalized(fixed), fixed), 'Sun normalization is not idempotent');
  });

  it('migrates former designs', () => {
    const legacySun = decoded('{"kind":"sun","width":188,"depth":34,"diffuserThickness":2}');
    check(legacySun.width === 188 && legacySun.depth === 34 && legacySun.diffuserThickness === 2, 'Existing sun changed during migration');
    // The former Rounded, Radiant and Halo designs open as the first sun.
    for (const former of ['rounded', 'radiant', 'halo']) {
      const saved = decoded(`{"kind":"sun","sunStyle":"${former}","width":188,"depth":34}`);
      check(
        saved.kind === 'sun' && saved.sunStyle === 'soft-star' && saved.width === 188 && saved.depth === 34 && sameParameters(normalized(saved), saved),
        `A sun saved as ${former} did not open`,
      );
    }
    check(legacySun.sunStyle === 'soft-star' && SUN_STYLES.length === 4, 'Suns changed');
  });

  it('keeps each style in settings and kit names', () => {
    const filenames = new Set<string>();
    for (const style of SUN_STYLES) {
      const p: CloudParameters = { ...defaults, sunStyle: style };
      const restored = roundTripped(p);
      check(sameParameters(restored, p) && sameParameters(normalized(restored), p), 'Sun style did not persist');
      check(!filenames.has(filename(p)) && filename(p).includes(style), 'Sun styles share an export filename');
      filenames.add(filename(p));
      // No kit takes the name of a former design's kit.
      check(filename(p) !== 'Sun-Lamp-200mm-kit.zip' && !filename(p).includes('radiant') && !filename(p).includes('halo'), 'Kit name of a former sun');
      const cloud: CloudParameters = { ...cloudParameters(), sunStyle: style };
      check(normalized(cloud).sunStyle === 'soft-star', "A cloud keeps a sun's design");
    }
  });

  it.each(SUN_STYLES)('%s: clips on flat flanks, fitting layouts and ray symmetry', (style) => {
    checkSunStyle(style);
  });

  // Soft star and Cones share their outline, and with it their back.
  it('keeps the silhouettes distinct, but for Soft star and Cones', () => {
    SUN_STYLES.forEach((a, index) => {
      for (const b of SUN_STYLES.slice(index + 1)) {
        const differences: number[] = [];
        for (let i = 0; i < 720; i++) {
          const angle = (i * PI) / 360;
          differences.push(Math.abs(CloudGenerator.radius(angle, 0, 200, 1, sunProfile(a)) - CloudGenerator.radius(angle, 0, 200, 1, sunProfile(b))));
        }
        if (new Set([a, b]).has('soft-star') && new Set([a, b]).has('cones')) {
          check(arrayMax(differences) === 0, 'Soft star and Cones no longer share their outline');
        } else {
          check(arrayMax(differences)! > 5 && differences.reduce((sum, d) => sum + d, 0) / 720 > 1.5, `${SUN_STYLE_INFO[a].title} and ${SUN_STYLE_INFO[b].title} are not visibly distinct`);
        }
      }
    });
  });
});

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

describe('sun kits', () => {
  const defaults = wallLampDefaults('sun');

  it('Soft star and Cones share their back', () => {
    const backs = (['soft-star', 'cones'] as const).map((sunStyle) => binarySTL(new CloudKit({ ...defaults, sunStyle }).back));
    check(bytesEqual(backs[0]!, backs[1]!), 'Soft star and Cones no longer share their back');
  });

  it.skipIf(waitsFor.k4c)('Soft star and Cones have their own fronts', () => {
    const fronts = (['soft-star', 'cones'] as const).map((sunStyle) => binarySTL(new CloudKit({ ...defaults, sunStyle, surface: 'sculpted' }).front));
    check(!bytesEqual(fronts[0]!, fronts[1]!), 'Soft star and Cones have the same front');
  }, 120_000);

  it.each(shardOf(SUN_STYLES))('%s: closed solids, lamp fittings, LED layouts and kit packaging', (style) => {
    const base: CloudParameters = { ...defaults, sunStyle: style };
    const cases: CloudParameters[] = [base];
    for (const width of [minimumWidth(base), 180, 200, 240, 241, 500]) {
      for (const largeFittings of [false, true]) {
        cases.push(
          normalized({
            ...base,
            width, depth: largeFittings ? 40 : 16,
            cableDiameter: largeFittings ? 6 : 2, nailHead: largeFittings ? 10 : 5,
            nailShaft: largeFittings ? 5 : 2, stripWidth: largeFittings ? 12 : 3.5,
            stripThickness: largeFittings ? 6 : 1, clipFit: largeFittings ? 0.5 : 0.2,
            diffuserThickness: largeFittings ? 2 : 0.8,
            cableSide: CABLE_SIDES[(cases.length + SUN_STYLES.indexOf(style)) % 4]!,
          }),
        );
      }
    }
    cases.forEach((p, index) => {
      checkLEDLayout(p);
      if (!FULL && index > 2) return;
      for (const quality of FULL ? (['preview', 'export'] as const) : (['preview'] as const)) {
        const kit = new CloudKit(p, quality);
        const parts = [];
        for (const [name, mesh] of [['back', kit.back], ['front', kit.front]] as const) {
          mesh.validate();
          const parsed = parseSTL(binarySTL(mesh));
          parsed.validate();
          parts.push(parsed);
          const dimensions = parsed.dimensions;
          check(Math.abs(dimensions.x - p.width) < 0.002 && Math.abs(dimensions.y - p.width) < 0.002, 'Sun must remain round and match its diameter');
          check(Math.abs(dimensions.z - (name === 'back' ? p.depth : p.diffuserThickness + 12)) < 0.002, 'Sun print depth incorrect');
          check(parsed.vertices.every((v) => v.z >= -1e-6), 'Sun extends below bed');
          check(parsed.vertices.length - parsed.triangles.length / 2 === (name === 'back' ? 0 : 2), 'Sun has extra shells or holes');
          check(fitsP2S(p) === (p.width <= 240), 'Sun bed fit incorrect');
        }
        checkCloudFeatures(p, parts[0]!, parts[1]!, FULL && index < 2, parseSTL(binarySTL(kit.seal)));
      }
    });
    for (const width of [minimumWidth(base), 200, 500]) {
      for (const cut of [16.0, 50, 100]) {
        for (const spacing of [14.0, 40]) {
          checkLEDLayout({ ...base, width, stripCutLength: cut, ledRowSpacing: spacing });
        }
      }
    }
    const kit = new CloudKit(base);
    const entries = kit.entries().map(([name]) => name);
    const expected = ['A-sun-back-opaque.stl', 'B-sun-front-diffuser.stl', 'C-cable-seal-TPU.stl', 'D-cable-clamp-bar.stl', 'E-cable-clamp-anvil.stl', 'LED-LAYOUT.svg', 'ASSEMBLY.md', 'sun-settings.json'];
    check(new Set(entries).size === expected.length && expected.every((name) => entries.includes(name)), 'Sun kit names or contents incorrect');
    check(kit.instructions.includes('Sun wall lamp') && kit.ledPlan.svg.includes(displayName(base)), 'Sun export mislabeled');
    check(kit.ledPlan.sections.length > 0 && kit.ledPlan.rowCount > 3, 'Sun has no useful LED layout');
  }, 900_000);
});
