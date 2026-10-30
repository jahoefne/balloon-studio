// JSON has to be byte-identical. When it is not, this names the first differing key path and
// says whether the parsed values agree (the writer is wrong: key order, number or string
// spelling, whitespace) or not (the port computed something else). `JSON.parse` would hide the
// spelling and the order of numeric keys, so the walk runs on its own tree.
import { firstDifference } from './textDiff';
import { identical, mismatch, type DiffResult } from './result';

type Node =
  | { type: 'object'; members: [key: string, value: Node][] }
  | { type: 'array'; items: Node[] }
  | { type: 'number'; raw: string; value: number }
  | { type: 'string'; raw: string; value: string }
  | { type: 'literal'; raw: string };

class Reader {
  at = 0;
  constructor(private readonly text: string) {}

  private skipSpace(): void {
    while (this.at < this.text.length && ' \n\r\t'.includes(this.text.charAt(this.at))) this.at++;
  }

  private fail(what: string): never {
    throw new SyntaxError(`${what} at offset ${this.at}`);
  }

  private string(): { raw: string; value: string } {
    const start = this.at++;
    while (this.at < this.text.length && this.text.charAt(this.at) !== '"') {
      this.at += this.text.charAt(this.at) === '\\' ? 2 : 1;
    }
    if (this.at >= this.text.length) this.fail('Unterminated string');
    this.at++;
    const raw = this.text.slice(start, this.at);
    return { raw, value: JSON.parse(raw) as string };
  }

  value(): Node {
    this.skipSpace();
    const c = this.text.charAt(this.at);
    if (c === '{') {
      this.at++;
      const members: [string, Node][] = [];
      this.skipSpace();
      if (this.text.charAt(this.at) === '}') {
        this.at++;
        return { type: 'object', members };
      }
      for (;;) {
        this.skipSpace();
        if (this.text.charAt(this.at) !== '"') this.fail('Expected a key');
        const key = this.string().value;
        this.skipSpace();
        if (this.text.charAt(this.at) !== ':') this.fail('Expected ":"');
        this.at++;
        members.push([key, this.value()]);
        this.skipSpace();
        const next = this.text.charAt(this.at++);
        if (next === '}') return { type: 'object', members };
        if (next !== ',') this.fail('Expected "," or "}"');
      }
    }
    if (c === '[') {
      this.at++;
      const items: Node[] = [];
      this.skipSpace();
      if (this.text.charAt(this.at) === ']') {
        this.at++;
        return { type: 'array', items };
      }
      for (;;) {
        items.push(this.value());
        this.skipSpace();
        const next = this.text.charAt(this.at++);
        if (next === ']') return { type: 'array', items };
        if (next !== ',') this.fail('Expected "," or "]"');
      }
    }
    if (c === '"') return { type: 'string', ...this.string() };
    for (const literal of ['true', 'false', 'null']) {
      if (this.text.startsWith(literal, this.at)) {
        this.at += literal.length;
        return { type: 'literal', raw: literal };
      }
    }
    const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.text.slice(this.at, this.at + 64));
    if (match === null) this.fail('Unexpected token');
    this.at += match[0].length;
    return { type: 'number', raw: match[0], value: Number(match[0]) };
  }

  document(): Node {
    const root = this.value();
    this.skipSpace();
    if (this.at !== this.text.length) this.fail('Trailing content');
    return root;
  }
}

function parse(bytes: Uint8Array): Node {
  return new Reader(new TextDecoder().decode(bytes)).document();
}

function childPath(path: string, key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function show(node: Node): string {
  switch (node.type) {
    case 'object':
      return `{…${node.members.length} keys}`;
    case 'array':
      return `[…${node.items.length} items]`;
    default:
      return node.raw;
  }
}

interface Difference {
  path: string;
  cause: 'writer' | 'port';
  detail: string;
}

/** The first difference in document order; value differences outrank a mere reordering of the same object. */
function firstDifferenceIn(expected: Node, actual: Node, path: string): Difference | null {
  if (expected.type !== actual.type) return { path, cause: 'port', detail: `${show(actual)} vs ${show(expected)}` };
  switch (expected.type) {
    case 'object': {
      const other = actual as Extract<Node, { type: 'object' }>;
      const theirs = new Map(other.members);
      const ours = new Map(expected.members);
      for (const [key] of expected.members) {
        if (!theirs.has(key)) return { path: childPath(path, key), cause: 'port', detail: 'missing in the TS output' };
      }
      for (const [key] of other.members) {
        if (!ours.has(key)) return { path: childPath(path, key), cause: 'port', detail: 'not in the reference' };
      }
      const differences = expected.members.map(([key, value]) => firstDifferenceIn(value, theirs.get(key) as Node, childPath(path, key)));
      const port = differences.find((difference) => difference?.cause === 'port');
      if (port !== undefined) return port;
      for (let i = 0; i < expected.members.length; i++) {
        const key = (expected.members[i] as [string, Node])[0];
        const otherKey = (other.members[i] as [string, Node])[0];
        if (key !== otherKey) return { path, cause: 'writer', detail: `key order: "${otherKey}" where the reference has "${key}"` };
      }
      return differences.find((difference) => difference !== null) ?? null;
    }
    case 'array': {
      const other = actual as Extract<Node, { type: 'array' }>;
      if (expected.items.length !== other.items.length) {
        return { path, cause: 'port', detail: `${other.items.length} items, reference has ${expected.items.length}` };
      }
      let writer: Difference | null = null;
      for (let i = 0; i < expected.items.length; i++) {
        const difference = firstDifferenceIn(expected.items[i] as Node, other.items[i] as Node, `${path}[${i}]`);
        if (difference?.cause === 'port') return difference;
        writer ??= difference;
      }
      return writer;
    }
    case 'number': {
      const other = actual as Extract<Node, { type: 'number' }>;
      if (expected.raw === other.raw) return null;
      return { path, cause: expected.value === other.value ? 'writer' : 'port', detail: `${other.raw} vs ${expected.raw}` };
    }
    case 'string': {
      const other = actual as Extract<Node, { type: 'string' }>;
      if (expected.raw === other.raw) return null;
      return { path, cause: expected.value === other.value ? 'writer' : 'port', detail: `${other.raw} vs ${expected.raw}` };
    }
    case 'literal': {
      const other = actual as Extract<Node, { type: 'literal' }>;
      return expected.raw === other.raw ? null : { path, cause: 'port', detail: `${other.raw} vs ${expected.raw}` };
    }
  }
}

const CAUSE: Record<'writer' | 'port', string> = {
  writer: 'numerically equal (writer bug)',
  port: 'different value (port bug)',
};

export function diffJson(expected: Uint8Array, actual: Uint8Array): DiffResult {
  const offset = firstDifference(expected, actual);
  if (offset === expected.length && expected.length === actual.length) return identical();
  const context = (bytes: Uint8Array): string => new TextDecoder().decode(bytes.subarray(offset > 20 ? offset - 20 : 0, offset + 40));
  const where = `first difference at byte ${offset}: …${context(actual)}… vs …${context(expected)}…`;
  let parsedExpected: Node;
  let parsedActual: Node;
  try {
    parsedExpected = parse(expected);
  } catch (error) {
    throw new Error(`The JSON reference does not parse: ${String(error)}`);
  }
  try {
    parsedActual = parse(actual);
  } catch (error) {
    return { ...mismatch('json', `TS output is not JSON: ${String(error)}`, where), cause: 'port' };
  }
  const difference = firstDifferenceIn(parsedExpected, parsedActual, '$');
  if (difference === null) return { ...mismatch('json', `${CAUSE.writer}: whitespace only`, where), cause: 'writer' };
  return { ...mismatch('json', `${difference.path}: ${CAUSE[difference.cause]}: ${difference.detail}`, where), cause: difference.cause };
}
