// CGGradient in DeviceGray with CGContext.drawLinearGradient / drawRadialGradient for the deterministic canvas
// (docs/plan.md, Abschnitt 7, WP-R2). Reproduces NightFlight.swift:24-27 and SummitCableCar.swift:107-117
// (`rounded`: radial after translate + anisotropic scale, `linear`) and :140-142 (`groundFill`).
//
// Every pixel centre goes through the inverse CTM into gradient space and is evaluated there, so a radial
// gradient under an anisotropic CTM comes out elliptical with no special case. Only the concentric radial
// form with start radius 0 exists, which is all the artworks draw.
//
// Measured on CoreGraphics (macOS 26.6.2, tests/fixtures/primitives/probes): the colour is not continuous in t.
// It comes from a table of gradientTableSize(length) stops, each holding the colour at its bin centre, and every
// byte then gets an ordered dither anchored at the clip's bounding box (GRADIENT_DITHER). Together they move
// steep gradients by several gray levels, so canvas.ts reproduces both. The table's seams also explain why a
// CoreGraphics gradient is not monotonic.
import { type Affine, invert } from './affine';

/** CGGradientDrawingOptions. */
export interface GradientOptions {
  readonly drawsBeforeStartLocation?: boolean;
  readonly drawsAfterEndLocation?: boolean;
}

/** CGGradient(colorSpace: DeviceGray, colorComponents: [g0, 1, g1, 1, …], locations: […]). */
export class GrayGradient {
  readonly colors: readonly number[];
  readonly locations: readonly number[];

  constructor(colors: readonly number[], locations: readonly number[] = [0, 1]) {
    if (colors.length < 2 || colors.length !== locations.length) {
      throw new Error(`GrayGradient: ${colors.length} colors for ${locations.length} locations`);
    }
    this.colors = colors;
    this.locations = locations;
  }

  /** Gray at parameter t (piecewise linear between the locations, clamped outside them), before the table. */
  grayAt(t: number): number {
    const { colors, locations } = this;
    const last = locations.length - 1;
    if (t <= (locations[0] as number)) return colors[0] as number;
    if (t >= (locations[last] as number)) return colors[last] as number;
    let i = 0;
    while (t >= (locations[i + 1] as number)) i++;
    const from = locations[i] as number;
    const f = (t - from) / ((locations[i + 1] as number) - from);
    const c0 = colors[i] as number;
    return c0 + ((colors[i + 1] as number) - c0) * f;
  }
}

/**
 * Parameter of pixel centres along a row. `start(y)` prepares row y; `at(x)` returns the parameter of pixel
 * (x, y), which is not limited to 0…1.
 */
export interface GradientField {
  start(y: number): void;
  at(x: number): number;
}

/** Device length of start→end: the `length` of gradientTableSize for a linear gradient. */
export function linearDeviceLength(ctm: Affine, x0: number, y0: number, x1: number, y1: number): number {
  const dx = ctm.a * (x1 - x0) + ctm.c * (y1 - y0);
  const dy = ctm.b * (x1 - x0) + ctm.d * (y1 - y0);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Device length of the user-space vector (radius, 0): the `length` of gradientTableSize for a radial gradient. */
export function radialDeviceLength(ctm: Affine, radius: number): number {
  return radius * Math.sqrt(ctm.a * ctm.a + ctm.b * ctm.b);
}

/** t along start→end in user space: projection of the pixel centre mapped by the inverse of `ctm`. */
export function linearField(ctm: Affine, x0: number, y0: number, x1: number, y1: number): GradientField {
  const inv = invert(ctm);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const denominator = dx * dx + dy * dy;
  // t(px, py) is affine in device space, so it steps by a constant per pixel.
  const stepX = denominator === 0 ? 0 : (inv.a * dx + inv.b * dy) / denominator;
  const stepY = denominator === 0 ? 0 : (inv.c * dx + inv.d * dy) / denominator;
  const origin = denominator === 0 ? 0 : ((inv.tx - x0) * dx + (inv.ty - y0) * dy) / denominator;
  let rowValue = 0;
  return {
    start(y: number): void {
      rowValue = origin + (y + 0.5) * stepY;
    },
    at(x: number): number {
      return rowValue + (x + 0.5) * stepX;
    },
  };
}

/** |p − centre| / radius in user space for the pixel centre p mapped by the inverse of `ctm`. */
export function radialField(ctm: Affine, cx: number, cy: number, radius: number): GradientField {
  const inv = invert(ctm);
  let ux = 0;
  let uy = 0;
  return {
    start(y: number): void {
      ux = inv.c * (y + 0.5) + inv.tx - cx;
      uy = inv.d * (y + 0.5) + inv.ty - cy;
    },
    at(x: number): number {
      const px = inv.a * (x + 0.5) + ux;
      const py = inv.b * (x + 0.5) + uy;
      return radius > 0 ? Math.sqrt(px * px + py * py) / radius : Infinity;
    },
  };
}

/**
 * Stops in CoreGraphics' gradient table for a gradient `length` device pixels long: the table is a strip whose
 * width including one pad entry at each end is a multiple of 16. Measured (macOS 26.6.2): 14 up to length 14,
 * 30 up to 30, 46 up to 46, 62, 78, 110 at 100, 142 at 128, 206 at 200, whatever the colours.
 */
export function gradientTableSize(length: number): number {
  return 16 * Math.ceil((length + 2) / 16) - 2;
}

/**
 * Ordered dither CoreGraphics adds to every gradient byte, byte = floor(value·255 + (256 − k)/256) with k from this
 * 16×16 tile, addressed relative to the clip's bounding box. Solid fills are not dithered. Measured by sweeping flat
 * gradients in 1/256 steps (macOS 26.6.2); row 0 of the tile is the clip's first storage row.
 */
export const GRADIENT_DITHER: Readonly<Uint16Array> = Uint16Array.of(
  12, 68, 240, 106, 149, 57, 100, 13, 138, 80, 210, 102, 54, 249, 120, 40,
  98, 192, 124, 7, 39, 184, 229, 121, 253, 158, 19, 146, 218, 76, 152, 178,
  214, 50, 164, 205, 251, 72, 144, 27, 51, 203, 112, 36, 172, 2, 60, 228,
  142, 84, 30, 135, 92, 177, 195, 85, 225, 65, 182, 234, 88, 196, 108, 22,
  117, 243, 157, 59, 235, 114, 3, 131, 168, 97, 8, 128, 46, 136, 245, 166,
  187, 9, 220, 105, 18, 211, 47, 248, 25, 155, 239, 191, 79, 223, 32, 71,
  55, 95, 43, 199, 171, 77, 147, 69, 215, 107, 58, 163, 17, 150, 101, 209,
  237, 181, 139, 255, 122, 33, 189, 119, 179, 41, 207, 91, 252, 175, 5, 125,
  159, 81, 21, 67, 151, 231, 89, 15, 244, 137, 29, 143, 113, 63, 201, 38,
  227, 111, 194, 219, 53, 1, 204, 103, 224, 75, 197, 233, 49, 217, 130, 74,
  167, 16, 134, 96, 173, 127, 45, 161, 61, 123, 169, 11, 86, 185, 24, 241,
  52, 212, 35, 246, 73, 226, 183, 145, 23, 256, 99, 153, 247, 118, 148, 104,
  90, 154, 188, 141, 10, 109, 31, 83, 213, 193, 56, 34, 180, 66, 206, 4,
  254, 62, 116, 48, 198, 250, 156, 238, 115, 6, 133, 230, 94, 222, 42, 170,
  202, 26, 232, 174, 87, 129, 64, 37, 93, 176, 70, 162, 14, 140, 82, 110,
  132, 160, 78, 216, 20, 208, 165, 221, 190, 44, 242, 126, 200, 28, 186, 236,
);
