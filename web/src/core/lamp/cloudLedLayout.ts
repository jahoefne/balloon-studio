// Ported from mac/Sources/BalloonStudio/CloudLEDLayout.swift @ cbda68d.

import { cos, PI, sin } from '../swift/dmath';
import { formatFixed } from '../swift/format';
import { swiftMax, swiftMin } from '../swift/minmax';
import { intCeil, intFloor } from '../swift/rounding';
import { CABLE_SIDE_TITLE, type CloudParameters } from '../types';
import { CableClamp } from './cableClamp';
import { CableOutlet } from './cableSeal';
import {
  cableConfigurations,
  cableSides,
  CloudConstants,
  CloudGenerator,
  displayName,
  height,
  lampProfile,
  LampClipGeometry,
  layoutHeightBasis,
  Layout,
  ledCenterY,
  normalized,
  Rect,
  verticalScale,
  type Pair,
} from './cloudGeometry';

export class Section {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly length: number,
  ) {}
  footprint(width: number): Rect {
    return new Rect(this.x - this.length / 2, this.x + this.length / 2, this.y - width / 2, this.y + width / 2);
  }
}

const mm = (x: number): string => formatFixed(x, 2);

/**
 * A mounting plan on the existing floor, independent of the mesher's small
 * rectangular core. Hardware sizes, row spacing and cut pitch stay in mm.
 */
export class CloudLEDPlan {
  readonly parameters: CloudParameters;
  readonly sections: readonly Section[];

  constructor(input: CloudParameters) {
    const p = normalized(input), l = new Layout(p);
    this.parameters = p;
    const profile = lampProfile(p), scale = verticalScale(p), basis = layoutHeightBasis(p), center = ledCenterY(p);
    const halfBand = p.stripWidth / 2 + 0.5, endSpace = 3.0;
    const keepOuts = [
      l.nailBoss.expanded(0.5),
      ...cableConfigurations(p).map((q) => (CableClamp.create(q)?.keepOut ?? new CableOutlet(q).keepOut).expanded(0.5)),
    ];
    // 2 mm beyond the thickest skirt contour also covers polygon chord error.
    const inset = CloudConstants.wall + p.clipFit + LampClipGeometry.rootThickness + 2;
    const low = profile.lowY * basis + inset * scale + halfBand;
    const high = profile.highY * basis - inset * scale - halfBand;
    const first = intCeil((low - center) / p.ledRowSpacing);
    const last = intFloor((high - center) / p.ledRowSpacing);
    const result: Section[] = [];
    for (let row = last; row >= first; row--) {
      const y = center + row * p.ledRowSpacing;
      let spans: Pair[] = [[-p.width / 2, p.width / 2]];
      // Intersect the cloud across the entire strip band. This handles
      // concave scallops and disconnected intervals in the top lobes.
      const steps = intCeil((2 * halfBand) / 0.25);
      for (let i = 0; i <= steps; i++) {
        const yy = y - halfBand + (2 * halfBand * i) / steps;
        const outline = CloudGenerator.horizontalIntervals(yy / scale, inset, p.width, profile);
        spans = spans.flatMap((a) => {
          const pieces: Pair[] = [];
          for (const b of outline) {
            const lo = swiftMax(a[0], b[0]), hi = swiftMin(a[1], b[1]);
            if (hi > lo) pieces.push([lo, hi]);
          }
          return pieces;
        });
      }
      // No LEDs or solder pads on the blind nail cap, nor in the way of
      // the cable seal and its strain relief.
      for (const boss of keepOuts) {
        if (!(y + halfBand > boss.y0 && y - halfBand < boss.y1)) continue;
        spans = spans.flatMap((span) => {
          if (span[1] <= boss.x0 || span[0] >= boss.x1) return [span];
          const pieces: Pair[] = [];
          if (span[0] < boss.x0) pieces.push([span[0], boss.x0]);
          if (span[1] > boss.x1) pieces.push([boss.x1, span[1]]);
          return pieces;
        });
      }
      for (const [lo, hi] of spans) {
        const units = Math.floor((hi - lo - 2 * endSpace) / p.stripCutLength);
        if (units >= 1) {
          result.push(new Section((lo + hi) / 2, y, units * p.stripCutLength));
        }
      }
    }
    this.sections = result;
  }
  get totalLength(): number {
    return this.sections.reduce((sum, section) => sum + section.length, 0);
  }
  get nominalWatts(): number {
    return this.totalLength * 0.009;
  }
  get rowCount(): number {
    return new Set(this.sections.map((section) => section.y)).size;
  }
  get cutList(): string {
    if (this.sections.length === 0) {
      return `No complete strip sections fit these settings. Reduce the cut interval only if your strip allows it, or enlarge the ${this.parameters.kind}.`;
    }
    return `Cut list (numbers match LED-LAYOUT.svg):\n${this.sections.map((section, offset) => `${offset + 1}. ${mm(section.length)} mm`).join('\n')}`;
  }

  /**
   * Physical units and a scale bar make this usable as a paper placement guide.
   * Y is flipped for the same cavity view as the app, with cloud lobes upward.
   */
  get svg(): string {
    const p = this.parameters, l = new Layout(p);
    const profile = lampProfile(p), scale = verticalScale(p), tall = height(p);
    const w = p.width + 20, h = tall + 47, tx = w / 2, ty = profile.highY * layoutHeightBasis(p) + 10;
    const points: string[] = [];
    for (let i = 0; i <= 720; i++) {
      const a = (i * 2 * PI) / 720, r = CloudGenerator.radius(a, 0, p.width, scale, profile);
      points.push(`${i === 0 ? 'M' : 'L'}${mm(tx + r * cos(a))},${mm(ty - r * sin(a))}`);
    }
    const outline = `${points.join(' ')} Z`;
    const rectangle = (r: Rect, fill: string): string =>
      `<rect x="${mm(tx + r.x0)}" y="${mm(ty - r.y1)}" width="${mm(r.x1 - r.x0)}" height="${mm(r.y1 - r.y0)}" fill="${fill}" stroke="#333" stroke-width="0.25"/>`;
    const configurations = cableConfigurations(p);
    const clamps: CableClamp[] = [];
    for (const q of configurations) {
      const clamp = CableClamp.create(q);
      if (clamp !== null) clamps.push(clamp);
    }
    const fittings = [...configurations.map((q) => new CableOutlet(q).pocketOutline), ...clamps.flatMap((clamp) => clamp.outlines)];
    const hardware =
      rectangle(l.nailBoss, '#ddd') +
      fittings
        .map((fitting) => {
          const corners = fitting.map((q) => `${mm(tx + q[0])},${mm(ty - q[1])}`).join(' ');
          return `\n<polygon points="${corners}" fill="#ddd" stroke="#333" stroke-width="0.25"/>`;
        })
        .join('');
    const leds = this.sections
      .map(
        (s, i) =>
          rectangle(s.footprint(p.stripWidth), '#d7ebdc') +
          `<text x="${mm(tx + s.x)}" y="${mm(ty - s.y + 1)}" text-anchor="middle" font-size="3.2">${i + 1}</text>`,
      )
      .join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${mm(w)}mm" height="${mm(h)}mm" viewBox="0 0 ${mm(w)} ${mm(h)}">
  <title>${displayName(p)} ${p.kind} LED placement plan — cavity view</title>
  <desc>Straight LED sections on the flat floor. Grey areas are the nail pocket and cable seals${clamps.length === 0 ? '' : ' with strain relief'}. Cable exits: ${cableSides(p).map((side) => CABLE_SIDE_TITLE[side]).join(', ')}. Lengths are in ASSEMBLY.md. This is a placement plan, not an optical simulation.</desc>
  <rect width="100%" height="100%" fill="white"/>
  <g font-family="sans-serif" fill="#222">
    <path d="${outline}" fill="#fafafa" stroke="#333" stroke-width="0.4"/>
    ${hardware}
    ${leds}
    <text x="10" y="${mm(tall + 19)}" font-size="3">LED side up · grey: nail pocket, cable seals${clamps.length === 0 ? '' : ', strain relief'}</text>
    <text x="10" y="${mm(tall + 25)}" font-size="3">Lengths: ASSEMBLY.md · print at 100%</text>
    <path d="M10 ${mm(tall + 35)} h50 m-50 -2 v4 m50 -4 v4" fill="none" stroke="#222" stroke-width="0.35"/>
    <text x="35" y="${mm(tall + 42)}" text-anchor="middle" font-size="3">50 mm</text>
  </g>
</svg>`;
  }
}
