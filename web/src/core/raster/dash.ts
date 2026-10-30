// CGPath.copy(dashingWithPhase:lengths:) and the dash step of CGContext.setLineDash for the deterministic rasterizer
// (docs/plan.md, Abschnitt 7, WP-R1). Callers: SummitCableCar.swift:213, NightFlight.swift:45-51.
//
// Measured on CoreGraphics (macOS 26.6.2; source: tests/fixtures/swift/probes/cg-stroke-dash.swift):
// - The pattern repeats; an odd count swaps on and off on every other pass ([30] = 30 on, 30 off).
// - The phase is taken modulo the period, negative phases too (−3 with [8, 5] equals 10).
// - The pattern restarts at every subpath.
// - A closed subpath is walked including the way back to its start, and comes out open: its first and last dash
//   are not merged, and no Close is emitted.
// - A zero-length dash becomes a line of 2⁻¹⁶ along the path, so that it still has a direction for its caps.
// - A lone Move or a zero-length subpath gives nothing. No lengths give the path unchanged.
//
// SWIFT-DIFF: CoreGraphics cuts curves and keeps them curved; here curves are flattened first (docs/plan.md §7: 0.01
// mm in user space) and every dash is a polyline.
// SWIFT-DIFF: CoreGraphics underestimates arc length on curves, so its dashes drift along the path. On
// M(0,0) C(0,10)(10,10)(10,0) with [3.4, 2.8] its sixth dash boundary sits at arc length 18.91 instead of 18.6 (1.6 %).
// Here the lengths are true to within the flattening, so dash ends move by up to that drift against CoreGraphics. Its
// estimate is not modelled; most of its pieces have a straight chord equal to the nominal length, which is the place
// to start if the raster metrics of WP-R4/R5 ever need it.
// SWIFT-DIFF: CoreGraphics adds a 2⁻¹⁶ stub at a corner reached exactly when a zero-length gap starts ([10, 0] on a
// square); not reproduced, because no caller has a zero-length gap.
import { flatten } from './flatten';
import { Path } from './path';

export const DEFAULT_DASH_TOLERANCE = 0.01;

/** 2⁻¹⁶, CoreGraphics' length for a zero-length dash. */
const ZERO_DASH_LENGTH = 1 / 65536;

/** The on-pieces of `path` under the dash pattern, as open line-only subpaths. */
export function dashPath(path: Path, lengths: readonly number[], phase: number, tol: number = DEFAULT_DASH_TOLERANCE): Path {
  let period = 0;
  for (const length of lengths) period += length;
  if (lengths.length === 0 || !(period > 0)) return path.copy();
  const pattern = lengths.length % 2 === 0 ? lengths : [...lengths, ...lengths];
  if (pattern !== lengths) period *= 2;

  let offset = phase % period;
  if (offset < 0) offset += period;
  let startIndex = 0;
  while (offset > 0 && offset >= (pattern[startIndex] as number)) {
    offset -= pattern[startIndex] as number;
    startIndex = (startIndex + 1) % pattern.length;
  }
  const startRemaining = (pattern[startIndex] as number) - offset;

  const out = new Path();
  for (const line of flatten(path, tol)) {
    const points = line.closed ? [...line.points, line.points[0] as number, line.points[1] as number] : line.points;
    let index = startIndex;
    let remaining = startRemaining;
    let drawing = false;
    for (let i = 0; i + 3 < points.length; i += 2) {
      const ax = points[i] as number;
      const ay = points[i + 1] as number;
      const bx = points[i + 2] as number;
      const by = points[i + 3] as number;
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length === 0) continue;
      let travelled = 0;
      while (travelled < length) {
        const on = index % 2 === 0;
        if (on && !drawing) {
          const f = travelled / length;
          out.moveTo(ax + dx * f, ay + dy * f);
          drawing = true;
          if (remaining === 0) {
            const g = (travelled + ZERO_DASH_LENGTH) / length;
            out.lineTo(ax + dx * g, ay + dy * g);
          }
        }
        if (remaining > length - travelled) {
          if (on) out.lineTo(bx, by);
          remaining -= length - travelled;
          break;
        }
        travelled += remaining;
        if (on) {
          if (remaining > 0) {
            const f = travelled / length;
            out.lineTo(ax + dx * f, ay + dy * f);
          }
          drawing = false;
        }
        index = (index + 1) % pattern.length;
        remaining = pattern[index] as number;
      }
    }
  }
  return out;
}
