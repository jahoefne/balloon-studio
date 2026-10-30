// The test tiers of docs/plan.md WP-V3, for test files and vitest configs. Node only (reads process.env).
//
//   fast   `npm test`: every PR. All settings, normalization and migration assertions, preview quality for every
//          suite, export quality only for defaults.
//   full   `FULL=1 npm test`: main, nightly and the label `full-tests`, in four shards. Every Swift sweep, the opt-in
//          suites `outlets` and `clamp`, every export assertion.
//
// `tier.ts` is the only place that reads FULL, PERF and REFS_SHARD for test files. web/harness reads REFS_SHARD itself.

const isOn = (value: string | undefined): boolean => value !== undefined && value !== '' && value !== '0';

/** `FULL=1`: the whole tier. Any value but empty and `0` switches it on. */
export const FULL = isOn(process.env['FULL']);

/** `PERF=1`: time budgets fail the test. Without it they warn at most: CI and parallel runs share their cores. */
export const PERF = isOn(process.env['PERF']);

export interface Shard {
  /** 1-based, as in `REFS_SHARD=2/4`. */
  part: number;
  parts: number;
}

export function parseShard(value: string | undefined): Shard | null {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
  if (match === null) return null;
  const part = Number(match[1]);
  const parts = Number(match[2]);
  if (parts < 1 || part < 1 || part > parts) throw new Error(`REFS_SHARD=${value}: expected i/n with 1 <= i <= n`);
  return { part, parts };
}

/** `REFS_SHARD=i/n`, as in web/harness. Null runs everything. */
export const SHARD = parseShard(process.env['REFS_SHARD']);

/** The items of this shard: every n-th, as web/harness/grid.reference.test.ts picks its cases. */
export function shardOf<T>(items: readonly T[], shard: Shard | null = SHARD): readonly T[] {
  return shard === null ? items : items.filter((_, index) => index % shard.parts === shard.part - 1);
}

/** Whether the item at this index of a sweep belongs to this shard. */
export const inShard = (index: number, shard: Shard | null = SHARD): boolean => shard === null || index % shard.parts === shard.part - 1;

/** The harness smoke of the `fast` tier: the defaults of every part, one case per kind of output. */
export const SMOKE_CASES: readonly string[] = [
  'balloon-classic',
  'pattern-stripes',
  'relief-night-flight-classic',
  'text-rounded-hello',
  'basket-wicker-default',
  'ring-solid-default',
  'ring-kit-450',
  'cloud-classic',
  'sun-soft-star',
  'figure-star-default',
  'figureset-defaults',
  'clip-default',
];

/** The sweeps too long for one job: each of these files takes its cases through `shardOf` and runs in every shard. */
export const SHARDED_FILES: readonly string[] = [
  'tests/balloon.test.ts',
  'tests/cableClamp.test.ts',
  'tests/cableOutlet.test.ts',
  'tests/cableOutletChained.test.ts',
  'tests/cloudShape.test.ts',
  'tests/lampSurface.test.ts',
  'tests/patterns.test.ts',
  'tests/sun.test.ts',
];

/** The grid has its own step in test-full.yml; its structure test expects all cases and runs in the `fast` tier. */
const NOT_IN_SHARDS = 'harness/grid.reference.test.ts';

/** The test files of a shard: the sharded sweeps, and every n-th of the others in path order. */
export function filesOfShard(files: readonly string[], shard: Shard): readonly string[] {
  const whole = files.filter((file) => !SHARDED_FILES.includes(file) && file !== NOT_IN_SHARDS).sort();
  return [...files.filter((file) => SHARDED_FILES.includes(file)), ...shardOf(whole, shard)];
}
