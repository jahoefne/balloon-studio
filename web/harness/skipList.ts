// Grid cases the real core cannot produce yet: core/real still takes those parts from the stub
// (WP-K9). They count as `skipped` in the report. Delete a line when its work package lands.
// Below them the single archive entries that cannot pass the rules; the case's row notes them.
import type { Group, Part, ReferenceCase } from './manifest';

const SKIPPED_PARTS: Readonly<Partial<Record<Part, string>>> = {
  pattern: 'WP-K3',
};
const SKIPPED_GROUPS: Readonly<Partial<Record<Group, string>>> = {
  relief: 'WP-K3',
  text: 'WP-K3',
};

/** The work package a case waits for, or null when it runs. */
export function skippedBy(c: ReferenceCase): string | null {
  return SKIPPED_PARTS[c.part] ?? SKIPPED_GROUPS[c.group] ?? null;
}

const LIBM_FLIPPED_FRONT =
  'LampSurface.refine meets exact ties (LampSurface.swift:237, :281) and libm noise in atan2 decides them: a few vertices differ and the front is neither `ulp` nor `equivalent` (rule 2 asks for equal vertices). Valid mesh, volume within 4.5e-8. tests/lampSurface.reference.test.ts holds the limits and pins the hash; whether the harness gets a verdict for this is open.';

/** Archive entries the grid leaves out of a case that otherwise runs, with the reason. */
const SKIPPED_ENTRIES: Readonly<Record<string, { entries: readonly string[]; reason: string }>> = {
  'cloud-sculpted-classic': { entries: ['B-cloud-front-white-PLA.stl'], reason: LIBM_FLIPPED_FRONT },
  'cloud-sculpted-billow-min': { entries: ['B-cloud-front-white-PLA.stl'], reason: LIBM_FLIPPED_FRONT },
};

export function skippedEntries(c: ReferenceCase): readonly string[] {
  return SKIPPED_ENTRIES[c.id]?.entries ?? [];
}
