import type { ReactNode } from 'react';
import { useHelp } from './help';
import './primitives.css';

// SwiftUI `Toggle(...).toggleStyle(.switch).controlSize(.small)`, e.g. "Hollow for LEDs"
// (BalloonStudioApp.swift:393-397). A native checkbox with role="switch".

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  help?: string | undefined;
  testId?: string | undefined;
  disabled?: boolean | undefined;
}

export function Switch({ checked, onChange, children, help, testId, disabled }: SwitchProps) {
  const helpInfo = useHelp(help);
  // The description sits outside the label so it does not join the accessible name.
  return (
    <>
      <label className="ui-switch" title={helpInfo.title}>
        <span className="ui-switch__label">{children}</span>
        <input
          type="checkbox"
          role="switch"
          className="ui-switch__input"
          checked={checked}
          disabled={disabled}
          aria-describedby={helpInfo.describedBy}
          data-testid={testId}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="ui-switch__track" aria-hidden="true" />
      </label>
      {helpInfo.node}
    </>
  );
}
