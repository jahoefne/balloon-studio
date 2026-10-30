// The rasters behind tests/fixtures/hashes.json, keyed like that file, for tests/hashes.test.ts. No Node APIs: the same
// module runs in Node and in Chromium, Firefox and WebKit (npm run test:browser).
//
// The primitive/* and scene/* drawings are those of src/core/raster/primitives.test.ts, which is not importable here
// (it needs node:fs and defines tests). Both compare with hashes.json, so a change to one copy alone fails.
//
// To add a raster: a line in RASTER_SCENES, then tests/fixtures/README.md, "Hashes".
import { ellipsePath, GrayCanvas, rectPath } from '../../src/core/raster/canvas';
import { GrayGradient } from '../../src/core/raster/gradient';
import { Path } from '../../src/core/raster/path';
import { cos, PI, sin } from '../../src/core/swift/dmath';

const BOTH = { drawsBeforeStartLocation: true, drawsAfterEndLocation: true } as const;
const POLYLINE = [[8, 12], [30, 52], [40, 20], [57, 30]] as const;

function polyline(): Path {
  const p = new Path();
  POLYLINE.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  return p;
}

// CoreGraphics' element list of the moon at r = 1 around the origin (path.test.ts), which does not depend on addArc.
function moon(): Path {
  const r = 24;
  const at = (v: number): number => 32 + v * r;
  const p = new Path();
  p.moveTo(at(-0.04452564107981014), at(0.999008241851103));
  p.cubicTo(at(-0.5962626579786845), at(0.9744174093076555), at(-1.0235990743945507), at(0.5072113758190642), at(-0.999008241851103), at(-0.04452564107981014));
  p.cubicTo(at(-0.9744174093076555), at(-0.5962626579786845), at(-0.5072113758190642), at(-1.0235990743945507), at(0.04452564107981014), at(-0.999008241851103));
  p.cubicTo(at(0.37298673351842954), at(-0.9843687823372304), at(0.673265366572041), at(-0.8092062463892905), at(0.8476862628414681), at(-0.5304978791568027));
  p.lineTo(at(0.8476862628414681), at(-0.5304978791568026));
  p.cubicTo(at(0.4000606444379227), at(-0.7335653948350997), at(-0.12743036347850542), at(-0.5353118812450134), at(-0.3304978791568026), at(-0.08768626284146802));
  p.cubicTo(at(-0.5048033906160255), at(0.29653871818251387), at(-0.38537900440845124), at(0.750351385771296), at(-0.04452564107981016), at(0.9990082418511032));
  p.close();
  return p;
}


// [name, draw]; the commands and numbers are those of mac/ReferenceExporter/main.swift:525-619.
const PRIMITIVES: readonly (readonly [string, (c: GrayCanvas) => void])[] = [
  ['circle-r20-gray07', (c) => {
    c.setFillGray(0.7);
    c.fillEllipseIn({ x: 12, y: 12, width: 40, height: 40 });
  }],
  ['triangle-aa-off', (c) => {
    c.setShouldAntialias(false);
    c.setFillGray(1);
    const p = new Path();
    p.moveTo(6.3, 8.6);
    p.lineTo(58.2, 20.4);
    p.lineTo(21.7, 57.1);
    p.close();
    c.fillPath(p);
  }],
  ['polyline-miter-w6', (c) => {
    c.setStrokeGray(1);
    c.setLineWidth(6);
    c.setLineCap('butt');
    c.setLineJoin('miter');
    c.setMiterLimit(10);
    c.strokePath(polyline());
  }],
  ['polyline-round-w6', (c) => {
    c.setStrokeGray(0.8);
    c.setLineWidth(6);
    c.setLineCap('round');
    c.setLineJoin('round');
    c.strokePath(polyline());
  }],
  ['cubic-dash-8-5-w4', (c) => {
    c.setStrokeGray(1);
    c.setLineWidth(4);
    c.setLineCap('butt');
    c.setLineDash(0, [8, 5]);
    const p = new Path();
    p.moveTo(6, 10);
    p.cubicTo(10, 62, 54, 2, 58, 54);
    c.strokePath(p);
  }],
  ['roundedrect-stroke-w2', (c) => {
    c.setStrokeGray(0.9);
    c.setLineWidth(2);
    c.strokePath(Path.roundedRect({ x: 10, y: 14, width: 44, height: 36 }, 8, 8));
  }],
  ['radial-gradient-circle-clip', (c) => {
    c.clip(ellipsePath({ x: 8, y: 8, width: 48, height: 48 }));
    c.drawRadialGradient(new GrayGradient([0.9, 0.6]), 26, 38, 20, { drawsAfterEndLocation: true });
  }],
  ['radial-gradient-anisotropic', (c) => {
    c.clip(ellipsePath({ x: 4, y: 14, width: 56, height: 36 }));
    c.translateBy(32, 32);
    c.scaleBy(2.2, 1);
    c.drawRadialGradient(new GrayGradient([0.95, 0.2]), 0, 0, 12, { drawsAfterEndLocation: true });
  }],
  ['linear-gradient-rect-clip', (c) => {
    c.clip(rectPath({ x: 8, y: 12, width: 48, height: 40 }));
    c.drawLinearGradient(new GrayGradient([0.2, 1]), 20, 20, 44, 44, BOTH);
  }],
  ['nested-aa-clips', (c) => {
    c.clip(ellipsePath({ x: 6, y: 10, width: 40, height: 44 }));
    c.clip(ellipsePath({ x: 20, y: 6, width: 38, height: 46 }));
    c.setFillGray(1);
    c.fillRect({ x: 0, y: 0, width: 64, height: 64 });
  }],
  ['moon-r24', (c) => {
    c.setFillGray(0.9);
    c.fillPath(moon());
  }],
  ['stroked-copy-fill', (c) => {
    c.setStrokeGray(0.75);
    c.setLineWidth(5);
    c.setLineCap('round');
    c.setLineJoin('round');
    c.setMiterLimit(4);
    c.strokePath(polyline());
  }],
  ['dashed-copy-stroke', (c) => {
    c.setStrokeGray(0.32);
    c.setLineWidth(1.4);
    c.setLineCap('round');
    c.setLineJoin('round');
    c.setMiterLimit(4);
    c.setLineDash(0, [3.4, 2.8]);
    const p = new Path();
    p.moveTo(6, 32);
    p.cubicTo(20, 58, 44, 6, 58, 32);
    c.strokePath(p);
  }],
  ['overlap-twice-circle', (c) => {
    c.setFillGray(0.7);
    c.fillEllipseIn({ x: 12, y: 12, width: 40, height: 40 });
    c.fillEllipseIn({ x: 12, y: 12, width: 40, height: 40 });
  }],
];

function draw(body: (c: GrayCanvas) => void, width = 64, height = 64): GrayCanvas {
  const c = new GrayCanvas(width, height);
  body(c);
  return c;
}

// The worst case of the budget in docs/plan.md §7: 3072 × 1200, about 700 primitives, about 18 Mpx of compositing.
function worstCaseScene(c: GrayCanvas): number {
  let seed = 0x2545f491;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let primitives = 0;
  // Sky, haze and ground: whole-canvas gradients, as Summit's rounded() and groundFill() are at their largest.
  for (let i = 0; i < 3; i++) {
    c.drawLinearGradient(new GrayGradient([0.05 + i * 0.1, 0.2 + i * 0.1]), 0, 0, 40 * i, 1200, BOTH);
    primitives++;
  }
  // Mountains: a clip with a warped outline, a linear gradient, then lit faces inside it.
  for (let m = 0; m < 12; m++) {
    const mountain = new Path();
    const x0 = m * 256 - 200;
    const peak = 700 + random() * 500;
    mountain.moveTo(x0, 0);
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      const ridge = peak * (1 - Math.abs(2 * u - 1)) + 18 * sin(u * 37 + m);
      mountain.lineTo(x0 + u * 700, ridge > 0 ? ridge : 0);
    }
    mountain.close();
    c.save();
    c.clip(mountain);
    c.drawLinearGradient(new GrayGradient([0.3 + random() * 0.2, 0.7 + random() * 0.2]), x0, 0, x0 + 40, peak, BOTH);
    primitives++;
    for (let f = 0; f < 12; f++) {
      const face = new Path();
      const fx = x0 + random() * 700;
      const fy = random() * peak;
      face.moveTo(fx, fy);
      for (let i = 1; i < 32; i++) face.lineTo(fx + i * 14 + 30 * sin(i + f), fy + 180 * cos(i * 0.7 + f));
      face.close();
      c.setFillGray(0.3 + random() * 0.6);
      c.fillPath(face);
      primitives++;
    }
    c.restore();
  }
  // Cable: a polyline stroked as the stroker emits it, one rectangle plus one disc per segment, nonzero.
  const cable = new Path();
  for (let i = 0; i < 240; i++) {
    const x = (i / 240) * 3072;
    const y = 1000 - 200 * sin((i / 240) * 6);
    const nx = ((i + 1) / 240) * 3072;
    const ny = 1000 - 200 * sin(((i + 1) / 240) * 6);
    const dx = nx - x;
    const dy = ny - y;
    const l = Math.sqrt(dx * dx + dy * dy);
    const hx = (-dy / l) * 5;
    const hy = (dx / l) * 5;
    cable.moveTo(x + hx, y + hy);
    cable.lineTo(x - hx, y - hy);
    cable.lineTo(nx - hx, ny - hy);
    cable.lineTo(nx + hx, ny + hy);
    cable.close();
    cable.addPath(ellipsePath({ x: x - 5, y: y - 5, width: 10, height: 10 }));
  }
  c.setFillGray(0.88);
  c.fillPath(cable);
  primitives++;
  // Cabins, stars and clouds: small shapes, rounded gradients under an anisotropic CTM, nested clips.
  while (primitives < 700) {
    const x = random() * 3072;
    const y = random() * 1200;
    const size = 6 + random() * 40;
    const kind = primitives % 5;
    if (kind === 0) {
      c.save();
      c.clip(ellipsePath({ x: x - size, y: y - size, width: 2 * size, height: 2 * size }));
      c.translateBy(x, y);
      c.scaleBy(1.2 + random(), 1);
      c.drawRadialGradient(new GrayGradient([0.9, 0.5]), 0, 0, size, { drawsAfterEndLocation: true });
      c.restore();
    } else if (kind === 1) {
      c.save();
      c.clip(ellipsePath({ x: x - size, y: y - size, width: 2 * size, height: 2 * size }));
      c.clip(ellipsePath({ x: x, y: y - size, width: 2 * size, height: 2 * size }));
      c.setFillGray(random());
      c.fillRect({ x: x - size, y: y - size, width: 3 * size, height: 2 * size });
      c.restore();
    } else if (kind === 2) {
      const star = new Path();
      for (let i = 0; i < 10; i++) {
        const a = (i * PI) / 5;
        const r = i % 2 === 0 ? size : size / 2.5;
        if (i === 0) star.moveTo(x + r * cos(a), y + r * sin(a));
        else star.lineTo(x + r * cos(a), y + r * sin(a));
      }
      star.close();
      c.setFillGray(random());
      c.fillPath(star);
    } else {
      c.setFillGray(random());
      c.fillEllipseIn({ x: x - 3 * size, y: y - size, width: 6 * size, height: 2 * size });
    }
    primitives++;
  }
  return primitives;
}

/** Each entry draws its raster from scratch and returns the bytes that get hashed. */
export const RASTER_SCENES: Readonly<Record<string, () => Uint8Array>> = {
  ...Object.fromEntries(PRIMITIVES.map(([name, body]) => [`primitive/${name}`, () => draw(body).pixels])),
  'scene/worst-case-3072x1200': () => draw(worstCaseScene, 3072, 1200).pixels,
};
