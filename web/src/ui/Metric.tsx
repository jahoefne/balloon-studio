import type { ReactNode } from 'react';
import './primitives.css';

// `metric(_:value:unit:)` (BalloonStudioApp.swift:625-633) and the row that holds them:
// `HStack(spacing:0)` with 30 pt dividers, 14 pt vertical padding, white 0.8, radius 12. The other
// editors write out their own `metric`: the row's `size` is the value's point size and brings the
// rest of that editor's look with it.

export interface MetricProps {
  title: string;
  value: string;
  unit?: string | undefined;
}

export function Metric({ title, value, unit = '' }: MetricProps) {
  return (
    <div className="ui-metric">
      <dt className="ui-metric__title">{title}</dt>
      <dd className="ui-metric__value">
        <span className="ui-metric__number">{value}</span>
        {unit && <span className="ui-metric__unit">{unit}</span>}
      </dd>
    </div>
  );
}

export interface MetricRowProps {
  children: ReactNode;
  testId?: string | undefined;
  /** 22 Balloon, 21 Basket and Figures, 20 Ring, 18 Cloud and Sun, 15 Cable clip. */
  size?: 22 | 21 | 20 | 18 | 15 | undefined;
}

export function MetricRow({ children, testId, size = 22 }: MetricRowProps) {
  return (
    <dl className={`ui-metric-row ui-metric-row--${size}`} data-testid={testId}>
      {children}
    </dl>
  );
}
