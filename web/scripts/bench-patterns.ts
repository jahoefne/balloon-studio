// `npm run bench:patterns`: what the raster patterns cost on the three balloon shapes, bundled like the
// app, because vitest doubles core timings (plan §15). The target of plan §7 is at most 1.5 s per
// pattern for `total` (draw + tables): over it exits 1 locally and only warns on CI (plan: soft gate).
// BENCH_ROUNDS (default 3). Writes the rows to `patternBench` in references/report.json.
//
// draw:     Text: the mask. Reliefs: the artwork.
// tables:   Text: the mask's summed-area table. Reliefs: both blur passes, coverage and boundaries.
// total:    the whole raster stage, BalloonTextLayout or NightFlightRelief; `first` is its first round.
// preview:  the whole core.balloon.preview, for a mesh that is already generated, which is what a
//           change of pattern costs in the app.
// export:   the whole core.balloon.export, at export quality, 3MF included.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { core } from '#core';
import { drawNightFlight } from '../src/core/artwork/nightFlightArtwork';
import { drawSummitCableCar } from '../src/core/artwork/summitCableCarArtwork';
import { generate } from '../src/core/balloon/balloonGenerator';
import { NightFlightRelief } from '../src/core/patterns/nightFlightRelief';
import { type ReliefArtwork, type TextRasterizer } from '../src/core/patterns/raster';
import { BalloonTextLayout } from '../src/core/patterns/textLayout';
import { loadFontSet } from '../src/core/text/fontSet';
import { createTextRasterizer } from '../src/core/text/textMask';
import type { BalloonParameters, BalloonPattern, PatternSettings } from '../src/core/types';

const TARGET_MS = 1500;
const REGRESSION_LIMIT = 1.25;

// The bundle runs from web/node_modules/.bench.
const root = new URL('../../../', import.meta.url);
const loader = async (file: string) => new Uint8Array(readFileSync(new URL(`web/public/fonts/${file}`, root)));

await core.prepare(loader);
const rasterizer = createTextRasterizer(await loadFontSet(loader));

const rounds = Number(process.env['BENCH_ROUNDS'] ?? 3);
const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[values.length >> 1] as number;
const api = core.balloon;
const SHAPES: readonly (readonly [string, BalloonParameters])[] = [
  ['classic', api.presets.classic],
  ['round', api.presets.round],
  ['tall', api.presets.tall],
];
const PATTERNS: readonly (readonly [string, BalloonPattern])[] = [
  ['text', 'Text'],
  ['night-flight', 'Night Flight'],
  ['summit-cable-car', 'Summit Cable Car'],
];

const timed = <T>(body: () => T): [T, number] => {
  const started = performance.now();
  const result = body();
  return [result, performance.now() - started];
};

/** The raster stage: `drawMs` is spent inside the seam, `ms` in all of it. */
const rasterStage = (style: BalloonPattern, settings: PatternSettings, p: BalloonParameters): { drawMs: number; ms: number } => {
  let drawMs = 0;
  if (style === 'Text') {
    const countingMask: TextRasterizer = (text, font) => {
      const [mask, ms] = timed(() => rasterizer(text, font));
      drawMs += ms;
      return mask;
    };
    const [, ms] = timed(() => BalloonTextLayout.create(settings, p, countingMask));
    return { drawMs, ms };
  }
  const counted = (artwork: ReliefArtwork): ReliefArtwork => (...args) => {
    const [pixels, ms] = timed(() => artwork(...args));
    drawMs += ms;
    return pixels;
  };
  const mesh = generate(p, 'preview');
  const artworks = { nightFlight: counted(drawNightFlight), summitCableCar: counted(drawSummitCableCar) };
  const [, ms] = timed(() => new NightFlightRelief(settings, p, mesh, { artworks }));
  return { drawMs, ms };
};

/** Wall and CPU time of `body`. */
const measured = <T>(body: () => T): { result: T; wallMs: number; cpuMs: number } => {
  const cpu = process.cpuUsage();
  const [result, wallMs] = timed(body);
  const used = process.cpuUsage(cpu);
  return { result, wallMs, cpuMs: (used.user + used.system) / 1000 };
};

interface Row {
  id: string;
  /** `total` of the first round, before the JIT has warmed up on this shape. */
  firstMs: number;
  drawMs: number;
  tablesMs: number;
  totalMs: number;
  totalCpuMs: number;
  previewMs: number;
  previewCpuMs: number;
  exportMs: number;
  exportCpuMs: number;
}

const rows: Row[] = [];
for (const [patternName, style] of PATTERNS) {
  for (const [shapeName, preset] of SHAPES) {
    const p = api.normalize(preset);
    const settings = api.pattern.normalize({ ...api.pattern.defaults, style }, p);
    const snapshot = { parameters: p, pattern: settings, purge: api.purge.defaults };
    const stages: ReturnType<typeof measured<ReturnType<typeof rasterStage>>>[] = [];
    const previews: ReturnType<typeof measured<unknown>>[] = [];
    const exports: ReturnType<typeof measured<unknown>>[] = [];
    // Generates the mesh `core.balloon.preview` keeps, so the rounds below time a change of pattern.
    api.preview({ ...snapshot, pattern: api.pattern.defaults });
    for (let round = 0; round < rounds; round++) {
      stages.push(measured(() => rasterStage(style, settings, p)));
      previews.push(measured(() => api.preview(snapshot)));
      exports.push(measured(() => api.export(snapshot)));
    }
    const drawMs = median(stages.map((stage) => stage.result.drawMs));
    const totalMs = median(stages.map((stage) => stage.result.ms));
    rows.push({
      id: `pattern/${patternName}/${shapeName}`,
      firstMs: (stages[0] as (typeof stages)[number]).result.ms,
      drawMs,
      tablesMs: totalMs - drawMs,
      totalMs,
      totalCpuMs: median(stages.map((stage) => stage.cpuMs)),
      previewMs: median(previews.map((run) => run.wallMs)),
      previewCpuMs: median(previews.map((run) => run.cpuMs)),
      exportMs: median(exports.map((run) => run.wallMs)),
      exportCpuMs: median(exports.map((run) => run.cpuMs)),
    });
  }
}

const baseline = JSON.parse(readFileSync(new URL('web/bench/baseline.json', root), 'utf8')) as Record<string, number>;
const pad = (value: number | string, width: number): string => String(typeof value === 'number' ? Math.round(value) : value).padStart(width);
const onCI = process.env['CI'] !== undefined;

/** Under 50 ms the scheduler decides, so a ratio says nothing. */
const regressed = (id: string, cpuMs: number): string => {
  const known = baseline[id];
  return known !== undefined && cpuMs > known * REGRESSION_LIMIT && cpuMs - known > 50 ? `  REGRESSED ${id} (baseline ${known} ms cpu)` : '';
};

console.log(`load average ${loadavg().map((x) => x.toFixed(1)).join(' ')}, ${rounds} rounds, Node ${process.version}`);
console.log(`${'id'.padEnd(34)} ${pad('first', 6)} ${pad('draw', 6)} ${pad('tables', 6)} ${pad('total', 6)} ${pad('preview', 8)} ${pad('export', 7)}`);
for (const row of rows) {
  const flags = [row.totalMs > TARGET_MS ? '  OVER' : '', row.previewMs > TARGET_MS ? '  preview over' : '', regressed(`${row.id}/total`, row.totalCpuMs), regressed(`${row.id}/preview`, row.previewCpuMs), regressed(`${row.id}/export`, row.exportCpuMs)];
  console.log(`${row.id.padEnd(34)} ${pad(row.firstMs, 6)} ${pad(row.drawMs, 6)} ${pad(row.tablesMs, 6)} ${pad(row.totalMs, 6)} ${pad(row.previewMs, 8)} ${pad(row.exportMs, 7)}${flags.join('')}`);
}

const reportUrl = new URL('references/report.json', root);
const report = existsSync(reportUrl) ? (JSON.parse(readFileSync(reportUrl, 'utf8')) as Record<string, unknown>) : {};
writeFileSync(reportUrl, `${JSON.stringify({ ...report, patternBench: rows }, null, 2)}\n`);

const over = rows.filter((row) => row.totalMs > TARGET_MS);
if (over.length > 0) {
  const message = `${over.map((row) => row.id).join(', ')} over the ${TARGET_MS} ms target`;
  if (onCI) console.log(`::warning::${message}`);
  else {
    console.error(message);
    process.exitCode = 1;
  }
}
