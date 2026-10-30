// The time budgets of plan §5 WP-K9, measured on the bundled real core in one thread, next to the
// Swift `durationMs` of the same case. Writes the rows to `bench` in references/report.json and
// exits 1 if a budget is missed. BENCH_ROUNDS (default 3), BENCH_CASES=balloon-classic,…
// Wall time suffers from whatever else the machine runs, so the table also has CPU time, and CPU
// time against bench/baseline.json (M-series, ~1.25× is the plan's regression limit) only warns.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { core } from '#core';
import { exportedFile, prepareCase } from '../harness/exportCase';
import type { ReferenceCase } from '../harness/manifest';

interface Budget {
  id: string;
  title: string;
  ms: number;
}

const BUDGETS: readonly Budget[] = [
  { id: 'balloon-classic', title: 'Balloon classic, export', ms: 1500 },
  { id: 'balloon-hanger-hollow-tethers', title: 'Hollow + tethered + hanger, export', ms: 5000 },
  { id: 'figureset-defaults', title: 'Figure set', ms: 15000 },
  { id: 'basket-wicker-default', title: 'Wicker basket, export', ms: 6000 },
  { id: 'pattern-hearts', title: 'Hearts 3MF', ms: 8000 },
  // TODO(WP-K4): Cloud 230 kit ≤ 6 s, sun kit ≤ 12 s, sculpted sun 500 (preview) ≤ 8 s.
];

/** Slow cases without a budget, for the record. */
const EXTRA: readonly string[] = ['relief-night-flight-classic', 'relief-night-flight-round', 'text-rounded-hello', 'balloon-hollow-classic', 'balloon-tethered-classic', 'balloon-hanger-small', 'figureset-two-sided'];

const REGRESSION_LIMIT = 1.25;

// The bundle runs from web/node_modules/.bench.
const root = new URL('../../../', import.meta.url);
const readJSON = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T;

const baseline = readJSON<Record<string, number>>('web/bench/baseline.json');
const manifest = readJSON<{ cases: ReferenceCase[] }>('references/manifest.json');
const grid = readJSON<{ cases: (Partial<ReferenceCase> & { id: string })[] }>('mac/cases/grid.json');
const caseOf = (id: string): ReferenceCase => {
  const c = manifest.cases.find((x) => x.id === id);
  if (c === undefined) throw new Error(`No case ${id}`);
  return { ...c, ...grid.cases.find((x) => x.id === id) } as ReferenceCase;
};

const rounds = Number(process.env['BENCH_ROUNDS'] ?? 3);
const only = (process.env['BENCH_CASES'] ?? '').split(',').filter((id) => id !== '');
const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[values.length >> 1] as number;

interface Row {
  id: string;
  title: string;
  firstMs: number;
  wallMs: number;
  cpuMs: number;
  swiftMs: number;
  budgetMs: number | null;
  bytes: number;
}

await core.prepare(async (file) => new Uint8Array(readFileSync(new URL(`web/public/fonts/${file}`, root))));

const rows: Row[] = [];
const entries = [...BUDGETS, ...EXTRA.map((id) => ({ id, title: id, ms: null }))].filter((entry) => only.length === 0 || only.includes(entry.id));
for (const { id, title, ms } of entries) {
  const c = caseOf(id);
  const walls: number[] = [];
  const cpus: number[] = [];
  let bytes = 0;
  for (let round = 0; round < rounds; round++) {
    const settings = prepareCase(core, c);
    const cpu = process.cpuUsage();
    const started = performance.now();
    const file = exportedFile(settings.run());
    walls.push(performance.now() - started);
    const used = process.cpuUsage(cpu);
    cpus.push((used.user + used.system) / 1000);
    bytes = file.bytes.length;
  }
  rows.push({ id, title, firstMs: walls[0] as number, wallMs: median(walls), cpuMs: median(cpus), swiftMs: c.durationMs, budgetMs: ms, bytes });
}

const pad = (text: string | number, width: number): string => String(text).padStart(width);
console.log(`load average ${loadavg().map((x) => x.toFixed(1)).join(' ')}, ${rounds} rounds, Node ${process.version}`);
console.log(`${'id'.padEnd(32)} ${pad('first', 7)} ${pad('median', 7)} ${pad('cpu', 7)} ${pad('swift', 7)} ${pad('budget', 7)}`);
for (const row of rows) {
  const known = baseline[row.id];
  const regressed = known !== undefined && row.cpuMs > known * REGRESSION_LIMIT;
  const flag = `${row.budgetMs !== null && row.wallMs > row.budgetMs ? '  OVER' : ''}${regressed ? `  REGRESSED (baseline ${known} ms cpu)` : ''}`;
  console.log(`${row.id.padEnd(32)} ${pad(Math.round(row.firstMs), 7)} ${pad(Math.round(row.wallMs), 7)} ${pad(Math.round(row.cpuMs), 7)} ${pad(row.swiftMs, 7)} ${pad(row.budgetMs ?? '-', 7)}${flag}`);
}

const reportUrl = new URL('references/report.json', root);
const report = existsSync(reportUrl) ? (JSON.parse(readFileSync(reportUrl, 'utf8')) as Record<string, unknown>) : {};
writeFileSync(reportUrl, `${JSON.stringify({ ...report, bench: rows }, null, 2)}\n`);

if (rows.some((row) => row.budgetMs !== null && row.wallMs > row.budgetMs)) process.exitCode = 1;
