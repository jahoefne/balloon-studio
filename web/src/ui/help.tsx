import { useId, type ReactNode } from 'react';

// SwiftUI `.help(text)` → a native tooltip (`title`) plus `aria-describedby` on a visually
// hidden copy, so screen readers announce the same text (docs/plan.md, Abschnitt 6).

export interface Help {
  title: string | undefined;
  describedBy: string | undefined;
  node: ReactNode;
}

export function useHelp(help: string | undefined): Help {
  const id = useId();
  if (!help) return { title: undefined, describedBy: undefined, node: null };
  return {
    title: help,
    describedBy: id,
    node: (
      <span id={id} className="ui-sr-only">
        {help}
      </span>
    ),
  };
}
