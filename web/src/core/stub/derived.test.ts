// Derived values the editors read, against the Swift sources and tests:
// SunTests:9, CloudTests:77, NailInsertTests:197-205, CableClipTests:35-55, FigureTests:82-106.

import { describe, expect, it } from 'vitest';
import { FIGURE_STYLES, type Vec2 } from '../types';
import { core } from './index';
import { printfFixed, printfG, rounded, swiftMax, swiftMin } from './swiftCompat';

describe('Swift formatting stand-ins', () => {
  it('printf %.1f/%.2f round the exact value, exact ties to even', () => {
    expect([0.25, 0.35, 2.25, 1.25, -0.04, 0].map((x) => printfFixed(x, 1))).toEqual(['0.2', '0.3', '2.2', '1.2', '-0.0', '0.0']);
    expect([2.675, 1.005, 0.125, 15.625].map((x) => printfFixed(x, 2))).toEqual(['2.67', '1.00', '0.12', '15.62']);
    expect(printfFixed(9.96, 1)).toBe('10.0');
  });
  it('%g keeps six significant digits', () => {
    expect([8, 3.75, 3.5, 12, 450, 0.0001, 1e-5, 1234567, 8.015625].map((x) => printfG(x))).toEqual([
      '8', '3.75', '3.5', '12', '450', '0.0001', '1E-05', '1.23457E+06', '8.01562',
    ]);
  });
  it('rounded() halves away from zero and min/max keep Swift tie rules', () => {
    expect([2.5, -2.5, 0.49999999999999994, -0.4].map(rounded)).toEqual([3, -3, 0, -0]);
    expect(Object.is(swiftMax(0, -0), -0)).toBe(true);
    expect(Object.is(swiftMin(0, -0), 0)).toBe(true);
  });
});

describe('balloon', () => {
  it('reports the classic balloon', () => {
    expect(core.balloon.derived(core.balloon.defaults)).toMatchObject({
      maximumNeckDiameter: 80,
      maximumNeckHeight: 20,
      loopHeight: 0,
      totalHeight: 220,
      maximumHeight: 250,
      minimumNeckDiameter: 12,
      minimumNeckHeight: 3,
      openingDiameter: 32 - 2 * 1.2,
      fitsPrinter: true,
      fitsWithBrim: true,
    });
  });
  it('reserves room for tethers and the hanger', () => {
    const p = { ...core.balloon.defaults, stringHoles: true, cordClearance: 4, wallThickness: 1.2, hangingLoop: true };
    const d = core.balloon.derived(p);
    expect(d.neckWallThickness).toBeCloseTo(2.2, 12);
    expect(d.minimumNeckDiameter).toBeCloseTo(4 * 4 + 2 * 2.2 + 1, 12);
    expect(d.minimumNeckHeight).toBe(12);
    expect(d.loopHeight).toBe(4 + 2 + 4 + 6);
    expect(d.maximumHeight).toBe(240);
  });
  it('caps pattern sizes by the balloon', () => {
    const p = core.balloon.normalize({ ...core.balloon.defaults, height: 80, diameter: 60, panels: 8 });
    const look = core.balloon.pattern.derived({ ...core.balloon.pattern.defaults, rows: 6, repeats: 24 }, p);
    expect(look.maximumTextHeight).toBeCloseTo((80 - p.neckHeight) * 0.28, 12);
    expect(look.maximumSize).toBeLessThan(40);
    const relief = core.balloon.pattern.derived({ ...core.balloon.pattern.defaults, style: 'Night Flight' }, core.balloon.defaults);
    expect([relief.hasRelief, relief.baseColor, relief.detailColor, relief.multicolor]).toEqual([true, 'Cream', 'Midnight blue', true]);
    expect(relief.capBoundary).toBeCloseTo(220 * 0.82, 12);
  });
});

describe('ring', () => {
  it('derives the solid and the uplight ring', () => {
    const solid = core.ring.derived(core.ring.defaults);
    expect(solid).toMatchObject({ diameterRange: { lower: 140, upper: 600 }, heightRange: { lower: 4, upper: 10 }, cordRange: { lower: 2, upper: 5 }, fitsP2S: true, continuousCords: false });
    expect(solid.outerProfile).toHaveLength(7);
    const large = core.ring.derived(core.ring.presets.large);
    expect(large).toMatchObject({ diameterRange: { lower: 300, upper: 600 }, maximumBandWidth: 60, fitsP2S: false, ledWallRadius: 222.6, ledShelfZ: 13 });
    expect(large.outerProfile).toHaveLength(12);
    expect(large.stripPathLength).toBeCloseTo(2 * Math.PI * 222.6, 9);
    expect(core.ring.normalize(core.ring.presets.large)).toEqual(core.ring.presets.large);
  });
});

describe('cloud and sun', () => {
  it('the default sun is 200 × 200 mm (SunTests:9)', () => {
    expect(core.cloud.derived(core.cloud.defaults('sun')).height).toBe(200);
  });
  it('small clouds grow taller to keep the fittings', () => {
    const small = core.cloud.normalize({ ...core.cloud.defaults('cloud'), width: 100, depth: 16 });
    const d = core.cloud.derived(small);
    expect(d.layoutHeightBasis).toBeGreaterThan(100);
    expect(d.height).toBeGreaterThan(58);
    const wide = core.cloud.derived(core.cloud.defaults('cloud'));
    expect(wide.layoutHeightBasis).toBe(230);
    expect(wide.fitsP2S).toBe(true);
    expect(wide.totalDepth).toBeCloseTo(22 + 1.2, 12);
    expect(wide.ledLength).toBeGreaterThan(0);
    expect(core.cloud.derived({ ...core.cloud.defaults('cloud'), width: 260 }).fitsP2S).toBe(false);
    expect(core.cloud.derived({ ...core.cloud.defaults('sun'), surface: 'sculpted', surfaceDepth: 20 }).totalDepth).toBeCloseTo(22 + 1.2 + 20, 12);
  });
  it('traces closed silhouettes for all ten shapes', () => {
    const refs = [
      ...(['classic', 'drift', 'billow', 'twin', 'breeze', 'cotton'] as const).map((style) => ({ kind: 'cloud' as const, style, mirrored: false })),
      ...(['soft-star', 'cones', 'pinwheel', 'bold-eight'] as const).map((sunStyle) => ({ kind: 'sun' as const, sunStyle })),
    ];
    for (const ref of refs) {
      const radii = Array.from({ length: 240 }, (_, i) => core.cloud.radius((i * 2 * Math.PI) / 240, ref));
      expect(Math.min(...radii)).toBeGreaterThan(0.1);
      expect(Math.max(...radii)).toBeLessThanOrEqual(0.55);
      const { lowY, highY } = core.cloud.profileExtent(ref);
      expect(highY).toBeGreaterThan(lowY);
    }
    // A sun's tips lie at radius 0.5 and its plain V notches at the notch radius (SunGeometry.swift:115-128).
    expect(core.cloud.radius(0, { kind: 'sun', sunStyle: 'bold-eight' })).toBeCloseTo(0.5, 9);
    expect(core.cloud.radius(Math.PI / 8, { kind: 'sun', sunStyle: 'bold-eight' })).toBeCloseTo(0.3, 9);
    // Mirroring flips left and right.
    const right = core.cloud.radius(0.3, { kind: 'cloud', style: 'billow', mirrored: false });
    const left = core.cloud.radius(Math.PI - 0.3, { kind: 'cloud', style: 'billow', mirrored: true });
    expect(left).toBeCloseTo(right, 12);
  });
  it('offers the slot insert where it fits, with the Mac reasons where not (NailInsertTests:197-205)', () => {
    const user = core.cloud.normalize({ ...core.cloud.defaults('cloud'), nailInsert: true });
    expect(core.cloud.nailInsert(user)).not.toBeNull();
    expect(core.cloud.nailInsertProblem(user)).toBeNull();
    expect(core.cloud.nailInsertProblem(core.cloud.normalize({ ...user, nailHeadDiameter: 2.4 }))).toContain('head of 2.8 mm or more');
    expect(core.cloud.nailInsertProblem(core.cloud.normalize({ ...user, nailHead: 6, nailShaft: 3 }))).toContain('keyhole is too small');
    expect(core.cloud.nailInsertProblem(core.cloud.normalize({ ...user, nailDiameter: 3.5 }))).toBe(
      'A 3.5 mm shaft is too thick for the insert to narrow the 3.5 mm slot.',
    );
    const insert = core.cloud.nailInsert(user)!;
    expect(insert.slotHalfWidth).toBeCloseTo(1.8 / 2 + 0.2, 12);
    expect(insert.nearestHead).toBeCloseTo(3.4, 12);
  });
  it('finds a clamp width with the same stride as CableClamp.minimumWidth (stub rule)', () => {
    const p = core.cloud.normalize({ ...core.cloud.defaults('cloud'), width: 120 });
    const width = core.cloud.clampMinimumWidth(p);
    expect(width).not.toBeNull();
    expect(core.cloud.clampFits({ ...p, width: width! })).toBe(true);
    expect(core.cloud.clampFits({ ...p, width: width! - 1 })).toBe(false);
    expect(core.cloud.clampFits({ ...p, strainRelief: false, width: 300 })).toBe(false);
  });
});

describe('figures', () => {
  const crosses = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => {
    const side = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return side(a, b, c) * side(a, b, d) < -1e-12 && side(c, d, a) * side(c, d, b) < -1e-12;
  };
  it.each(FIGURE_STYLES)('%s: a simple drawing with a size (FigureTests:82-106)', (style) => {
    const outline = core.figure.outline(style);
    outline.loops.forEach((loop, l) => {
      expect(loop.length).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < loop.length; i += 1) {
        const next = loop[(i + 1) % loop.length]!;
        expect(Math.hypot(loop[i]!.x - next.x, loop[i]!.y - next.y)).toBeGreaterThan(1e-9);
        for (let j = i + 2; j < loop.length; j += 1) {
          if (i === 0 && j === loop.length - 1) continue;
          expect(crosses(loop[i]!, next, loop[j]!, loop[(j + 1) % loop.length]!)).toBe(false);
        }
      }
      for (const other of outline.loops.slice(l + 1)) {
        for (let i = 0; i < loop.length; i += 1)
          for (let j = 0; j < other.length; j += 1)
            expect(crosses(loop[i]!, loop[(i + 1) % loop.length]!, other[j]!, other[(j + 1) % other.length]!)).toBe(false);
      }
    });
    expect(outline.rawHeight).toBeGreaterThan(0);
    expect(outline.rawWidth).toBeGreaterThan(0);
    expect(outline.rounding).toBeGreaterThan(0);
  });
  it('scales the drawing to the height', () => {
    const p = { ...core.figure.defaults, style: 'heart' as const, height: 80, surface: 'puffy' as const, doubleSided: true };
    const d = core.figure.derived(p);
    expect(d.scale * core.figure.outline('heart').rawHeight).toBeCloseTo(80, 12);
    expect(d.width).toBeCloseTo(core.figure.outline('heart').rawWidth * d.scale, 12);
    expect([d.domed, d.sides, d.thickness]).toEqual([true, 2, 1.6 + 3.2 * 2]);
    expect(core.figure.derived({ ...p, height: 240 }).fitsP2S).toBe(false);
  });
});

describe('cable clip', () => {
  const d = core.clip.defaults;
  it('reports problems and notes like CableClip (CableClipTests:35-55)', () => {
    expect(core.clip.clip({ ...d, nailHeadDiameter: 2.2 }).problem).toBe(
      'A 2.2 mm head is too small for a 1.8 mm nail: it needs a head of 2.4 mm or more to hold the plate.',
    );
    const plain = core.clip.clip(d);
    expect([plain.problem, plain.note]).toEqual([null, null]);
    const tall = core.clip.clip({ ...d, nailHeadHeight: 2 });
    expect(tall.plateThickness).toBeCloseTo(2.6, 9);
    expect(tall.counterboreDepth).toBeCloseTo(2, 9);
    expect(tall.note).toBeNull();
    const deep = core.clip.clip({ ...d, overlap: 1.5 });
    expect(deep.opening).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(deep.overlap >= 1.5 - 0.01 || deep.note !== null).toBe(true);
    const thin = core.clip.clip({ ...d, cableDiameter: 2, mount: 'adhesive', overlap: 1.5 });
    expect(thin.overlap).toBeLessThan(0.9 - 0.01);
    expect(thin.note).toContain('The overlap is limited to');
    expect(Math.abs(thin.opening - 0.3)).toBeLessThan(0.02);
    expect(thin.nailY).toBeNull();
  });
  it('derives the readouts the editor shows', () => {
    const c = core.clip.clip(d);
    expect(c.width).toBeCloseTo(2 * c.halfWidth, 12);
    expect(c.length).toBeCloseTo(d.length / 2 + c.plateEnd, 12);
    expect(c.height).toBeCloseTo(c.center + c.outer, 12);
    expect(c.insertion).toBeGreaterThanOrEqual(0);
    expect(c.snapStrain).toBeGreaterThan(0);
    expect(c.padArea).toBeGreaterThan(0);
    expect(c.fitsP2S).toBe(true);
  });
});
