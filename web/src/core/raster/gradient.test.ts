import { describe, expect, it } from 'vitest';
import { fixtureText, probeSection } from '../../../tests/support/swiftProbe';
import { affine, concat, rotation, scaling, translation, IDENTITY } from './affine';
import { GRADIENT_DITHER, GrayGradient, gradientTableSize, linearDeviceLength, linearField, radialDeviceLength, radialField } from './gradient';

const probes = fixtureText('primitives/probes/cg-raster.txt.gz');
const lines = (name: string): number[][] =>
  probeSection(probes, name)
    .filter((l) => l !== '')
    .map((l) => l.split(' ').map(Number));

describe('GrayGradient', () => {
  it('interpolates between locations and clamps outside them', () => {
    const g = new GrayGradient([0.2, 1]);
    expect(g.grayAt(-1)).toBe(0.2);
    expect(g.grayAt(0)).toBe(0.2);
    expect(g.grayAt(0.5)).toBeCloseTo(0.6, 15);
    expect(g.grayAt(1)).toBe(1);
    expect(g.grayAt(7)).toBe(1);
  });

  it('supports more than two stops', () => {
    const g = new GrayGradient([0, 1, 0.5], [0, 0.25, 1]);
    expect(g.grayAt(0.125)).toBeCloseTo(0.5, 15);
    expect(g.grayAt(0.25)).toBe(1);
    expect(g.grayAt(0.625)).toBeCloseTo(0.75, 15);
  });

  it('rejects mismatched arrays', () => {
    expect(() => new GrayGradient([0, 1], [0, 0.5, 1])).toThrow();
    expect(() => new GrayGradient([1], [0])).toThrow();
  });
});

describe('gradient table', () => {
  it('has the stops CoreGraphics uses for a horizontal linear gradient', () => {
    for (const [length, stops] of lines('TABLE_LINEAR') as [number, number][]) {
      expect(gradientTableSize(linearDeviceLength(IDENTITY, 0, 0, length, 0)), `length ${length}`).toBe(stops);
    }
  });

  it('measures a linear gradient by its device vector', () => {
    for (const [lx, ly, sx, sy, stops] of lines('TABLE_LINEAR_CTM') as [number, number, number, number, number][]) {
      expect(gradientTableSize(linearDeviceLength(scaling(sx, sy), 0, 0, lx, ly))).toBe(stops);
    }
  });

  it('measures a radial gradient along the device image of user +x', () => {
    for (const [sx, sy, rotate, stops] of lines('TABLE_RADIAL') as [number, number, number, number][]) {
      expect(gradientTableSize(radialDeviceLength(concat(rotation(rotate), scaling(sx, sy)), 16))).toBe(stops);
    }
  });
});

describe('gradient dither', () => {
  it('is the measured tile, a permutation of 1…256', () => {
    const measured = lines('DITHER')[0] as number[];
    expect(Array.from(GRADIENT_DITHER)).toEqual(measured);
    expect(Array.from(GRADIENT_DITHER).sort((a, b) => a - b)).toEqual(Array.from({ length: 256 }, (_, i) => i + 1));
  });
});

describe('gradient fields', () => {
  it('projects pixel centres on a linear axis', () => {
    const f = linearField(IDENTITY, 20, 20, 44, 44);
    f.start(30);
    expect(f.at(8)).toBeCloseTo((8.5 - 20 + 30.5 - 20) / 48, 12);
    expect(f.at(32)).toBeCloseTo((32.5 - 20 + 30.5 - 20) / 48, 12);
  });

  it('agrees with mapping through the inverse CTM under a general transform', () => {
    const ctm = affine(1.5, 0.4, -0.7, 2.2, 13, -5);
    const det = ctm.a * ctm.d - ctm.b * ctm.c;
    const toUser = (x: number, y: number): [number, number] => [
      (ctm.d * (x - ctm.tx) - ctm.c * (y - ctm.ty)) / det,
      (-ctm.b * (x - ctm.tx) + ctm.a * (y - ctm.ty)) / det,
    ];
    const linear = linearField(ctm, 1, 2, 7, -3);
    const radial = radialField(ctm, 1, 2, 9);
    for (const [x, y] of [[3, 4], [20, 7], [0, 31]] as const) {
      const [ux, uy] = toUser(x + 0.5, y + 0.5);
      linear.start(y);
      expect(linear.at(x)).toBeCloseTo(((ux - 1) * 6 + (uy - 2) * -5) / 61, 12);
      radial.start(y);
      expect(radial.at(x)).toBeCloseTo(Math.hypot(ux - 1, uy - 2) / 9, 12);
    }
  });

  it('is elliptical under an anisotropic CTM', () => {
    // SummitCableCar.rounded: translate to the centre, then scale x.
    const f = radialField(concat(scaling(2.2, 1), translation(32, 32)), 0, 0, 12);
    // Pixel centres at (32 ± d, 32.5) and (32.5, 32 ± d): t = 1 at 26.4 px in x and 12 px in y.
    f.start(31);
    const onX = f.at(31 + 26);
    f.start(31 + 12);
    const onY = f.at(31);
    expect(onX).toBeCloseTo(Math.hypot(25.5 / 2.2, 0.5) / 12, 12);
    expect(onY).toBeCloseTo(Math.hypot(0.5 / 2.2, 11.5) / 12, 12);
  });

  it('never divides by a zero radius or a zero-length axis', () => {
    const radial = radialField(IDENTITY, 0, 0, 0);
    radial.start(0);
    expect(radial.at(0)).toBe(Infinity);
    const linear = linearField(IDENTITY, 3, 3, 3, 3);
    linear.start(0);
    expect(linear.at(0)).toBe(0);
  });
});
