import { useState, type ReactNode } from 'react';
import './primitives.css';

// SwiftUI `DisclosureGroup(title) { ... }`, collapsed by default ("P2S waste assumptions",
// PatternEditor.swift:83).

export interface DisclosureGroupProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean | undefined;
  testId?: string | undefined;
}

export function DisclosureGroup({ title, children, defaultOpen = false, testId }: DisclosureGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="ui-disclosure"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-testid={testId}
    >
      <summary className="ui-disclosure__summary">{title}</summary>
      <div className="ui-disclosure__body">{children}</div>
    </details>
  );
}
