import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { filesOfShard, inShard, parseShard, SHARDED_FILES, shardOf } from './tier';

describe('shards', () => {
  it('reads i/n as web/harness does', () => {
    expect(parseShard('2/4')).toEqual({ part: 2, parts: 4 });
    expect(parseShard(undefined)).toBeNull();
    expect(parseShard('')).toBeNull();
    expect(parseShard('abc')).toBeNull();
    expect(() => parseShard('5/4')).toThrow();
    expect(() => parseShard('0/4')).toThrow();
  });

  it('puts every item of a sweep into exactly one shard', () => {
    const items = Array.from({ length: 23 }, (_, index) => index);
    const all = [1, 2, 3, 4].flatMap((part) => shardOf(items, { part, parts: 4 }));
    expect(all.sort((a, b) => a - b)).toEqual(items);
    expect(shardOf(items, null)).toEqual(items);
    expect(items.filter((index) => inShard(index, { part: 2, parts: 4 }))).toEqual(shardOf(items, { part: 2, parts: 4 }));
  });

  it('runs every test file, the sharded sweeps in every shard and the others in one', () => {
    const files = [...SHARDED_FILES, 'a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts', 'e.test.ts', 'harness/grid.reference.test.ts'];
    const shards = [1, 2, 3, 4].map((part) => filesOfShard(files, { part, parts: 4 }));
    for (const shard of shards) for (const file of SHARDED_FILES) expect(shard).toContain(file);
    const others = shards.flat().filter((file) => !SHARDED_FILES.includes(file));
    expect(others.sort()).toEqual(['a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts', 'e.test.ts']);
  });

  it('knows which files split their sweeps', () => {
    const web = new URL('../../', import.meta.url);
    const sources = globSync('tests/*.test.ts', { cwd: fileURLToPath(web) }).filter((file) => !file.endsWith('tier.test.ts'));
    const splitting = sources.filter((file) => /\bshardOf\(/.test(readFileSync(new URL(file, web), 'utf8')));
    expect(splitting.sort()).toEqual([...SHARDED_FILES].sort());
  });
});
