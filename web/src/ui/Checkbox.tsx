import type { ReactNode } from 'react';
import { useHelp } from './help';
import './primitives.css';

// SwiftUI `Toggle(...).toggleStyle(.checkbox)`: Build plate, Wireframe, Cutaway, Mirror,
// cable outlets and the like.

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  help?: string | undefined;
  testId?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function Checkbox({ checked, onChange, children, help, testId, disabled, className }: CheckboxProps) {
  const helpInfo = useHelp(help);
  // The description sits outside the label so it does not join the accessible name.
  return (
    <>
      <label className={className ? `ui-checkbox ${className}` : 'ui-checkbox'} title={helpInfo.title}>
        <input
          type="checkbox"
          className="ui-checkbox__input"
          checked={checked}
          disabled={disabled}
          aria-describedby={helpInfo.describedBy}
          data-testid={testId}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="ui-checkbox__label">{children}</span>
      </label>
      {helpInfo.node}
    </>
  );
}
