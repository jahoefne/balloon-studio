// Coverage rules of scanline.ts against CoreGraphics' measured behaviour (tests/fixtures/primitives/probes).
import { describe, expect, it } from 'vitest';
import { probeSection, fixtureText } from '../../../tests/support/swiftProbe';
import { IDENTITY, scaling, translation } from './affine';
import { Path } from './path';
import { addPathEdges, EdgeTable, edgeBounds, intersectPixelRects, rasterize, S, snapCoordinate, type FillRule } from './scanline';

const probes = fixtureText('primitives/probes/cg-raster.txt.gz');

function polygon(edges: EdgeTable, points: readonly (readonly [number, number])[]): void {
  points.forEach(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length] as readonly [number, number];
    edges.addLine(x, y, nx, ny);
  });
}

function rectangle(edges: EdgeTable, x0: number, y0: number, x1: number, y1: number, ccw = true): void {
  polygon(edges, ccw ? [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] : [[x0, y0], [x0, y1], [x1, y1], [x1, y0]]);
}

const AA = { antialias: true, rule: 'nonzero' } as const;
const WHOLE = (w: number, h: number) => ({ x0: 0, y0: 0, x1: w, y1: h });

describe('EdgeTable', () => {
  it('snaps to 1/256 px, half up', () => {
    expect(snapCoordinate(1 / 512)).toBe(1 / 256);
    expect(snapCoordinate(0.999 / 512)).toBe(0);
    expect(snapCoordinate(-1 / 512)).toBe(0);
    const edges = new EdgeTable();
    edges.addLine(3.999, 2.999, 5.001, 5.001);
    expect(edgeBounds(edges)).toEqual({ x0: 4, y0: 3, x1: 5, y1: 5 });
  });

  it('drops horizontal edges but keeps their vertices in the bounds', () => {
    const edges = new EdgeTable();
    edges.addLine(1, 2, 9, 2);
    expect(edges.count).toBe(0);
    expect(edgeBounds(edges)).toEqual({ x0: 1, y0: 2, x1: 9, y1: 2 });
  });

  it('grows past its initial capacity', () => {
    const edges = new EdgeTable();
    for (let i = 0; i < 1000; i++) edges.addLine(i, 0, i, 10);
    expect(edges.count).toBe(1000);
    expect(edges.xTop[999]).toBe(999);
  });

  it('has an empty rectangle while empty', () => {
    expect(edgeBounds(new EdgeTable())).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
  });
});

describe('antialiased coverage', () => {
  it('matches CoreGraphics for a fractional vertical edge within a gray level', () => {
    for (const line of probeSection(probes, 'EDGE_X')) {
      if (line === '') continue;
      const [i, cg] = line.split(' ').map(Number) as [number, number];
      const edges = new EdgeTable();
      rectangle(edges, 4 + i / 64, 2, 12, 10);
      const { pixels } = rasterize(edges, WHOLE(16, 16), AA);
      expect(Math.abs((pixels[5 * 16 + 4] as number) - cg), `f=${i}/64`).toBeLessThanOrEqual(1);
    }
  });

  it('matches CoreGraphics for a fractional horizontal edge within a gray level', () => {
    for (const line of probeSection(probes, 'EDGE_Y')) {
      if (line === '') continue;
      const [i, cg] = line.split(' ').map(Number) as [number, number];
      const edges = new EdgeTable();
      rectangle(edges, 2, 4 + i / 64, 10, 12);
      const { pixels } = rasterize(edges, WHOLE(16, 16), AA);
      expect(Math.abs((pixels[4 * 16 + 5] as number) - cg), `f=${i}/64`).toBeLessThanOrEqual(1);
    }
  });

  it('computes the exact area of a shallow edge, which S uniform sample lines could not', () => {
    // CoreGraphics: y = 1.1 + 0.0125·x over row 1 gives 228 224 221 … 27.
    const edges = new EdgeTable();
    polygon(edges, [[0, 1.1], [64, 1.9], [64, 4], [0, 4]]);
    const { pixels } = rasterize(edges, WHOLE(64, 4), AA);
    for (let x = 0; x < 64; x++) {
      const exact = (1 - (0.1 + 0.0125 * (x + 0.5))) * 255;
      expect(Math.abs((pixels[64 + x] as number) - exact)).toBeLessThanOrEqual(1);
    }
  });

  it('gives the union of subpaths meeting inside one pixel, as CoreGraphics does', () => {
    const shapes: Record<string, { rule: FillRule; build: (e: EdgeTable) => void }> = {
      'right-edges-0.5-0.25': { rule: 'nonzero', build: (e) => { rectangle(e, 2, 0, 8.5, 8); rectangle(e, 4, 0, 8.25, 8); } },
      'left-edges-0.5-0.25': { rule: 'nonzero', build: (e) => { rectangle(e, 8.5, 0, 14, 8); rectangle(e, 8.25, 0, 12, 8); } },
      'abutting-at-8.4': { rule: 'nonzero', build: (e) => { rectangle(e, 2, 0, 8.4, 8); rectangle(e, 8.4, 0, 14, 8); } },
      'overlap-0.6-0.7': { rule: 'nonzero', build: (e) => { rectangle(e, 2, 0, 8.6, 8); rectangle(e, 8.3, 0, 14, 8); } },
      'gap-8.3-8.6': { rule: 'nonzero', build: (e) => { rectangle(e, 2, 0, 8.3, 8); rectangle(e, 8.6, 0, 14, 8); } },
      'opposite-directions': { rule: 'nonzero', build: (e) => { rectangle(e, 2, 0, 10.5, 8); rectangle(e, 6.25, 0, 14, 8, false); } },
      evenodd: { rule: 'evenodd', build: (e) => { rectangle(e, 2, 0, 10.5, 8); rectangle(e, 6.25, 0, 14, 8); } },
      'same-rect-twice': { rule: 'nonzero', build: (e) => { rectangle(e, 2, 0, 8.5, 8); rectangle(e, 2, 0, 8.5, 8); } },
      'same-rect-opposite': { rule: 'nonzero', build: (e) => { rectangle(e, 2, 0, 8.5, 8); rectangle(e, 2, 0, 8.5, 8, false); } },
    };
    const lines = probeSection(probes, 'UNION').filter((l) => l !== '');
    expect(lines).toHaveLength(Object.keys(shapes).length);
    for (const line of lines) {
      const [name, ...values] = line.split(' ') as [string, ...string[]];
      const shape = shapes[name];
      if (shape === undefined) throw new Error(`no shape for ${name}`);
      const edges = new EdgeTable();
      shape.build(edges);
      const { pixels } = rasterize(edges, WHOLE(16, 8), { antialias: true, rule: shape.rule });
      const row = Array.from(pixels.subarray(32, 48));
      row.forEach((v, x) => expect(Math.abs(v - Number(values[x])), `${name} x=${x}`).toBeLessThanOrEqual(1));
    }
  });

  it('resolves edges that cross inside a row: a bow-tie has the area of its two triangles', () => {
    const edges = new EdgeTable();
    polygon(edges, [[0, 0], [8, 8], [0, 8], [8, 0]]);
    const { pixels } = rasterize(edges, WHOLE(8, 8), AA);
    // Nonzero and even-odd agree here: left and right triangles meet at (4, 4). Each row is symmetric.
    let area = 0;
    for (const v of pixels) area += v;
    expect(area / 255).toBeCloseTo(32, 0);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(pixels[y * 8 + x]).toBe(pixels[y * 8 + 7 - x]);
        expect(pixels[y * 8 + x]).toBe(pixels[(7 - y) * 8 + x]);
      }
    }
  });

  it('keeps the crossing fallback at S sub-bands: two crossing strokes stay within a sixteenth of a row', () => {
    expect(S).toBe(16);
    const edges = new EdgeTable();
    polygon(edges, [[0, 1], [16, 3], [16, 4], [0, 2]]);
    polygon(edges, [[0, 3], [16, 1], [16, 2], [0, 4]]);
    const { pixels } = rasterize(edges, WHOLE(16, 6), AA);
    // Sampled at 64 rows per pixel for comparison.
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 16; x++) {
        let inside = 0;
        for (let j = 0; j < 64; j++) {
          for (let i = 0; i < 64; i++) {
            const px = x + (i + 0.5) / 64;
            const py = y + (j + 0.5) / 64;
            const a = py >= 1 + px / 8 && py < 2 + px / 8;
            const b = py >= 3 - px / 8 && py < 4 - px / 8;
            if (a || b) inside++;
          }
        }
        expect(Math.abs((pixels[y * 16 + x] as number) - (inside / 4096) * 255), `(${x}, ${y})`).toBeLessThanOrEqual(8);
      }
    }
  });

  it('clips to the bounds without changing what stays visible', () => {
    const edges = new EdgeTable();
    polygon(edges, [[-20.3, -7.1], [50.2, 3.3], [30.7, 44.9], [-5.5, 30.1]]);
    const full = rasterize(edges, { x0: -32, y0: -16, x1: 64, y1: 64 }, AA);
    const window = { x0: 3, y0: 5, x1: 21, y1: 19 };
    const part = rasterize(edges, window, AA);
    for (let y = window.y0; y < window.y1; y++) {
      for (let x = window.x0; x < window.x1; x++) {
        expect(part.pixels[(y - window.y0) * 18 + x - window.x0]).toBe(full.pixels[(y + 16) * 96 + x + 32]);
      }
    }
    expect(rasterize(edges, { x0: 100, y0: 100, x1: 104, y1: 104 }, AA).pixels.every((v) => v === 0)).toBe(true);
  });

  it('fills up to the window edge when a span ends beyond it', () => {
    const edges = new EdgeTable();
    rectangle(edges, 2.5, 0, 100, 2);
    const { pixels } = rasterize(edges, WHOLE(6, 2), AA);
    expect(Array.from(pixels.subarray(0, 6))).toEqual([0, 0, 128, 255, 255, 255]);
    const left = new EdgeTable();
    rectangle(left, -100, 0, 3.5, 2);
    expect(Array.from(rasterize(left, WHOLE(6, 2), AA).pixels.subarray(0, 6))).toEqual([255, 255, 255, 128, 0, 0]);
  });

  it('spreads a side crossing the window edge over the pixels it passes', () => {
    const edges = new EdgeTable();
    polygon(edges, [[-4, 0], [4, 1], [40, 1], [40, 0]]);
    const { pixels } = rasterize(edges, WHOLE(8, 1), AA);
    for (let x = 0; x < 4; x++) {
      expect(Math.abs((pixels[x] as number) - ((4 + x + 0.5) / 8) * 255)).toBeLessThanOrEqual(1);
    }
    expect(Array.from(pixels.subarray(4, 8))).toEqual([255, 255, 255, 255]);
  });

  it('leaves nothing behind for the next call in the shared scratch', () => {
    const big = new EdgeTable();
    polygon(big, [[0.3, 0.2], [30.4, 2.1], [12.7, 19.5]]);
    const small = new EdgeTable();
    rectangle(small, 1.5, 1.5, 3.5, 3.5);
    const first = rasterize(small, WHOLE(5, 5), AA).pixels.slice();
    rasterize(big, WHOLE(32, 32), AA);
    expect(rasterize(small, WHOLE(5, 5), AA).pixels).toEqual(first);
  });
});

describe('antialias off', () => {
  function grid(bytes: string): number[] {
    return Array.from({ length: bytes.length / 2 }, (_, i) => parseInt(bytes.slice(2 * i, 2 * i + 2), 16));
  }

  // The same shapes as cg-raster.swift `aliased`.
  const shapes: Record<string, { rule: FillRule; build: (e: EdgeTable) => void }> = {
    'tiny-inside-a-pixel': { rule: 'nonzero', build: (e) => rectangle(e, 4.1, 4.1, 4.2, 4.2) },
    'thin-column': { rule: 'nonzero', build: (e) => rectangle(e, 4.1, 2, 4.4, 6) },
    'straddling-a-corner': { rule: 'nonzero', build: (e) => rectangle(e, 3.9, 2.9, 4.1, 3.1) },
    'below-the-snap': { rule: 'nonzero', build: (e) => rectangle(e, 3.999, 2.999, 5.001, 5.001) },
    'above-the-snap': { rule: 'nonzero', build: (e) => rectangle(e, 3.99, 2.99, 5.01, 5.01) },
    'half-pixel-rect': { rule: 'nonzero', build: (e) => rectangle(e, 3.5, 2.5, 5.5, 5.5) },
    'integer-rect': { rule: 'nonzero', build: (e) => rectangle(e, 4, 3, 6, 5) },
    triangle: { rule: 'nonzero', build: (e) => polygon(e, [[2.9, 1], [7.1, 1], [5, 6.3]]) },
    'thin-diagonal': { rule: 'nonzero', build: (e) => polygon(e, [[1.2, 1.2], [9.3, 6.7], [9.3, 6.9], [1.2, 1.4]]) },
    'evenodd-hole': { rule: 'evenodd', build: (e) => { rectangle(e, 1.5, 1.5, 8.5, 6.5); rectangle(e, 3.5, 2.5, 6.5, 5.5); } },
    'gap-inside-a-pixel': { rule: 'nonzero', build: (e) => { rectangle(e, 1.5, 1.5, 4.3, 6.5); rectangle(e, 4.6, 1.5, 8.5, 6.5); } },
  };

  it('sets exactly the pixels CoreGraphics sets, which are all it touches and not its centres', () => {
    const lines = probeSection(probes, 'ALIASED').filter((l) => l !== '');
    expect(lines).toHaveLength(Object.keys(shapes).length);
    for (const line of lines) {
      const [name, bytes] = line.split(' ') as [string, string];
      const shape = shapes[name];
      if (shape === undefined) throw new Error(`no shape for ${name}`);
      const edges = new EdgeTable();
      shape.build(edges);
      const { pixels } = rasterize(edges, WHOLE(10, 8), { antialias: false, rule: shape.rule });
      if (name === 'below-the-snap') {
        // CoreGraphics keeps an edge 0.001 px past a pixel boundary on the far side in its y-up device space (one
        // more column and row), where the snap here has already moved it onto the boundary. Documented in scanline.ts.
        const expected = grid(bytes).filter((v) => v > 0).length;
        expect(expected).toBe(6);
        expect(pixels.filter((v) => v > 0)).toHaveLength(2);
      } else {
        expect(Array.from(pixels), name).toEqual(grid(bytes));
      }
    }
  });

  it('writes only 0 and 255 and reports each row without gaps from the previous one', () => {
    const edges = new EdgeTable();
    rectangle(edges, 1.5, 0.5, 2.5, 3.5);
    rectangle(edges, 6.5, 1.5, 7.5, 2.5);
    const { pixels } = rasterize(edges, WHOLE(10, 4), { antialias: false, rule: 'nonzero' });
    expect(new Set(pixels)).toEqual(new Set([0, 255]));
    expect(Array.from(pixels.subarray(10, 20))).toEqual([0, 255, 255, 0, 0, 0, 255, 255, 0, 0]);
    expect(Array.from(pixels.subarray(0, 10))).toEqual([0, 255, 255, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('addPathEdges', () => {
  it('closes open subpaths and maps by the transform', () => {
    const p = new Path();
    p.moveTo(1, 1);
    p.lineTo(3, 1);
    p.lineTo(3, 3);
    p.moveTo(10, 10);
    p.lineTo(12, 10);
    p.lineTo(12, 12);
    const edges = new EdgeTable();
    addPathEdges(edges, p, translation(0.5, 0));
    // Right side, closing diagonal, then the same for the second subpath; the horizontal edges drop out.
    expect(edges.count).toBe(4);
    expect(edgeBounds(edges)).toEqual({ x0: 1, y0: 1, x1: 13, y1: 12 });
  });

  it('bisects a quarter circle into the chord counts CoreGraphics uses', () => {
    const k = 0.5522847498;
    for (const [r, chords] of [[2, 4], [5, 8], [20, 16], [80, 32], [320, 64]] as const) {
      const p = new Path();
      p.moveTo(r, 0);
      p.cubicTo(r, r * k, r * k, r, 0, r);
      const edges = new EdgeTable();
      addPathEdges(edges, p, IDENTITY);
      // Plus the closing edge, which is a diagonal.
      expect(edges.count, `r=${r}`).toBe(chords + 1);
    }
  });

  it('flattens in device space: a curve drawn small and scaled up gets the chords of its device size', () => {
    const k = 0.5522847498;
    const p = new Path();
    p.moveTo(1, 0);
    p.cubicTo(1, k, k, 1, 0, 1);
    const edges = new EdgeTable();
    addPathEdges(edges, p, scaling(80, 80));
    expect(edges.count).toBe(33);
  });

  it('lets a quad end exactly at its end point', () => {
    const p = new Path();
    p.moveTo(0, 0);
    p.quadTo(50, 100, 100, 0);
    p.close();
    const edges = new EdgeTable();
    addPathEdges(edges, p, IDENTITY);
    expect(edgeBounds(edges)).toEqual({ x0: 0, y0: 0, x1: 100, y1: 50 });
  });
});

describe('pixel rectangles', () => {
  it('intersect', () => {
    expect(intersectPixelRects({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 5, y0: -3, x1: 20, y1: 4 })).toEqual({ x0: 5, y0: 0, x1: 10, y1: 4 });
  });
});
