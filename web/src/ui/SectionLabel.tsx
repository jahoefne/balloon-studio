import type { ReactNode } from 'react';
import './primitives.css';

// `sectionLabel(_:)` / `label(_:)` in the editors: 9 pt bold, tracking 1.3, secondary
// ("DIMENSIONS", "PATTERN & COLOR"). The text is passed in capitals as in Swift.

export interface SectionLabelProps {
  children: ReactNode;
  /** Heading level for the outline; the look does not change. */
  level?: 2 | 3 | 4 | undefined;
}

export function SectionLabel({ children, level = 3 }: SectionLabelProps) {
  const Heading = `h${level}` as const;
  return <Heading className="ui-section-label">{children}</Heading>;
}
