import { FILAMENT_SWATCHES, filamentHex, type FilamentColorName } from './filamentColors';
import { Select } from './Select';
import './primitives.css';

// `colorPicker(_:key:)` in PatternEditor.swift:102-109: a 14 px swatch, then a picker of
// the seven filament colors by name.

export interface ColorPickerProps {
  label: string;
  value: FilamentColorName;
  onChange: (value: FilamentColorName) => void;
  testId?: string | undefined;
}

const options = FILAMENT_SWATCHES.map((color) => ({ value: color.name, label: color.name }));

export function ColorPicker({ label, value, onChange, testId }: ColorPickerProps) {
  return (
    <div className="ui-color-picker">
      <span className="ui-swatch" style={{ backgroundColor: filamentHex(value) }} aria-hidden="true" />
      <Select<FilamentColorName> hug label={label} options={options} value={value} onChange={onChange} testId={testId} />
    </div>
  );
}
