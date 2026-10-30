import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { clampToRange, formatNumber, fractionDigitsForStep, parseDecimal, roundHalfAwayFromZero } from './format';
import { useHelp } from './help';
import './primitives.css';

// Port of `ParameterControl` in mac/Sources/BalloonStudio/BalloonStudioApp.swift:635-684:
// title left, a 44 px monospaced field right with an optional 19 px unit, a slider with its step
// ticks below.
// The field follows `value` only while it is not focused; Enter or blur commits the text
// (parse → round to the step, halves away from zero → clamp → onChange), and anything
// unparsable reverts to the current value.

export interface ParameterControlProps {
  title: string;
  value: number;
  onChange: (value: number) => void;
  range: readonly [lower: number, upper: number];
  step?: number | undefined;
  unit?: string | undefined;
  /** SwiftUI `.help(...)` on the control. */
  help?: string | undefined;
  testId?: string | undefined;
}

export function ParameterControl({
  title,
  value,
  onChange,
  range,
  step = 1,
  unit = '',
  help,
  testId,
}: ParameterControlProps) {
  const [lower, upper] = range;
  const sliderUpper = Math.max(upper, lower + step);
  const digits = fractionDigitsForStep(step);
  // The text being edited; null while the field is not focused, so the field shows `value`.
  const [draft, setDraft] = useState<string | null>(null);
  const fieldId = useId();
  const helpInfo = useHelp(help);

  function commit(input: string) {
    const number = parseDecimal(input);
    if (number !== null) {
      onChange(clampToRange(roundHalfAwayFromZero(number / step) * step, lower, upper));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    // Handled here: a surrounding dialog must not treat this Enter as its default action.
    event.preventDefault();
    event.currentTarget.blur();
  }

  return (
    <div className="ui-parameter" title={helpInfo.title} data-testid={testId}>
      <div className="ui-parameter__row">
        <label className="ui-parameter__title" htmlFor={fieldId}>
          {title}
        </label>
        <input
          id={fieldId}
          className="ui-parameter__field"
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
          aria-label={title}
          aria-describedby={helpInfo.describedBy}
          value={draft ?? formatNumber(value, digits)}
          onFocus={() => setDraft(formatNumber(value, digits))}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            commit(event.currentTarget.value);
            setDraft(null);
          }}
          onKeyDown={onKeyDown}
        />
        {unit && <span className="ui-parameter__unit">{unit}</span>}
      </div>
      <div className="ui-parameter__track">
        <input
          className="ui-parameter__slider"
          type="range"
          min={lower}
          max={sliderUpper}
          step={step}
          value={value}
          disabled={lower === upper}
          aria-label={`${title} slider`}
          aria-valuetext={unit ? `${formatNumber(value, digits)} ${unit}` : undefined}
          aria-describedby={helpInfo.describedBy}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <span className="ui-parameter__ticks" style={{ '--tick-spacing': step / (sliderUpper - lower) } as CSSProperties} aria-hidden="true" />
      </div>
      {helpInfo.node}
    </div>
  );
}
