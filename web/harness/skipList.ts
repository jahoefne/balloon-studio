// Grid cases the real core cannot produce yet: core/real still takes those parts from the stub
// (WP-K9). They count as `skipped` in the report. Delete a line when its work package lands.
import type { Part, ReferenceCase } from './manifest';

const SKIPPED_PARTS: Readonly<Partial<Record<Part, string>>> = {
  cloud: 'WP-K4',
  sun: 'WP-K4',
};

/** The work package a case waits for, or null when it runs. */
export function skippedBy(c: ReferenceCase): string | null {
  if ((c.pattern as { style?: string } | null | undefined)?.style === 'Summit Cable Car') return 'WP-R5';
  return SKIPPED_PARTS[c.part] ?? null;
}
