// Grid cases the real core cannot produce yet: core/real still takes those parts from the stub
// (WP-K9). They count as `skipped` in the report. Delete a line when its work package lands.
import type { Group, Part, ReferenceCase } from './manifest';

const SKIPPED_PARTS: Readonly<Partial<Record<Part, string>>> = {
  cloud: 'WP-K4',
  sun: 'WP-K4',
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
