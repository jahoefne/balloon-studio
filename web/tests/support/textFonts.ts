// The bundled fonts in vitest, the Node counterpart of the worker's fetch loader (WP-R3).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export function bundledFontBytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../../public/fonts/${file}`, import.meta.url)));
}

export const fontLoader = async (file: string): Promise<Uint8Array> => bundledFontBytes(file);

/** `tests/fixtures/text/<name>`, gunzipped if it ends in .gz. */
export function textFixture(name: string): Uint8Array {
  const raw = readFileSync(new URL(`../fixtures/text/${name}`, import.meta.url));
  return new Uint8Array(name.endsWith('.gz') ? gunzipSync(raw) : raw);
}
