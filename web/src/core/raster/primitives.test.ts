// The 14 calibration canvases of WP-V1 (references/PACK.md "Primitives", mac/ReferenceExporter/main.swift:525-619)
// drawn on GrayCanvas and compared with the CoreGraphics dumps in references/files (Tier A), plus the larger probes
// in tests/fixtures/primitives/probes, and the worst-case scene of the performance budget.
// The time budget is hard only with PERF=1 (`PERF=1 npx vitest run primitives`), a warning in the `full` tier, skipped in `fast`.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blockMeanDifference, pixelAgreement, THRESHOLDS } from '../../../tests/support/compare';
import { fixtureText } from '../../../tests/support/swiftProbe';
import { FULL, PERF } from '../../../tests/support/tier';
import { sha256 } from '../io/sha256';
import { cos, PI, sin } from '../swift/dmath';
import { ellipsePath, GrayCanvas, rectPath } from './canvas';
import { GrayGradient } from './gradient';
import { decodePGM } from './pgm';
import { Path } from './path';
import { addPathEdges, EdgeTable, rasterize } from './scanline';

const references = new URL('../../../../references/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', references), 'utf8')) as {
  primitives: { name: string; sha256: string }[];
};

function reference(name: string): Uint8Array {
  const record = manifest.primitives.find((p) => p.name === `primitives/${name}.pgm`);
  if (record === undefined) throw new Error(`no primitive ${name}`);
  const bytes = readFileSync(new URL(`files/${record.sha256.slice(0, 2)}/${record.sha256}`, references));
  const image = decodePGM(new Uint8Array(bytes));
  expect([image.width, image.height]).toEqual([64, 64]);
  return image.pixels;
}

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

// [name, needs WP-R1, draw]; the commands and numbers are those of mac/ReferenceExporter/main.swift:525-619.
const PRIMITIVES: readonly (readonly [string, boolean, (c: GrayCanvas) => void])[] = [
  ['circle-r20-gray07', false, (c) => {
    c.setFillGray(0.7);
    c.fillEllipseIn({ x: 12, y: 12, width: 40, height: 40 });
  }],
  ['triangle-aa-off', false, (c) => {
    c.setShouldAntialias(false);
    c.setFillGray(1);
    const p = new Path();
    p.moveTo(6.3, 8.6);
    p.lineTo(58.2, 20.4);
    p.lineTo(21.7, 57.1);
    p.close();
    c.fillPath(p);
  }],
  ['polyline-miter-w6', true, (c) => {
    c.setStrokeGray(1);
    c.setLineWidth(6);
    c.setLineCap('butt');
    c.setLineJoin('miter');
    c.setMiterLimit(10);
    c.strokePath(polyline());
  }],
  ['polyline-round-w6', true, (c) => {
    c.setStrokeGray(0.8);
    c.setLineWidth(6);
    c.setLineCap('round');
    c.setLineJoin('round');
    c.strokePath(polyline());
  }],
  ['cubic-dash-8-5-w4', true, (c) => {
    c.setStrokeGray(1);
    c.setLineWidth(4);
    c.setLineCap('butt');
    c.setLineDash(0, [8, 5]);
    const p = new Path();
    p.moveTo(6, 10);
    p.cubicTo(10, 62, 54, 2, 58, 54);
    c.strokePath(p);
  }],
  ['roundedrect-stroke-w2', true, (c) => {
    c.setStrokeGray(0.9);
    c.setLineWidth(2);
    c.strokePath(Path.roundedRect({ x: 10, y: 14, width: 44, height: 36 }, 8, 8));
  }],
  ['radial-gradient-circle-clip', false, (c) => {
    c.clip(ellipsePath({ x: 8, y: 8, width: 48, height: 48 }));
    c.drawRadialGradient(new GrayGradient([0.9, 0.6]), 26, 38, 20, { drawsAfterEndLocation: true });
  }],
  ['radial-gradient-anisotropic', false, (c) => {
    c.clip(ellipsePath({ x: 4, y: 14, width: 56, height: 36 }));
    c.translateBy(32, 32);
    c.scaleBy(2.2, 1);
    c.drawRadialGradient(new GrayGradient([0.95, 0.2]), 0, 0, 12, { drawsAfterEndLocation: true });
  }],
  ['linear-gradient-rect-clip', false, (c) => {
    c.clip(rectPath({ x: 8, y: 12, width: 48, height: 40 }));
    c.drawLinearGradient(new GrayGradient([0.2, 1]), 20, 20, 44, 44, BOTH);
  }],
  ['nested-aa-clips', false, (c) => {
    c.clip(ellipsePath({ x: 6, y: 10, width: 40, height: 44 }));
    c.clip(ellipsePath({ x: 20, y: 6, width: 38, height: 46 }));
    c.setFillGray(1);
    c.fillRect({ x: 0, y: 0, width: 64, height: 64 });
  }],
  ['moon-r24', false, (c) => {
    c.setFillGray(0.9);
    c.fillPath(moon());
  }],
  ['stroked-copy-fill', true, (c) => {
    c.setStrokeGray(0.75);
    c.setLineWidth(5);
    c.setLineCap('round');
    c.setLineJoin('round');
    c.setMiterLimit(4);
    c.strokePath(polyline());
  }],
  ['dashed-copy-stroke', true, (c) => {
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
  ['overlap-twice-circle', false, (c) => {
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

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('primitives against CoreGraphics', () => {
  it('covers every canvas in the manifest', () => {
    const names = manifest.primitives.map((p) => p.name).filter((n) => n.endsWith('.pgm'));
    expect(names.map((n) => n.slice('primitives/'.length, -'.pgm'.length)).sort()).toEqual(PRIMITIVES.map(([name]) => name).sort());
  });

  // CoreGraphics underestimates arc length on curves, so its dashes drift along the path (SWIFT-DIFF in dash.ts). With
  // true lengths the ends of this widest dash land up to a third of a pixel away, 0.975 at ±2 and 0.99 at ±16.
  const exceptions: Readonly<Record<string, number>> = { 'cubic-dash-8-5-w4': 0.97 };

  for (const [name, , body] of PRIMITIVES) {
    const min = exceptions[name] ?? THRESHOLDS.primitives.min;
    it(`${name}: pixelAgreement(±2) ≥ ${min}`, () => {
      const cg = reference(name);
      const ts = draw(body).pixels;
      expect(pixelAgreement(ts, cg, THRESHOLDS.primitives.tolerance)).toBeGreaterThanOrEqual(min);
      expect(blockMeanDifference(ts, cg, 64, 64, THRESHOLDS.blockMean.block)).toBeLessThanOrEqual(THRESHOLDS.blockMean.max);
    });
  }

  it('leaves the moon without ink at the centre of the bite and fills the crescent', () => {
    const cg = reference('moon-r24');
    const ts = draw((c) => {
      c.setFillGray(0.9);
      c.fillPath(moon());
    }).pixels;
    // The inner circle's centre is (32 + 0.48·24, 32 + 0.28·24); the moon circle's centre lies inside the bite too.
    for (const [x, y] of [[43, 38], [37, 36], [50, 42]] as const) {
      expect(cg[y * 64 + x]).toBe(0);
      expect(ts[y * 64 + x]).toBe(0);
    }
    expect(ts[32 * 64 + 12]).toBe(230);
    expect(cg[32 * 64 + 12]).toBe(230);
  });
});

describe('larger curves against CoreGraphics', () => {
  const probes = fixtureText('primitives/probes/cg-raster.txt.gz');

  function dump(name: string): { width: number; height: number; pixels: Uint8Array } {
    const lines = probes.split('\n');
    const start = lines.findIndex((l) => l.startsWith(`RASTER ${name} `));
    if (start < 0) throw new Error(`no raster ${name}`);
    const [, , w, h] = (lines[start] as string).split(' ');
    const width = Number(w);
    const height = Number(h);
    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = lines[start + 1 + y] as string;
      for (let x = 0; x < width; x++) pixels[y * width + x] = parseInt(row.slice(2 * x, 2 * x + 2), 16);
    }
    return { width, height, pixels };
  }

  for (const r of [2, 5, 10, 20, 40, 80]) {
    it(`circle r = ${r}: every pixel within ±2`, () => {
      const cg = dump(`circle-${r}`);
      const ts = draw((c) => {
        c.setFillGray(1);
        c.fillEllipseIn({ x: 4, y: 4, width: 2 * r, height: 2 * r });
      }, cg.width, cg.height);
      expect(pixelAgreement(ts.pixels, cg.pixels, 2)).toBeGreaterThanOrEqual(0.999);
      expect(pixelAgreement(ts.pixels, cg.pixels, 5)).toBe(1);
    });
  }

  it('free cubics and quads agree on ±2 and stay within a few levels', () => {
    const cubic = new Path();
    cubic.moveTo(20, 30);
    cubic.cubicTo(60, 250, 180, -40, 230, 60);
    cubic.cubicTo(300, 180, 100, 300, 60, 220);
    cubic.close();
    const quad = new Path();
    quad.moveTo(20, 30);
    quad.quadTo(120, 280, 230, 60);
    quad.quadTo(250, 300, 40, 230);
    quad.close();
    for (const [name, path] of [['cubic-blob', cubic], ['quad-blob', quad]] as const) {
      const cg = dump(name);
      const ts = draw((c) => {
        c.setFillGray(1);
        c.fillPath(path);
      }, 256, 256);
      expect(pixelAgreement(ts.pixels, cg.pixels, 2), name).toBeGreaterThanOrEqual(0.995);
      expect(pixelAgreement(ts.pixels, cg.pixels, 16), name).toBe(1);
    }
  });

  it('rasterize and the canvas agree', () => {
    const edges = new EdgeTable();
    addPathEdges(edges, moon(), { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    const coverage = rasterize(edges, { x0: 0, y0: 0, x1: 64, y1: 64 }, { antialias: true, rule: 'nonzero' });
    const c = draw((canvas) => {
      canvas.setFillGray(1);
      canvas.fillPath(moon());
    });
    expect(c.pixels).toEqual(coverage.pixels);
  });
});

describe('determinism', () => {
  // Written once on the reference machine; the cross-engine run of WP-R6 reads the same file. Refresh it with
  // UPDATE_RASTER_HASHES=1 npx vitest run src/core/raster/primitives.test.ts after an intended rasterizer change.
  const hashesUrl = new URL('../../../tests/fixtures/hashes.json', import.meta.url);

  it('matches the hashes in tests/fixtures/hashes.json', () => {
    const current: Record<string, string> = {};
    for (const [name, needsR1, body] of PRIMITIVES) {
      if (!needsR1) current[`primitive/${name}`] = hex(sha256(draw(body).pixels));
    }
    current['scene/worst-case-3072x1200'] = hex(sha256(draw(worstCaseScene, 3072, 1200).pixels));
    if (process.env['UPDATE_RASTER_HASHES'] === '1') {
      writeFileSync(hashesUrl, `${JSON.stringify(current, null, 2)}\n`);
    }
    const stored = JSON.parse(readFileSync(hashesUrl, 'utf8')) as Record<string, string>;
    expect(current).toEqual(Object.fromEntries(Object.keys(current).map((k) => [k, stored[k]])));
  });

  it('draws the same bytes twice in one process', () => {
    const a = draw(PRIMITIVES.find(([n]) => n === 'radial-gradient-anisotropic')?.[2] as (c: GrayCanvas) => void);
    draw(worstCaseScene, 3072, 1200);
    const b = draw(PRIMITIVES.find(([n]) => n === 'radial-gradient-anisotropic')?.[2] as (c: GrayCanvas) => void);
    expect(a.pixels).toEqual(b.pixels);
  });
});

describe('performance', () => {
  it('draws the worst-case scene inside the budget', () => {
    const c = new GrayCanvas(3072, 1200);
    expect(worstCaseScene(c)).toBe(700);
    if (!PERF && !FULL) return;
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const fresh = new GrayCanvas(3072, 1200);
      const start = performance.now();
      worstCaseScene(fresh);
      times.push(performance.now() - start);
    }
    const best = Math.min(...times);
    // Plan budget: under 0.6 s in Node, measured on purpose with PERF=1. Every other run only gets the soft gate of §7
    // (3 s), as a warning: CI runners and a machine full of parallel test runs share their cores.
    if (PERF) expect(best).toBeLessThan(600);
    else if (best >= 3000) console.warn(`worst-case scene: ${best.toFixed(0)} ms, soft gate 3000 ms`);
  }, 60_000);
});
