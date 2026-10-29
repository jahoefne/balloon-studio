import { describe, expect, it } from 'vitest';
import { acos, asin, atan, atan2, cbrt, cos, exp, hypot, log, PI, pow, sin, sqrt, tan } from './dmath';

describe('dmath (deterministic transcendental functions)', () => {
  it('matches Math.* to within one ULP on a sample', () => {
    const ulp = (a: number, b: number): number => {
      if (a === b) return 0;
      const buf = new DataView(new ArrayBuffer(16));
      buf.setFloat64(0, a); buf.setFloat64(8, b);
      return Number(buf.getBigInt64(0) - buf.getBigInt64(8)) >= 0
        ? Number(buf.getBigInt64(0) - buf.getBigInt64(8))
        : Number(buf.getBigInt64(8) - buf.getBigInt64(0));
    };
    for (let i = 0; i <= 2000; i++) {
      const x = -7 + (14 * i) / 2000;
      expect(ulp(sin(x), Math.sin(x))).toBeLessThanOrEqual(1);
      expect(ulp(cos(x), Math.cos(x))).toBeLessThanOrEqual(1);
      expect(ulp(atan(x), Math.atan(x))).toBeLessThanOrEqual(1);
      expect(ulp(atan2(x, 1.5), Math.atan2(x, 1.5))).toBeLessThanOrEqual(1);
      expect(ulp(exp(x / 4), Math.exp(x / 4))).toBeLessThanOrEqual(1);
      const u = (i / 2000) * 2 - 1;
      expect(ulp(asin(u), Math.asin(u))).toBeLessThanOrEqual(1);
      expect(ulp(acos(u), Math.acos(u))).toBeLessThanOrEqual(1);
      expect(ulp(tan(u), Math.tan(u))).toBeLessThanOrEqual(1);
      const p = 0.01 + 300 * (i / 2000);
      expect(ulp(pow(p, 0.65), Math.pow(p, 0.65))).toBeLessThanOrEqual(1);
      expect(ulp(log(p), Math.log(p))).toBeLessThanOrEqual(1);
      expect(ulp(cbrt(p), Math.cbrt(p))).toBeLessThanOrEqual(1);
    }
  });
  it('keeps exact values exact', () => {
    expect(sin(0)).toBe(0);
    expect(cos(0)).toBe(1);
    expect(atan2(0, 1)).toBe(0);
    expect(atan2(1, 0)).toBe(PI / 2);
    expect(pow(2, 10)).toBe(1024);
    expect(sqrt(144)).toBe(12);
    expect(hypot(3, 4)).toBe(5);
    expect(exp(0)).toBe(1);
    expect(log(1)).toBe(0);
  });
});
