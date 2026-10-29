import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import './primitives.css';

// SwiftUI `Picker(...).pickerStyle(.segmented).labelsHidden()`: a radio group with one
// tab stop. Arrow keys move and select (wrapping), Home/End jump to the ends.

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  testId?: string | undefined;
  disabled?: boolean | undefined;
}

export interface SegmentedControlProps<T extends string | number> {
  /** Accessible name; the Mac hides the label (`.labelsHidden()`). */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testId?: string | undefined;
  className?: string | undefined;
}

export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  testId,
  className,
}: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);

  function select(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    buttons.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  }

  // The nearest enabled option after `from` in `direction`, wrapping around.
  function nextEnabled(from: number, direction: 1 | -1) {
    const count = options.length;
    for (let offset = 1; offset <= count; offset++) {
      const index = (((from + direction * offset) % count) + count) % count;
      if (!options[index]?.disabled) return index;
    }
    return from;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = nextEnabled(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = nextEnabled(index, -1);
        break;
      case 'Home':
        next = nextEnabled(-1, 1);
        break;
      case 'End':
        next = nextEnabled(options.length, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    select(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={className ? `ui-segmented ${className}` : 'ui-segmented'}
      data-testid={testId}
    >
      {options.map((option, index) => {
        const checked = index === selectedIndex;
        return (
          <button
            key={String(option.value)}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={option.disabled}
            className="ui-segmented__segment"
            data-testid={option.testId}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
