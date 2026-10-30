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
  /** 11: the preview toggles. 12 medium: the attachment and option toggles in the sidebars. */
  size?: 11 | 12 | undefined;
  /** `.font(.system(size:12,weight:.semibold))` on the lamp sidebars. */
  strong?: boolean | undefined;
}

export function Checkbox({ checked, onChange, children, help, testId, disabled, className, size = 11, strong = false }: CheckboxProps) {
  const helpInfo = useHelp(help);
  const classes = ['ui-checkbox', size === 12 && 'ui-checkbox--12', strong && 'ui-checkbox--strong', className].filter(Boolean).join(' ');
  // The description sits outside the label so it does not join the accessible name.
  return (
    <>
      <label className={classes} title={helpInfo.title}>
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
