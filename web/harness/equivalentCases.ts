import type { BoundedLimits } from './boundedDiff';

// The only STLs that may pass as `equivalent` (docs/plan.md §14). Everything else that passes the
// rule stays `mismatch (topology)`. A listed entry that turns `identical` or `ulp` gets the warning
// "allowlist stale" and should be removed.

export interface EquivalentCase {
  caseId: string;
  /** The ZIP or 3MF entry; null for a case whose output is the STL itself. */
  entry: string | null;
  reason: string;
}

const ANNULUS_TIE =
  'CableClamp.annulus (CableClamp.swift:361-363): a post corner lies exactly between two hole points (45° between 37.5° and 52.5°), so rounding noise picks the nearest and the fan of the post top starts one step later. Same vertices, same body; details in PR #22.';

export const EQUIVALENT_CASES: readonly EquivalentCase[] = [
  { caseId: 'cloud-drift', entry: 'A-cloud-back-opaque.stl', reason: ANNULUS_TIE },
  { caseId: 'sun-cable-bottom', entry: 'A-sun-back-opaque.stl', reason: ANNULUS_TIE },
  { caseId: 'cloud-sculpted-billow-min', entry: 'A-cloud-back-opaque.stl', reason: ANNULUS_TIE },
];

/** An entry that may pass as `equivalent-bounded` (docs/plan.md §15). */
export interface BoundedCase extends EquivalentCase {
  /** What shows that this is libm and not the port: with Apple's values the entry is `identical` or `ulp`. */
  replay: string;
  limits: BoundedLimits;
}

const TIE_FLIP_REASON =
  'crossesBoundary/occupied meet a pixel column exactly (x·columns whole up to the last bits, x = 0.5 at an even mask width), so floor and ceil follow the last bit of atan2, sin or cos: a few refinement edges differ and every later vertex is renumbered.';
const PATTERN_REPLAY = 'tests/patterns.replay.test.ts: with the values of Apple libm the 3MF is byte-identical.';
const PATTERN_LIMITS: BoundedLimits = { triangleCountDifference: 800, verticesWithoutPartner: 200, trianglesWithoutPartner: 800, maxDistance: 1e-6, volume: 1e-5, area: 1e-5 };

const FRONT_REASON =
  'refine meets exact ties on symmetric grid cells (longest, LampSurface.swift:237; diagonal, :281), decided by the last bit of an atan2: a few vertices differ and the shell vertex above them follows by about 0.01 mm.';
const FRONT_REPLAY = "tests/lampSurface.reference.test.ts: with Apple's atan2 for the arguments named there every corner is bit-identical.";
const FRONT_LIMITS: BoundedLimits = { triangleCountDifference: 8, verticesWithoutPartner: 16, trianglesWithoutPartner: 64, maxDistance: 0.02, volume: 1e-7, area: 1e-8 };

const MODEL = '3D/3dmodel.model';
const FRONT = 'B-cloud-front-white-PLA.stl';
const patternCase = (caseId: string): BoundedCase => ({ caseId, entry: MODEL, reason: TIE_FLIP_REASON, replay: PATTERN_REPLAY, limits: PATTERN_LIMITS });
const frontCase = (caseId: string): BoundedCase => ({ caseId, entry: FRONT, reason: FRONT_REASON, replay: FRONT_REPLAY, limits: FRONT_LIMITS });

export const BOUNDED_CASES: readonly BoundedCase[] = [
  patternCase('text-sans-hello'),
  patternCase('text-serif-zoe-lea'),
  patternCase('text-mono-hello'),
  patternCase('relief-night-flight-classic'),
  patternCase('relief-night-flight-round'),
  patternCase('relief-night-flight-tall'),
  patternCase('relief-summit-classic'),
  patternCase('relief-summit-round'),
  patternCase('relief-summit-tall'),
  patternCase('relief-night-flight-legacy'),
  patternCase('relief-night-flight-v2'),
  patternCase('relief-summit-saved'),
  frontCase('cloud-sculpted-classic'),
  frontCase('cloud-sculpted-billow-min'),
];
