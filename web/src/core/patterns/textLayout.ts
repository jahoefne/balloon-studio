// Ported from mac/Sources/BalloonStudio/BalloonText.swift @ cbda68d (lines 21-27, 71-150: the summed-area
// table, contains, crossesBoundary, BalloonTextLayout). Shaping and rasterizing (:28-69) live behind the
// TextRasterizer seam (patterns/raster.ts, WP-R3); this file only reads the finished mask.
import { atan2, cos, PI, sin } from '../swift/dmath';
import { swiftMax, swiftMax3, swiftMin, swiftMin3 } from '../swift/minmax';
import { intFloor, intCeil, intTrunc, rounded } from '../swift/rounding';
import type { BalloonParameters, PatternSettings } from '../types';
import type { TextMask, TextRasterizer } from './raster';
import type { Point3 } from '../geometry/point3';

/** Swift `struct BalloonTextMask` around a finished mask: `sums` is built as in :71-79. */
export class BalloonTextMask {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly pixels: Uint8Array;
  private readonly sums: Int32Array;

  constructor(mask: TextMask) {
    const { width, height, aspect, pixels: bytes } = mask;
    this.width = width;
    this.height = height;
    this.aspect = aspect;
    this.pixels = bytes;
    const integral = new Int32Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        row += (bytes[y * width + x] as number) > 0 ? 1 : 0;
        integral[(y + 1) * (width + 1) + x + 1] = (integral[y * (width + 1) + x + 1] as number) + row;
      }
    }
    this.sums = integral;
  }

  contains(x: number, y: number): boolean {
    if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return false;
    const { width, height } = this;
    return (this.pixels[swiftMin(height - 1, intTrunc(y * height)) * width + swiftMin(width - 1, intTrunc(x * width))] as number) > 0;
  }

  // A summed-area table catches ink even when every triangle sample misses a glyph.
  crossesBoundary(minX: number, maxX: number, minY: number, maxY: number): boolean {
    if (!(maxX >= 0 && minX <= 1 && maxY >= 0 && minY <= 1)) return false;
    const { width, height, sums } = this;
    const x0 = swiftMax(0, intFloor(swiftMax(0, minX) * width));
    const x1 = swiftMin(width, intCeil(swiftMin(1, maxX) * width) + 1);
    const y0 = swiftMax(0, intFloor(swiftMax(0, minY) * height));
    const y1 = swiftMin(height, intCeil(swiftMin(1, maxY) * height) + 1);
    if (!(x1 > x0 && y1 > y0)) return false;
    const stride = width + 1;
    const ink = (sums[y1 * stride + x1] as number) - (sums[y0 * stride + x1] as number) - (sums[y1 * stride + x0] as number) + (sums[y0 * stride + x0] as number);
    return ink > 0 && (ink < (x1 - x0) * (y1 - y0) || minX < 0 || maxX > 1 || minY < 0 || maxY > 1);
  }
}

/** Swift `struct BalloonTextLayout`. `create` is `init?`: null where the rasterizer has no mask. */
export class BalloonTextLayout {
  readonly mask: BalloonTextMask;
  readonly height: number;
  readonly bottom: number;
  readonly angularWidth: number;
  readonly step: number;
  readonly nominalRadius: number;
  // Face the starting preview camera with the first copy, even at a repeat count of one.
  static readonly origin: number = -PI / 3;

  get fittedWidth(): number {
    return this.height * this.mask.aspect;
  }
  get resolution(): number {
    return swiftMin(0.35, swiftMax(0.06, this.height / 32));
  }

  private constructor(mask: BalloonTextMask, settings: PatternSettings, p: BalloonParameters) {
    this.mask = mask;
    this.step = (2 * PI) / settings.textRepeats;
    this.nominalRadius = p.diameter * 0.45;
    // Leave a gap between copies and fit both dimensions with one scale factor.
    this.height = swiftMin(settings.textHeight, (this.step * this.nominalRadius * 0.78) / mask.aspect);
    this.angularWidth = (this.height * mask.aspect) / this.nominalRadius;
    this.bottom = p.neckHeight + (p.height - p.neckHeight) * 0.55 - this.height / 2;
  }

  static create(settings: PatternSettings, p: BalloonParameters, textRasterizer: TextRasterizer): BalloonTextLayout | null {
    const mask = textRasterizer(settings.text, settings.textFont);
    if (mask === null) return null;
    return new BalloonTextLayout(new BalloonTextMask(mask), settings, p);
  }

  color(v: Point3, normal: Point3): number {
    if (!(v.z >= this.bottom && v.z <= this.bottom + this.height && normal.x * v.x + normal.y * v.y > 0)) return 0;
    const angle = atan2(v.y, v.x) - BalloonTextLayout.origin;
    const delta = angle - this.step * rounded(angle / this.step);
    return this.mask.contains(delta / this.angularWidth + 0.5, (v.z - this.bottom) / this.height) ? 1 : 0;
  }

  needsRefinement(a: Point3, b: Point3, c: Point3, normal: Point3): boolean {
    const third = 1.0 / 3;
    const centerX = (a.x + b.x + c.x) * third;
    const centerY = (a.y + b.y + c.y) * third;
    const { bottom, height } = this;
    if (!(normal.x * centerX + normal.y * centerY > 0 && swiftMax3(a.z, b.z, c.z) >= bottom && swiftMin3(a.z, b.z, c.z) <= bottom + height)) return false;
    // Unwrap all three angles together so a triangle crossing ±π is local too.
    const first = atan2(a.y, a.x);
    const unwrap = (p: Point3): number => {
      const delta = atan2(p.y, p.x) - first;
      return first + atan2(sin(delta), cos(delta));
    };
    const angleB = unwrap(b);
    const angleC = unwrap(c);
    const middle = (0 + first + angleB + angleC) / 3;
    const origin = BalloonTextLayout.origin;
    const copy = origin + this.step * rounded((middle - origin) / this.step);
    const xA = (first - copy) / this.angularWidth + 0.5;
    const xB = (angleB - copy) / this.angularWidth + 0.5;
    const xC = (angleC - copy) / this.angularWidth + 0.5;
    const yA = (a.z - bottom) / height;
    const yB = (b.z - bottom) / height;
    const yC = (c.z - bottom) / height;
    const minX = lowest(xA, xB, xC);
    const maxX = highest(xA, xB, xC);
    const minY = lowest(yA, yB, yC);
    const maxY = highest(yA, yB, yC);
    if (!(swiftMax((maxX - minX) * this.fittedWidth, (maxY - minY) * height) > this.resolution)) return false;
    return this.mask.crossesBoundary(minX, maxX, minY, maxY);
  }
}

/** Swift `[x, y, z].min()!`: the first of equal values. */
export function lowest(x: number, y: number, z: number): number {
  let result = x;
  if (y < result) result = y;
  if (z < result) result = z;
  return result;
}

/** Swift `[x, y, z].max()!`: the first of equal values. */
export function highest(x: number, y: number, z: number): number {
  let result = x;
  if (y > result) result = y;
  if (z > result) result = z;
  return result;
}
