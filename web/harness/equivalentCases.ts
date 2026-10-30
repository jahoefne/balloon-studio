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
