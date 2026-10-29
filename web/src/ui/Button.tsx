import type { ButtonHTMLAttributes } from 'react';
import './primitives.css';

// Push buttons for dialogs and toolbars: `bordered` is the macOS default push button,
// `prominent` is `.borderedProminent` (the default action), `plain` has no chrome.

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'bordered' | 'prominent' | 'plain' | undefined;
  testId?: string | undefined;
}

export function Button({ variant = 'bordered', testId, className, type = 'button', ...rest }: ButtonProps) {
  const classes = `ui-button ui-button--${variant}${className ? ` ${className}` : ''}`;
  return <button type={type} className={classes} data-testid={testId} {...rest} />;
}
