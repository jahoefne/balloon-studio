// The 8-bit DeviceGray CGContext the artworks draw on (docs/plan.md, Abschnitt 7, WP-R2): the state and drawing
// calls of NightFlight.swift:8-240, SummitCableCar.swift:14-120, :438-448 and BalloonText.swift:54-66.
//
// Row index = device y with no implicit flip: the Swift code flips with translateBy(0, rows) + scaleBy(1, −1)
// so its memory row 0 is the artwork bottom, and the port simply leaves those two calls out.
// Each primitive composites by itself, dst = floor(dst + (gray·255 − dst)·a + 0.5), as an 8-bit context does.
// Gradients go through a stepped table and an ordered dither first, see gradient.ts.
//
// SWIFT-DIFF: `fillPath(path)`/`strokePath(path)`/`clip(path)` take the path as an argument instead of the
// context's current path; it is mapped by the CTM at the time of the call. Every Swift caller adds the path and
// draws without changing the CTM in between, so the result is the same.
import { type Affine, IDENTITY, concat, rotation, scaling, translation } from './affine';
import { ClipMask, multiplyCoverage } from './clip';
import {
  GRADIENT_DITHER,
  type GradientField,
  type GradientOptions,
  type GrayGradient,
  gradientTableSize,
  linearDeviceLength,
  linearField,
  radialDeviceLength,
  radialField,
} from './gradient';
import { dashPath } from './dash';
import { type GrayImage, encodePGM } from './pgm';
import { Path, type Rect } from './path';
import { addPathEdges, EdgeTable, rasterizeRows, type FillRule } from './scanline';
import { strokePath } from './stroke';

/** CGLineCap. */
export type LineCap = 'butt' | 'round' | 'square';
/** CGLineJoin. */
export type LineJoin = 'miter' | 'round' | 'bevel';

/** The stroke parameters of a gstate; defaults as in a fresh CGContext. */
export interface StrokeStyle {
  readonly width: number;
  readonly cap: LineCap;
  readonly join: LineJoin;
  readonly miterLimit: number;
}

/** CGContext.setLineDash(phase:lengths:). */
export interface DashStyle {
  readonly phase: number;
  readonly lengths: readonly number[];
}

interface GState {
  ctm: Affine;
  clip: ClipMask;
  antialias: boolean;
  fillGray: number;
  strokeGray: number;
  stroke: StrokeStyle;
  dash: DashStyle | null;
}

// Tolerances in device pixels for the WP-R1 geometry, divided by the largest CTM scale before use. docs/plan.md asks
// for 0.1 px; measured against the stroke primitives, 0.1 leaves chords up to 11 gray levels off and the rounded
// rectangle under 0.98, 0.03 is the best fit (below that it gets worse again, as CoreGraphics' own chords are not
// finer). Dash lengths accumulate along the curve, so they take a finer flattening.
const STROKE_FLATTEN_TOLERANCE = 0.03;
const DASH_FLATTEN_TOLERANCE = 0.01;

/** The WP-R1 path operations a stroke needs. */
export interface StrokeGeometry {
  strokePath(path: Path, style: StrokeStyle, tolerance: number): Path;
  dashPath(path: Path, lengths: readonly number[], phase: number, tolerance: number): Path;
}

let strokeGeometry: StrokeGeometry = { strokePath, dashPath };

/** Replaces the stroke geometry (tests). */
export function installStrokeGeometry(geometry: StrokeGeometry): void {
  strokeGeometry = geometry;
}

/** dst = floor(dst + (gray·255 − dst)·a/255 + 0.5) for coverage a in 0…255. */
export function composite(dst: number, gray255: number, a: number): number {
  return Math.floor(dst + ((gray255 - dst) * a) / 255 + 0.5);
}

export class GrayCanvas implements GrayImage {
  readonly width: number;
  readonly height: number;
  /** Pixel (x, y) is pixels[y·width + x]; row 0 is device y = 0. */
  readonly pixels: Uint8Array;

  private state: GState;
  private readonly stack: GState[] = [];
  private readonly edges = new EdgeTable();

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`GrayCanvas: invalid size ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
    this.state = {
      ctm: IDENTITY,
      clip: ClipMask.full(width, height),
      antialias: true,
      fillGray: 0,
      strokeGray: 0,
      stroke: { width: 1, cap: 'butt', join: 'miter', miterLimit: 10 },
      dash: null,
    };
  }

  // ---- gstate --------------------------------------------------------------------------------------

  /** CGContext.saveGState. */
  save(): void {
    this.stack.push({ ...this.state });
  }

  /** CGContext.restoreGState; ignored with nothing saved, as CoreGraphics only logs it. */
  restore(): void {
    const previous = this.stack.pop();
    if (previous !== undefined) this.state = previous;
  }

  /** CGContext.ctm. */
  get ctm(): Affine {
    return this.state.ctm;
  }

  /** CGContext.concatenate(_:): `m` acts first, in the current user space. */
  concatCTM(m: Affine): void {
    this.state.ctm = concat(m, this.state.ctm);
  }

  /** CGContext.translateBy(x:y:). */
  translateBy(x: number, y: number): void {
    this.concatCTM(translation(x, y));
  }

  /** CGContext.scaleBy(x:y:). */
  scaleBy(x: number, y: number): void {
    this.concatCTM(scaling(x, y));
  }

  /** CGContext.rotate(by:). */
  rotateBy(radians: number): void {
    this.concatCTM(rotation(radians));
  }

  /** CGContext.setShouldAntialias(_:). */
  setShouldAntialias(on: boolean): void {
    this.state.antialias = on;
  }

  /** CGContext.setFillColor(gray:alpha:1). */
  setFillGray(gray: number): void {
    this.state.fillGray = gray;
  }

  /** CGContext.setStrokeColor(gray:alpha:1). */
  setStrokeGray(gray: number): void {
    this.state.strokeGray = gray;
  }

  /** CGContext.setLineWidth(_:). */
  setLineWidth(width: number): void {
    this.state.stroke = { ...this.state.stroke, width };
  }

  /** CGContext.setLineCap(_:). */
  setLineCap(cap: LineCap): void {
    this.state.stroke = { ...this.state.stroke, cap };
  }

  /** CGContext.setLineJoin(_:). */
  setLineJoin(join: LineJoin): void {
    this.state.stroke = { ...this.state.stroke, join };
  }

  /** CGContext.setMiterLimit(_:). */
  setMiterLimit(miterLimit: number): void {
    this.state.stroke = { ...this.state.stroke, miterLimit };
  }

  /** CGContext.setLineDash(phase:lengths:); an empty list switches dashing off. */
  setLineDash(phase: number, lengths: readonly number[]): void {
    this.state.dash = lengths.length === 0 ? null : { phase, lengths };
  }

  // ---- clip ----------------------------------------------------------------------------------------

  /** CGContext.addPath + clip(using:). */
  clip(path: Path, rule: FillRule = 'nonzero'): void {
    this.state.clip = this.state.clip.clip(path, this.state.ctm, this.state.antialias, rule, this.edges);
  }

  /**
   * CGContext.clip(to: rect). SWIFT-DIFF: two nested rectangles with fractional edges multiply their coverage here;
   * CoreGraphics intersects rectangles exactly. No Swift caller uses a rectangle clip.
   */
  clipRect(rect: Rect): void {
    const { a, b, c, d, tx, ty } = this.state.ctm;
    const { minX, minY, maxX, maxY } = standardized(rect);
    const x0 = a * minX + tx;
    const y0 = d * minY + ty;
    const x1 = a * maxX + tx;
    const y1 = d * maxY + ty;
    if (b === 0 && c === 0 && a > 0 && d > 0 && Number.isInteger(x0) && Number.isInteger(y0) && Number.isInteger(x1) && Number.isInteger(y1)) {
      this.state.clip = this.state.clip.clipPixelRect({ x0, y0, x1, y1 });
    } else {
      this.clip(rectPath(rect));
    }
  }

  // ---- fills ---------------------------------------------------------------------------------------

  /** CGContext.addPath + fillPath(using:). */
  fillPath(path: Path, rule: FillRule = 'nonzero'): void {
    this.edges.clear();
    addPathEdges(this.edges, path, this.state.ctm);
    this.fillEdges(this.state.fillGray, rule);
  }

  /** CGContext.fillEllipse(in:). */
  fillEllipseIn(rect: Rect): void {
    this.fillPath(ellipsePath(rect));
  }

  /** CGContext.fill(_ rect:). */
  fillRect(rect: Rect): void {
    this.fillPath(rectPath(rect));
  }

  /**
   * CGContext.addPath + strokePath, with the gstate's width, cap, join, miter limit and dash: the outline is
   * built in user space (STROKE_FLATTEN_TOLERANCE / largest CTM scale), so an anisotropic CTM stretches the pen as in
   * CoreGraphics, then filled nonzero under the CTM.
   */
  strokePath(path: Path): void {
    const scale = maxScale(this.state.ctm);
    const dash = this.state.dash;
    const source = dash === null ? path : strokeGeometry.dashPath(path, dash.lengths, dash.phase, DASH_FLATTEN_TOLERANCE / scale);
    this.edges.clear();
    addPathEdges(this.edges, strokeGeometry.strokePath(source, this.state.stroke, STROKE_FLATTEN_TOLERANCE / scale), this.state.ctm);
    this.fillEdges(this.state.strokeGray, 'nonzero');
  }

  private fillEdges(gray: number, rule: FillRule): void {
    const { clip, antialias } = this.state;
    if (clip.isEmpty) return;
    const { pixels, width } = this;
    const gray255 = gray * 255;
    const solid = Math.floor(gray255 + 0.5);
    const mask = clip.coverage;
    const clipStride = clip.rect.x1 - clip.rect.x0;
    rasterizeRows(this.edges, clip.rect, { antialias, rule }, (y, x0, x1, coverage) => {
      const row = y * width;
      const clipRow = (y - clip.rect.y0) * clipStride - clip.rect.x0;
      for (let x = x0; x < x1; x++) {
        let a = coverage[x - x0] as number;
        if (a === 0) continue;
        if (mask !== null) {
          const m = mask[clipRow + x] as number;
          if (m !== 255) a = multiplyCoverage(a, m);
          if (a === 0) continue;
        }
        const i = row + x;
        pixels[i] = a === 255 ? solid : composite(pixels[i] as number, gray255, a);
      }
    });
  }

  // ---- gradients -----------------------------------------------------------------------------------

  /** CGContext.drawLinearGradient(_:start:end:options:). */
  drawLinearGradient(gradient: GrayGradient, x0: number, y0: number, x1: number, y1: number, options: GradientOptions = {}): void {
    const { ctm } = this.state;
    this.drawGradient(gradient, linearField(ctm, x0, y0, x1, y1), gradientTableSize(linearDeviceLength(ctm, x0, y0, x1, y1)), options);
  }

  /** CGContext.drawRadialGradient with startCenter = endCenter = (cx, cy) and startRadius 0. */
  drawRadialGradient(gradient: GrayGradient, cx: number, cy: number, radius: number, options: GradientOptions = {}): void {
    const { ctm } = this.state;
    this.drawGradient(gradient, radialField(ctm, cx, cy, radius), gradientTableSize(radialDeviceLength(ctm, radius)), options);
  }

  private drawGradient(gradient: GrayGradient, field: GradientField, tableSize: number, options: GradientOptions): void {
    const clip = this.state.clip;
    if (clip.isEmpty) return;
    const before = options.drawsBeforeStartLocation === true;
    const after = options.drawsAfterEndLocation === true;
    const { pixels, width } = this;
    const { x0, y0, x1, y1 } = clip.rect;
    const mask = clip.coverage;
    const stride = x1 - x0;
    const table = new Float64Array(tableSize);
    for (let i = 0; i < tableSize; i++) table[i] = gradient.grayAt((i + 0.5) / tableSize) * 255;
    const startGray = gradient.grayAt(0) * 255;
    const endGray = gradient.grayAt(1) * 255;
    for (let y = y0; y < y1; y++) {
      field.start(y);
      const row = y * width;
      const clipRow = (y - y0) * stride - x0;
      const ditherRow = ((y - y0) & 15) << 4;
      for (let x = x0; x < x1; x++) {
        const a = mask === null ? 255 : (mask[clipRow + x] as number);
        if (a === 0) continue;
        const t = field.at(x);
        let value: number;
        if (t < 0) {
          if (!before) continue;
          value = startGray;
        } else if (t > 1) {
          if (!after) continue;
          value = endGray;
        } else {
          const index = Math.floor(t * tableSize);
          value = table[index < tableSize ? index : tableSize - 1] as number;
        }
        const k = GRADIENT_DITHER[ditherRow | ((x - x0) & 15)] as number;
        const source = Math.floor(value + (256 - k) / 256);
        const i = row + x;
        pixels[i] = a === 255 ? source : composite(pixels[i] as number, source, a);
      }
    }
  }

  // ---- export --------------------------------------------------------------------------------------

  /** The bitmap as PGM (row 0 first, nothing flipped). */
  toPGM(): Uint8Array {
    return encodePGM(this);
  }
}

// sqrt of the largest eigenvalue of Mᵀ·M: the largest stretch the CTM applies to a user-space vector.
function maxScale(m: Affine): number {
  const p = m.a * m.a + m.b * m.b;
  const q = m.a * m.c + m.b * m.d;
  const r = m.c * m.c + m.d * m.d;
  const half = (p + r) / 2;
  const diff = (p - r) / 2;
  return Math.sqrt(half + Math.sqrt(diff * diff + q * q));
}

// CGRect is used standardised here: CoreGraphics draws negative sizes as the same rectangle.
function standardized(rect: Rect): { minX: number; minY: number; maxX: number; maxY: number } {
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  return { minX: x1 < rect.x ? x1 : rect.x, minY: y1 < rect.y ? y1 : rect.y, maxX: x1 < rect.x ? rect.x : x1, maxY: y1 < rect.y ? rect.y : y1 };
}

export function rectPath(rect: Rect): Path {
  const { minX, minY, maxX, maxY } = standardized(rect);
  const p = new Path();
  p.moveTo(minX, minY);
  p.lineTo(maxX, minY);
  p.lineTo(maxX, maxY);
  p.lineTo(minX, maxY);
  p.close();
  return p;
}

/** κ of Path.addEllipse (CoreGraphics' ten-digit constant, plan §7). */
const KAPPA = 0.5522847498;

// CGContext.fillEllipse: same four cubics as CGPath(ellipseIn:).
export function ellipsePath(rect: Rect): Path {
  const { minX, minY, maxX, maxY } = standardized(rect);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const kx = ((maxX - minX) / 2) * KAPPA;
  const ky = ((maxY - minY) / 2) * KAPPA;
  const p = new Path();
  p.moveTo(maxX, midY);
  p.cubicTo(maxX, midY + ky, midX + kx, maxY, midX, maxY);
  p.cubicTo(midX - kx, maxY, minX, midY + ky, minX, midY);
  p.cubicTo(minX, midY - ky, midX - kx, minY, midX, minY);
  p.cubicTo(midX + kx, minY, maxX, midY - ky, maxX, midY);
  p.close();
  return p;
}
