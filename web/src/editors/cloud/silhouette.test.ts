import { describe, expect, it } from 'vitest';
import { CLOUD_STYLES, SUN_STYLES } from '../../core/types';
import { CLOUD_BOX, cloudSilhouettePath, sunSilhouettePath, SUN_BOX, type SilhouetteBox } from './silhouette';

const coordinates = (path: string): [number, number][] => {
  expect(path.startsWith('M')).toBe(true);
  expect(path.endsWith('Z')).toBe(true);
  return path
    .slice(1, -1)
    .split('L')
    .map((point) => point.split(' ').map(Number) as [number, number]);
};

const expectInside = (points: [number, number][], box: SilhouetteBox) => {
  for (const [x, y] of points) {
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(-0.01);
    expect(x).toBeLessThanOrEqual(box.width + 0.01);
    expect(y).toBeGreaterThanOrEqual(-0.01);
    expect(y).toBeLessThanOrEqual(box.height + 0.01);
  }
};

describe('silhouettes', () => {
  it.each(SUN_STYLES)('sun %s: 480 samples without NaN, as wide as the frame is high', (style) => {
    const path = sunSilhouettePath(style);
    expect(path).not.toContain('NaN');
    const points = coordinates(path);
    expect(points).toHaveLength(480);
    expectInside(points, SUN_BOX);
    // The first sample is the ray tip at angle 0: radius 0.5 at a scale of min(w, h) = 70.
    expect(points[0]![0]).toBeCloseTo(SUN_BOX.width / 2 + 35, 1);
  });

  it.each(CLOUD_STYLES.flatMap((style) => [[style, false], [style, true]] as const))('cloud %s mirrored %s: 240 samples without NaN', (style, mirrored) => {
    const path = cloudSilhouettePath(style, mirrored);
    expect(path).not.toContain('NaN');
    const points = coordinates(path);
    expect(points).toHaveLength(240);
    expectInside(points, CLOUD_BOX);
  });

  it('scales a cloud by min(width, height / 0.71) and centers it on its extent', () => {
    const points = coordinates(cloudSilhouettePath('classic', false, { width: 1000, height: 71 }));
    const ys = points.map(([, y]) => y);
    // Scale 100, centered at height / 2.
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(35.5, 0);
  });

  it('mirroring flips the outline', () => {
    const plain = coordinates(cloudSilhouettePath('billow', false));
    const mirrored = coordinates(cloudSilhouettePath('billow', true));
    expect(Math.min(...mirrored.map(([x]) => x))).toBeCloseTo(CLOUD_BOX.width - Math.max(...plain.map(([x]) => x)), 0);
  });
});
