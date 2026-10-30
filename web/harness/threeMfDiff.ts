// 3D/3dmodel.model line by line: head and foot exact, <triangle …/> exact, <vertex …/> numeric.
// The coordinates are Swift `\(Double)` text, so a libm difference in the last digit changes the
// line but not the geometry. Models reach 198 MB; only lines that differ get parsed.
import { checkBounds, describeMeasures, type BoundedLimits, type BoundedMesh } from './boundedDiff';
import { NoteList, boundedResult, mismatch, type DiffResult } from './result';

/** Relative limit of plan §1. Floor of 1 mm on the scale: a cancellation near 0 (1e-14 vs 2e-14 mm) is not a port error. */
export const MODEL_TOLERANCE = 1e-12;

const VERTEX = /^(.*)<vertex x="([^"]*)" y="([^"]*)" z="([^"]*)"\/>(.*)$/;
const AXES = ['x', 'y', 'z'] as const;

const scratch = new DataView(new ArrayBuffer(8));

function f64Ordinal(value: number): bigint {
  scratch.setFloat64(0, value);
  const bits = scratch.getBigInt64(0);
  return bits < 0n ? -(bits & 0x7fffffffffffffffn) : bits;
}

function f64UlpDistance(a: number, b: number): number {
  const distance = f64Ordinal(a) - f64Ordinal(b);
  return Number(distance < 0n ? -distance : distance);
}

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
}

const VERTEX_TAG = /<vertex x="([^"]*)" y="([^"]*)" z="([^"]*)"\/>/g;
const TRIANGLE_TAG = /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"([^/]*)\/>/g;

interface ParsedModel extends BoundedMesh {
  /** Everything but the vertex and triangle tags: head, between them and foot. */
  frame: string;
}

/** `colorIds` numbers the attribute texts of `<triangle …/>` (`pid`, `p1-3`, `paint_color`), shared between two models. */
function parseModel(text: string, colorIds: Map<string, number>): ParsedModel {
  const coordinates: number[] = [];
  const corners: number[] = [];
  const colors: number[] = [];
  let frame = '';
  let at = 0;
  VERTEX_TAG.lastIndex = 0;
  for (let m = VERTEX_TAG.exec(text); m !== null; m = VERTEX_TAG.exec(text)) {
    frame += text.slice(at, m.index);
    at = m.index + m[0].length;
    coordinates.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  TRIANGLE_TAG.lastIndex = at;
  for (let m = TRIANGLE_TAG.exec(text); m !== null; m = TRIANGLE_TAG.exec(text)) {
    frame += text.slice(at, m.index);
    at = m.index + m[0].length;
    corners.push(Number(m[1]), Number(m[2]), Number(m[3]));
    const attributes = m[4] as string;
    let id = colorIds.get(attributes);
    if (id === undefined) {
      id = colorIds.size;
      colorIds.set(attributes, id);
    }
    colors.push(id);
  }
  frame += text.slice(at);
  return { positions: Float64Array.from(coordinates), triangles: Uint32Array.from(corners), colors: Int32Array.from(colors), frame };
}

/** A strict mismatch of a listed model: everything but the mesh has to be exact, the mesh is measured. */
function diffBounded(e: string, a: string, limits: BoundedLimits, strict: DiffResult): DiffResult {
  const colorIds = new Map<string, number>();
  const reference = parseModel(e, colorIds);
  const own = parseModel(a, colorIds);
  // Line breaks between tags change with the number of tags; everything else has to be the same.
  if (reference.frame.replace(/\n+/g, '\n') !== own.frame.replace(/\n+/g, '\n')) {
    return { ...mismatch('model', 'The text around the vertices and triangles differs'), notes: ['The text around the vertices and triangles differs', ...strict.notes] };
  }
  const check = checkBounds(reference, own, limits);
  if (check.invalid !== null) return { ...mismatch('invalid mesh', check.invalid), notes: [check.invalid, ...strict.notes] };
  if (check.exceeded.length > 0) return { ...mismatch('bounds', ...check.exceeded), notes: [...check.exceeded, describeMeasures(check.measures), ...strict.notes] };
  return boundedResult(check.measures);
}

/** Compares a model; `bounds` = it is on the bounded allowlist, with these limits. */
export function diffModel(expected: Uint8Array, actual: Uint8Array, bounds?: BoundedLimits): DiffResult {
  const e = latin1(expected);
  const a = latin1(actual);
  const notes = new NoteList();
  const tags = new Set<string>();
  let vertexLines = 0;
  let vertexLinesEqual = 0;
  let triangleLines = 0;
  let ulpCount = 0;
  let maxUlp = 0;
  let maxRelative = 0;
  let line = 0;
  let eAt = 0;
  let aAt = 0;
  while (eAt <= e.length && aAt <= a.length) {
    let eEnd = e.indexOf('\n', eAt);
    if (eEnd < 0) eEnd = e.length;
    let aEnd = a.indexOf('\n', aAt);
    if (aEnd < 0) aEnd = a.length;
    const eLine = e.slice(eAt, eEnd);
    const aLine = a.slice(aAt, aEnd);
    line++;
    const isVertex = eLine.includes('<vertex ');
    const isTriangle = !isVertex && eLine.startsWith('<triangle ');
    if (isVertex) vertexLines++;
    if (isTriangle) triangleLines++;
    if (eLine === aLine) {
      if (isVertex) vertexLinesEqual++;
    } else if (isTriangle || aLine.startsWith('<triangle ')) {
      tags.add('triangle');
      notes.add(`line ${line}: ${aLine} vs ${eLine}`);
    } else {
      const eMatch = VERTEX.exec(eLine);
      const aMatch = VERTEX.exec(aLine);
      if (eMatch === null || aMatch === null || eMatch[1] !== aMatch[1] || eMatch[5] !== aMatch[5]) {
        tags.add(eMatch !== null || aMatch !== null ? 'vertex' : 'model');
        notes.add(`line ${line}: ${aLine.slice(0, 200)} vs ${eLine.slice(0, 200)}`);
      } else {
        for (let k = 0; k < 3; k++) {
          const eText = eMatch[k + 2] as string;
          const aText = aMatch[k + 2] as string;
          if (eText === aText) continue;
          const eValue = Number(eText);
          const aValue = Number(aText);
          if (eValue === aValue && Object.is(eValue, aValue)) {
            // Same number, other spelling: Swift's description has exactly one spelling.
            tags.add('vertex');
            notes.add(`line ${line} ${AXES[k]}: spelled ${aText} vs ${eText}`);
          } else if (eValue === 0 && aValue === 0) {
            tags.add('signed zero');
            notes.add(`line ${line} ${AXES[k]}: ${aText} vs ${eText}`);
          } else {
            const relative = Math.abs(aValue - eValue) / Math.max(Math.abs(aValue), Math.abs(eValue), 1);
            if (!(relative <= MODEL_TOLERANCE)) {
              tags.add('vertex');
              notes.add(`line ${line} ${AXES[k]}: ${aText} vs ${eText}, relative ${relative}`);
            } else {
              ulpCount++;
              if (relative > maxRelative) maxRelative = relative;
              const distance = f64UlpDistance(aValue, eValue);
              if (distance > maxUlp) maxUlp = distance;
            }
          }
        }
      }
    }
    eAt = eEnd + 1;
    aAt = aEnd + 1;
  }
  if (eAt <= e.length || aAt <= a.length) {
    tags.add('model');
    notes.add(`Line counts differ: the ${aAt <= a.length ? 'TS model' : 'reference'} goes on after line ${line}`);
  }
  const summary = `${vertexLinesEqual}/${vertexLines} vertex lines text-equal, ${triangleLines} triangle lines, max relative ${maxRelative}`;
  if (tags.size > 0 && bounds !== undefined) {
    return diffBounded(e, a, bounds, { ...mismatch('model'), tags: [...tags], notes: [...notes.all(), summary] });
  }
  return {
    status: tags.size > 0 ? 'mismatch' : 'ulp',
    tags: [...tags],
    maxUlp,
    ulpCount,
    normalDiffs: 0,
    nearZeroCorners: 0,
    differingTriangles: 0,
    notes: tags.size > 0 ? [...notes.all(), summary] : [summary],
  };
}
