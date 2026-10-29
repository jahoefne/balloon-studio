import type { ReactNode } from 'react';
import { Icon, type SymbolName } from './Icon';
import './primitives.css';

// The advice line under each preview (BalloonStudioApp.swift:583-596): an icon in accent
// or orange, an 11 pt semibold title and 11 pt secondary text. `tone` colors the icon only;
// the icon is chosen separately, as in Swift.

export interface AdviceRowProps {
  icon: SymbolName;
  tone?: 'accent' | 'warning' | undefined;
  title: ReactNode;
  children?: ReactNode;
  testId?: string | undefined;
}

export function AdviceRow({ icon, tone = 'accent', title, children, testId }: AdviceRowProps) {
  return (
    <div className={`ui-advice ui-advice--${tone}`} data-testid={testId}>
      <Icon name={icon} size={13} className="ui-advice__icon" />
      <div className="ui-advice__text">
        <p className="ui-advice__title">{title}</p>
        {children !== undefined && <p className="ui-advice__body">{children}</p>}
      </div>
    </div>
  );
}
