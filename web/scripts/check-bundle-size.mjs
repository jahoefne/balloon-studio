// Gzip budget for the built page: fails the build when dist/assets grows past the limits.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TOTAL_LIMIT = 2 * 1024 * 1024; // 2 MiB gzipped for all JS and CSS
const ENTRY_LIMIT = 300 * 1024; // 300 KiB gzipped for the entry chunk
const dir = join(process.cwd(), 'dist', 'assets');
let total = 0;
let entry = 0;
for (const name of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(name)) continue;
  const path = join(dir, name);
  if (!statSync(path).isFile()) continue;
  const size = gzipSync(readFileSync(path)).length;
  total += size;
  if (/^index-.*\.js$/.test(name)) entry = Math.max(entry, size);
  console.log(`${name}\t${(size / 1024).toFixed(1)} KiB gz`);
}
console.log(`total\t${(total / 1024).toFixed(1)} KiB gz (limit ${(TOTAL_LIMIT / 1024).toFixed(0)} KiB)`);
console.log(`entry\t${(entry / 1024).toFixed(1)} KiB gz (limit ${(ENTRY_LIMIT / 1024).toFixed(0)} KiB)`);
if (total > TOTAL_LIMIT || entry > ENTRY_LIMIT) {
  console.error('bundle size budget exceeded');
  process.exit(1);
}
