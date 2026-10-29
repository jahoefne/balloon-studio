import { useId, type CSSProperties } from 'react';
import { useHelp } from './help';
import './primitives.css';

// SwiftUI `Picker` in its default menu style: the title on the left, a pop-up on the right.
// Native `<select>`; option values may be strings or numbers (layer heights), so the DOM
// value is the option index.
//
// `rich` opts into customizable selects (`appearance: base-select`, Chromium 135+), where
// each option keeps its own `style`; the Font picker uses it to show every option in its
// typeface like PatternEditor.swift:56. Other browsers fall back to the native pop-up.

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  style?: CSSProperties | undefined;
  disabled?: boolean | undefined;
}

export interface SelectProps<T extends string | number> {
  label: string;
  /** `.labelsHidden()`: the label becomes the accessible name only. */
  labelHidden?: boolean | undefined;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  help?: string | undefined;
  testId?: string | undefined;
  disabled?: boolean | undefined;
  rich?: boolean | undefined;
  className?: string | undefined;
}

export function Select<T extends string | number>({
  label,
  labelHidden = false,
  options,
  value,
  onChange,
  help,
  testId,
  disabled,
  rich = false,
  className,
}: SelectProps<T>) {
  const id = useId();
  const helpInfo = useHelp(help);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const classes = ['ui-select', rich && 'ui-select--rich', className].filter(Boolean).join(' ');

  return (
    <div className={classes} title={helpInfo.title}>
      {!labelHidden && (
        <label className="ui-select__label" htmlFor={id}>
          {label}
        </label>
      )}
      <select
        id={id}
        className="ui-select__control"
        value={selectedIndex >= 0 ? String(selectedIndex) : ''}
        disabled={disabled}
        style={selected?.style}
        aria-label={labelHidden ? label : undefined}
        aria-describedby={helpInfo.describedBy}
        data-testid={testId}
        onChange={(event) => {
          const option = options[Number(event.currentTarget.value)];
          if (option) onChange(option.value);
        }}
      >
        {selectedIndex < 0 && <option value="" disabled hidden />}
        {options.map((option, index) => (
          <option key={String(option.value)} value={String(index)} style={option.style} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {helpInfo.node}
    </div>
  );
}
