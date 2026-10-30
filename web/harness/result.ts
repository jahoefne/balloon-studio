// The result every diff returns, and how results of archive entries roll up (WP-V2).

export type OutputKind = 'stl' | 'zip' | '3mf' | 'json' | 'text' | 'svg' | 'model';

export type Status = 'identical' | 'ulp' | 'mismatch' | 'unverified';

export interface DiffResult {
  status: Status;
  /** Why it is not identical: `topology`, `signed zero`, `ulp`, `json`, `needs-pack`, … Empty for `identical` and `ulp`. */
  tags: string[];
  /** Largest distance of a differing coordinate: Float32 steps in an STL, Float64 steps in a 3MF model. */
  maxUlp: number;
  /** Differing vertex coordinates. Normals are counted in `normalDiffs`, not here. */
  ulpCount: number;
  /** Stored normals that differ from the reference but stay within tolerance. */
  normalDiffs: number;
  /** Differing vertex coordinates that are both within `NEAR_ZERO_MM` of zero (libm noise on a value that should be 0). Not in `ulpCount` or `maxUlp`. */
  nearZeroCorners: number;
  /** Readable details, most important first. */
  notes: string[];
  /** JSON only: the parsed values agree (`writer`) or they do not (`port`). */
  cause?: 'writer' | 'port';
  /** Archives only: the entries that are not `identical`. */
  entries?: EntryDiff[];
}

export interface EntryDiff extends DiffResult {
  name: string;
}

const NOTE_LIMIT = 8;

export function identical(): DiffResult {
  return { status: 'identical', tags: [], maxUlp: 0, ulpCount: 0, normalDiffs: 0, nearZeroCorners: 0, notes: [] };
}

export function mismatch(tag: string, ...notes: string[]): DiffResult {
  return { status: 'mismatch', tags: [tag], maxUlp: 0, ulpCount: 0, normalDiffs: 0, nearZeroCorners: 0, notes };
}

export function needsPack(...notes: string[]): DiffResult {
  return { status: 'unverified', tags: ['needs-pack'], maxUlp: 0, ulpCount: 0, normalDiffs: 0, nearZeroCorners: 0, notes };
}

/** `identical`, `ulp`, `mismatch (topology)`, `unverified-needs-pack`. */
export function statusLabel(result: Pick<DiffResult, 'status' | 'tags'>): string {
  if (result.status === 'unverified') return result.tags.includes('needs-pack') ? 'unverified-needs-pack' : 'unverified';
  if (result.status === 'mismatch' && result.tags.length > 0) return `mismatch (${result.tags.join(', ')})`;
  return result.status;
}

const SEVERITY: Record<Status, number> = { identical: 0, ulp: 1, unverified: 2, mismatch: 3 };

/** Worst status wins: a mismatch in one entry is not hidden by another entry that cannot be checked. */
export function rollUp(entries: EntryDiff[], own: DiffResult = identical()): DiffResult {
  const differing = entries.filter((entry) => entry.status !== 'identical');
  let status = own.status;
  for (const entry of differing) if (SEVERITY[entry.status] > SEVERITY[status]) status = entry.status;
  const tags = new Set(own.tags);
  for (const entry of differing) {
    if (entry.status === status) for (const tag of entry.tags) tags.add(tag);
  }
  const notes = [...own.notes];
  // Entries of the deciding status first, so the first note names the reason.
  for (const entry of [...differing].sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status])) {
    notes.push(`${entry.name}: ${statusLabel(entry)}${entry.notes[0] === undefined ? '' : `: ${entry.notes[0]}`}`);
  }
  const result: DiffResult = {
    status,
    tags: [...tags],
    maxUlp: differing.reduce((max, entry) => (entry.maxUlp > max ? entry.maxUlp : max), own.maxUlp),
    ulpCount: differing.reduce((sum, entry) => sum + entry.ulpCount, own.ulpCount),
    normalDiffs: differing.reduce((sum, entry) => sum + entry.normalDiffs, own.normalDiffs),
    nearZeroCorners: differing.reduce((sum, entry) => sum + entry.nearZeroCorners, own.nearZeroCorners),
    notes: notes.slice(0, NOTE_LIMIT),
    entries: differing,
  };
  return result;
}

/** Keeps the first `limit` items of a list that may grow to millions of notes. */
export class NoteList {
  readonly notes: string[] = [];
  private dropped = 0;
  constructor(private readonly limit = NOTE_LIMIT) {}
  add(note: string): void {
    if (this.notes.length < this.limit) this.notes.push(note);
    else this.dropped++;
  }
  /** The notes plus how many were left out. */
  all(): string[] {
    return this.dropped === 0 ? this.notes : [...this.notes, `… ${this.dropped} more`];
  }
}
