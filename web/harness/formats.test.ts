// JSON, text, 3MF model and ZIP container, on synthetic fixtures.
import { describe, expect, it } from 'vitest';
import { storedZipArchive } from '../src/core/io/storedZip';
import { compareOutput } from './compare';
import { TETRA_AND_LONE, at, bump, copy, stl, text } from './fixtures';
import { diffJson } from './jsonDiff';
import { statusLabel } from './result';
import { unifiedDiff } from './textDiff';

describe('JSON', () => {
  const diff = (expected: string, actual: string) => compareOutput(text(expected), text(actual), 'json');

  it('identical', () => {
    expect(diff('{"a":1}', '{"a":1}').status).toBe('identical');
  });

  it('reordered keys: `mismatch (json)`, a writer bug at the object', () => {
    const result = diff('{"a":{"x":1,"y":2},"b":3}', '{"a":{"y":2,"x":1},"b":3}');
    expect(statusLabel(result)).toBe('mismatch (json)');
    expect(result.cause).toBe('writer');
    expect(result.notes[0]).toBe('$.a: numerically equal (writer bug): key order: "y" where the reference has "x"');
  });

  it('other spelling of the same number or string is a writer bug', () => {
    const number = diff('{"w":[1,0.29999999999999999]}', '{"w":[1,0.3]}');
    expect(number.cause).toBe('writer');
    expect(number.notes[0]).toBe('$.w[1]: numerically equal (writer bug): 0.3 vs 0.29999999999999999');
    expect(diff('{"w":450}', '{"w":450.0}').cause).toBe('writer');
    const slash = diff('{"u":"a\\/b"}', '{"u":"a/b"}');
    expect(slash.cause).toBe('writer');
    expect(slash.notes[0]).toContain('$.u');
  });

  it('whitespace is a writer bug', () => {
    const result = diff('{"a" : 1}', '{"a":1}');
    expect(result.cause).toBe('writer');
    expect(result.notes[0]).toContain('whitespace only');
  });

  it('other values, missing and extra keys are port bugs', () => {
    expect(diff('{"a":{"b":[1,2]}}', '{"a":{"b":[1,3]}}').notes[0]).toBe('$.a.b[1]: different value (port bug): 3 vs 2');
    expect(diff('{"a":1,"b":2}', '{"a":1}').notes[0]).toBe('$.b: different value (port bug): missing in the TS output');
    expect(diff('{"a":1}', '{"a":1,"b":2}').notes[0]).toBe('$.b: different value (port bug): not in the reference');
    expect(diff('{"a":[1]}', '{"a":[1,2]}').cause).toBe('port');
    expect(diff('{"a":true}', '{"a":null}').cause).toBe('port');
    expect(diff('{"a":1}', '{"a":"1"}').cause).toBe('port');
  });

  it('a value difference outranks a key order difference earlier in the file', () => {
    const result = diff('{"a":{"x":1,"y":2},"b":3}', '{"a":{"y":2,"x":1},"b":4}');
    expect(result.cause).toBe('port');
    expect(result.notes[0]).toContain('$.b');
  });

  it('keys that need quoting show in brackets', () => {
    expect(diff('{"filament-1":1}', '{"filament-1":2}').notes[0]).toContain('$["filament-1"]');
  });

  it('numeric keys keep their order, unlike JSON.parse', () => {
    expect(diff('{"10":1,"9":2}', '{"9":2,"10":1}').cause).toBe('writer');
  });

  it('unparsable TS output is a mismatch, an unparsable reference an error', () => {
    expect(statusLabel(diff('{"a":1}', '{"a":'))).toBe('mismatch (json)');
    expect(() => diffJson(text('{'), text('{}'))).toThrow(/reference does not parse/);
  });
});

describe('text', () => {
  it('identical and different, with a unified diff', () => {
    expect(compareOutput(text('a\nb'), text('a\nb'), 'text').status).toBe('identical');
    const result = compareOutput(text('one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n'), text('one\ntwo\nthree\nfour\nFIVE\nsix\nseven\neight\n'), 'svg');
    expect(statusLabel(result)).toBe('mismatch (text)');
    expect(result.notes[0]).toContain('First difference at byte 19');
    expect(result.notes[1]).toBe(['--- swift', '+++ ts', '@@ -2,7 +2,7 @@', ' two', ' three', ' four', '-five', '+FIVE', ' six', ' seven', ' eight'].join('\n'));
  });

  it('additions and removals align', () => {
    expect(unifiedDiff('a\nb\nc', 'a\nc')).toBe(['--- swift', '+++ ts', '@@ -1,3 +1,2 @@', ' a', '-b', ' c'].join('\n'));
    expect(unifiedDiff('a\nc', 'a\nb\nc')).toBe(['--- swift', '+++ ts', '@@ -1,2 +1,3 @@', ' a', '+b', ' c'].join('\n'));
  });

  it('a huge rewrite does not explode and is cut off', () => {
    const left = Array.from({ length: 3000 }, (_, i) => `l${i}`).join('\n');
    const right = Array.from({ length: 3000 }, (_, i) => `r${i}`).join('\n');
    expect(unifiedDiff(left, right)).toMatch(/… \d+ more lines$/);
  });

  it('bytes that decode alike still differ', () => {
    const result = compareOutput(Uint8Array.of(0xff), Uint8Array.of(0xfe), 'text');
    expect(result.status).toBe('mismatch');
  });
});

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<model>\n<resources>\n<object id="1"><mesh><vertices><vertex x="16.0" y="0.0" z="0.0"/>\n';
const VERTICES = '<vertex x="15.805242189705986" y="2.488838951145284" z="-0.0"/>\n<vertex x="28.25479182812895" y="-0.32170311656954054" z="210.83333333333334"/>\n';
const TRIANGLES = '</vertices><triangles>\n<triangle v1="0" v2="1" v3="2" pid="2" p1="0" p2="0" p3="0" paint_color="4"/>\n';
const FOOT = '</triangles></mesh></object></resources></model>';
const MODEL = HEAD + VERTICES + TRIANGLES + FOOT;

/** The double next to the coordinate 2.488838951145284 of the fixture, in Swift's spelling. */
const NEXT_DOUBLE = String(2.488838951145284 + 2 ** -51);

describe('3MF model', () => {
  const diff = (actual: string) => compareOutput(text(MODEL), text(actual), 'model');

  it('identical', () => {
    expect(diff(MODEL).status).toBe('identical');
  });

  it('a last-digit vertex difference is `ulp`, also in the head line', () => {
    const result = diff(MODEL.replace('2.488838951145284', NEXT_DOUBLE));
    expect(result.status).toBe('ulp');
    expect(result.ulpCount).toBe(1);
    expect(result.maxUlp).toBe(1);
    expect(result.notes[0]).toContain('2/3 vertex lines text-equal, 1 triangle lines');
    expect(diff(MODEL.replace('x="16.0"', 'x="16.000000000000004"')).status).toBe('ulp');
  });

  it('beyond 1e-12 relative is a mismatch', () => {
    expect(statusLabel(diff(MODEL.replace('2.488838951145284', '2.48883895115')))).toBe('mismatch (vertex)');
  });

  it('near zero the scale is 1 mm, not the value', () => {
    const near = MODEL.replace('y="0.0" z="0.0"/>', 'y="1e-14" z="0.0"/>');
    expect(compareOutput(text(near), text(near.replace('1e-14', '2e-14')), 'model').status).toBe('ulp');
  });

  it('a signed zero is a mismatch, like in an STL', () => {
    expect(statusLabel(diff(MODEL.replace('z="-0.0"', 'z="0.0"')))).toBe('mismatch (signed zero)');
  });

  it('another spelling of the same value is a mismatch', () => {
    expect(statusLabel(diff(MODEL.replace('x="16.0"', 'x="16"')))).toBe('mismatch (vertex)');
  });

  it('triangles are exact', () => {
    expect(statusLabel(diff(MODEL.replace('paint_color="4"', 'paint_color="8"')))).toBe('mismatch (triangle)');
    expect(statusLabel(diff(MODEL.replace('v3="2"', 'v3="3"')))).toBe('mismatch (triangle)');
  });

  it('head and foot are exact', () => {
    expect(statusLabel(diff(MODEL.replace('encoding="UTF-8"', 'encoding="utf-8"')))).toBe('mismatch (model)');
    expect(statusLabel(diff(MODEL.replace('</model>', '</modeL>')))).toBe('mismatch (model)');
    expect(statusLabel(diff(MODEL.replace('<object id="1">', '<object id="2">')))).toBe('mismatch (vertex)');
  });

  it('a missing or an extra line is a mismatch', () => {
    expect(diff(HEAD + VERTICES + TRIANGLES + FOOT + '\n').tags).toContain('model');
    const shorter = diff(HEAD + TRIANGLES + FOOT);
    expect(shorter.status).toBe('mismatch');
    expect(shorter.notes.join('\n')).toContain('Line counts differ');
  });
});

describe('ZIP', () => {
  const base = stl(TETRA_AND_LONE);
  const entries: [string, Uint8Array][] = [
    ['A-part.stl', base],
    ['ASSEMBLY.md', text('# Kit\nstep one\n')],
    ['cloud-settings.json', text('{"width":230}')],
    ['LED-LAYOUT.svg', text('<svg/>')],
  ];
  const archive = storedZipArchive(entries);
  const replaced = (name: string, bytes: Uint8Array) => storedZipArchive(entries.map(([n, b]) => [n, n === name ? bytes : b]));

  it('identical', () => {
    expect(compareOutput(archive, copy(archive), 'zip').status).toBe('identical');
  });

  it('another entry name is a mismatch', () => {
    const renamed = storedZipArchive(entries.map(([n, b]) => [n === 'ASSEMBLY.md' ? 'ASSEMBLY.txt' : n, b]));
    const result = compareOutput(archive, renamed, 'zip');
    expect(statusLabel(result)).toBe('mismatch (zip)');
    expect(result.notes[0]).toContain('ASSEMBLY.txt vs ASSEMBLY.md');
  });

  it('another order or count of entries is a mismatch', () => {
    expect(statusLabel(compareOutput(archive, storedZipArchive([...entries].reverse()), 'zip'))).toBe('mismatch (zip)');
    expect(statusLabel(compareOutput(archive, storedZipArchive(entries.slice(0, 3)), 'zip'))).toBe('mismatch (zip)');
  });

  it('entries compare by extension and roll up', () => {
    const ulp = compareOutput(archive, replaced('A-part.stl', bump(base, at(4, 0, 1))), 'zip');
    expect(statusLabel(ulp)).toBe('ulp');
    expect(ulp.ulpCount).toBe(1);
    expect(ulp.entries?.map((entry) => entry.name)).toEqual(['A-part.stl']);

    const json = compareOutput(archive, replaced('cloud-settings.json', text('{"width":231}')), 'zip');
    expect(statusLabel(json)).toBe('mismatch (json)');
    expect(json.notes[0]).toContain('cloud-settings.json');

    expect(statusLabel(compareOutput(archive, replaced('ASSEMBLY.md', text('# Kit\nstep 1\n')), 'zip'))).toBe('mismatch (text)');
    expect(statusLabel(compareOutput(archive, replaced('LED-LAYOUT.svg', text('<svg />')), 'zip'))).toBe('mismatch (text)');
  });

  it('a mismatch in one entry outranks an ULP in another', () => {
    const both = storedZipArchive(entries.map(([n, b]) => [n, n === 'A-part.stl' ? bump(base, at(4, 0, 1)) : n === 'ASSEMBLY.md' ? text('other') : b]));
    const result = compareOutput(archive, both, 'zip');
    expect(statusLabel(result)).toBe('mismatch (text)');
    expect(result.ulpCount).toBe(1);
  });

  it('a 3MF compares its model numerically', () => {
    const threeMf = (model: string) => storedZipArchive([['[Content_Types].xml', text('<Types/>')], ['3D/3dmodel.model', text(model)]]);
    expect(statusLabel(compareOutput(threeMf(MODEL), threeMf(MODEL.replace('2.488838951145284', NEXT_DOUBLE)), '3mf'))).toBe('ulp');
    expect(statusLabel(compareOutput(threeMf(MODEL), threeMf(MODEL.replace('paint_color="4"', 'paint_color="8"')), '3mf'))).toBe('mismatch (triangle)');
  });

  const centralOffset = (bytes: Uint8Array): number => new DataView(bytes.buffer, bytes.byteOffset).getUint32(bytes.length - 22 + 16, true);
  const patchedU16 = (offset: number, value: number): Uint8Array => {
    const out = copy(archive);
    new DataView(out.buffer).setUint16(offset, value, true);
    return out;
  };

  it.each([
    ['central date', (): number => centralOffset(archive) + 14, 34, 'date'],
    ['central time', (): number => centralOffset(archive) + 12, 1, 'time'],
    ['central flags', (): number => centralOffset(archive) + 8, 2, 'flags'],
    ['central version needed', (): number => centralOffset(archive) + 6, 45, 'version'],
    ['version made by', (): number => centralOffset(archive) + 4, 63, 'madeBy'],
    ['internal attributes', (): number => centralOffset(archive) + 36, 1, 'internal'],
    ['local date', (): number => 12, 34, 'localDate'],
    ['local time', (): number => 10, 1, 'localTime'],
    ['local version', (): number => 4, 45, 'localVersion'],
  ] as const)('%s', (_, offset, value, field) => {
    const result = compareOutput(archive, patchedU16(offset(), value), 'zip');
    expect(statusLabel(result)).toBe('mismatch (zip)');
    expect(result.notes[0]).toContain(`A-part.stl: ${field} ${value} vs`);
  });

  it('invalid TS archives are a mismatch, with the reader’s message', () => {
    const corrupt = copy(archive);
    corrupt[100] = (corrupt[100] as number) ^ 1;
    const result = compareOutput(archive, corrupt, 'zip');
    expect(statusLabel(result)).toBe('mismatch (zip)');
    expect(result.notes[0]).toContain('CRC mismatch');
    expect(statusLabel(compareOutput(archive, text('not a zip'), 'zip'))).toBe('mismatch (zip)');
  });

  it('a gap between entries is a mismatch although the reader accepts it', () => {
    // Move the second entry's bytes one further and repoint the directory: valid, but not what StoredZIP writes.
    const end = archive.length - 22;
    const central = centralOffset(archive);
    const second = 30 + 'A-part.stl'.length + base.length;
    const gapped = new Uint8Array(archive.length + 1);
    gapped.set(archive.subarray(0, second));
    gapped.set(archive.subarray(second, end), second + 1);
    gapped.set(archive.subarray(end), end + 1);
    const view = new DataView(gapped.buffer);
    view.setUint32(end + 1 + 16, central + 1, true);
    let at = central + 1;
    for (let i = 0; i < entries.length; i++) {
      const offset = view.getUint32(at + 42, true);
      if (i > 0) view.setUint32(at + 42, offset + 1, true);
      at += 46 + view.getUint16(at + 28, true);
    }
    const result = compareOutput(archive, gapped, 'zip');
    expect(statusLabel(result)).toBe('mismatch (zip)');
    expect(result.notes[0]).toContain('ASSEMBLY.md starts at');
  });
});
